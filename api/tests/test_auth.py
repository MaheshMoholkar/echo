"""Token verification: one test per way a bad token could get through.

Tokens are signed with a throwaway Ed25519 key, like Better Auth's, and the
app is given the matching public key as a static JWKS.
"""

import time
from typing import Any

import httpx
import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from jwt_helpers import KID, make_token, settings

pytestmark = pytest.mark.usefixtures("trust_test_key")


async def get_me(client: httpx.AsyncClient, token: str | None) -> httpx.Response:
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    return await client.get("/v1/me", headers=headers)


@pytest.mark.asyncio
async def test_valid_token_identifies_user_and_org(client: httpx.AsyncClient) -> None:
    response = await get_me(client, make_token())
    assert response.status_code == 200
    assert response.json() == {
        "user_id": "user_1",
        "email": "alice@example.com",
        "name": "Alice",
        "org_id": "org_1",
    }


@pytest.mark.asyncio
async def test_missing_token(client: httpx.AsyncClient) -> None:
    response = await get_me(client, None)
    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("case", "overrides"),
    [
        ("expired", {"exp": int(time.time()) - 60}),
        ("wrong audience", {"aud": "some-other-api"}),
        ("wrong issuer", {"iss": "https://evil.example"}),
        ("no subject", {"sub": None}),
    ],
)
async def test_rejects_bad_claims(
    client: httpx.AsyncClient, case: str, overrides: dict[str, Any]
) -> None:
    response = await get_me(client, make_token(**overrides))
    assert response.status_code == 401, case


@pytest.mark.asyncio
async def test_rejects_token_signed_by_another_key(client: httpx.AsyncClient) -> None:
    """A forger reuses our kid but can't have our private key."""
    forged = make_token(key=Ed25519PrivateKey.generate())
    assert (await get_me(client, forged)).status_code == 401


@pytest.mark.asyncio
async def test_rejects_unsigned_token(client: httpx.AsyncClient) -> None:
    """`alg: none` must not be accepted, whatever the header says."""
    now = int(time.time())
    claims = {
        "sub": "user_1",
        "orgId": "org_1",
        "iss": settings.auth_issuer,
        "aud": settings.auth_audience,
        "exp": now + 900,
    }
    unsigned = jwt.encode(claims, None, algorithm="none", headers={"kid": KID})
    assert (await get_me(client, unsigned)).status_code == 401


@pytest.mark.asyncio
async def test_rejects_unknown_key_id(client: httpx.AsyncClient) -> None:
    response = await get_me(client, make_token(kid="not-a-known-key"))
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_valid_token_without_org_is_forbidden(client: httpx.AsyncClient) -> None:
    """Signed in, but no active organization: authenticated, not authorized."""
    response = await get_me(client, make_token(orgId=None))
    assert response.status_code == 403
