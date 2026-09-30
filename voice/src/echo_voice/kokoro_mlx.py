"""Kokoro on the GPU (MLX) instead of the CPU (ONNX).

Same model (Kokoro-82M), same voices, same phonemes: kokoro-onnx's espeak-ng
phonemizer turns the text into phonemes as before, and only the neural
network moves to the GPU, through mlx-audio. mlx-audio's own text front end
(misaki) would pull in spaCy, and isn't needed.

Measured while the LLM was generating (as it is during a reply):

    "Sure."                                  0.56 s on the CPU → 0.11 s
    "Delivery usually takes three to five…"  1.71 s → 0.52 s
"""

import asyncio
from collections.abc import AsyncGenerator
from concurrent.futures import ThreadPoolExecutor
from functools import cache
from pathlib import Path

import mlx.core as mx
import numpy as np
from kokoro_onnx.chunker import split_phonemes
from kokoro_onnx.tokenizer import Tokenizer
from mlx_audio.tts.utils import load_model
from pipecat.audio.utils import create_stream_resampler
from pipecat.frames.frames import (
    ErrorFrame,
    Frame,
    InterruptionFrame,
    TTSAudioRawFrame,
    TTSStoppedFrame,
)
from pipecat.processors.frame_processor import FrameDirection
from pipecat.services.kokoro.tts import KokoroTTSService, language_to_kokoro_language
from pipecat.services.tts_service import TTSService
from pipecat.transcriptions.language import Language

MODEL = "mlx-community/Kokoro-82M-bf16"
MODEL_FILES = ["config.json", "kokoro-v1_0.safetensors"]  # 312 MB; not its voices
SAMPLE_RATE = 24_000

# The model pads each piece with ~0.35 s of silence before the speech and
# ~0.5 s after. Kept, every reply would start 0.35 s later.
SILENCE = 0.01  # amplitude below which a sample counts as silence
KEEP_BEFORE = 0.03  # seconds of it kept before the speech
KEEP_AFTER = 0.1  # and after (a breath between pieces)

# All MLX work for Kokoro happens on this one thread, loading included.
mlx_thread = ThreadPoolExecutor(max_workers=1, thread_name_prefix="kokoro-mlx")

# MLX keeps freed GPU buffers to reuse them, by default up to most of the
# system's memory. Every piece of speech has a different length, so none fit
# the next one exactly: the cache grew to 7 GB in ten sentences and the
# system started swapping (Whisper 5 s instead of 0.9 s). Capped, pieces are
# as fast and steadier. Process-wide: Whisper's buffers count too.
CACHE_LIMIT = 256 * 1024**2


def limit_cache() -> None:
    mx.set_cache_limit(CACHE_LIMIT)


@cache
def model():
    return load_model(MODEL, allow_patterns=MODEL_FILES)


@cache
def tokenizer() -> Tokenizer:
    return Tokenizer()


@cache
def voice_pack(voices_path: Path, voice: str) -> np.ndarray:
    """A voice: one style vector per phoneme count (510 × 1 × 256)."""
    return np.load(voices_path)[voice]


def trim(audio: np.ndarray) -> np.ndarray:
    loud = np.flatnonzero(np.abs(audio) > SILENCE)
    if not len(loud):
        return audio[:0]
    start = max(0, loud[0] - int(KEEP_BEFORE * SAMPLE_RATE))
    return audio[start : loud[-1] + 1 + int(KEEP_AFTER * SAMPLE_RATE)]


def synthesize(text: str, pack: np.ndarray, speed: float = 1.0) -> np.ndarray:
    """Speech for `text` as 24 kHz float samples. Blocking: run it on
    `mlx_thread`."""
    phonemes = tokenizer().phonemize(text, "en-us")
    pieces = []
    # The model reads at most 510 phonemes at a time (~400 characters).
    for batch in split_phonemes(phonemes):
        style = mx.array(pack[len(batch) - 1])
        pieces.append(trim(np.array(model()(batch, style, speed=speed)).reshape(-1)))
    return np.concatenate(pieces) if pieces else np.zeros(0, dtype=np.float32)


def word_starts(text: str, audio: np.ndarray) -> list[tuple[str, float]]:
    """When each word of `text` starts in its (trimmed) audio, roughly: the
    speech between the kept silences, shared out by each word's phoneme
    count ("1,499" is five spoken words, "a" one sound). Good to a word or
    so, which is what the transcript and live captions need; an exact map
    from Kokoro's phoneme durations breaks on numbers and merged words."""
    words = text.split()
    weights = [max(1, len(tokenizer().phonemize(w, "en-us"))) for w in words]
    speech = max(0.0, len(audio) / SAMPLE_RATE - KEEP_BEFORE - KEEP_AFTER)
    starts, at = [], KEEP_BEFORE
    for word, weight in zip(words, weights, strict=True):
        starts.append((word, at))
        at += speech * weight / sum(weights)
    return starts


def speak(text: str, pack: np.ndarray, speed: float) -> tuple[np.ndarray, list]:
    audio = synthesize(text, pack, speed)
    return audio, word_starts(text, audio)


class KokoroMLXTTSService(TTSService):
    """Pipecat's Kokoro service with the synthesis done by `synthesize`.

    It also says when each word is heard (`word_starts`), so Pipecat
    releases the reply word by word as it plays: the widget shows live
    captions, and when the caller cuts in, the transcript keeps exactly the
    words they heard. Without word times a piece only counted once fully
    spoken, so an answer interrupted in its first sentence left no trace.
    """

    Settings = KokoroTTSService.Settings

    def __init__(self, *, voices_path: Path, settings: Settings, **kwargs) -> None:
        defaults = self.Settings(
            model=MODEL, voice=None, language=Language.EN, speed=1.0
        )
        defaults.apply_update(settings)
        super().__init__(
            push_start_frame=True,
            push_stop_frames=True,
            push_text_frames=False,  # words come from add_word_timestamps
            settings=defaults,
            **kwargs,
        )
        self._voices_path = voices_path
        self._resampler = create_stream_resampler()
        # Word times count from the start of the reply's audio, which spans
        # all its pieces: where the next piece starts.
        self._offset = 0.0

    async def push_frame(
        self, frame: Frame, direction: FrameDirection = FrameDirection.DOWNSTREAM
    ) -> None:
        await super().push_frame(frame, direction)
        if isinstance(frame, (InterruptionFrame, TTSStoppedFrame)):
            self._offset = 0.0  # the next reply starts from zero

    def can_generate_metrics(self) -> bool:
        return True

    def language_to_service_language(self, language: Language) -> str:
        return language_to_kokoro_language(language)

    async def run_tts(self, text: str, context_id: str) -> AsyncGenerator[Frame]:
        try:
            await self.start_tts_usage_metrics(text)
            pack = voice_pack(self._voices_path, self._settings.voice)
            audio, words = await asyncio.get_running_loop().run_in_executor(
                mlx_thread, speak, text, pack, self._settings.speed
            )
            await self.stop_ttfb_metrics()
            pcm = (audio * 32767).astype(np.int16).tobytes()
            yield TTSAudioRawFrame(
                audio=await self._resampler.resample(
                    pcm, SAMPLE_RATE, self.sample_rate
                ),
                sample_rate=self.sample_rate,
                num_channels=1,
                context_id=context_id,
            )
            await self.add_word_timestamps(
                [(word, self._offset + at) for word, at in words], context_id
            )
            self._offset += len(audio) / SAMPLE_RATE
        except Exception as exc:  # noqa: BLE001 - reported to the pipeline
            yield ErrorFrame(error=f"Kokoro (MLX) failed: {exc}")
        finally:
            await self.stop_ttfb_metrics()
