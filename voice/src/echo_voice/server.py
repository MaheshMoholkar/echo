"""The voice bot's HTTP side: WebRTC connection setup ("signaling").

The browser POSTs an SDP offer, we answer, and from then on audio flows
browser ⇄ bot directly over WebRTC. The browser also PATCHes the network
addresses it discovers (ICE candidates). Both requests carry the widget's
contact session, checked exactly like the chat's (echo_api.contacts).
"""

import asyncio
import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, HTTPException, status
from pipecat.transports.smallwebrtc.connection import SmallWebRTCConnection
from pipecat.transports.smallwebrtc.request_handler import (
    IceCandidate,
    SmallWebRTCPatchRequest,
    SmallWebRTCRequest,
    SmallWebRTCRequestHandler,
)

from echo_api import chat
from echo_api.contacts import CurrentContact
from echo_api.db import DbSession
from echo_api.models import ConversationStatus
from echo_voice.bot import history_messages, run_bot, warm_up

handler = SmallWebRTCRequestHandler()
calls: set[asyncio.Task[None]] = set()  # keep references so calls aren't GC'd


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    await asyncio.to_thread(warm_up)  # model loading is blocking work
    yield
    await handler.close()


app = FastAPI(title="Echo voice", lifespan=lifespan)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/offer")
async def offer(
    body: dict[str, Any], contact: CurrentContact, db: DbSession
) -> dict[str, Any]:
    request = SmallWebRTCRequest.from_dict(body)
    try:
        conversation_id = uuid.UUID(
            str((request.request_data or {})["conversation_id"])
        )
    except (KeyError, ValueError, TypeError) as exc:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "conversation_id is required"
        ) from exc

    conversation = await chat.get_conversation(db, contact, conversation_id)
    if conversation is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Conversation not found")
    if conversation.status != ConversationStatus.unresolved:
        # A person has it (or it's closed): the AI doesn't answer, by voice either.
        raise HTTPException(
            status.HTTP_409_CONFLICT, "The team is handling this conversation"
        )

    organization_id = conversation.organization_id
    history = history_messages(conversation)

    async def start(connection: SmallWebRTCConnection) -> None:
        # Runs the call in the background: this request must return the SDP
        # answer now, or the browser never connects.
        call = asyncio.create_task(
            run_bot(connection, conversation_id, organization_id, history)
        )
        calls.add(call)
        call.add_done_callback(calls.discard)

    answer = await handler.handle_web_request(request, start)
    return answer or {}


@app.patch("/offer")
async def ice_candidates(
    body: dict[str, Any], contact: CurrentContact
) -> dict[str, str]:
    await handler.handle_patch_request(
        SmallWebRTCPatchRequest(
            pc_id=body["pc_id"],
            candidates=[IceCandidate(**c) for c in body.get("candidates", [])],
        )
    )
    return {"status": "ok"}
