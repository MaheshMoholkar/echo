"""How many knowledge-base passages should a voice reply get?

Run: `make voice-eval ORG=<organization id> [RUNS=2]`, with the sample
documents from `docs/sample-knowledge-base/` uploaded.

The same questions as the text chat's grounding eval (api/scripts/
eval_grounding.py), asked with the voice prompt and 0-4 passages. Before
its first word the model reads the passages: ~0.26 s each on an M4 Mac mini, the
biggest part of the wait it controls. Fewer passages: a shorter wait, but a
better chance the answer isn't among them. Per count, it prints:

- answerable: the reply contains the fact, said the way a voice would say
  it ("seven to fourteen").
- unanswerable: the reply admits it doesn't know instead of claiming a
  yes/no fact.
- first token: the wait for the first word when the question and passages
  are new and the instructions cached, as on a call. Timed with a separate
  one-token request that starts with a unique marker, because Ollama keeps
  several recent prompts and would otherwise skip text it has already read
  (its own `prompt_eval_duration` misses most of the cost too).
"""

import asyncio
import json
import re
import statistics
import sys
import time
import uuid

import httpx

from echo_api import agent, chat, knowledge
from echo_api.config import get_settings
from echo_api.db import SessionLocal
from echo_voice.prompts import VOICE_INSTRUCTIONS, VOICE_RESULTS_NOTE

PASSAGES = [0, 1, 2, 3, 4]
ANSWERABLE = {
    "Can I return something I bought 2 weeks ago?": r"30|thirty",
    "How long is the warranty?": r"(2|two)[- ]year",
    "How long does international delivery take?": r"(7|seven)\s*(to|-|–)\s*(14|fourteen)",
    "How much is Acme Pro per month?": r"499|four hundred (and )?ninety[- ]nine",
    "When is your support team available?": (
        r"(9|nine)\s*(am|a\.m\.)?\s*(to|-|–|until)\s*(7|seven)|9:00"
    ),
    "How do I reset my password?": r"forgot (your )?password",
}
UNANSWERABLE = [
    "Do you have a mobile app?",
    "Can I pay with bitcoin?",
    "Do you sell gift cards?",
    "Is there a student discount?",
    "Who is the CEO of your company?",
    "Do you ship to Antarctica by drone?",
]
ADMITS = (
    r"(don't|do not|doesn't|does not|no) (have|information|details|info)"
    r"|not sure|unable to find|couldn't find|can't find|not (mentioned|listed|covered)"
)
CLAIMS = r"^(yes|no)\b|we (do|don't|do not) (have|offer|sell|accept)"

SYSTEM = {"role": "system", "content": VOICE_INSTRUCTIONS}
GREETING = {"role": "assistant", "content": chat.GREETING}


async def complete(
    http: httpx.AsyncClient, user: str, **extra: int
) -> tuple[str, float]:
    """The model's reply to the call so far + `user`, and the seconds to its
    first word. The same endpoint and settings as the voice bot."""
    settings = get_settings()
    body = {
        "model": settings.chat_model,
        "messages": [SYSTEM, GREETING, {"role": "user", "content": user}],
        "stream": True,
        "reasoning_effort": "none",
        **extra,
    }
    start, first, text = time.perf_counter(), 0.0, ""
    async with http.stream(
        "POST", f"{settings.ollama_base_url}/chat/completions", json=body
    ) as response:
        async for line in response.aiter_lines():
            if not line.startswith("data: {"):
                continue
            choices = json.loads(line[6:])["choices"]
            if choices and (delta := choices[0]["delta"].get("content")):
                first = first or time.perf_counter() - start
                text += delta
    return text.strip(), first


async def main(organization_id: str, runs: int) -> None:
    async with SessionLocal() as db:
        found = {
            q: await knowledge.search(db, organization_id, q, limit=max(PASSAGES))
            for q in [*ANSWERABLE, *UNANSWERABLE]
        }
    async with httpx.AsyncClient(timeout=120) as http:
        await complete(
            http, "Hi", max_tokens=1
        )  # load the model, cache the instructions
        for count in PASSAGES:
            answered = admitted = 0
            waits = []
            for _ in range(runs):
                for question in [*ANSWERABLE, *UNANSWERABLE]:
                    prompt = agent.build_prompt(
                        question, found[question][:count], note=VOICE_RESULTS_NOTE
                    )
                    _, wait = await complete(
                        http, f"[{uuid.uuid4().hex[:8]}]\n{prompt}", max_tokens=1
                    )
                    waits.append(wait)
                    text, _ = await complete(http, prompt)
                    if question in ANSWERABLE:
                        if re.search(ANSWERABLE[question], text, re.IGNORECASE):
                            answered += 1
                        else:
                            print(f"  {count}: MISSED   {question!r}: {text[:110]!r}")
                        continue
                    admits = re.search(ADMITS, text, re.IGNORECASE)
                    claims = re.search(CLAIMS, text, re.IGNORECASE | re.MULTILINE)
                    if admits and not claims:
                        admitted += 1
                    else:
                        print(f"  {count}: INVENTED {question!r}: {text[:110]!r}")
            print(
                f"{count} passage(s): answerable {answered}/{runs * len(ANSWERABLE)}, "
                f"unanswerable admitted {admitted}/{runs * len(UNANSWERABLE)} · "
                f"first token {statistics.median(waits):.2f} s (median)",
                flush=True,
            )


if __name__ == "__main__":
    asyncio.run(main(sys.argv[1], int(sys.argv[2]) if len(sys.argv) > 2 else 1))
