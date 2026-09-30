"""The voice bot: one Pipecat pipeline per call.

    mic ─▶ WebRTC in ─▶ Whisper (speech → text) ─▶ user turn ─▶ knowledge search
                                                                     │
    speaker ◀─ WebRTC out ◀─ Kokoro (text → speech) ◀─ Ollama ◀──────┘

Silero spots speech in the audio, and Smart Turn v3 decides when the
customer has finished, so the bot neither talks over a pause nor waits too
long. Everything streams: Kokoro starts speaking the first piece of the reply
while the model is still writing the next (echo_voice.timing).

`make voice-latency` times a scripted call and shows where each wait goes.
"""

import asyncio
import uuid
from pathlib import Path
from typing import Any

import httpx
from loguru import logger
from pipecat.audio.vad.silero import SileroVADAnalyzer
from pipecat.frames.frames import Frame, LLMContextFrame, TTSSpeakFrame
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.runner import PipelineRunner
from pipecat.pipeline.task import PipelineParams, PipelineTask
from pipecat.processors.aggregators.llm_context import LLMContext
from pipecat.processors.aggregators.llm_response_universal import (
    LLMContextAggregatorPair,
    LLMUserAggregatorParams,
)
from pipecat.processors.aggregators.llm_text_processor import LLMTextProcessor
from pipecat.processors.frame_processor import FrameDirection, FrameProcessor
from pipecat.services.kokoro.tts import KokoroTTSService
from pipecat.services.ollama.llm import OLLamaLLMService
from pipecat.services.whisper.stt import MLXModel, WhisperSTTServiceMLX
from pipecat.transcriptions.language import Language
from pipecat.transports.base_transport import TransportParams
from pipecat.transports.smallwebrtc.connection import SmallWebRTCConnection
from pipecat.transports.smallwebrtc.transport import SmallWebRTCTransport
from pipecat.turns.user_turn_strategies import UserTurnStrategies

from echo_api import agent, chat, knowledge
from echo_api.config import get_settings
from echo_api.db import SessionLocal
from echo_api.models import Conversation, MessageRole
from echo_voice.prompts import VOICE_INSTRUCTIONS, VOICE_RESULTS_NOTE
from echo_voice.timing import ShortOpeningAggregator, SmartTurnWithAllTranscripts

# int8: 92 MB instead of 326 MB (fp32), and faster on the CPU, where Kokoro
# runs; that leaves the GPU to Whisper and the LLM. `make voice-models`
# downloads it (Pipecat would fetch the fp32 file on its own).
KOKORO_DIR = Path.home() / ".cache" / "pipecat" / "kokoro-onnx"
KOKORO_MODEL = KOKORO_DIR / "kokoro-v1.0.int8.onnx"
KOKORO_VOICES = KOKORO_DIR / "voices-v1.0.bin"
KOKORO_VOICE = "af_heart"

WHISPER_MODEL = MLXModel.LARGE_V3_TURBO_Q4  # ~460 MB, close to large-v3 accuracy


def warm_up() -> None:
    """Load Whisper before the first call. MLX Whisper loads its model on first
    use and keeps it for the life of the process, so without this the first
    caller's first sentence waited for the load (3.7 s for a 2 s question)."""
    import mlx_whisper
    import numpy as np

    silence = np.zeros(16_000, dtype=np.float32)  # one second at 16 kHz
    mlx_whisper.transcribe(silence, path_or_hf_repo=WHISPER_MODEL, language="en")


async def warm_up_call(organization_id: str, history: list[dict[str, str]]) -> None:
    """Do the first answer's slow work while the greeting plays: load the
    chat and embedding models if Ollama has unloaded them (7.9 s for the chat
    model's first token), open a database connection, and have the model
    read the call's opening prompt (instructions + conversation so far).
    Ollama keeps what it last read, so the first question then only costs
    its own tokens."""
    settings = get_settings()

    async def search() -> None:
        async with SessionLocal() as db:
            await knowledge.search(db, organization_id, chat.GREETING)

    async def read_prompt() -> None:
        # The same endpoint and settings as OLLamaLLMService, so the prompt
        # is formatted the same way and Ollama can reuse it.
        async with httpx.AsyncClient(timeout=60) as http:
            await http.post(
                f"{settings.ollama_base_url}/chat/completions",
                json={
                    "model": settings.chat_model,
                    "messages": [
                        {"role": "system", "content": VOICE_INSTRUCTIONS},
                        *history,
                    ],
                    "max_tokens": 1,
                    "reasoning_effort": "none",
                },
            )

    try:
        await asyncio.gather(search(), read_prompt())
    except Exception:  # noqa: BLE001 - best effort: the call works without it
        logger.exception("warming up the call failed; the first answer may be slow")


def history_messages(conversation: Conversation) -> list[dict[str, str]]:
    """The conversation so far (the greeting, any earlier chat) as LLM
    messages: the customer is the user, the AI and operators the assistant."""
    return [
        {
            "role": "user" if m.role == MessageRole.customer else "assistant",
            "content": m.content,
        }
        for m in conversation.messages
    ]


class KnowledgeRetriever(FrameProcessor):
    """Pipeline RAG for voice, as in the text chat: before the model answers a
    turn, search the knowledge base for what the customer said, and hand the
    model a *copy* of the context whose last user message carries the results.
    The shared context (the history the aggregators keep) stays clean, so the
    next turn's prompt still starts with the same, cacheable prefix."""

    def __init__(self, organization_id: str) -> None:
        super().__init__()
        self._organization_id = organization_id

    async def process_frame(self, frame: Frame, direction: FrameDirection) -> None:
        await super().process_frame(frame, direction)
        if (
            isinstance(frame, LLMContextFrame)
            and direction == FrameDirection.DOWNSTREAM
        ):
            frame = await self.with_knowledge(frame)
        await self.push_frame(frame, direction)

    async def with_knowledge(self, frame: LLMContextFrame) -> LLMContextFrame:
        messages: list[Any] = list(frame.context.get_messages())
        users = [
            i
            for i, m in enumerate(messages)
            if isinstance(m, dict)
            and m.get("role") == "user"
            and isinstance(m.get("content"), str)
        ]
        if not users:
            return frame
        last = users[-1]
        said = messages[last]["content"]
        earlier = [messages[i]["content"] for i in users[:-1]]
        async with SessionLocal() as db:
            hits = await knowledge.search(
                db, self._organization_id, agent.retrieval_query(earlier, said)
            )
        messages[last] = {
            "role": "user",
            "content": agent.build_prompt(said, hits, note=VOICE_RESULTS_NOTE),
        }
        context = LLMContext(
            messages=messages,
            tools=frame.context.tools,
            tool_choice=frame.context.tool_choice,
        )
        return LLMContextFrame(context=context, speculation=frame.speculation)


async def save_message(
    conversation_id: uuid.UUID, role: MessageRole, content: str
) -> None:
    """Store a finished turn, so the team sees the call in the inbox."""
    # A turn spoken in parts is Whisper's pieces joined, each padded with
    # spaces: "sorry one more thing   When is…".
    content = " ".join(content.split())
    if not content:
        return
    async with SessionLocal() as db:
        conversation = await db.get(Conversation, conversation_id)
        if conversation is not None:
            await chat.add_message(db, conversation, role, content)
            await db.commit()


async def run_bot(
    connection: SmallWebRTCConnection,
    conversation_id: uuid.UUID,
    organization_id: str,
    history: list[dict[str, str]],
) -> None:
    settings = get_settings()

    transport = SmallWebRTCTransport(
        webrtc_connection=connection,
        params=TransportParams(audio_in_enabled=True, audio_out_enabled=True),
    )
    stt = WhisperSTTServiceMLX(
        settings=WhisperSTTServiceMLX.Settings(
            model=WHISPER_MODEL,
            language=Language.EN,
        ),
        # How long a transcript may take after speech ends before the turn
        # ends without it. Whisper takes ~0.85 s here (up to ~1.9 s while the
        # model is busy too), and VAD reports the end 0.2 s late: with the 1 s
        # default, the second part of "Sorry, one more thing. When is…" was
        # routinely given up on.
        ttfs_p99_latency=2.0,
    )
    llm = OLLamaLLMService(
        base_url=settings.ollama_base_url,
        settings=OLLamaLLMService.Settings(
            model=settings.chat_model,  # the same model as the text chat
            system_instruction=VOICE_INSTRUCTIONS,
            # Thinking off: on a call, seconds of silent reasoning are dead air.
            extra={"reasoning_effort": "none"},
        ),
    )
    tts = KokoroTTSService(
        model_path=str(KOKORO_MODEL),
        voices_path=str(KOKORO_VOICES),
        settings=KokoroTTSService.Settings(voice=KOKORO_VOICE),
    )

    context = LLMContext(messages=history)
    aggregators = LLMContextAggregatorPair(
        context,
        user_params=LLMUserAggregatorParams(
            vad_analyzer=SileroVADAnalyzer(),
            user_turn_strategies=UserTurnStrategies(
                stop=[SmartTurnWithAllTranscripts()]
            ),
        ),
    )
    pipeline = Pipeline(
        [
            transport.input(),
            stt,
            aggregators.user(),
            KnowledgeRetriever(organization_id),
            llm,
            LLMTextProcessor(text_aggregator=ShortOpeningAggregator()),
            tts,
            transport.output(),
            aggregators.assistant(),
        ]
    )
    task = PipelineTask(
        pipeline,
        # Timings and token counts, sent to the client too (make voice-latency).
        params=PipelineParams(enable_metrics=True, enable_usage_metrics=True),
    )

    @aggregators.user().event_handler("on_user_turn_stopped")
    async def on_user_turn(aggregator: Any, strategy: Any, message: Any) -> None:
        if message.content:
            await save_message(conversation_id, MessageRole.customer, message.content)

    @aggregators.assistant().event_handler("on_assistant_turn_stopped")
    async def on_assistant_turn(aggregator: Any, message: Any) -> None:
        if message.content:
            await save_message(conversation_id, MessageRole.assistant, message.content)

    @transport.event_handler("on_client_connected")
    async def on_connected(transport: Any, client: Any) -> None:
        # Say the conversation's greeting out loud. It's already the first
        # message in the history, so it isn't added to the context again.
        await task.queue_frames([TTSSpeakFrame(chat.GREETING, append_to_context=False)])

    @transport.event_handler("on_client_disconnected")
    async def on_disconnected(transport: Any, client: Any) -> None:
        await task.cancel()

    logger.info(f"voice call started for conversation {conversation_id}")
    # Starts now: connecting and the greeting take ~3.5 s before the caller
    # can even ask anything.
    warming = asyncio.create_task(warm_up_call(organization_id, history))
    try:
        await PipelineRunner(handle_sigint=False).run(task)
    finally:
        warming.cancel()
    logger.info(f"voice call ended for conversation {conversation_id}")
