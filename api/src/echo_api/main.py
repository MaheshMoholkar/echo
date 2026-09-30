from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from echo_api.db import engine
from echo_api.routers import assist, files, health, inbox, me, public


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    yield
    await engine.dispose()


app = FastAPI(title="Echo API", lifespan=lifespan)

# Everything lives under /v1. The Next.js app proxies /api/v1/* here, so the
# browser talks to one origin; /api/auth/* stays with Better Auth in Next.js.
app.include_router(health.router, prefix="/v1")
app.include_router(me.router, prefix="/v1")
app.include_router(public.router, prefix="/v1")
app.include_router(files.router, prefix="/v1")
app.include_router(inbox.router, prefix="/v1")
app.include_router(assist.router, prefix="/v1")
