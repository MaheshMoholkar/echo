from fastapi import APIRouter

from echo_api.auth import OrgPrincipal, OrgUser

router = APIRouter(tags=["auth"])


@router.get("/me")
async def me(principal: OrgUser) -> OrgPrincipal:
    """The caller as the API sees them, after verifying their token."""
    return principal
