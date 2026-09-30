"""Request and response bodies shared by the widget and (later) the dashboard."""

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from echo_api.models import ConversationStatus, DocumentStatus, MessageRole


class OrganizationOut(BaseModel):
    id: str
    name: str


class ContactSessionCreate(BaseModel):
    organization_id: str
    name: str = Field(min_length=1, max_length=100)
    email: EmailStr
    details: dict[str, Any] | None = None


class ContactSessionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    organization_id: str
    name: str
    email: str
    expires_at: datetime


class MessageCreate(BaseModel):
    content: str = Field(min_length=1, max_length=4000)


class MessageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    role: MessageRole
    content: str
    created_at: datetime


class ConversationSummary(BaseModel):
    id: uuid.UUID
    status: ConversationStatus
    created_at: datetime
    updated_at: datetime
    last_message: MessageOut | None


class ConversationDetail(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    status: ConversationStatus
    created_at: datetime
    messages: list[MessageOut]


class DocumentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    filename: str
    content_type: str
    size_bytes: int
    status: DocumentStatus
    error: str | None
    chunk_count: int
    created_at: datetime


# --- the operator inbox ----------------------------------------------------------


class ContactOut(BaseModel):
    """The widget visitor, as operators see them."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    email: str
    details: dict[str, Any] | None
    created_at: datetime


class InboxItem(BaseModel):
    id: uuid.UUID
    status: ConversationStatus
    created_at: datetime
    updated_at: datetime
    contact: ContactOut
    last_message: MessageOut | None


class InboxPage(BaseModel):
    items: list[InboxItem]
    # Pass back as `cursor` for the next (older) page; null on the last page.
    next_cursor: str | None


class OperatorConversation(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    status: ConversationStatus
    created_at: datetime
    updated_at: datetime
    contact: ContactOut
    messages: list[MessageOut]


class StatusUpdate(BaseModel):
    status: ConversationStatus


class EnhanceRequest(BaseModel):
    text: str = Field(min_length=1, max_length=4000)


class EnhanceResponse(BaseModel):
    text: str
