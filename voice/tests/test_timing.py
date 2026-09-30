"""When the bot ends the caller's turn, and how it cuts replies for Kokoro.
The timings themselves are measured with `make voice-latency`."""

import pytest
from pipecat.frames.frames import (
    Frame,
    TranscriptionFrame,
    VADUserStartedSpeakingFrame,
    VADUserStoppedSpeakingFrame,
)
from pipecat.turns.types import ProcessFrameResult
from pipecat.turns.user_stop.turn_analyzer_user_turn_stop_strategy import (
    TurnAnalyzerUserTurnStopStrategy,
)

from echo_voice.timing import ShortOpeningAggregator, SmartTurnWithAllTranscripts


async def pieces(aggregator: ShortOpeningAggregator, reply: str) -> list[str]:
    """Feed a reply the way the model streams it (a few characters at a
    time) and collect what would go to Kokoro."""
    out = []
    for start in range(0, len(reply), 3):
        out += [a.text async for a in aggregator.aggregate(reply[start : start + 3])]
    if last := await aggregator.flush():
        out.append(last.text)
    return out


async def test_the_opening_is_cut_at_commas_the_rest_by_sentence() -> None:
    aggregator = ShortOpeningAggregator()

    assert await pieces(
        aggregator,
        "Sure. International orders take seven to fourteen days, and customs "
        "duties, if any, are paid by you. Anything else?",
    ) == [
        "Sure.",
        "International orders take seven to fourteen days,",
        # ~2.5 s of speech is queued by now: whole sentences from here.
        "and customs duties, if any, are paid by you.",
        "Anything else?",
    ]
    # Each reply starts over.
    assert await pieces(aggregator, "Yes, it is. Thanks.") == [
        "Yes,",
        "it is.",
        "Thanks.",
    ]


async def test_a_comma_inside_a_number_is_not_a_clause() -> None:
    assert await pieces(
        ShortOpeningAggregator(), "Acme Pro costs 1,499 rupees, per month."
    ) == ["Acme Pro costs 1,499 rupees,", "per month."]


def transcript(text: str) -> TranscriptionFrame:
    return TranscriptionFrame(text, "caller", "now", finalized=True)


async def test_the_turn_waits_for_the_transcript_of_its_last_part(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    seen: list[Frame] = []

    async def parent(self: object, frame: Frame) -> ProcessFrameResult:
        seen.append(frame)
        return ProcessFrameResult.CONTINUE

    monkeypatch.setattr(TurnAnalyzerUserTurnStopStrategy, "process_frame", parent)
    strategy = SmartTurnWithAllTranscripts()

    # "Sorry, one more thing." / pause / "When is support available?", with
    # the first part's transcript arriving while the caller is still talking.
    await strategy.process_frame(VADUserStartedSpeakingFrame())
    await strategy.process_frame(VADUserStoppedSpeakingFrame())
    await strategy.process_frame(VADUserStartedSpeakingFrame())
    await strategy.process_frame(transcript("sorry one more thing"))
    await strategy.process_frame(VADUserStoppedSpeakingFrame())
    await strategy.process_frame(transcript("When is support available?"))

    finals = [f.text for f in seen if isinstance(f, TranscriptionFrame) and f.finalized]
    assert finals == ["When is support available?"]

    # A new turn counts from zero: its one transcript is the final one.
    await strategy.handle_user_turn_started()
    seen.clear()
    await strategy.process_frame(VADUserStartedSpeakingFrame())
    await strategy.process_frame(VADUserStoppedSpeakingFrame())
    await strategy.process_frame(transcript("Thanks, bye."))
    assert [f.finalized for f in seen if isinstance(f, TranscriptionFrame)] == [True]
