"""Test tokens: signed with a throwaway Ed25519 key, like Better Auth's.

Tests that call dashboard routes give the app the matching public key as a
static JWKS (the `trust_test_key` fixture) and send `make_token(...)`.
"""

import time
from typing import Any

import jwt
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from jwt.algorithms import OKPAlgorithm

from echo_api.config import get_settings

KID = "test-key"
signing_key = Ed25519PrivateKey.generate()
public_jwk = OKPAlgorithm.to_jwk(signing_key.public_key(), as_dict=True) | {
    "kid": KID,
    "alg": "EdDSA",
}
settings = get_settings()


def make_token(key: Any = signing_key, kid: str = KID, **overrides: Any) -> str:
    now = int(time.time())
    claims = {
        "sub": "user_1",
        "email": "alice@example.com",
        "name": "Alice",
        "orgId": "org_1",
        "iss": settings.auth_issuer,
        "aud": settings.auth_audience,
        "iat": now,
        "exp": now + 900,
    } | overrides
    claims = {k: v for k, v in claims.items() if v is not None}
    return jwt.encode(claims, key, algorithm="EdDSA", headers={"kid": kid})


def bearer(org_id: str) -> dict[str, str]:
    """Headers for a dashboard user acting in `org_id`."""
    return {"Authorization": f"Bearer {make_token(orgId=org_id)}"}
