"""The operator inbox, from the dashboard: conversations, replies, status."""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status

from echo_api import chat
from echo_api.auth import OrgUser
from echo_api.db import DbSession
from echo_api.models import Conversation, ConversationStatus, MessageRole
from echo_api.schemas import (
    ConversationStats,
    InboxPage,
    MessageCreate,
    MessageOut,
    OperatorConversation,
    StatusUpdate,
)

router = APIRouter(prefix="/conversations", tags=["inbox"])


async def org_conversation(
    conversation_id: uuid.UUID, principal: OrgUser, db: DbSession
) -> Conversation:
    conversation = await chat.get_org_conversation(
        db, principal.org_id, conversation_id
    )
    if conversation is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Conversation not found")
    return conversation


OrgConversation = Annotated[Conversation, Depends(org_conversation)]


@router.get("")
async def list_conversations(
    principal: OrgUser,
    db: DbSession,
    status_: Annotated[ConversationStatus | None, Query(alias="status")] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 30,
    cursor: str | None = None,
) -> InboxPage:
    try:
        return await chat.list_inbox(db, principal.org_id, status_, limit, cursor)
    except chat.InvalidCursor as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc


# Before /{conversation_id}, which would otherwise take "stats" for an id.
@router.get("/stats")
async def conversation_stats(principal: OrgUser, db: DbSession) -> ConversationStats:
    return await chat.count_by_status(db, principal.org_id)


@router.get("/{conversation_id}")
async def get_conversation(conversation: OrgConversation) -> OperatorConversation:
    return OperatorConversation.model_validate(conversation)


@router.patch("/{conversation_id}")
async def update_status(
    body: StatusUpdate, conversation: OrgConversation, principal: OrgUser, db: DbSession
) -> OperatorConversation:
    """Resolve, reopen, or hand back to the AI (status `unresolved`)."""
    conversation.status = body.status
    await db.commit()
    refreshed = await chat.get_org_conversation(db, principal.org_id, conversation.id)
    return OperatorConversation.model_validate(refreshed)


@router.post("/{conversation_id}/messages", status_code=status.HTTP_201_CREATED)
async def reply(
    body: MessageCreate, conversation: OrgConversation, db: DbSession
) -> MessageOut:
    """An operator's reply. On a conversation the AI is handling, it's a
    takeover: the status becomes `escalated` and the AI stops answering."""
    if conversation.status == ConversationStatus.resolved:
        raise HTTPException(
            status.HTTP_409_CONFLICT, "Conversation is resolved; reopen it first"
        )
    if conversation.status == ConversationStatus.unresolved:
        conversation.status = ConversationStatus.escalated
    message = await chat.add_message(
        db, conversation, MessageRole.operator, body.content
    )
    await db.commit()
    return MessageOut.model_validate(message)
