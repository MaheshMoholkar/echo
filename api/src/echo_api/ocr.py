"""OCR: text from images and scanned PDFs, with GLM-OCR on Ollama.

GLM-OCR (0.9B parameters, 1.6 GB) is a small vision model trained for one
job, reading documents. It gets one page image at a time with the prompt
"Text Recognition:" and answers with the page's text as Markdown.

Called through Ollama's native /api/generate rather than the OpenAI-style
endpoint, because only the native one takes `keep_alive`: the model stays
loaded while a document's pages are read, then unloads instead of holding
1.6 GB next to the chat model (the mini keeps at most two models loaded).

It doesn't know when to stop. On the sample notice, glm-ocr:q8_0 read the
page correctly and then started over from the top until it ran out of room
(50 s for one page), on /api/generate and /api/chat alike, cropped or not.
So the output is streamed, and as soon as the page starts repeating we keep
the first pass and hang up, which makes Ollama stop generating.
"""

import base64
import io
import json
import re

import httpx
import pypdfium2 as pdfium
from PIL import Image, ImageChops, UnidentifiedImageError

from echo_api.config import get_settings

PROMPT = "Text Recognition:"
KEEP_ALIVE = "30s"  # not 0: that would reload the model for every page
RENDER_SCALE = 2.0  # PDF points → pixels (144 dpi): small print stays legible
MAX_SIDE = 2000  # downscale big photos: OCR time grows with the pixel count
MAX_PAGES = 25  # each scanned page takes seconds
MAX_TOKENS = 2048  # backstop: a dense A4 page is well under this
# A PDF whose text layer has less than this per page is treated as a scan.
MIN_CHARS_PER_PAGE = 40
MARGIN = 40  # pixels of white kept around the content when cropping

_FENCE = re.compile(r"^```\w*\s*$", re.MULTILINE)


class OCRError(Exception):
    """A problem worth showing the user as the document's error."""


def _trim_margins(image: Image.Image) -> Image.Image:
    """Crop blank space around the content. A mostly empty page read out of
    order (the title came last); cropped, it was read top to bottom."""
    ink = ImageChops.difference(image, Image.new("RGB", image.size, "white"))
    box = ink.convert("L").point(lambda v: 255 if v > 24 else 0).getbbox()
    if box is None:  # a blank page
        return image
    left, top, right, bottom = box
    return image.crop(
        (
            max(left - MARGIN, 0),
            max(top - MARGIN, 0),
            min(right + MARGIN, image.width),
            min(bottom + MARGIN, image.height),
        )
    )


def _png(image: Image.Image) -> bytes:
    image = _trim_margins(image.convert("RGB"))
    image.thumbnail((MAX_SIDE, MAX_SIDE))  # only ever shrinks
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def image_to_png(data: bytes) -> bytes:
    try:
        with Image.open(io.BytesIO(data)) as image:
            return _png(image)
    except (UnidentifiedImageError, OSError) as exc:
        raise OCRError("Couldn't read this image. Is it damaged?") from exc


def pdf_page_count(data: bytes) -> int:
    try:
        return len(pdfium.PdfDocument(data))
    except pdfium.PdfiumError as exc:
        raise OCRError("Couldn't read this .pdf file. Is it damaged?") from exc


def pdf_pages_as_png(data: bytes) -> list[bytes]:
    document = pdfium.PdfDocument(data)
    if len(document) > MAX_PAGES:
        raise OCRError(
            f"This PDF is a scan of {len(document)} pages; scans of up to "
            f"{MAX_PAGES} pages are supported."
        )
    return [_png(page.render(scale=RENDER_SCALE).to_pil()) for page in document]


def first_pass(text: str) -> tuple[str, bool]:
    """The page's text up to where the model starts reading it again.

    A loop is two consecutive paragraphs repeating an earlier pair in the
    same order: stricter than "a paragraph repeats", so a legitimately
    repeated short line ("N/A" in a table) doesn't cut the page short.
    Returns the kept text and whether a loop was found.
    """
    paragraphs = [p.strip() for p in _FENCE.sub("", text).split("\n\n") if p.strip()]
    pairs: set[tuple[str, str]] = set()
    for i in range(len(paragraphs) - 1):
        pair = (paragraphs[i], paragraphs[i + 1])
        if pair in pairs:
            return "\n\n".join(paragraphs[:i]), True
        pairs.add(pair)
    return "\n\n".join(paragraphs), False


async def recognize(png: bytes) -> str:
    """One page image → its text (Markdown)."""
    settings = get_settings()
    url = settings.ollama_base_url.removesuffix("/v1") + "/api/generate"
    text = ""
    async with (
        httpx.AsyncClient(timeout=180) as client,
        client.stream(
            "POST",
            url,
            json={
                "model": settings.ocr_model,
                "prompt": PROMPT,
                "images": [base64.b64encode(png).decode()],
                "stream": True,
                "keep_alive": KEEP_ALIVE,
                "options": {"temperature": 0, "num_predict": MAX_TOKENS},
            },
        ) as response,
    ):
        if response.status_code == 404:
            raise OCRError(
                f"OCR isn't available: the {settings.ocr_model} model isn't installed."
            )
        response.raise_for_status()
        async for line in response.aiter_lines():
            chunk = json.loads(line)
            text += chunk.get("response", "")
            if chunk.get("done"):
                break
            # Leaving the stream closes the connection; Ollama stops generating.
            if "\n" in chunk.get("response", "") and first_pass(text)[1]:
                break
    return first_pass(text)[0]


async def recognize_pages(pages: list[bytes]) -> str:
    # One page at a time: Ollama serves one request at a time on the mini anyway.
    return "\n\n".join([await recognize(page) for page in pages])
