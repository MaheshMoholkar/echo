"""When the bot decides the caller has finished, and how it cuts its reply
into pieces for speech. Both were tuned with `make voice-latency`."""

import copy

from pipecat.audio.turn.smart_turn.local_smart_turn_v3 import LocalSmartTurnAnalyzerV3
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
from pipecat.utils.text.base_text_aggregator import Aggregation, AggregationType
from pipecat.utils.text.simple_text_aggregator import SimpleTextAggregator


class SmartTurnWithAllTranscripts(TurnAnalyzerUserTurnStopStrategy):
    """Pipecat's default turn end (Smart Turn v3, then the transcript), except
    that the turn only ends once *every* part of it has been transcribed.

    Whisper transcribes each stretch of speech that VAD finds, after it
    ends. In "Sorry, one more thing. When is support available?" the first
    part's transcript arrives (~0.9 s) after the caller has started the
    second, and Pipecat took it as the turn's final transcript: the turn
    ended the moment Smart Turn judged the second part complete, before its
    text existed. The model answered "sorry one more thing", the real
    question then interrupted it, and the caller waited ~1.5 s longer.

    Here a transcript only counts as the final one once there is one for
    every stretch of speech in the turn.
    """

    def __init__(self) -> None:
        super().__init__(turn_analyzer=LocalSmartTurnAnalyzerV3())
        self._speaking = False
        self._stretches = 0  # of speech that ended, this turn
        self._transcripts = 0

    async def process_frame(self, frame: Frame) -> ProcessFrameResult:
        if isinstance(frame, VADUserStartedSpeakingFrame):
            self._speaking = True
        elif isinstance(frame, VADUserStoppedSpeakingFrame):
            self._speaking = False
            self._stretches += 1
        elif isinstance(frame, TranscriptionFrame) and frame.finalized:
            self._transcripts += 1
            if self._speaking or self._transcripts < self._stretches:
                # An earlier part of the turn: the caller has said more since.
                frame = copy.copy(frame)
                frame.finalized = False
        return await super().process_frame(frame)

    async def handle_user_turn_started(self) -> None:
        await super().handle_user_turn_started()
        self._stretches = self._transcripts = 0

    async def handle_user_turn_stopped(self) -> None:
        await super().handle_user_turn_stopped()
        self._stretches = self._transcripts = 0


# Where a clause ends: a piece may stop at one of these as well.
CLAUSE_ENDINGS = (",", ";", ":")
# Cut at clauses too until this much of the reply has gone to Kokoro
# (~2.5 s of speech).
CLAUSE_CUTS_UNTIL = 40


class ShortOpeningAggregator(SimpleTextAggregator):
    """Cuts the model's reply into pieces for Kokoro: whole sentences, except
    at the start of a reply, where it also cuts at commas.

    Kokoro turns a whole piece into audio before any of it plays (on the
    mini's GPU, ~0.1 s plus ~0.07 s per second of speech, about twice that
    while the model is still writing). So the first piece's length is part
    of the caller's wait ("International orders take seven to fourteen
    business days," rather than the whole 20-word sentence), and each next
    piece must be ready before the audio ahead of it runs out. Once ~2.5 s
    of speech is queued, the next sentence is ready in time, and whole
    sentences sound more natural.

    On the CPU (~0.4 s plus ~0.35 s per second of speech) this mattered
    more: after "Sure." (0.7 s of audio), a whole 20-word sentence left the
    caller in silence for over 2 s.
    """

    def __init__(self) -> None:
        super().__init__()
        self._sent = 0  # characters of this reply already cut off

    async def _check_sentence_with_lookahead(self, char: str) -> Aggregation | None:
        piece = await super()._check_sentence_with_lookahead(char)
        if (
            piece is None
            and self._sent < CLAUSE_CUTS_UNTIL
            and char.isspace()
            and self._text.rstrip().endswith(CLAUSE_ENDINGS)
        ):
            piece = Aggregation(self._text.strip(), AggregationType.SENTENCE)
            self._text = ""
        if piece is not None:
            self._sent += len(piece.text)
        return piece

    # A new reply starts after each of these.
    async def flush(self) -> Aggregation | None:
        self._sent = 0
        return await super().flush()

    async def handle_interruption(self) -> None:
        self._sent = 0
        await super().handle_interruption()

    async def reset(self) -> None:
        self._sent = 0
        await super().reset()
