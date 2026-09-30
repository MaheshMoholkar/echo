"""The operator inbox: listing, pagination, replies, takeover, status, enhance."""

from collections.abc import AsyncIterator, Awaitable, Callable

import httpx
import pytest
from jwt_helpers import bearer, make_token
from pydantic_ai.messages import ModelMessage, ModelResponse, TextPart, UserPromptPart
from pydantic_ai.models.function import AgentInfo, FunctionModel

from echo_api.agent import support_agent
from echo_api.assist import enhance_agent

pytestmark = [pytest.mark.asyncio, pytest.mark.usefixtures("trust_test_key")]


def replies(text: str) -> FunctionModel:
    async def stream(
        messages: list[ModelMessage], info: AgentInfo
    ) -> AsyncIterator[str]:
        yield text

    return FunctionModel(stream_function=stream)


def must_not_be_called() -> FunctionModel:
    async def stream(
        messages: list[ModelMessage], info: AgentInfo
    ) -> AsyncIterator[str]:
        raise AssertionError("the AI should stay quiet")
        yield ""  # pragma: no cover

    return FunctionModel(stream_function=stream)


class Visitor:
    """A widget visitor with one conversation, driven through the public API."""

    def __init__(
        self, client: httpx.AsyncClient, headers: dict[str, str], conversation_id: str
    ):
        self.client, self.headers, self.conversation_id = (
            client,
            headers,
            conversation_id,
        )

    @classmethod
    async def start(
        cls, client: httpx.AsyncClient, org_id: str, name: str
    ) -> "Visitor":
        session = await client.post(
            "/v1/public/contact-sessions",
            json={
                "organization_id": org_id,
                "name": name,
                "email": f"{name.lower()}@example.com",
            },
        )
        headers = {"X-Contact-Session": session.json()["id"]}
        conversation = await client.post("/v1/public/conversations", headers=headers)
        return cls(client, headers, conversation.json()["id"])

    async def say(self, text: str) -> httpx.Response:
        return await self.client.post(
            f"/v1/public/conversations/{self.conversation_id}/messages",
            headers=self.headers,
            json={"content": text},
        )

    async def messages(self) -> list[tuple[str, str]]:
        response = await self.client.get(
            f"/v1/public/conversations/{self.conversation_id}", headers=self.headers
        )
        return [(m["role"], m["content"]) for m in response.json()["messages"]]


async def inbox(client: httpx.AsyncClient, org_id: str, **params: str | int) -> dict:
    response = await client.get(
        "/v1/conversations", headers=bearer(org_id), params=params
    )
    assert response.status_code == 200, response.text
    return response.json()


# --- listing ----------------------------------------------------------------------------


async def test_inbox_shows_latest_activity_first(
    client: httpx.AsyncClient, organization_id: str
) -> None:
    ana = await Visitor.start(client, organization_id, "Ana")
    await Visitor.start(client, organization_id, "Ben")
    await Visitor.start(client, organization_id, "Cleo")
    with support_agent.override(model=replies("Happy to help.")):
        await ana.say("Hello?")  # Ana's conversation now has the newest activity

    page = await inbox(client, organization_id)
    assert [item["contact"]["name"] for item in page["items"]] == ["Ana", "Cleo", "Ben"]
    first = page["items"][0]
    assert first["contact"]["email"] == "ana@example.com"
    assert first["last_message"]["content"] == "Happy to help."
    assert page["next_cursor"] is None


async def test_filter_by_status(
    client: httpx.AsyncClient, organization_id: str
) -> None:
    ana = await Visitor.start(client, organization_id, "Ana")
    await Visitor.start(client, organization_id, "Ben")
    await client.patch(
        f"/v1/conversations/{ana.conversation_id}",
        headers=bearer(organization_id),
        json={"status": "escalated"},
    )

    escalated = await inbox(client, organization_id, status="escalated")
    unresolved = await inbox(client, organization_id, status="unresolved")
    assert [i["contact"]["name"] for i in escalated["items"]] == ["Ana"]
    assert [i["contact"]["name"] for i in unresolved["items"]] == ["Ben"]


async def test_pages_never_repeat_or_skip(
    client: httpx.AsyncClient, organization_id: str
) -> None:
    names = ["Ana", "Ben", "Cleo", "Dev", "Eli"]
    for name in names:
        await Visitor.start(client, organization_id, name)

    seen: list[str] = []
    cursor: str | None = None
    pages = 0
    while True:
        params: dict[str, str | int] = {"limit": 2} | (
            {"cursor": cursor} if cursor else {}
        )
        page = await inbox(client, organization_id, **params)
        seen += [item["contact"]["name"] for item in page["items"]]
        pages += 1
        cursor = page["next_cursor"]
        if cursor is None:
            break

    assert pages == 3
    assert seen == list(reversed(names))  # newest first, each exactly once

    bad = await client.get(
        "/v1/conversations", headers=bearer(organization_id), params={"cursor": "nope"}
    )
    assert bad.status_code == 400


async def test_other_organizations_see_nothing(
    client: httpx.AsyncClient, make_organization: Callable[[], Awaitable[str]]
) -> None:
    acme, globex = await make_organization(), await make_organization()
    ana = await Visitor.start(client, acme, "Ana")
    path = f"/v1/conversations/{ana.conversation_id}"

    assert (await inbox(client, globex))["items"] == []
    assert (await client.get(path, headers=bearer(globex))).status_code == 404
    patch = await client.patch(
        path, headers=bearer(globex), json={"status": "resolved"}
    )
    assert patch.status_code == 404
    reply = await client.post(
        f"{path}/messages", headers=bearer(globex), json={"content": "hi"}
    )
    assert reply.status_code == 404


async def test_stats_count_each_status_in_the_organization(
    client: httpx.AsyncClient, make_organization: Callable[[], Awaitable[str]]
) -> None:
    acme, globex = await make_organization(), await make_organization()
    ana = await Visitor.start(client, acme, "Ana")
    ben = await Visitor.start(client, acme, "Ben")
    await Visitor.start(client, acme, "Cleo")
    await Visitor.start(client, globex, "Dev")
    for visitor, status in [(ana, "escalated"), (ben, "resolved")]:
        await client.patch(
            f"/v1/conversations/{visitor.conversation_id}",
            headers=bearer(acme),
            json={"status": status},
        )

    stats = await client.get("/v1/conversations/stats", headers=bearer(acme))
    assert stats.json() == {"unresolved": 1, "escalated": 1, "resolved": 1}
    empty = await make_organization()
    stats = await client.get("/v1/conversations/stats", headers=bearer(empty))
    assert stats.json() == {"unresolved": 0, "escalated": 0, "resolved": 0}


async def test_inbox_needs_a_token_with_an_organization(
    client: httpx.AsyncClient,
) -> None:
    assert (await client.get("/v1/conversations")).status_code == 401
    no_org = {"Authorization": f"Bearer {make_token(orgId=None)}"}
    assert (await client.get("/v1/conversations", headers=no_org)).status_code == 403


# --- detail, replies and status ------------------------------------------------------------


async def test_detail_has_contact_and_thread(
    client: httpx.AsyncClient, organization_id: str
) -> None:
    ana = await Visitor.start(client, organization_id, "Ana")
    with support_agent.override(model=replies("Sure.")):
        await ana.say("Can you help?")

    response = await client.get(
        f"/v1/conversations/{ana.conversation_id}", headers=bearer(organization_id)
    )
    detail = response.json()
    assert detail["contact"]["name"] == "Ana"
    assert [m["role"] for m in detail["messages"]] == [
        "assistant",
        "customer",
        "assistant",
    ]


async def test_operator_reply_takes_over_from_the_ai(
    client: httpx.AsyncClient, organization_id: str
) -> None:
    ana = await Visitor.start(client, organization_id, "Ana")
    response = await client.post(
        f"/v1/conversations/{ana.conversation_id}/messages",
        headers=bearer(organization_id),
        json={"content": "Hi Ana, I'm Priya from the team."},
    )
    assert response.status_code == 201
    assert response.json()["role"] == "operator"

    # The visitor sees it, and the AI no longer answers.
    assert (await ana.messages())[-1] == (
        "operator",
        "Hi Ana, I'm Priya from the team.",
    )
    with support_agent.override(model=must_not_be_called()):
        answer = await ana.say("Thanks Priya!")
    assert answer.text.rstrip().endswith('event: status\ndata: "escalated"')


async def test_handing_back_to_the_ai(
    client: httpx.AsyncClient, organization_id: str
) -> None:
    ana = await Visitor.start(client, organization_id, "Ana")
    path = f"/v1/conversations/{ana.conversation_id}"
    await client.post(
        f"{path}/messages", headers=bearer(organization_id), json={"content": "Hi"}
    )
    await client.patch(
        path, headers=bearer(organization_id), json={"status": "unresolved"}
    )

    with support_agent.override(model=replies("The assistant again.")):
        await ana.say("One more question")
    assert (await ana.messages())[-1] == ("assistant", "The assistant again.")


async def test_resolved_conversation_takes_no_replies(
    client: httpx.AsyncClient, organization_id: str
) -> None:
    ana = await Visitor.start(client, organization_id, "Ana")
    path = f"/v1/conversations/{ana.conversation_id}"
    patch = await client.patch(
        path, headers=bearer(organization_id), json={"status": "resolved"}
    )
    assert patch.json()["status"] == "resolved"

    reply = await client.post(
        f"{path}/messages", headers=bearer(organization_id), json={"content": "Hi"}
    )
    assert reply.status_code == 409
    assert (await ana.say("Hello?")).status_code == 409


# --- enhance ----------------------------------------------------------------------------------


async def test_enhance_rewrites_the_draft(
    client: httpx.AsyncClient, organization_id: str
) -> None:
    seen: list[str] = []

    def model(messages: list[ModelMessage], info: AgentInfo) -> ModelResponse:
        [part] = messages[-1].parts
        assert isinstance(part, UserPromptPart)
        seen.append(str(part.content))
        return ModelResponse(
            parts=[TextPart(content="  Yes, the Pro plan is 499 rupees a month.  ")]
        )

    with enhance_agent.override(model=FunctionModel(function=model)):
        response = await client.post(
            "/v1/assist/enhance",
            headers=bearer(organization_id),
            json={"text": "ya pro is 499 a month"},
        )
    assert response.status_code == 200
    assert response.json() == {"text": "Yes, the Pro plan is 499 rupees a month."}
    assert seen == ["ya pro is 499 a month"]  # only the draft, not the conversation


async def test_enhance_retries_when_a_fact_is_added(
    client: httpx.AsyncClient, organization_id: str
) -> None:
    """The model adds "$"; the validator sends it back; the retry keeps "499"."""
    attempts: list[list[ModelMessage]] = []

    def model(messages: list[ModelMessage], info: AgentInfo) -> ModelResponse:
        attempts.append(messages)
        text = (
            "The Pro plan is $499 a month."
            if len(attempts) == 1
            else "The Pro plan is 499 a month."
        )
        return ModelResponse(parts=[TextPart(content=text)])

    with enhance_agent.override(model=FunctionModel(function=model)):
        response = await client.post(
            "/v1/assist/enhance",
            headers=bearer(organization_id),
            json={"text": "pro is 499 a month"},
        )
    assert response.json() == {"text": "The Pro plan is 499 a month."}
    assert len(attempts) == 2
    feedback = str(attempts[1][-1].parts[0].content)  # what the retry was told
    assert "'$'" in feedback
