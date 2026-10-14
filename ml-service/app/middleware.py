import time
import uuid
from collections.abc import Callable

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

from app.logging_config import logger


class CorrelationAndLoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        # Extract or generate request ID
        request_id = request.headers.get("x-request-id") or str(uuid.uuid4())
        request.state.request_id = request_id

        start_time = time.perf_counter()
        response = await call_next(request)
        duration_ms = round((time.perf_counter() - start_time) * 1000, 2)

        # Attach request ID to response header
        response.headers["X-Request-Id"] = request_id

        # Structured JSON log
        extra_info = {
            "requestId": request_id,
            "method": request.method,
            "route": str(request.url.path),
            "status": response.status_code,
            "durationMs": duration_ms,
        }

        if response.status_code >= 500:
            logger.error(
                f"{request.method} {request.url.path} {response.status_code}",
                extra=extra_info,
            )
        elif response.status_code >= 400:
            logger.warning(
                f"{request.method} {request.url.path} {response.status_code}",
                extra=extra_info,
            )
        else:
            logger.info(
                f"{request.method} {request.url.path} {response.status_code}",
                extra=extra_info,
            )

        return response
