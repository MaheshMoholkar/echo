"""The widget's credential: a contact session id in the X-Contact-Session header.

Widget visitors don't have accounts. They give a name and email, get a
session id (a random UUID, so unguessable), and send it with every request.
It expires after 24 h, and is extended while it is still being used.
"""

import uuid
from typing import Annotated

from fastapi import Depends, Header, HTTPException, status

from echo_api import chat
from echo_api.db import DbSession
from echo_api.models import ContactSession, Conversation, ConversationStatus


async def current_contact(
    db: DbSession,
    x_contact_session: Annotated[uuid.UUID | None, Header()] = None,
) -> ContactSession:
    if x_contact_session is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing contact session")
    contact = await db.get(ContactSession, x_contact_session)
    now = chat.now()
    if contact is None or contact.expires_at <= now:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Contact session expired")
    if contact.expires_at - now < chat.REFRESH_WITHIN:
        contact.expires_at = now + chat.SESSION_TTL
        await db.commit()
    return contact


CurrentContact = Annotated[ContactSession, Depends(current_contact)]


async def contact_conversation(
    conversation_id: uuid.UUID, contact: CurrentContact, db: DbSession
) -> Conversation:
    conversation = await chat.get_conversation(db, contact, conversation_id)
    if conversation is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Conversation not found")
    return conversation


ContactConversation = Annotated[Conversation, Depends(contact_conversation)]


async def open_conversation(conversation: ContactConversation) -> Conversation:
    # Checked in a dependency, not in the streaming route: once an SSE
    # response has started, its status code can no longer change.
    if conversation.status == ConversationStatus.resolved:
        raise HTTPException(status.HTTP_409_CONFLICT, "Conversation is resolved")
    return conversation


OpenConversation = Annotated[Conversation, Depends(open_conversation)]
