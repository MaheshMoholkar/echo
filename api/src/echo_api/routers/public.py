"""Routes for the embeddable widget. No user login: see echo_api.contacts."""

import logging
from collections.abc import AsyncIterable

import openai
from fastapi import APIRouter, Depends, HTTPException, Response, status
from fastapi.sse import EventSourceResponse, ServerSentEvent
from pydantic_ai.exceptions import AgentRunError

from echo_api import agent, chat
from echo_api.contacts import ContactConversation, CurrentContact, OpenConversation
from echo_api.db import DbSession
from echo_api.models import ConversationStatus, MessageRole
from echo_api.schemas import (
    ContactSessionCreate,
    ContactSessionOut,
    ConversationDetail,
    ConversationSummary,
    MessageCreate,
    MessageOut,
    OrganizationOut,
)

log = logging.getLogger(__name__)
router = APIRouter(prefix="/public", tags=["widget"])

FALLBACK_REPLY = "Sorry, I couldn't answer just now. Please try again."


@router.get("/organizations/{organization_id}")
async def get_organization(organization_id: str, db: DbSession) -> OrganizationOut:
    organization = await chat.get_organization(db, organization_id)
    if organization is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Organization not found")
    return organization


@router.post("/contact-sessions", status_code=status.HTTP_201_CREATED)
async def create_contact_session(
    body: ContactSessionCreate, db: DbSession
) -> ContactSessionOut:
    # Checked here, not only in the widget: anyone can call this endpoint.
    if await chat.get_organization(db, body.organization_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Organization not found")
    return ContactSessionOut.model_validate(await chat.create_contact_session(db, body))


@router.get("/contact-sessions/current")
async def current_contact_session(contact: CurrentContact) -> ContactSessionOut:
    return ContactSessionOut.model_validate(contact)


@router.get("/conversations")
async def list_conversations(
    contact: CurrentContact, db: DbSession
) -> list[ConversationSummary]:
    return await chat.list_conversations(db, contact)


@router.post("/conversations", status_code=status.HTTP_201_CREATED)
async def create_conversation(
    contact: CurrentContact, db: DbSession
) -> ConversationDetail:
    return ConversationDetail.model_validate(
        await chat.create_conversation(db, contact)
    )


@router.get("/conversations/{conversation_id}")
async def get_conversation(conversation: ContactConversation) -> ConversationDetail:
    return ConversationDetail.model_validate(conversation)


def no_transform(response: Response) -> None:
    """Proxies that compress (Next.js does, on rewrites) buffer a stream until
    they have enough bytes to gzip, so the reply arrives in one lump.
    `no-transform` tells them to pass the body through untouched.

    A dependency, because it runs before the response starts; the streaming
    function's body only runs after the headers are already sent.
    """
    response.headers["Cache-Control"] = "no-cache, no-transform"


@router.post(
    "/conversations/{conversation_id}/messages",
    response_class=EventSourceResponse,
    dependencies=[Depends(no_transform)],
)
async def send_message(
    body: MessageCreate, conversation: OpenConversation, db: DbSession
) -> AsyncIterable[ServerSentEvent]:
    """Save the customer's message and stream the reply as Server-Sent Events.

    Events: `message` (a saved message), `tool` (the assistant is searching
    or using a tool), `delta` (a piece of the reply as it is generated),
    `error`, and finally `status` (the conversation status after this turn).
    """
    previous = list(conversation.messages)  # before this message is added
    customer_message = await chat.add_message(
        db, conversation, MessageRole.customer, body.content
    )
    await db.commit()
    yield ServerSentEvent(
        event="message", data=MessageOut.model_validate(customer_message)
    )

    # Escalated: a human operator answers (milestone 5); the AI stays quiet.
    if conversation.status == ConversationStatus.unresolved:
        reply = ""
        try:
            async for event in agent.reply_events(
                db, conversation, body.content, previous
            ):
                match event:
                    case agent.TextDelta(text=delta):
                        reply += delta
                        yield ServerSentEvent(event="delta", data=delta)
                    case agent.ToolCalled(name=name):
                        yield ServerSentEvent(event="tool", data=name)
        except (AgentRunError, openai.APIError):
            log.exception("agent run failed for conversation %s", conversation.id)
            yield ServerSentEvent(event="error", data="The assistant is unavailable.")

        assistant_message = await chat.add_message(
            db, conversation, MessageRole.assistant, reply.strip() or FALLBACK_REPLY
        )
        await db.commit()  # also saves a status change made by a tool
        yield ServerSentEvent(
            event="message", data=MessageOut.model_validate(assistant_message)
        )

    yield ServerSentEvent(event="status", data=conversation.status)
