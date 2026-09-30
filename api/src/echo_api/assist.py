"""AI help for operators: turn a rough draft into a clear, polite reply.

A second, separate agent with its own short prompt: the LLM as a writing
tool rather than a chatbot. It never sees the conversation, only the draft,
so it can't add facts from anywhere.

The prompt alone wasn't enough: sampled 4 times, "the pro plan is 499 a
month" came back as "$499" twice (the business charges in rupees). So the
output is also checked in code, and PydanticAI sends a failed check back to
the model as feedback for another try. The operator still reviews the text
before sending it.
"""

import re

from pydantic_ai import Agent, ModelRetry, RunContext

from echo_api.llm import NO_THINKING, chat_model

# Adapted from the template's OPERATOR_MESSAGE_ENHANCEMENT_PROMPT.
ENHANCE_INSTRUCTIONS = """\
Rewrite a support operator's draft reply to a customer so it is clear, polite \
and professional.

- Keep the meaning, every fact (prices, dates, names, numbers) and every \
promise exactly as in the draft. Don't add information: no currency symbols \
or units the draft doesn't have, no extra offers or sign-offs.
- Fix spelling and grammar. Keep it about as long as the draft, in one \
paragraph unless the draft is a list. Plain text, no markdown.
- Keep the operator's tone: casual stays friendly, formal stays formal.

Reply with the rewritten message only.
"""

CURRENCY_SYMBOLS = set("$€£¥₹")
_NUMBER = re.compile(r"\d+")

enhance_agent = Agent(
    chat_model(),
    deps_type=str,  # the draft, so the validator can compare against it
    instructions=ENHANCE_INSTRUCTIONS,
    model_settings=NO_THINKING,
    retries=2,  # attempts after a failed check before giving up
)


@enhance_agent.output_validator
def keeps_the_facts(ctx: RunContext[str], output: str) -> str:
    """Reject a rewrite that adds a currency symbol or a number."""
    draft = ctx.deps
    added = sorted({c for c in output if c in CURRENCY_SYMBOLS} - set(draft))
    added += sorted(set(_NUMBER.findall(output)) - set(_NUMBER.findall(draft)))
    if added:
        # Feedback is a prompt too: say what to fix *and* what still to do, or
        # the retry plays safe and hands back the draft almost unchanged.
        raise ModelRetry(
            f"You added {', '.join(repr(a) for a in added)}, which the draft doesn't "
            "contain. Rewrite the whole message again, polished as before (full "
            "words, spelling, grammar), but write every amount and number exactly "
            "as the draft does, with no currency symbol it doesn't have."
        )
    return output


async def enhance(draft: str) -> str:
    result = await enhance_agent.run(draft, deps=draft)
    return result.output.strip()
