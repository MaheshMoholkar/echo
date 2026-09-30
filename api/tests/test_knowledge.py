"""Knowledge base: upload → ingest → search, and the agent's search tool.

Embeddings are faked with keyword vectors (conftest.fake_embeddings) so
results are predictable; storage and pgvector search are real.
"""

import uuid
from collections.abc import AsyncIterator, Awaitable, Callable

import httpx
import pytest
from jwt_helpers import bearer
from pdf_helpers import minimal_pdf
from pydantic_ai.messages import ModelMessage, UserPromptPart
from pydantic_ai.models.function import AgentInfo, FunctionModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from echo_api import knowledge
from echo_api.agent import support_agent
from echo_api.models import Chunk

pytestmark = [
    pytest.mark.asyncio,
    pytest.mark.usefixtures("trust_test_key", "inline_ingest", "fake_embeddings"),
]

REFUNDS = b"""# Refunds

You can return any product within 30 days of delivery. We refund the
original payment method within 5 business days.
"""

SHIPPING = b"""# Shipping

Orders ship within 2 business days. Delivery in India takes 3-5 days;
international packages arrive in 7-14 days.
"""


async def upload(
    client: httpx.AsyncClient, org_id: str, filename: str, data: bytes
) -> httpx.Response:
    return await client.post(
        "/v1/files", headers=bearer(org_id), files={"file": (filename, data)}
    )


async def list_files(client: httpx.AsyncClient, org_id: str) -> list[dict]:
    response = await client.get("/v1/files", headers=bearer(org_id))
    assert response.status_code == 200
    return response.json()


# --- upload and ingestion -----------------------------------------------------------


async def test_upload_is_parsed_chunked_and_embedded(
    client: httpx.AsyncClient, organization_id: str
) -> None:
    response = await upload(client, organization_id, "refunds.md", REFUNDS)
    assert response.status_code == 201
    assert response.json()["status"] == "processing"  # answered before ingestion

    [document] = await list_files(client, organization_id)  # ingestion has run by now
    assert document["filename"] == "refunds.md"
    assert document["status"] == "ready"
    assert document["chunk_count"] == 1


@pytest.mark.parametrize(
    ("filename", "data", "expected"),
    [
        ("faq.html", b"<h1>Refunds</h1><p>Within <b>30 days</b>.</p>", "30 days"),
        (
            "policy.pdf",
            minimal_pdf("Refunds are possible within 30 days of delivery."),
            "30 days",
        ),
    ],
)
async def test_html_and_pdf_are_converted(
    client: httpx.AsyncClient,
    db: AsyncSession,
    organization_id: str,
    filename: str,
    data: bytes,
    expected: str,
) -> None:
    await upload(client, organization_id, filename, data)
    [document] = await list_files(client, organization_id)
    assert document["status"] == "ready", document["error"]
    content = await db.scalar(
        select(Chunk.content).where(Chunk.document_id == uuid.UUID(document["id"]))
    )
    assert content is not None and expected in content


async def test_unreadable_file_ends_in_error(
    client: httpx.AsyncClient, organization_id: str
) -> None:
    await upload(
        client, organization_id, "broken.pdf", b"%PDF-1.4 this is not really a pdf"
    )
    [document] = await list_files(client, organization_id)
    assert document["status"] == "error"
    assert document["error"]


async def test_upload_rules(client: httpx.AsyncClient, organization_id: str) -> None:
    assert (
        await upload(client, organization_id, "archive.zip", b"PK\x03\x04")
    ).status_code == 400
    assert (await upload(client, organization_id, "empty.txt", b"")).status_code == 400
    assert (
        await upload(client, organization_id, "refunds.md", REFUNDS)
    ).status_code == 201
    duplicate = await upload(client, organization_id, "copy-of-refunds.md", REFUNDS)
    assert duplicate.status_code == 409
    assert "refunds.md" in duplicate.json()["detail"]


async def test_delete_removes_document_and_chunks(
    client: httpx.AsyncClient, db: AsyncSession, organization_id: str
) -> None:
    await upload(client, organization_id, "refunds.md", REFUNDS)
    [document] = await list_files(client, organization_id)

    response = await client.delete(
        f"/v1/files/{document['id']}", headers=bearer(organization_id)
    )
    assert response.status_code == 204
    assert await list_files(client, organization_id) == []
    remaining = await db.scalar(
        select(func.count())
        .select_from(Chunk)
        .where(Chunk.organization_id == organization_id)
    )
    assert remaining == 0


async def test_same_name_replaces_the_old_version(
    client: httpx.AsyncClient, db: AsyncSession, organization_id: str
) -> None:
    await upload(client, organization_id, "refunds.md", REFUNDS)
    updated = REFUNDS.replace(b"30 days", b"45 days")
    assert (
        await upload(client, organization_id, "refunds.md", updated)
    ).status_code == 201

    [document] = await list_files(client, organization_id)
    hits = await knowledge.search(db, organization_id, "refund")
    assert [hit.content.count("45 days") for hit in hits] == [1]
    assert document["status"] == "ready"


async def test_failed_new_version_keeps_the_old_one(
    client: httpx.AsyncClient, organization_id: str
) -> None:
    await upload(
        client,
        organization_id,
        "policy.pdf",
        minimal_pdf("Refunds are possible within 30 days of delivery."),
    )
    await upload(client, organization_id, "policy.pdf", b"%PDF-1.4 damaged")

    statuses = sorted(d["status"] for d in await list_files(client, organization_id))
    assert statuses == ["error", "ready"]  # the working version is still searchable


# --- tenant isolation ---------------------------------------------------------------


async def test_organizations_cannot_see_each_others_documents(
    client: httpx.AsyncClient,
    db: AsyncSession,
    make_organization: Callable[[], Awaitable[str]],
) -> None:
    acme, globex = await make_organization(), await make_organization()
    await upload(client, acme, "refunds.md", REFUNDS)
    [document] = await list_files(client, acme)

    assert await list_files(client, globex) == []
    response = await client.delete(
        f"/v1/files/{document['id']}", headers=bearer(globex)
    )
    assert response.status_code == 404
    # Search is scoped too: Globex's customers never get Acme's answers.
    assert await knowledge.search(db, globex, "how do I get a refund?") == []


# --- search ---------------------------------------------------------------------------


async def test_search_finds_the_relevant_passage(
    client: httpx.AsyncClient, db: AsyncSession, organization_id: str
) -> None:
    await upload(client, organization_id, "refunds.md", REFUNDS)
    await upload(client, organization_id, "shipping.md", SHIPPING)

    hits = await knowledge.search(db, organization_id, "when will my package arrive?")
    assert hits[0].filename == "shipping.md"

    hits = await knowledge.search(db, organization_id, "can I get my money back?")
    assert [hit.filename for hit in hits] == ["refunds.md"]  # shipping is too far away

    assert (
        await knowledge.search(db, organization_id, "do you have a mobile app?") == []
    )


# --- retrieval before the model runs ("pipeline RAG") ------------------------------


async def ask(
    client: httpx.AsyncClient, organization_id: str, *messages: str
) -> list[str]:
    """Send messages to a new conversation; return the prompts the model received."""
    prompts: list[str] = []

    async def model(
        messages_: list[ModelMessage], info: AgentInfo
    ) -> AsyncIterator[str]:
        [part] = messages_[-1].parts
        assert isinstance(part, UserPromptPart)
        prompts.append(str(part.content))
        yield "ok"

    session = await client.post(
        "/v1/public/contact-sessions",
        json={
            "organization_id": organization_id,
            "name": "Bob",
            "email": "bob@example.com",
        },
    )
    headers = {"X-Contact-Session": session.json()["id"]}
    conversation = await client.post("/v1/public/conversations", headers=headers)
    with support_agent.override(model=FunctionModel(stream_function=model)):
        for message in messages:
            response = await client.post(
                f"/v1/public/conversations/{conversation.json()['id']}/messages",
                headers=headers,
                json={"content": message},
            )
            assert response.status_code == 200
    return prompts


async def test_model_receives_the_search_results(
    client: httpx.AsyncClient, organization_id: str
) -> None:
    await upload(client, organization_id, "refunds.md", REFUNDS)
    [prompt] = await ask(client, organization_id, "Can I return my order?")

    assert "<customer_message>\nCan I return my order?\n</customer_message>" in prompt
    assert "From refunds.md" in prompt and "30 days" in prompt


async def test_model_is_told_when_nothing_is_relevant(
    client: httpx.AsyncClient, organization_id: str
) -> None:
    """The case the 4B model got wrong when searching was its own decision."""
    await upload(client, organization_id, "refunds.md", REFUNDS)
    [prompt] = await ask(client, organization_id, "Do you have a mobile app?")

    assert "No relevant information found in the knowledge base." in prompt
    assert "refunds.md" not in prompt


async def test_short_follow_up_is_searched_with_the_previous_message(
    client: httpx.AsyncClient, organization_id: str
) -> None:
    await upload(client, organization_id, "shipping.md", SHIPPING)
    _first, follow_up = await ask(
        client, organization_id, "How long does delivery take?", "And abroad?"
    )
    # "And abroad?" alone matches nothing; with the previous message it does.
    assert "From shipping.md" in follow_up
