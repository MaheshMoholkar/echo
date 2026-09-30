"""Smoke test: PydanticAI -> Ollama with one tool, thinking off.

Run: `uv run python scripts/llm_smoke.py`

It prints every message the agent exchanged, so you can see what the
framework does for you: the model asks for a tool call, PydanticAI runs the
Python function, sends the result back, and the model writes the answer.
"""

import asyncio
import time

from pydantic_ai import Agent
from pydantic_ai.models.ollama import OllamaModel
from pydantic_ai.providers.ollama import OllamaProvider

from echo_api.config import get_settings

settings = get_settings()

model = OllamaModel(
    settings.chat_model,
    provider=OllamaProvider(base_url=settings.ollama_base_url),
)

agent = Agent(
    model,
    instructions=(
        "You are a support assistant. Use the tools to look things up. "
        "Answer in one short sentence."
    ),
    # qwen3.5 reasons before answering by default; that costs seconds.
    # PydanticAI's generic `thinking=False` is ignored by Ollama (measured:
    # 5.8 s, 146 tokens); `reasoning_effort="none"` works (1.8 s, 46 tokens).
    model_settings={"openai_reasoning_effort": "none"},
)


@agent.tool_plain
def order_status(order_id: str) -> str:
    """Look up the shipping status of an order by its id."""
    return {"A100": "shipped on Monday, arriving Thursday"}.get(order_id, "not found")


async def main() -> None:
    start = time.perf_counter()
    result = await agent.run("Where is my order A100?")
    elapsed = time.perf_counter() - start

    for message in result.all_messages():
        print(f"\n[{message.kind}]")
        for part in message.parts:
            content = getattr(part, "content", None) or getattr(part, "args", None)
            name = getattr(part, "tool_name", "")
            print(f"  {part.part_kind:<16} {name:<14} {str(content)[:120]!r}")

    usage = result.usage
    print(f"\noutput: {result.output!r}")
    print(
        f"time: {elapsed:.1f}s  requests: {usage.requests}  tokens in/out: "
        f"{usage.input_tokens}/{usage.output_tokens}"
    )


if __name__ == "__main__":
    asyncio.run(main())
