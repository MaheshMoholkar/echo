"""The support agent: instructions, tools, and turning a run into a stream.

Retrieval: every customer message is searched in the knowledge base *before*
the model runs, and the results are handed over with the message ("pipeline
RAG"). We first let the model decide when to search (a search tool, "agentic
RAG"), but the 4B model skipped the tool for "Do you have a mobile app?" and
invented "Yes, iOS and Android". Always searching makes grounding
non-optional, and it's one model call per turn instead of two.

Prompt layout, for Ollama's prompt cache (prefill is ~360 tok/s on the mini,
a cached prefix ~25,000 tok/s):

    [instructions + tool definitions]    identical on every request
    [conversation history]               rebuilt the same way each turn
    [customer message + search results]  the only new tokens to process

Anything that varies per turn goes at the end, never into the instructions,
or every turn pays full prefill again.
"""

from collections.abc import AsyncIterator, Sequence
from dataclasses import dataclass

from pydantic_ai import Agent, RunContext
from pydantic_ai.messages import (
    FunctionToolCallEvent,
    ModelMessage,
    ModelRequest,
    ModelResponse,
    PartDeltaEvent,
    PartStartEvent,
    TextPart,
    TextPartDelta,
    UserPromptPart,
)
from sqlalchemy.ext.asyncio import AsyncSession

from echo_api import knowledge
from echo_api.llm import NO_THINKING, chat_model
from echo_api.models import Conversation, ConversationStatus, Message, MessageRole

# Short on purpose: every token here is prefill on a cold cache.
# (Adapted from the template's SUPPORT_AGENT_PROMPT.)
SUPPORT_INSTRUCTIONS = """\
You are a friendly customer support assistant chatting with a customer in a \
website widget.

Each customer message arrives in <customer_message>, followed by \
<knowledge_base>: passages from the company's help articles, policies and \
product documents, found by searching for that message.

How to answer:
- Questions about the company, its products, prices, accounts or policies: \
answer only from <knowledge_base>. Never guess, and don't add details it \
doesn't contain.
- If <knowledge_base> doesn't answer the question, say you don't have that \
information and ask if they'd like to talk to a person. Don't answer yes or \
no, and don't escalate yet.
- Greetings and small talk: just answer normally and ignore <knowledge_base>.
- Be brief and clear. One question at a time. Plain text, no markdown.

Tools:
- escalate_conversation: only when the customer asks for a person, or says \
yes after you offered one. Then tell them a team member will reply here.
- resolve_conversation: only when the customer confirms they're done, for \
example "that's all, thanks". Then say a short goodbye.
"""

# Messages shorter than this are often follow-ups ("and internationally?")
# that mean little on their own as a search query.
FOLLOW_UP_CHARS = 60


@dataclass
class ChatDeps:
    """What tools can reach during a run: the conversation being answered."""

    conversation: Conversation


support_agent = Agent(
    chat_model(),
    deps_type=ChatDeps,
    instructions=SUPPORT_INSTRUCTIONS,
    model_settings=NO_THINKING,
)


@support_agent.tool
async def escalate_conversation(ctx: RunContext[ChatDeps]) -> str:
    """Hand the conversation to a human operator from the company.

    Only when the customer asked for a person, or said yes to your offer.
    """
    ctx.deps.conversation.status = ConversationStatus.escalated
    return "Escalated. A human operator will reply in this chat."


@support_agent.tool
async def resolve_conversation(ctx: RunContext[ChatDeps]) -> str:
    """Close the conversation because the customer's issue is done."""
    ctx.deps.conversation.status = ConversationStatus.resolved
    return "Resolved. The conversation is closed."


def to_history(messages: Sequence[Message]) -> list[ModelMessage]:
    """Stored messages as the model's conversation, oldest first.

    The customer is the model's "user"; the AI's and human operators' replies
    are both the "assistant" side of the chat. Past turns are replayed
    without their search results: only the current turn needs them.
    """
    history: list[ModelMessage] = []
    for message in messages:
        if message.role == MessageRole.customer:
            history.append(
                ModelRequest(parts=[UserPromptPart(content=message.content)])
            )
        else:
            history.append(ModelResponse(parts=[TextPart(content=message.content)]))
    return history


def retrieval_query(earlier: Sequence[str], message: str) -> str:
    """What to search for: the message, plus the customer's previous message
    (`earlier`: their messages so far, oldest first) when this one is short
    enough to be a follow-up."""
    if len(message) < FOLLOW_UP_CHARS and earlier:
        return f"{earlier[-1]}\n{message}"
    return message


def customer_texts(messages: Sequence[Message]) -> list[str]:
    return [m.content for m in messages if m.role == MessageRole.customer]


# The grounding rule again, right after the results: small models follow an
# instruction better the closer it is to where they start writing. Measured
# with scripts/eval_grounding.py (2 runs x 12 questions, qwen3.5:4b):
#   rule in the instructions only        answerable 11/12, invented 5/12
#   + this note after empty results      answerable 11/12, invented 4/12
#   + this note after every result block answerable 12/12, invented 2/12
# (temperature 0.2 made no measurable difference, so it stays at the default).
# What's left is mostly partial context: "student discount?" retrieves the
# pricing section, which doesn't mention one.
RESULTS_NOTE = (
    "If the customer asked about the company, its products, prices or policies "
    "and the passages above don't answer it, reply that you don't have that "
    "information and ask if they'd like to talk to a person. Don't say yes or no."
)


def build_prompt(
    message: str, hits: list[knowledge.SearchHit], note: str = RESULTS_NOTE
) -> str:
    """The customer's message with the search results, in tagged sections so
    the model can tell what the customer wrote from what we found. The voice
    bot passes its own `note` (on a call there's no escalating to a person)."""
    return (
        f"<customer_message>\n{message}\n</customer_message>\n\n"
        f"<knowledge_base>\n{knowledge.format_hits(hits)}\n\n{note}\n"
        "</knowledge_base>"
    )


@dataclass
class TextDelta:
    text: str


@dataclass
class ToolCalled:
    """An action the assistant takes: searching, or one of the agent's tools."""

    name: str


async def reply_events(
    db: AsyncSession,
    conversation: Conversation,
    message: str,
    previous: Sequence[Message],
) -> AsyncIterator[TextDelta | ToolCalled]:
    """Search, then run the agent and yield its answer as it is generated.

    A run can be several model calls: the model asks for a tool, PydanticAI
    runs it and sends back the result, the model continues. We pass on text
    as it streams, and each tool call as it starts.
    """
    yield ToolCalled("search_knowledge_base")
    # Scoped to the conversation's organization: one tenant's documents can
    # never answer another tenant's customers.
    hits = await knowledge.search(
        db,
        conversation.organization_id,
        retrieval_query(customer_texts(previous), message),
    )

    async with support_agent.run_stream_events(
        build_prompt(message, hits),
        message_history=to_history(previous),
        deps=ChatDeps(conversation),
    ) as events:
        wrote_text = False
        async for event in events:
            if isinstance(event, PartStartEvent) and isinstance(event.part, TextPart):
                # A new text part, e.g. after a tool call: without a break the
                # two would run together ("help with that.I've escalated").
                if wrote_text:
                    yield TextDelta("\n\n")
                wrote_text = True
                if event.part.content:
                    yield TextDelta(event.part.content)
            elif isinstance(event, PartDeltaEvent) and isinstance(
                event.delta, TextPartDelta
            ):
                if event.delta.content_delta:
                    yield TextDelta(event.delta.content_delta)
            elif isinstance(event, FunctionToolCallEvent):
                yield ToolCalled(event.part.tool_name)
