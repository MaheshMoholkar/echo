"""Verify the JWTs that Better Auth (in the Next.js app) issues.

Better Auth signs a short-lived token with its Ed25519 *private* key and
publishes the matching *public* keys as a JWKS at /api/auth/jwks. We fetch
those keys once, cache them, and then verify every request locally:
signature, issuer, audience and expiry. No call to the auth server per
request, which is how any API trusts Auth0, Keycloak, Cognito or Clerk.
"""

import time
from functools import lru_cache
from typing import Annotated, Any

import httpx
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel

from echo_api.config import Settings, get_settings


class JWKS:
    """Public signing keys by key id (`kid`), fetched on demand.

    An unknown `kid` triggers a refetch, which is how key rotation reaches us
    without a restart. Refetches are at most every MIN_REFRESH seconds, so a
    stream of garbage tokens can't make us hammer the auth server.
    """

    MIN_REFRESH = 30.0

    def __init__(self, url: str) -> None:
        self.url = url
        self._keys: dict[str, jwt.PyJWK] = {}
        self._fetched_at = float("-inf")

    @classmethod
    def static(cls, jwks: dict[str, Any]) -> "JWKS":
        """Fixed keys that are never refetched (tests)."""
        instance = cls(url="")
        instance._load(jwks)
        instance._fetched_at = float("inf")
        return instance

    def _load(self, jwks: dict[str, Any]) -> None:
        keys = jwt.PyJWKSet.from_dict(jwks).keys
        self._keys = {key.key_id: key for key in keys if key.key_id}

    async def get(self, kid: str) -> jwt.PyJWK:
        stale = time.monotonic() - self._fetched_at > self.MIN_REFRESH
        if kid not in self._keys and stale:
            async with httpx.AsyncClient(timeout=5) as client:
                response = await client.get(self.url)
                response.raise_for_status()
            self._load(response.json())
            self._fetched_at = time.monotonic()
        try:
            return self._keys[kid]
        except KeyError:
            raise jwt.InvalidTokenError("unknown signing key") from None


@lru_cache
def get_jwks() -> JWKS:
    return JWKS(get_settings().auth_jwks_url)


class Principal(BaseModel):
    """Who is calling, from the token's claims."""

    user_id: str
    email: str
    name: str
    org_id: str | None


class OrgPrincipal(Principal):
    """A caller acting inside an organization: every tenant query filters by org_id."""

    org_id: str


bearer = HTTPBearer(auto_error=False)


def _unauthorized(detail: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
        headers={"WWW-Authenticate": "Bearer"},
    )


async def current_principal(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
    jwks: Annotated[JWKS, Depends(get_jwks)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> Principal:
    if credentials is None:
        raise _unauthorized("Missing bearer token")
    token = credentials.credentials
    try:
        kid = jwt.get_unverified_header(token).get("kid")
        if not kid:
            raise jwt.InvalidTokenError("token has no key id")
        key = await jwks.get(kid)
        claims = jwt.decode(
            token,
            key=key,
            # Pin the algorithm. Letting the token's own header choose it is
            # the classic JWT hole ("alg": "none", or HS256 keyed with the
            # public key).
            algorithms=["EdDSA"],
            audience=settings.auth_audience,
            issuer=settings.auth_issuer,
            options={"require": ["exp", "sub", "iss", "aud"]},
        )
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Cannot fetch the auth server's signing keys",
        ) from exc
    except jwt.InvalidTokenError as exc:
        raise _unauthorized(f"Invalid token: {exc}") from exc

    return Principal(
        user_id=claims["sub"],
        email=claims.get("email", ""),
        name=claims.get("name", ""),
        org_id=claims.get("orgId"),
    )


CurrentUser = Annotated[Principal, Depends(current_principal)]


async def require_org(principal: CurrentUser) -> OrgPrincipal:
    if not principal.org_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No active organization",
        )
    return OrgPrincipal(
        **principal.model_dump(exclude={"org_id"}), org_id=principal.org_id
    )


OrgUser = Annotated[OrgPrincipal, Depends(require_org)]
