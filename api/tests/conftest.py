import re
import uuid
from collections.abc import AsyncIterator, Awaitable, Callable

import httpx
import pytest
import pytest_asyncio
from jwt_helpers import public_jwk
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from echo_api import embeddings, ocr
from echo_api.auth import JWKS, get_jwks
from echo_api.db import engine, get_session
from echo_api.ingest import get_ingest_runner, ingest_document
from echo_api.main import app


@pytest_asyncio.fixture
async def db() -> AsyncIterator[AsyncSession]:
    """A session inside a transaction that is rolled back after the test.

    Tests use the real lab Postgres but leave nothing behind: the app's
    commits become savepoints inside our outer transaction.
    """
    async with engine.connect() as connection:
        transaction = await connection.begin()
        session = AsyncSession(
            bind=connection,
            join_transaction_mode="create_savepoint",
            expire_on_commit=False,
        )

        async def override() -> AsyncIterator[AsyncSession]:
            yield session

        app.dependency_overrides[get_session] = override
        yield session
        await session.close()
        await transaction.rollback()


@pytest_asyncio.fixture
async def client() -> AsyncIterator[httpx.AsyncClient]:
    """Calls the app in-process: no server, but the full FastAPI stack."""
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
    app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def make_organization(db: AsyncSession) -> Callable[[], Awaitable[str]]:
    """Create organization rows as Better Auth would (rolled back)."""

    async def make() -> str:
        org_id = f"test-org-{uuid.uuid4().hex[:8]}"
        await db.execute(
            text(
                'insert into auth.organization (id, name, slug, "createdAt") '
                "values (:id, 'Test Org', :id, now())"
            ),
            {"id": org_id},
        )
        return org_id

    return make


@pytest_asyncio.fixture
async def organization_id(make_organization: Callable[[], Awaitable[str]]) -> str:
    return await make_organization()


@pytest.fixture
def trust_test_key() -> None:
    """Accept tokens from jwt_helpers.make_token (dashboard routes)."""
    app.dependency_overrides[get_jwks] = lambda: JWKS.static({"keys": [public_jwk]})


@pytest.fixture
def inline_ingest(db: AsyncSession) -> None:
    """Run ingestion inside the test's transaction instead of a new session."""

    async def run(document_id: uuid.UUID, data: bytes) -> None:
        await ingest_document(db, document_id, data)

    app.dependency_overrides[get_ingest_runner] = lambda: run


# One dimension per topic: texts about the same topic point the same way.
TOPICS = [
    r"refund|return|money back",
    r"ship|deliver|package|arrive",
    r"password|login|log in|sign in",
    r"price|cost|month|plan",
]


def keyword_vector(text: str) -> list[float]:
    vector = [0.0] * 768
    for dimension, pattern in enumerate(TOPICS):
        vector[dimension] = float(len(re.findall(pattern, text.lower())))
    vector[-1] = 0.1  # never all zeros (cosine distance needs a direction)
    return vector


@pytest.fixture(autouse=True)
def fake_embeddings(monkeypatch: pytest.MonkeyPatch) -> None:
    """Predictable embeddings without Ollama; pgvector search stays real.

    Autouse: every chat turn searches the knowledge base first.
    """

    async def embed_documents(texts: list[str]) -> list[list[float]]:
        return [keyword_vector(t) for t in texts]

    async def embed_query(text: str) -> list[float]:
        return keyword_vector(text)

    monkeypatch.setattr(embeddings, "embed_documents", embed_documents)
    monkeypatch.setattr(embeddings, "embed_query", embed_query)


@pytest.fixture(autouse=True)
def no_real_ocr(monkeypatch: pytest.MonkeyPatch) -> None:
    """Tests never call the OCR model; test_ocr.py installs a fake."""

    async def recognize(png: bytes) -> str:
        raise AssertionError("OCR was called unexpectedly")

    monkeypatch.setattr(ocr, "recognize", recognize)
