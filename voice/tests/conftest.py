import uuid
from collections.abc import AsyncIterator

import httpx
import pytest_asyncio
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from echo_api import chat
from echo_api.db import engine, get_session
from echo_api.models import ContactSession, Conversation
from echo_api.schemas import ContactSessionCreate
from echo_voice.server import app


@pytest_asyncio.fixture
async def db() -> AsyncIterator[AsyncSession]:
    """Real lab Postgres, inside a transaction rolled back after the test."""
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
        app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def client() -> AsyncIterator[httpx.AsyncClient]:
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


@pytest_asyncio.fixture
async def contact(db: AsyncSession) -> ContactSession:
    org_id = f"test-org-{uuid.uuid4().hex[:8]}"
    await db.execute(
        text(
            'insert into auth.organization (id, name, slug, "createdAt") '
            "values (:id, 'Test Org', :id, now())"
        ),
        {"id": org_id},
    )
    return await chat.create_contact_session(
        db,
        ContactSessionCreate(
            organization_id=org_id, name="Bob", email="bob@example.com"
        ),
    )


@pytest_asyncio.fixture
async def conversation(db: AsyncSession, contact: ContactSession) -> Conversation:
    return await chat.create_conversation(db, contact)
