import secrets
from fastapi import Header, HTTPException, Request, status

from app.config import settings
from app.logging_config import logger


async def verify_internal_key(
    request: Request,
    x_internal_key: str | None = Header(default=None, alias="X-Internal-Key"),
) -> str:
    """
    Validates that the incoming request carries a valid X-Internal-Key header.
    Only the Node.js backend API gateway is authorized to call the ML service.
    Uses constant-time comparison to protect against timing side-channel attacks.
    Logs only 'internal key rejected' with requestId on failure (never the key).
    """
    request_id = getattr(request.state, "request_id", None) or request.headers.get("x-request-id", "unknown")

    if not x_internal_key:
        logger.warning(
            "internal key rejected",
            extra={"requestId": request_id, "reason": "missing_header", "route": request.url.path},
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing X-Internal-Key header",
        )

    if not secrets.compare_digest(x_internal_key, settings.internal_api_key):
        logger.warning(
            "internal key rejected",
            extra={"requestId": request_id, "reason": "key_mismatch", "route": request.url.path},
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid X-Internal-Key header",
        )

    return x_internal_key

