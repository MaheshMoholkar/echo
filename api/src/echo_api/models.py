"""App tables, in the `public` schema. Better Auth's tables live in `auth`.

Every table carries `organization_id` (Better Auth's organization id): that
column is the tenant boundary, and every query filters by it.
"""

import uuid
from datetime import datetime
from enum import StrEnum
from typing import Any

from pgvector.sqlalchemy import Vector
from sqlalchemy import DateTime, Enum, ForeignKey, Index, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

EMBEDDING_DIMENSIONS = 768  # nomic-embed-text; see Settings.embedding_dimensions


class Base(DeclarativeBase):
    pass


class ConversationStatus(StrEnum):
    unresolved = "unresolved"  # the AI answers
    escalated = "escalated"  # a human operator took over; the AI stays quiet
    resolved = "resolved"  # closed; no new messages


class MessageRole(StrEnum):
    customer = "customer"  # the widget visitor
    assistant = "assistant"  # the AI agent
    operator = "operator"  # a human from the organization


def _enum(cls: type[StrEnum], name: str) -> Enum:
    # Stored as text with a CHECK constraint: easier to migrate than a native enum.
    return Enum(
        cls,
        name=name,
        native_enum=False,
        create_constraint=True,
        values_callable=lambda e: [m.value for m in e],
    )


def _now() -> Mapped[datetime]:
    # clock_timestamp(), not now(): now() is the time the *transaction*
    # started, so rows written in one transaction (a conversation and its
    # greeting, two messages in one test) would share a timestamp and sort
    # in no particular order.
    return mapped_column(DateTime(timezone=True), server_default=func.clock_timestamp())


class ContactSession(Base):
    """An anonymous widget visitor who gave a name and email. Valid for 24 h."""

    __tablename__ = "contact_sessions"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[str]
    name: Mapped[str]
    email: Mapped[str]
    # Browser details the widget sends (language, timezone, page URL…) for operators.
    details: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = _now()


class Conversation(Base):
    __tablename__ = "conversations"
    __table_args__ = (
        # The operator inbox, filtered by status, newest activity first.
        Index(
            "ix_conversations_org_status_updated",
            "organization_id",
            "status",
            "updated_at",
        ),
        # The inbox across all statuses: `status` sits between organization_id
        # and updated_at in the index above, so it can't serve this sort.
        Index("ix_conversations_org_updated", "organization_id", "updated_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[str]
    contact_session_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("contact_sessions.id", ondelete="CASCADE"), index=True
    )
    status: Mapped[ConversationStatus] = mapped_column(
        _enum(ConversationStatus, "conversation_status"),
        default=ConversationStatus.unresolved,
    )
    created_at: Mapped[datetime] = _now()
    updated_at: Mapped[datetime] = _now()  # bumped on every new message

    messages: Mapped[list["Message"]] = relationship(
        back_populates="conversation", order_by="Message.created_at"
    )
    contact: Mapped[ContactSession] = relationship()


class Message(Base):
    __tablename__ = "messages"
    __table_args__ = (
        # Messages are always read as "this conversation's, in order".
        Index("ix_messages_conversation_created", "conversation_id", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    conversation_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("conversations.id", ondelete="CASCADE")
    )
    role: Mapped[MessageRole] = mapped_column(_enum(MessageRole, "message_role"))
    content: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = _now()

    conversation: Mapped[Conversation] = relationship(back_populates="messages")


# --- knowledge base ------------------------------------------------------------


class DocumentStatus(StrEnum):
    processing = "processing"  # uploaded; being parsed, chunked and embedded
    ready = "ready"  # searchable
    error = "error"  # see Document.error


class Document(Base):
    """An uploaded file. Only its extracted text is kept, not the file itself."""

    __tablename__ = "documents"
    __table_args__ = (
        # The same file twice in one organization would double its search hits.
        UniqueConstraint("organization_id", "content_hash"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[str]
    filename: Mapped[str]
    content_type: Mapped[str]
    size_bytes: Mapped[int]
    content_hash: Mapped[str]  # sha256 of the uploaded bytes
    status: Mapped[DocumentStatus] = mapped_column(
        _enum(DocumentStatus, "document_status"), default=DocumentStatus.processing
    )
    error: Mapped[str | None]
    # The extracted Markdown: enough to re-chunk or re-embed later without
    # the original file (for example after changing the embedding model).
    text: Mapped[str | None] = mapped_column(Text)
    chunk_count: Mapped[int] = mapped_column(default=0)
    created_at: Mapped[datetime] = _now()


class Chunk(Base):
    """A passage of a document with its embedding: the unit of search."""

    __tablename__ = "chunks"
    __table_args__ = (
        # HNSW: a graph index for approximate nearest-neighbour search, so a
        # query doesn't compare against every chunk. Cosine distance, the
        # usual measure for text embeddings.
        Index(
            "ix_chunks_embedding",
            "embedding",
            postgresql_using="hnsw",
            postgresql_ops={"embedding": "vector_cosine_ops"},
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    document_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("documents.id", ondelete="CASCADE"), index=True
    )
    # Copied from the document so search can filter by tenant without a join.
    organization_id: Mapped[str] = mapped_column(index=True)
    chunk_index: Mapped[int]
    content: Mapped[str] = mapped_column(Text)
    embedding: Mapped[list[float]] = mapped_column(Vector(EMBEDDING_DIMENSIONS))
