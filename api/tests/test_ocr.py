"""OCR: images and scanned PDFs are read by the (faked) OCR model; PDFs
with a text layer are not."""

import io
import uuid

import httpx
import pytest
from jwt_helpers import bearer
from pdf_helpers import minimal_pdf, png, scanned_pdf
from PIL import Image
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from echo_api import ocr
from echo_api.models import Chunk

pytestmark = pytest.mark.usefixtures("trust_test_key", "inline_ingest")


@pytest.fixture
def fake_ocr(monkeypatch: pytest.MonkeyPatch) -> list[bytes]:
    """Each call "reads" one page; returns the list of pages it was given."""
    calls: list[bytes] = []

    async def recognize(image: bytes) -> str:
        calls.append(image)
        return f"Page {len(calls)}: refunds are possible within 30 days."

    monkeypatch.setattr(ocr, "recognize", recognize)
    return calls


async def upload(
    client: httpx.AsyncClient, org_id: str, name: str, data: bytes
) -> dict:
    response = await client.post(
        "/v1/files", headers=bearer(org_id), files={"file": (name, data)}
    )
    assert response.status_code == 201, response.text
    [document] = (await client.get("/v1/files", headers=bearer(org_id))).json()
    return document


async def chunk_text(db: AsyncSession, document: dict) -> str:
    rows = await db.scalars(
        select(Chunk.content).where(Chunk.document_id == uuid.UUID(document["id"]))
    )
    return "\n".join(rows)


async def test_image_is_read_with_ocr(
    client: httpx.AsyncClient,
    db: AsyncSession,
    organization_id: str,
    fake_ocr: list[bytes],
) -> None:
    document = await upload(client, organization_id, "policy.png", png())
    assert document["status"] == "ready", document["error"]
    assert len(fake_ocr) == 1
    assert "30 days" in await chunk_text(db, document)


async def test_scanned_pdf_pages_are_read_with_ocr(
    client: httpx.AsyncClient,
    db: AsyncSession,
    organization_id: str,
    fake_ocr: list[bytes],
) -> None:
    document = await upload(client, organization_id, "scan.pdf", scanned_pdf(pages=2))
    assert document["status"] == "ready", document["error"]
    assert len(fake_ocr) == 2  # one call per page
    text = await chunk_text(db, document)
    assert "Page 1:" in text and "Page 2:" in text


async def test_pdf_with_a_text_layer_skips_ocr(
    client: httpx.AsyncClient, organization_id: str
) -> None:
    # The autouse no_real_ocr fixture fails the ingestion if OCR is called.
    pdf = minimal_pdf("Refunds are possible within 30 days of delivery.")
    document = await upload(client, organization_id, "policy.pdf", pdf)
    assert document["status"] == "ready", document["error"]


async def test_long_scans_are_refused(
    client: httpx.AsyncClient, organization_id: str, fake_ocr: list[bytes]
) -> None:
    pages = ocr.MAX_PAGES + 1
    document = await upload(client, organization_id, "book.pdf", scanned_pdf(pages))
    assert document["status"] == "error"
    assert f"{pages} pages" in document["error"]
    assert fake_ocr == []


async def test_missing_ocr_model_is_explained(
    client: httpx.AsyncClient, organization_id: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    async def recognize(image: bytes) -> str:
        raise ocr.OCRError(
            "OCR isn't available: the glm-ocr:q8_0 model isn't installed."
        )

    monkeypatch.setattr(ocr, "recognize", recognize)
    document = await upload(client, organization_id, "photo.jpg", png())
    assert document["status"] == "error"
    assert "OCR isn't available" in document["error"]


async def test_damaged_image_is_explained(
    client: httpx.AsyncClient, organization_id: str, fake_ocr: list[bytes]
) -> None:
    document = await upload(client, organization_id, "photo.png", b"\x89PNG not really")
    assert document["status"] == "error"
    assert "Couldn't read this image" in document["error"]


def test_big_images_are_scaled_down() -> None:
    with Image.open(io.BytesIO(ocr.image_to_png(png(4000, 1000)))) as image:
        assert image.size == (ocr.MAX_SIDE, 500)


# --- GLM-OCR's repetition loop ------------------------------------------------


def test_first_pass_cuts_the_page_when_it_starts_over() -> None:
    looped = "Title\n\nOrders ship on 2 January.\n\nGift wrap is free.\n\n" * 3
    assert ocr.first_pass(looped) == (
        "Title\n\nOrders ship on 2 January.\n\nGift wrap is free.",
        True,
    )


def test_first_pass_ignores_code_fences_around_the_repeat() -> None:
    looped = "Title\n\nBody text.\n```markdown\n\nTitle\n\nBody text.\n```\n```\nTitle\n\nBody"
    assert ocr.first_pass(looped) == ("Title\n\nBody text.", True)


def test_a_repeated_short_line_is_not_a_loop() -> None:
    table = "Plan A\n\nN/A\n\nPlan B\n\nN/A\n\nPlan C"
    assert ocr.first_pass(table) == (table, False)


def test_blank_margins_are_cropped() -> None:
    page = Image.new("RGB", (1000, 1400), "white")
    page.paste(Image.new("RGB", (200, 100), "black"), (100, 100))
    with Image.open(io.BytesIO(ocr.image_to_png(_png_bytes(page)))) as cropped:
        assert cropped.size == (200 + 2 * ocr.MARGIN, 100 + 2 * ocr.MARGIN)


def _png_bytes(image: Image.Image) -> bytes:
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()
