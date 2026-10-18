import secrets
from fastapi import Header, HTTPException, status

from app.config import settings


async def verify_internal_key(
    x_internal_key: str | None = Header(default=None, alias="X-Internal-Key"),
) -> str:
    """
    Validates that the incoming request carries a valid X-Internal-Key header.
    Only the Node.js backend API gateway is authorized to call the ML service.
    Uses constant-time comparison to protect against timing side-channel attacks.
    """
    if not x_internal_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing X-Internal-Key header",
        )

    if not secrets.compare_digest(x_internal_key, settings.internal_api_key):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid X-Internal-Key header",
        )

    return x_internal_key

