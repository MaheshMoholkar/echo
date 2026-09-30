"""Kokoro on MLX: the model itself is exercised by `make voice-latency`."""

import numpy as np

from echo_voice.kokoro_mlx import (
    KEEP_AFTER,
    KEEP_BEFORE,
    SAMPLE_RATE,
    trim,
    word_starts,
)


def test_trim_keeps_the_speech_and_a_little_silence_around_it() -> None:
    silence = np.zeros(int(0.4 * SAMPLE_RATE), dtype=np.float32)
    speech = np.full(SAMPLE_RATE, 0.5, dtype=np.float32)  # one second

    trimmed = trim(np.concatenate([silence, speech, silence]))

    assert len(trimmed) == round((1 + KEEP_BEFORE + KEEP_AFTER) * SAMPLE_RATE)
    assert trimmed[int(KEEP_BEFORE * SAMPLE_RATE) + 1] == 0.5


def test_trim_of_silence_is_empty() -> None:
    assert len(trim(np.zeros(SAMPLE_RATE, dtype=np.float32))) == 0


def test_words_are_spread_over_the_speech_by_how_long_they_sound() -> None:
    audio = np.zeros(int((KEEP_BEFORE + 2.0 + KEEP_AFTER) * SAMPLE_RATE))  # 2 s

    starts = word_starts("It costs 1,499 a month.", audio)

    assert [word for word, _ in starts] == ["It", "costs", "1,499", "a", "month."]
    times = [at for _, at in starts]
    assert times[0] == KEEP_BEFORE
    assert times == sorted(times) and times[-1] < KEEP_BEFORE + 2.0
    # "1,499" ("one thousand four hundred ninety nine") takes far longer than "a".
    assert times[3] - times[2] > 4 * (times[4] - times[3])
