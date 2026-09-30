"""Upload → searchable: extract text, chunk it, embed the chunks, store them.

Runs after the upload request has returned (FastAPI BackgroundTasks), so the
dashboard shows the document as "processing" and polls until it is ready.
"""

import io
import logging
import uuid
from collections.abc import Awaitable, Callable
from pathlib import PurePath
from typing import Annotated

from fastapi import Depends
from fastapi.concurrency import run_in_threadpool
from markitdown import MarkItDown, StreamInfo
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from echo_api import embeddings, ocr
from echo_api.chunking import chunk_markdown
from echo_api.db import SessionLocal
from echo_api.models import Chunk, Document, DocumentStatus

log = logging.getLogger(__name__)

IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp"}
ALLOWED_EXTENSIONS = {
    ".pdf",
    ".docx",
    ".md",
    ".markdown",
    ".txt",
    ".html",
    ".htm",
    *IMAGE_EXTENSIONS,
}
MAX_BYTES = 10 * 1024 * 1024

_markitdown = MarkItDown(enable_plugins=False)


class IngestError(Exception):
    """A problem worth showing the user as the document's error."""


def extract_markdown(filename: str, data: bytes) -> str:
    """PDF, Word, HTML or text → Markdown. Headings survive, which helps both
    chunking (sections stay together) and the model reading the results."""
    extension = PurePath(filename).suffix.lower()
    if extension in {".md", ".markdown", ".txt"}:
        return data.decode("utf-8", errors="replace")
    result = _markitdown.convert_stream(
        io.BytesIO(data), stream_info=StreamInfo(extension=extension, filename=filename)
    )
    # When the PDF/Word converter can't read a file, markitdown quietly falls
    # back to its plain-text converter and returns the raw bytes as "text".
    # Indexing that would put binary garbage in front of the model.
    if result.markdown.strip() == data.decode("utf-8", errors="ignore").strip():
        raise IngestError(f"Couldn't read this {extension} file. Is it damaged?")
    return result.markdown


async def extract_text(filename: str, data: bytes) -> str:
    """Any supported upload → Markdown, using OCR where there's no text layer.

    Images always go to OCR. A PDF is read as text first; if that gives
    almost nothing for its number of pages, it's a scan (pictures of pages)
    and its pages go to OCR. Everything else is plain text extraction.
    Parsing and rendering are CPU work in sync libraries: off the event loop.
    """
    extension = PurePath(filename).suffix.lower()
    try:
        if extension in IMAGE_EXTENSIONS:
            return await ocr.recognize(await run_in_threadpool(ocr.image_to_png, data))
        if extension != ".pdf":
            return await run_in_threadpool(extract_markdown, filename, data)

        pages = await run_in_threadpool(ocr.pdf_page_count, data)  # damaged → error
        try:
            markdown = await run_in_threadpool(extract_markdown, filename, data)
        except IngestError:
            markdown = ""  # a valid PDF whose text layer can't be read: try OCR
        if len(markdown.strip()) >= ocr.MIN_CHARS_PER_PAGE * pages:
            return markdown
        images = await run_in_threadpool(ocr.pdf_pages_as_png, data)
        return await ocr.recognize_pages(images)
    except ocr.OCRError as exc:
        raise IngestError(str(exc)) from exc


async def ingest_document(
    db: AsyncSession, document_id: uuid.UUID, data: bytes
) -> None:
    document = await db.get(Document, document_id)
    if document is None:  # deleted before we got to it
        return
    try:
        markdown = await extract_text(document.filename, data)
        if not markdown.strip():
            raise IngestError("No text found in this file, even with OCR.")
        passages = chunk_markdown(markdown)
        # The document's name goes into each embedded text as a little context
        # (a passage saying "it takes 30 days" is clearer next to "refunds.md").
        vectors = await embeddings.embed_documents(
            [f"{document.filename}\n\n{passage}" for passage in passages]
        )
        db.add_all(
            Chunk(
                document_id=document.id,
                organization_id=document.organization_id,
                chunk_index=index,
                content=passage,
                embedding=vector,
            )
            for index, (passage, vector) in enumerate(
                zip(passages, vectors, strict=True)
            )
        )
        document.text = markdown
        document.chunk_count = len(passages)
        document.status = DocumentStatus.ready
        # Uploading a file with the same name replaces the old version, now
        # that the new one is searchable (if this one had failed, the old one
        # would have stayed). Byte-level dedup alone misses this: a re-exported
        # PDF has new bytes (timestamps) even when its text hasn't changed.
        await db.execute(
            delete(Document).where(
                Document.organization_id == document.organization_id,
                Document.filename == document.filename,
                Document.id != document.id,
            )
        )
    except IngestError as exc:
        document.status, document.error = DocumentStatus.error, str(exc)
    # Logged, and any failure must end up on the document, not vanish.
    except Exception as exc:
        log.exception("ingesting document %s failed", document_id)
        document.status, document.error = (
            DocumentStatus.error,
            f"Processing failed: {exc}"[:500],
        )
    await db.commit()


# The route hands ingestion to a runner so tests can run it inline in their
# own (rolled-back) session; the real one opens a fresh session, because the
# request's session is closed once the response has been sent.
IngestFn = Callable[[uuid.UUID, bytes], Awaitable[None]]


async def ingest_in_new_session(document_id: uuid.UUID, data: bytes) -> None:
    async with SessionLocal() as db:
        await ingest_document(db, document_id, data)


def get_ingest_runner() -> IngestFn:
    return ingest_in_new_session


IngestRunner = Annotated[IngestFn, Depends(get_ingest_runner)]
