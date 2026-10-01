"""The voice bot's own logic. The audio path (Whisper, Kokoro, WebRTC) is
exercised end to end in a browser, not here."""

import httpx
import pytest
import uvicorn
from pipecat.frames.frames import LLMContextFrame
from pipecat.processors.aggregators.llm_context import LLMContext
from sqlalchemy.ext.asyncio import AsyncSession

from echo_api import knowledge
from echo_api.models import ContactSession, Conversation, ConversationStatus
from echo_voice import ServerSettings, main
from echo_voice.bot import PASSAGES, KnowledgeRetriever, history_messages

HIT = knowledge.SearchHit(
    filename="shipping.md", content="Delivery takes 3-5 days.", distance=0.3
)


async def test_retriever_gives_the_model_results_and_keeps_history_clean(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    queries: list[str] = []

    async def search(
        db: object, organization_id: str, query: str, limit: int
    ) -> list[knowledge.SearchHit]:
        assert limit == PASSAGES  # fewer than the text chat: see PASSAGES
        queries.append(query)
        return [HIT]

    monkeypatch.setattr(knowledge, "search", search)
    history = [
        {"role": "assistant", "content": "Hi! How can I help you today?"},
        {"role": "user", "content": "How long does delivery take?"},
    ]
    shared = LLMContext(messages=[dict(m) for m in history])

    frame = await KnowledgeRetriever("org_1").with_knowledge(
        LLMContextFrame(context=shared)
    )

    sent = frame.context.get_messages()
    assert "<knowledge_base>" in sent[-1]["content"]
    assert "Delivery takes 3-5 days." in sent[-1]["content"]
    assert (
        shared.get_messages() == history
    )  # the conversation's own record is untouched
    assert queries == ["How long does delivery take?"]


async def test_short_follow_up_is_searched_with_the_previous_turn(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    queries: list[str] = []

    async def search(
        db: object, organization_id: str, query: str, limit: int
    ) -> list[knowledge.SearchHit]:
        queries.append(query)
        return []

    monkeypatch.setattr(knowledge, "search", search)
    context = LLMContext(
        messages=[
            {"role": "user", "content": "How long does delivery take?"},
            {"role": "assistant", "content": "Three to five days."},
            {"role": "user", "content": "And abroad?"},
        ]
    )
    await KnowledgeRetriever("org_1").with_knowledge(LLMContextFrame(context=context))
    assert queries == ["How long does delivery take?\nAnd abroad?"]


async def test_history_maps_roles(conversation: Conversation) -> None:
    assert history_messages(conversation) == [
        {"role": "assistant", "content": "Hi! How can I help you today?"}
    ]


# --- /offer access rules (checked before any WebRTC work) ---------------------


def offer(conversation_id: object = None) -> dict[str, object]:
    body: dict[str, object] = {"sdp": "v=0", "type": "offer"}
    if conversation_id is not None:
        body["requestData"] = {"conversation_id": str(conversation_id)}
    return body


async def test_offer_needs_a_contact_session(
    client: httpx.AsyncClient, conversation: Conversation
) -> None:
    response = await client.post("/offer", json=offer(conversation.id))
    assert response.status_code == 401


async def test_offer_needs_a_conversation_id(
    client: httpx.AsyncClient, contact: ContactSession
) -> None:
    headers = {"X-Contact-Session": str(contact.id)}
    assert (
        await client.post("/offer", json=offer(), headers=headers)
    ).status_code == 400


async def test_offer_rejects_someone_elses_conversation(
    client: httpx.AsyncClient,
    db: AsyncSession,
    contact: ContactSession,
    conversation: Conversation,
) -> None:
    from echo_api import chat
    from echo_api.schemas import ContactSessionCreate

    stranger = await chat.create_contact_session(
        db,
        ContactSessionCreate(
            organization_id=contact.organization_id, name="Eve", email="eve@example.com"
        ),
    )
    headers = {"X-Contact-Session": str(stranger.id)}
    response = await client.post("/offer", json=offer(conversation.id), headers=headers)
    assert response.status_code == 404


async def test_offer_refused_once_the_team_has_the_conversation(
    client: httpx.AsyncClient,
    db: AsyncSession,
    contact: ContactSession,
    conversation: Conversation,
) -> None:
    conversation.status = ConversationStatus.escalated
    await db.flush()
    headers = {"X-Contact-Session": str(contact.id)}
    response = await client.post("/offer", json=offer(conversation.id), headers=headers)
    assert response.status_code == 409


# --- where the bot listens -----------------------------------------------------


def test_bot_listens_on_this_machine_only_by_default(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("VOICE_HOST", raising=False)
    monkeypatch.delenv("VOICE_PORT", raising=False)
    settings = ServerSettings(_env_file=None)  # the defaults, whatever .env says
    assert (settings.host, settings.port) == ("127.0.0.1", 8001)


def test_bot_listens_where_the_environment_says(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    served: dict[str, object] = {}
    monkeypatch.setenv("VOICE_HOST", "192.0.2.10")
    monkeypatch.setenv("VOICE_PORT", "9001")
    monkeypatch.setattr(uvicorn, "run", lambda app, **where: served.update(where))
    main()
    assert served == {"host": "192.0.2.10", "port": 9001}
