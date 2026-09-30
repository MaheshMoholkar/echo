"""Kokoro on MLX: the model itself is exercised by `make voice-latency`."""

import numpy as np

from echo_voice.kokoro_mlx import KEEP_AFTER, KEEP_BEFORE, SAMPLE_RATE, trim


def test_trim_keeps_the_speech_and_a_little_silence_around_it() -> None:
    silence = np.zeros(int(0.4 * SAMPLE_RATE), dtype=np.float32)
    speech = np.full(SAMPLE_RATE, 0.5, dtype=np.float32)  # one second

    trimmed = trim(np.concatenate([silence, speech, silence]))

    assert len(trimmed) == round((1 + KEEP_BEFORE + KEEP_AFTER) * SAMPLE_RATE)
    assert trimmed[int(KEEP_BEFORE * SAMPLE_RATE) + 1] == 0.5


def test_trim_of_silence_is_empty() -> None:
    assert len(trim(np.zeros(SAMPLE_RATE, dtype=np.float32))) == 0
