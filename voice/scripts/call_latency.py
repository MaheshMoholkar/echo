"""Time voice replies the way a caller hears them.

Run: `make voice-latency ORG=<organization id> [COLD=1]` while `make dev` is
running. The organization needs the sample documents from
`docs/sample-knowledge-base/`.

A scripted caller phones the bot like the widget does: a contact session and
a conversation from the API, an SDP offer to the voice server, then WebRTC
(aiortc, the library Pipecat's server side uses). It speaks QUESTIONS into
the call (Kokoro, in a voice other than the bot's) and, for each, measures
from the last sample of the question it sent to the first reply audio it
received: the silence the caller sits through.

Like the widget, it opens the RTVI data channel, so it also gets the bot's
own events and metrics and can show where the wait went:

    caller stops ─▶ turn end (VAD + Smart Turn) ─▶ Whisper ─▶ search
        ─▶ model's first token ─▶ first chunk written ─▶ Kokoro ─▶ audio

The last question interrupts the bot mid-reply (barge-in); the saved
transcript at the end shows what the team sees in the inbox.

COLD=1 unloads the chat model first, so the first answer includes loading it:
the worst case for a caller.
"""

import argparse
import asyncio
import fractions
import json
import time
import uuid

import httpx
import numpy as np
from aiortc import MediaStreamTrack, RTCPeerConnection, RTCSessionDescription
from aiortc.mediastreams import MediaStreamError
from av import AudioFrame
from kokoro_onnx import Kokoro

from echo_api.config import get_settings
from echo_voice.bot import KOKORO_MODEL, KOKORO_VOICES

API = "http://127.0.0.1:8000/v1/public"
VOICE = "http://127.0.0.1:8001"
CALLER_VOICE = "am_michael"  # the bot speaks as af_heart

QUESTIONS = [
    "How long does delivery take within India?",
    # A follow-up: only answerable if the search also uses the last question.
    "And what about international orders?",
    "How long is the warranty?",
]
# Asked while the bot is still answering the last question.
INTERRUPTION = "Sorry, one more thing. When is your support team available?"
INTERRUPT_AFTER = 1.5  # seconds of the bot's reply before the caller cuts in

RATE = 24_000  # Kokoro's rate; aiortc resamples to Opus's 48 kHz
FRAME = RATE // 50  # 20 ms, like a browser
LOUD = 300.0  # RMS of a received int16 frame above which it counts as speech
QUIET = 3.0  # seconds of silence that end a reply
TIMEOUT = 60.0


class CallerMic(MediaStreamTrack):
    """The caller's microphone: silence, or the speech `say` queued, sent in
    real time as 20 ms frames, as a browser would."""

    kind = "audio"

    def __init__(self) -> None:
        super().__init__()
        self._pending = np.zeros(0, dtype=np.int16)
        self._done: asyncio.Future[float] | None = None
        self._start: float | None = None
        self._pts = 0

    def say(self, speech: np.ndarray) -> asyncio.Future[float]:
        """Queue speech; resolves with the time its last frame was sent."""
        self._pending = speech
        self._done = asyncio.get_running_loop().create_future()
        return self._done

    async def recv(self) -> AudioFrame:
        if self._start is None:
            self._start = time.monotonic()
        wait = self._start + self._pts / RATE - time.monotonic()
        if wait > 0:
            await asyncio.sleep(wait)
        chunk, self._pending = self._pending[:FRAME], self._pending[FRAME:]
        if len(chunk) and not len(self._pending) and self._done:
            self._done.set_result(time.monotonic())
        chunk = np.pad(chunk, (0, FRAME - len(chunk)))
        frame = AudioFrame.from_ndarray(chunk[None, :], format="s16", layout="mono")
        frame.sample_rate = RATE
        frame.time_base = fractions.Fraction(1, RATE)
        frame.pts = self._pts
        self._pts += FRAME
        return frame


class Ear:
    """The caller's speaker: remembers when the bot's audio was speech."""

    def __init__(self) -> None:
        self.loud: list[float] = []

    async def listen(self, track: MediaStreamTrack) -> None:
        while True:
            try:
                frame = await track.recv()
            except MediaStreamError:
                return
            samples = frame.to_ndarray().astype(np.float32)
            if np.sqrt(np.mean(samples**2)) > LOUD:
                self.loud.append(time.monotonic())

    async def first_sound(self, since: float) -> float:
        while True:
            if heard := [t for t in self.loud if t > since]:
                return heard[0]
            if time.monotonic() - since > TIMEOUT:
                raise TimeoutError("the bot never answered")
            await asyncio.sleep(0.02)

    async def reply(self, since: float) -> tuple[float, float, float]:
        """First and last speech after `since`, and the longest pause in it,
        once the bot has been quiet for QUIET seconds."""
        await self.first_sound(since)
        while True:
            heard = [t for t in self.loud if t > since]
            if time.monotonic() - heard[-1] > QUIET:
                return heard[0], heard[-1], float(np.max(np.diff(heard), initial=0))
            await asyncio.sleep(0.05)


class Events:
    """The bot's RTVI messages, timestamped as they arrive."""

    def __init__(self) -> None:
        self.log: list[tuple[float, dict]] = []

    def add(self, raw: str) -> None:
        message = json.loads(raw)
        if message.get("label") == "rtvi-ai":
            self.log.append((time.monotonic(), message))

    def between(self, start: float, end: float, kind: str) -> list[tuple[float, dict]]:
        return [(t, m) for t, m in self.log if start <= t <= end and m["type"] == kind]

    def metric(self, start: float, end: float, kind: str, service: str) -> float | None:
        """The first `kind` metric ("ttfb", "processing") of a service."""
        for _, message in self.between(start, end, "metrics"):
            for item in message["data"].get(kind, []):
                if service in item["processor"]:
                    return item["value"]
        return None


def speak(kokoro: Kokoro, text: str) -> np.ndarray:
    samples, rate = kokoro.create(text, voice=CALLER_VOICE)
    assert rate == RATE
    return (samples * 32767).astype(np.int16)


async def unload_chat_model() -> None:
    settings = get_settings()
    base = settings.ollama_base_url.removesuffix("/v1")
    async with httpx.AsyncClient() as http:
        await http.post(
            f"{base}/api/generate",
            json={"model": settings.chat_model, "keep_alive": 0},
        )


def report(
    number: int,
    question: str,
    events: Events,
    asked: float,
    stopped: float,
    first: float,
    reply: tuple[float, float] | None = None,
) -> None:
    """One question: what the bot heard, and the wait as a timeline of the
    bot's events, from the caller going quiet to the first reply audio."""
    heard = [
        m["data"]["text"].strip()
        for _, m in events.between(asked, first, "user-transcription")
        if m["data"].get("final")
    ]
    # The turn ends once Smart Turn says so *and* Whisper has the transcript.
    turn = events.between(asked, first, "user-stopped-speaking")
    turn_end = turn[-1][0] if turn else stopped
    llm = events.between(turn_end, first, "bot-llm-started")  # search done
    llm_start = llm[0][0] if llm else None
    tokens = events.between(llm_start or turn_end, first, "bot-llm-text")
    # The first chunk Kokoro spoke, and when the model had written all of it.
    chunks = [
        m["data"]["text"]
        for _, m in events.between(turn_end, first + 5, "bot-output")
        if m["data"].get("spoken_status") == "new"
    ]
    written, text = None, ""
    for t, m in tokens:
        text += m["data"]["text"]
        if chunks and len(text.strip()) >= len(chunks[0]):
            written = t
            break
    steps = [
        ("turn end", turn_end if turn else None),
        ("search", llm_start),
        ("first token", tokens[0][0] if tokens else None),
        ("chunk written", written),
        ("Kokoro + audio", first),
    ]
    timeline, previous = [], stopped
    for name, at in steps:
        if at is not None:
            timeline.append(f"{name} {at - previous:.2f}")
            previous = at
    whisper = events.metric(asked, first, "processing", "Whisper")
    usage = [
        m["data"].get("tokens", [])
        for _, m in events.between(stopped, first + 30, "metrics")
    ]
    prompt = next((u["prompt_tokens"] for batch in usage for u in batch), None)

    print(f"\nQ{number}  {question}")
    print(f"    heard as     {' '.join(heard) or '?'}")
    print(f"    first chunk  {chunks[0] if chunks else '?'}")
    print(f"    WAIT {first - stopped:5.2f} s = {' + '.join(timeline)}")
    notes = []
    if whisper is not None:
        notes.append(f"Whisper {whisper:.2f} s of the turn end")
    if prompt is not None:
        notes.append(f"prompt {prompt} tokens")
    if reply:
        last, pause = reply
        notes.append(f"reply {last - first:.1f} s, longest pause {pause:.2f} s")
    print(f"    ({'; '.join(notes)})")


async def main(organization_id: str, cold: bool) -> None:
    kokoro = Kokoro(str(KOKORO_MODEL), str(KOKORO_VOICES))
    speech = [speak(kokoro, q) for q in [*QUESTIONS, INTERRUPTION]]

    async with httpx.AsyncClient(timeout=30) as http:
        response = await http.post(
            f"{API}/contact-sessions",
            json={
                "organization_id": organization_id,
                "name": "Latency test",
                "email": "latency@example.com",
            },
        )
        response.raise_for_status()
        headers = {"X-Contact-Session": response.json()["id"]}
        response = await http.post(f"{API}/conversations", headers=headers)
        response.raise_for_status()
        conversation_id = response.json()["id"]

        if cold:
            await unload_chat_model()

        pc = RTCPeerConnection()
        mic, ear, events = CallerMic(), Ear(), Events()
        pc.addTrack(mic)
        channel = pc.createDataChannel("rtvi")
        tasks: list[asyncio.Task] = []

        @pc.on("track")
        def on_track(track: MediaStreamTrack) -> None:
            tasks.append(asyncio.create_task(ear.listen(track)))

        async def keep_alive() -> None:
            # The server treats a client that stops pinging as gone (3 s).
            while True:
                channel.send(f"ping: {time.time()}")
                await asyncio.sleep(1)

        @channel.on("open")
        def on_open() -> None:
            ready = {"version": "2.1.0", "about": {"library": "call_latency"}}
            channel.send(
                json.dumps(
                    {
                        "label": "rtvi-ai",
                        "type": "client-ready",
                        "id": str(uuid.uuid4()),
                        "data": ready,
                    }
                )
            )
            tasks.append(asyncio.create_task(keep_alive()))

        channel.on("message", events.add)

        await pc.setLocalDescription(await pc.createOffer())
        response = await http.post(
            f"{VOICE}/offer",
            headers=headers,
            json={
                "sdp": pc.localDescription.sdp,
                "type": pc.localDescription.type,
                "request_data": {"conversation_id": conversation_id},
            },
        )
        response.raise_for_status()
        answer = response.json()
        await pc.setRemoteDescription(
            RTCSessionDescription(answer["sdp"], answer["type"])
        )
        connected = time.monotonic()

        first, last, _ = await ear.reply(connected)
        print(f"greeting after {first - connected:.2f} s ({last - first:.1f} s long)")

        for number, (question, audio) in enumerate(zip(QUESTIONS, speech), start=1):
            asked = time.monotonic()
            stopped = await mic.say(audio)
            if number < len(QUESTIONS):
                first, last, pause = await ear.reply(stopped)
                report(number, question, events, asked, stopped, first, (last, pause))
                continue
            # The last one gets interrupted a moment into its answer.
            first = await ear.first_sound(stopped)
            await asyncio.sleep(INTERRUPT_AFTER)
            report(number, f"{question} (interrupted)", events, asked, stopped, first)
            asked = time.monotonic()
            stopped = await mic.say(speech[-1])
            first, last, pause = await ear.reply(stopped)
            report(
                number + 1, INTERRUPTION, events, asked, stopped, first, (last, pause)
            )

        await pc.close()
        for task in tasks:
            task.cancel()

        await asyncio.sleep(1)  # the bot saves its last turn as the call ends
        response = await http.get(
            f"{API}/conversations/{conversation_id}", headers=headers
        )
        print("\nsaved to the conversation:")
        for message in response.json()["messages"]:
            print(f"  {message['role']:>9}: {message['content']}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("organization_id")
    parser.add_argument("--cold", action="store_true", help="unload the model first")
    args = parser.parse_args()
    asyncio.run(main(args.organization_id, args.cold))
