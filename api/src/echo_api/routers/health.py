from typing import Annotated

import httpx
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from echo_api.config import Settings, get_settings
from echo_api.db import get_session

router = APIRouter(tags=["health"])


class DatabaseHealth(BaseModel):
    ok: bool
    pgvector: str | None = None
    error: str | None = None


class OllamaHealth(BaseModel):
    ok: bool
    models: list[str] = []
    missing: list[str] = []
    # Missing but not required: the feature that needs it is unavailable.
    optional_missing: list[str] = []
    error: str | None = None


class Health(BaseModel):
    status: str
    database: DatabaseHealth
    ollama: OllamaHealth


async def check_database(session: AsyncSession) -> DatabaseHealth:
    try:
        version = await session.scalar(
            text("select extversion from pg_extension where extname = 'vector'")
        )
        return DatabaseHealth(ok=version is not None, pgvector=version)
    except SQLAlchemyError as exc:  # report, don't crash the health check
        return DatabaseHealth(ok=False, error=str(exc))


async def check_ollama(settings: Settings) -> OllamaHealth:
    try:
        async with httpx.AsyncClient(timeout=3) as client:
            response = await client.get(f"{settings.ollama_base_url}/models")
            response.raise_for_status()
        models = [m["id"] for m in response.json()["data"]]

        def absent(names: tuple[str, ...]) -> list[str]:
            return [m for m in names if m not in models and f"{m}:latest" not in models]

        missing = absent((settings.chat_model, settings.embedding_model))
        return OllamaHealth(
            ok=not missing,
            models=models,
            missing=missing,
            optional_missing=absent((settings.ocr_model,)),
        )
    except (httpx.HTTPError, KeyError, ValueError) as exc:
        return OllamaHealth(ok=False, error=str(exc))


@router.get("/health")
async def health(
    session: Annotated[AsyncSession, Depends(get_session)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> Health:
    database = await check_database(session)
    ollama = await check_ollama(settings)
    status = "ok" if database.ok and ollama.ok else "degraded"
    return Health(status=status, database=database, ollama=ollama)
