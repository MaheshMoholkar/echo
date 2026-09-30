"""AI tools for dashboard users."""

import logging

import openai
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic_ai.exceptions import AgentRunError

from echo_api import assist
from echo_api.auth import require_org
from echo_api.schemas import EnhanceRequest, EnhanceResponse

log = logging.getLogger(__name__)
router = APIRouter(
    prefix="/assist", tags=["assist"], dependencies=[Depends(require_org)]
)


@router.post("/enhance")
async def enhance(body: EnhanceRequest) -> EnhanceResponse:
    """Rewrite an operator's draft reply: clearer and politer, same facts."""
    try:
        return EnhanceResponse(text=await assist.enhance(body.text))
    except (AgentRunError, openai.APIError) as exc:
        log.exception("enhance failed")
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE, "The assistant is unavailable"
        ) from exc
