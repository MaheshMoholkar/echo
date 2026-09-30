from collections.abc import AsyncIterator
from typing import Annotated

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from echo_api.config import get_settings

engine = create_async_engine(get_settings().sqlalchemy_url, pool_pre_ping=True)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False)


async def get_session() -> AsyncIterator[AsyncSession]:
    """FastAPI dependency: one session per request.

    Request scope (FastAPI's default for `yield` dependencies) keeps it open
    until the response is fully sent, so a streaming (SSE) route can keep
    writing while it streams.
    """
    async with SessionLocal() as session:
        yield session


DbSession = Annotated[AsyncSession, Depends(get_session)]
