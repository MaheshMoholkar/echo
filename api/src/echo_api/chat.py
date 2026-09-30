"""Conversations and messages: the data side of chat, shared by all routes."""

import base64
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import func, literal, select, text, tuple_
from sqlalchemy.dialects.postgresql import distinct_on
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from echo_api.models import (
    ContactSession,
    Conversation,
    ConversationStatus,
    Message,
    MessageRole,
)
from echo_api.schemas import (
    ContactOut,
    ContactSessionCreate,
    ConversationSummary,
    InboxItem,
    InboxPage,
    MessageOut,
    OrganizationOut,
)

SESSION_TTL = timedelta(hours=24)
REFRESH_WITHIN = timedelta(hours=4)  # extend sessions that are still in use
GREETING = "Hi! How can I help you today?"


def now() -> datetime:
    return datetime.now(UTC)


async def get_organization(
    db: AsyncSession, organization_id: str
) -> OrganizationOut | None:
    """Organizations live in Better Auth's tables; we only ever read them."""
    row = (
        await db.execute(
            text("select id, name from auth.organization where id = :id"),
            {"id": organization_id},
        )
    ).one_or_none()
    return OrganizationOut(id=row.id, name=row.name) if row else None


async def create_contact_session(
    db: AsyncSession, data: ContactSessionCreate
) -> ContactSession:
    contact = ContactSession(
        organization_id=data.organization_id,
        name=data.name,
        email=str(data.email),
        details=data.details,
        expires_at=now() + SESSION_TTL,
    )
    db.add(contact)
    await db.commit()
    return contact


async def add_message(
    db: AsyncSession, conversation: Conversation, role: MessageRole, content: str
) -> Message:
    message = Message(conversation_id=conversation.id, role=role, content=content)
    db.add(message)
    # The inbox sorts by latest activity (clock_timestamp: see models._now).
    conversation.updated_at = func.clock_timestamp()
    await db.flush()
    await db.refresh(message)
    await db.refresh(conversation, ["updated_at"])
    return message


async def create_conversation(
    db: AsyncSession, contact: ContactSession
) -> Conversation:
    conversation = Conversation(
        organization_id=contact.organization_id, contact_session_id=contact.id
    )
    db.add(conversation)
    await db.flush()
    await add_message(db, conversation, MessageRole.assistant, GREETING)
    await db.commit()
    return await get_conversation(db, contact, conversation.id)  # type: ignore[return-value]


async def get_conversation(
    db: AsyncSession, contact: ContactSession, conversation_id: uuid.UUID
) -> Conversation | None:
    """Only the contact's own conversations: someone else's id reads as not found."""
    return await db.scalar(
        select(Conversation)
        .where(
            Conversation.id == conversation_id,
            Conversation.contact_session_id == contact.id,
        )
        .options(selectinload(Conversation.messages))
        .execution_options(populate_existing=True)
    )


async def list_conversations(
    db: AsyncSession, contact: ContactSession
) -> list[ConversationSummary]:
    conversations = (
        await db.scalars(
            select(Conversation)
            .where(Conversation.contact_session_id == contact.id)
            .order_by(Conversation.updated_at.desc())
            .limit(50)
        )
    ).all()
    last_by_conversation = await latest_messages(db, [c.id for c in conversations])
    return [
        ConversationSummary(
            id=c.id,
            status=c.status,
            created_at=c.created_at,
            updated_at=c.updated_at,
            last_message=(
                MessageOut.model_validate(last_by_conversation[c.id])
                if c.id in last_by_conversation
                else None
            ),
        )
        for c in conversations
    ]


async def latest_messages(
    db: AsyncSession, conversation_ids: list[uuid.UUID]
) -> dict[uuid.UUID, Message]:
    """The latest message of each conversation, in one query: Postgres
    DISTINCT ON, served by the (conversation_id, created_at) index."""
    if not conversation_ids:
        return {}
    latest = await db.scalars(
        select(Message)
        .where(Message.conversation_id.in_(conversation_ids))
        .order_by(Message.conversation_id, Message.created_at.desc())
        .ext(distinct_on(Message.conversation_id))
    )
    return {m.conversation_id: m for m in latest}


# --- the operator inbox ----------------------------------------------------------------


class InvalidCursor(ValueError):
    pass


def encode_cursor(conversation: Conversation) -> str:
    raw = f"{conversation.updated_at.isoformat()}|{conversation.id}"
    return base64.urlsafe_b64encode(raw.encode()).decode()


def decode_cursor(cursor: str) -> tuple[datetime, uuid.UUID]:
    try:
        updated_at, conversation_id = (
            base64.urlsafe_b64decode(cursor).decode().split("|")
        )
        return datetime.fromisoformat(updated_at), uuid.UUID(conversation_id)
    except ValueError as exc:  # also covers bad base64 and bad UUIDs
        raise InvalidCursor("Invalid cursor") from exc


async def list_inbox(
    db: AsyncSession,
    organization_id: str,
    status: ConversationStatus | None,
    limit: int,
    cursor: str | None,
) -> InboxPage:
    """One page of an organization's conversations, newest activity first.

    Keyset pagination: the cursor is the (updated_at, id) of the last row
    seen, and the next page is "everything older than that". Unlike
    OFFSET, it stays fast on page 1,000, and rows don't shift or repeat when
    new messages move conversations to the top while someone is scrolling.
    The id breaks ties between equal timestamps.
    """
    query = (
        select(Conversation)
        .where(Conversation.organization_id == organization_id)
        .options(selectinload(Conversation.contact))
        .order_by(Conversation.updated_at.desc(), Conversation.id.desc())
        .limit(limit + 1)  # one extra row tells us whether there's a next page
    )
    if status is not None:
        query = query.where(Conversation.status == status)
    if cursor is not None:
        updated_at, conversation_id = decode_cursor(cursor)
        query = query.where(
            tuple_(Conversation.updated_at, Conversation.id)
            < tuple_(literal(updated_at), literal(conversation_id))
        )

    rows = list(await db.scalars(query))
    page, more = rows[:limit], len(rows) > limit
    last_by_conversation = await latest_messages(db, [c.id for c in page])
    return InboxPage(
        items=[
            InboxItem(
                id=c.id,
                status=c.status,
                created_at=c.created_at,
                updated_at=c.updated_at,
                contact=ContactOut.model_validate(c.contact),
                last_message=(
                    MessageOut.model_validate(last_by_conversation[c.id])
                    if c.id in last_by_conversation
                    else None
                ),
            )
            for c in page
        ],
        next_cursor=encode_cursor(page[-1]) if more else None,
    )


async def get_org_conversation(
    db: AsyncSession, organization_id: str, conversation_id: uuid.UUID
) -> Conversation | None:
    """Only this organization's conversations: another's id reads as not found."""
    return await db.scalar(
        select(Conversation)
        .where(
            Conversation.id == conversation_id,
            Conversation.organization_id == organization_id,
        )
        .options(
            selectinload(Conversation.messages), selectinload(Conversation.contact)
        )
        .execution_options(populate_existing=True)
    )
