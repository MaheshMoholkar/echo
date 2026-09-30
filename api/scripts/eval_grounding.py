"""A small eval: does the agent stay grounded in the knowledge base?

Run: `make eval ORG=<organization id> [RUNS=2]`. The organization needs the
sample documents from `docs/sample-knowledge-base/` uploaded.

One chat turn per question with the real model and real search, scored by
rules. The model samples its answers, so one example proves nothing; a pass
rate over a set does (and even 12 questions are noisy between runs). Change
the prompt (agent.SUPPORT_INSTRUCTIONS, agent.RESULTS_NOTE,
knowledge.MAX_DISTANCE…), run again, compare.

- answerable: the reply must contain the fact (e.g. "30-day").
- unanswerable: the reply must admit it doesn't know rather than claim a
  yes/no fact, and should offer a person.

The rules are rough: some honest replies ("no mention of a student
discount") get flagged, so read the printed failures. A bigger eval would
use a stronger model as the judge.
"""

import asyncio
import re
import sys
import time

from echo_api import agent
from echo_api.db import SessionLocal
from echo_api.models import Conversation

ANSWERABLE = {
    "Can I return something I bought 2 weeks ago?": r"30[- ]day",
    "How long is the warranty?": r"2[- ]year|two[- ]year",
    "How long does international delivery take?": r"7\s*(to|-|–)\s*14",
    "How much is Acme Pro per month?": r"499",
    "When is your support team available?": r"9\s*am|9:00",
    "How do I reset my password?": r"forgot password",
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
    r"|not (from|in) the (provided|available)"
)
OFFERS = r"person|human|team member|someone|agent|representative"
CLAIMS = r"^(yes|no)\b|we (do|don't|do not) (have|offer|sell|accept)"


async def reply(organization_id: str, question: str) -> str:
    conversation = Conversation(organization_id=organization_id)  # not saved
    text = ""
    async with SessionLocal() as db:
        async for event in agent.reply_events(db, conversation, question, []):
            if isinstance(event, agent.TextDelta):
                text += event.text
    return text.strip()


async def main(organization_id: str, runs: int) -> None:
    start = time.perf_counter()
    answered = admitted = offered = invented = 0
    for _ in range(runs):
        for question, fact in ANSWERABLE.items():
            text = await reply(organization_id, question)
            ok = bool(re.search(fact, text, re.IGNORECASE))
            answered += ok
            if not ok:
                print(f"  MISSED   {question!r}: {text[:150]!r}")
        for question in UNANSWERABLE:
            text = await reply(organization_id, question)
            admits = bool(re.search(ADMITS, text, re.IGNORECASE))
            claims = bool(re.search(CLAIMS, text.strip(), re.IGNORECASE | re.MULTILINE))
            admitted += admits and not claims
            offered += bool(re.search(OFFERS, text, re.IGNORECASE))
            invented += claims or not admits
            if claims or not admits:
                print(f"  INVENTED {question!r}: {text[:150]!r}")
    n_a, n_u = runs * len(ANSWERABLE), runs * len(UNANSWERABLE)
    print(
        f"answerable {answered}/{n_a} · unanswerable: admitted {admitted}/{n_u}, "
        f"offered a person {offered}/{n_u}, invented {invented}/{n_u} · "
        f"{time.perf_counter() - start:.0f}s"
    )


if __name__ == "__main__":
    asyncio.run(main(sys.argv[1], int(sys.argv[2]) if len(sys.argv) > 2 else 1))
