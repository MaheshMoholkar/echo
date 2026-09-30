"""The knowledge base, from the dashboard: upload, list, delete documents."""

import hashlib
import uuid
from pathlib import PurePath

from fastapi import APIRouter, BackgroundTasks, HTTPException, UploadFile, status
from sqlalchemy import select

from echo_api.auth import OrgUser
from echo_api.db import DbSession
from echo_api.ingest import ALLOWED_EXTENSIONS, MAX_BYTES, IngestRunner
from echo_api.models import Document
from echo_api.schemas import DocumentOut

router = APIRouter(prefix="/files", tags=["knowledge base"])


async def _get_document(
    db: DbSession, principal: OrgUser, document_id: uuid.UUID
) -> Document:
    document = await db.get(Document, document_id)
    # Another organization's document reads as not found.
    if document is None or document.organization_id != principal.org_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Document not found")
    return document


@router.get("")
async def list_documents(principal: OrgUser, db: DbSession) -> list[DocumentOut]:
    documents = await db.scalars(
        select(Document)
        .where(Document.organization_id == principal.org_id)
        .order_by(Document.created_at.desc())
    )
    return [DocumentOut.model_validate(d) for d in documents]


@router.post("", status_code=status.HTTP_201_CREATED)
async def upload_document(
    file: UploadFile,
    principal: OrgUser,
    db: DbSession,
    background_tasks: BackgroundTasks,
    ingest: IngestRunner,
) -> DocumentOut:
    filename = PurePath(file.filename or "").name
    if PurePath(filename).suffix.lower() not in ALLOWED_EXTENSIONS:
        allowed = ", ".join(sorted(ALLOWED_EXTENSIONS))
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, f"Unsupported file type. Allowed: {allowed}"
        )

    data = await file.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise HTTPException(
            status.HTTP_413_CONTENT_TOO_LARGE, "Files can be at most 10 MB"
        )
    if not data:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "The file is empty")

    content_hash = hashlib.sha256(data).hexdigest()
    duplicate = await db.scalar(
        select(Document.filename).where(
            Document.organization_id == principal.org_id,
            Document.content_hash == content_hash,
        )
    )
    if duplicate is not None:
        raise HTTPException(
            status.HTTP_409_CONFLICT, f"Already uploaded as {duplicate}"
        )

    document = Document(
        organization_id=principal.org_id,
        filename=filename,
        content_type=file.content_type or "application/octet-stream",
        size_bytes=len(data),
        content_hash=content_hash,
    )
    db.add(document)
    await db.commit()

    # Parse, chunk and embed after the response is sent: that takes seconds.
    background_tasks.add_task(ingest, document.id, data)
    return DocumentOut.model_validate(document)


@router.delete("/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(
    document_id: uuid.UUID, principal: OrgUser, db: DbSession
) -> None:
    document = await _get_document(db, principal, document_id)
    await db.delete(document)  # its chunks go with it (ON DELETE CASCADE)
    await db.commit()
