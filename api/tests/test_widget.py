"""The widget's public API, with the LLM replaced by a scripted FunctionModel.

FunctionModel plays the model's part: it sees the same messages Ollama
would and "answers" with text or tool calls we choose, so these tests are
fast and deterministic. Every test's data is rolled back (see conftest).
"""

import json
import uuid
from collections.abc import AsyncIterator
from datetime import timedelta
from typing import Any

import httpx
import pytest
from pydantic_ai.messages import (
    ModelMessage,
    ModelRequest,
    ModelResponse,
    ToolReturnPart,
)
from pydantic_ai.models.function import (
    AgentInfo,
    DeltaToolCall,
    DeltaToolCalls,
    FunctionModel,
)
from sqlalchemy.ext.asyncio import AsyncSession

from echo_api import chat
from echo_api.agent import support_agent
from echo_api.models import ContactSession, Conversation, ConversationStatus

pytestmark = pytest.mark.asyncio


def parse_sse(body: str) -> list[tuple[str, Any]]:
    """`event:`/`data:` blocks separated by blank lines; data is JSON."""
    events = []
    for block in body.strip().split("\n\n"):
        event, data = "message", None
        for line in block.splitlines():
            if line.startswith("event:"):
                event = line.removeprefix("event:").strip()
            elif line.startswith("data:"):
                data = json.loads(line.removeprefix("data:").strip())
        if data is not None:
            events.append((event, data))
    return events


def replies(*chunks: str) -> FunctionModel:
    async def stream(
        messages: list[ModelMessage], info: AgentInfo
    ) -> AsyncIterator[str]:
        for chunk in chunks:
            yield chunk

    return FunctionModel(stream_function=stream)


def calls_tool_then_replies(tool: str, text: str) -> FunctionModel:
    """First model call asks for the tool; once it sees the result, it answers."""

    async def stream(
        messages: list[ModelMessage], info: AgentInfo
    ) -> AsyncIterator[str | DeltaToolCalls]:
        if any(isinstance(part, ToolReturnPart) for part in messages[-1].parts):
            yield text
        else:
            yield {0: DeltaToolCall(name=tool, json_args="{}")}

    return FunctionModel(stream_function=stream)


def must_not_be_called() -> FunctionModel:
    async def stream(
        messages: list[ModelMessage], info: AgentInfo
    ) -> AsyncIterator[str]:
        raise AssertionError("the model should not be called")
        yield ""  # pragma: no cover  (makes this an async generator)

    return FunctionModel(stream_function=stream)


async def start_session(
    client: httpx.AsyncClient, organization_id: str
) -> dict[str, str]:
    response = await client.post(
        "/v1/public/contact-sessions",
        json={
            "organization_id": organization_id,
            "name": "Bob",
            "email": "bob@example.com",
        },
    )
    assert response.status_code == 201, response.text
    return {"X-Contact-Session": response.json()["id"]}


async def start_conversation(client: httpx.AsyncClient, headers: dict[str, str]) -> str:
    response = await client.post("/v1/public/conversations", headers=headers)
    assert response.status_code == 201, response.text
    return response.json()["id"]


async def send(
    client: httpx.AsyncClient,
    headers: dict[str, str],
    conversation_id: str,
    content: str,
) -> list[tuple[str, Any]]:
    response = await client.post(
        f"/v1/public/conversations/{conversation_id}/messages",
        headers=headers,
        json={"content": content},
    )
    assert response.status_code == 200, response.text
    assert response.headers["content-type"].startswith("text/event-stream")
    # Without it, Next.js gzips the proxied stream and the reply arrives in one lump.
    assert "no-transform" in ", ".join(response.headers.get_list("cache-control"))
    return parse_sse(response.text)


# --- organizations and sessions ------------------------------------------------


async def test_unknown_organization(
    client: httpx.AsyncClient, db: AsyncSession
) -> None:
    assert (await client.get("/v1/public/organizations/nope")).status_code == 404
    response = await client.post(
        "/v1/public/contact-sessions",
        json={"organization_id": "nope", "name": "Bob", "email": "bob@example.com"},
    )
    assert response.status_code == 404


async def test_session_is_the_credential(
    client: httpx.AsyncClient, organization_id: str
) -> None:
    organization = await client.get(f"/v1/public/organizations/{organization_id}")
    assert organization.json() == {"id": organization_id, "name": "Test Org"}

    headers = await start_session(client, organization_id)
    current = await client.get("/v1/public/contact-sessions/current", headers=headers)
    assert current.status_code == 200
    assert current.json()["organization_id"] == organization_id

    assert (await client.get("/v1/public/conversations")).status_code == 401
    unknown = {"X-Contact-Session": str(uuid.uuid4())}
    assert (
        await client.get("/v1/public/conversations", headers=unknown)
    ).status_code == 401


async def test_expired_session_is_rejected(
    client: httpx.AsyncClient, db: AsyncSession, organization_id: str
) -> None:
    headers = await start_session(client, organization_id)
    contact = await db.get(ContactSession, uuid.UUID(headers["X-Contact-Session"]))
    assert contact is not None
    contact.expires_at = chat.now() - timedelta(minutes=1)
    await db.flush()
    assert (
        await client.get("/v1/public/conversations", headers=headers)
    ).status_code == 401


async def test_session_nearing_expiry_is_extended(
    client: httpx.AsyncClient, db: AsyncSession, organization_id: str
) -> None:
    headers = await start_session(client, organization_id)
    contact = await db.get(ContactSession, uuid.UUID(headers["X-Contact-Session"]))
    assert contact is not None
    contact.expires_at = chat.now() + timedelta(hours=1)
    await db.flush()
    await client.get("/v1/public/contact-sessions/current", headers=headers)
    assert contact.expires_at - chat.now() > timedelta(hours=23)


# --- conversations -----------------------------------------------------------------


async def test_new_conversation_starts_with_a_greeting(
    client: httpx.AsyncClient, organization_id: str
) -> None:
    headers = await start_session(client, organization_id)
    conversation_id = await start_conversation(client, headers)

    detail = (
        await client.get(f"/v1/public/conversations/{conversation_id}", headers=headers)
    ).json()
    assert detail["status"] == "unresolved"
    assert [(m["role"], m["content"]) for m in detail["messages"]] == [
        ("assistant", chat.GREETING)
    ]

    listed = (await client.get("/v1/public/conversations", headers=headers)).json()
    assert [c["id"] for c in listed] == [conversation_id]
    assert listed[0]["last_message"]["content"] == chat.GREETING


async def test_cannot_read_another_visitors_conversation(
    client: httpx.AsyncClient, organization_id: str
) -> None:
    alice = await start_session(client, organization_id)
    conversation_id = await start_conversation(client, alice)
    mallory = await start_session(client, organization_id)

    response = await client.get(
        f"/v1/public/conversations/{conversation_id}", headers=mallory
    )
    assert response.status_code == 404  # not 403: don't confirm it exists


# --- chat with the agent ----------------------------------------------------------------


async def test_reply_streams_and_is_saved(
    client: httpx.AsyncClient, organization_id: str
) -> None:
    headers = await start_session(client, organization_id)
    conversation_id = await start_conversation(client, headers)

    with support_agent.override(model=replies("Hello", " there!")):
        events = await send(client, headers, conversation_id, "Hi")

    assert [name for name, _ in events] == [
        "message",
        "tool",  # every turn searches the knowledge base first
        "delta",
        "delta",
        "message",
        "status",
    ]
    assert events[0][1]["role"] == "customer"
    assert events[1][1] == "search_knowledge_base"
    assert [data for name, data in events if name == "delta"] == ["Hello", " there!"]
    assert events[4][1] | {"id": None, "created_at": None} == {
        "id": None,
        "created_at": None,
        "role": "assistant",
        "content": "Hello there!",
    }
    assert events[5][1] == "unresolved"

    detail = (
        await client.get(f"/v1/public/conversations/{conversation_id}", headers=headers)
    ).json()
    assert [m["role"] for m in detail["messages"]] == [
        "assistant",
        "customer",
        "assistant",
    ]


async def test_model_sees_the_whole_conversation(
    client: httpx.AsyncClient, organization_id: str
) -> None:
    seen: list[list[ModelMessage]] = []

    async def stream(
        messages: list[ModelMessage], info: AgentInfo
    ) -> AsyncIterator[str]:
        seen.append(messages)
        yield "ok"

    headers = await start_session(client, organization_id)
    conversation_id = await start_conversation(client, headers)
    with support_agent.override(model=FunctionModel(stream_function=stream)):
        await send(client, headers, conversation_id, "first")
        await send(client, headers, conversation_id, "second")

    # Second turn: greeting, "first", "ok", then "second" appended at the end.
    second_turn = seen[1]
    kinds = [type(m).__name__ for m in second_turn]
    assert kinds == ["ModelResponse", "ModelRequest", "ModelResponse", "ModelRequest"]
    assert isinstance(second_turn[0], ModelResponse)
    assert isinstance(second_turn[-1], ModelRequest)


async def test_escalation_tool_hands_over_to_a_human(
    client: httpx.AsyncClient, db: AsyncSession, organization_id: str
) -> None:
    headers = await start_session(client, organization_id)
    conversation_id = await start_conversation(client, headers)

    model = calls_tool_then_replies(
        "escalate_conversation", "A team member will reply here."
    )
    with support_agent.override(model=model):
        events = await send(client, headers, conversation_id, "I want a real person")

    assert ("tool", "escalate_conversation") in events
    assert events[-1] == ("status", "escalated")
    conversation = await db.get(Conversation, uuid.UUID(conversation_id))
    assert conversation is not None
    assert conversation.status == ConversationStatus.escalated

    # From now on the AI stays quiet: the message is saved, the model isn't called.
    with support_agent.override(model=must_not_be_called()):
        events = await send(client, headers, conversation_id, "Hello?")
    assert [name for name, _ in events] == ["message", "status"]
    assert events[-1] == ("status", "escalated")


async def test_resolved_conversation_accepts_no_messages(
    client: httpx.AsyncClient, organization_id: str
) -> None:
    headers = await start_session(client, organization_id)
    conversation_id = await start_conversation(client, headers)

    with support_agent.override(
        model=calls_tool_then_replies("resolve_conversation", "Bye!")
    ):
        events = await send(client, headers, conversation_id, "That's all, thanks")
    assert events[-1] == ("status", "resolved")

    response = await client.post(
        f"/v1/public/conversations/{conversation_id}/messages",
        headers=headers,
        json={"content": "one more thing"},
    )
    assert response.status_code == 409


async def test_text_parts_around_a_tool_call_are_separated(
    client: httpx.AsyncClient, organization_id: str
) -> None:
    """Text, then a tool call, then more text: two parts, not one run-on."""

    async def stream(
        messages: list[ModelMessage], info: AgentInfo
    ) -> AsyncIterator[str | DeltaToolCalls]:
        if any(isinstance(part, ToolReturnPart) for part in messages[-1].parts):
            yield "A team member will reply here."
        else:
            yield "Let me get someone."
            yield {1: DeltaToolCall(name="escalate_conversation", json_args="{}")}

    headers = await start_session(client, organization_id)
    conversation_id = await start_conversation(client, headers)
    with support_agent.override(model=FunctionModel(stream_function=stream)):
        events = await send(client, headers, conversation_id, "A person please")

    [reply] = [
        data
        for name, data in events
        if name == "message" and data["role"] == "assistant"
    ]
    assert reply["content"] == "Let me get someone.\n\nA team member will reply here."
