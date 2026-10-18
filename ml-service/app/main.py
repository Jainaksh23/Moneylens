from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.config import settings
from app.middleware import CorrelationAndLoggingMiddleware
from app.routers import (
    anomalies,
    categorize,
    forecast,
    goals,
    health,
    internal,
    pdf_import,
    rag,
    recommendations,
    recurring,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        from app.services.rag_service import rag_service
        rag_service.ensure_ingested_on_startup()
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning("RAG startup ingestion skipped/failed: %s", e)
    yield


app = FastAPI(
    title="MoneyLens ML & Intelligence Service",
    description="Internal Analytical, Categorization, Forecasting, and RAG Engine for MoneyLens",
    version="1.0.0",
    docs_url="/docs" if settings.environment != "production" else None,
    redoc_url=None,
    lifespan=lifespan,
)

# Correlation ID and structured logging middleware
app.add_middleware(CorrelationAndLoggingMiddleware)


# Error format consistency: { "error": { "code", "message", "details?" }, "requestId" }
@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
    request_id = getattr(request.state, "request_id", "unknown")
    status_code_map = {
        400: "BAD_REQUEST",
        401: "UNAUTHORIZED",
        403: "FORBIDDEN",
        404: "NOT_FOUND",
        422: "VALIDATION_ERROR",
        500: "INTERNAL_SERVER_ERROR",
        503: "SERVICE_UNAVAILABLE",
    }
    code = status_code_map.get(exc.status_code, "ERROR")

    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": {
                "code": code,
                "message": exc.detail,
            },
            "requestId": request_id,
        },
        headers={"X-Request-Id": request_id},
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    request_id = getattr(request.state, "request_id", "unknown")
    details = [
        {
            "field": ".".join(str(loc) for loc in err["loc"]),
            "message": err["msg"],
            "type": err["type"],
        }
        for err in exc.errors()
    ]

    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={
            "error": {
                "code": "VALIDATION_ERROR",
                "message": "Invalid request schema or payload",
                "details": details,
            },
            "requestId": request_id,
        },
        headers={"X-Request-Id": request_id},
    )


@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    request_id = getattr(request.state, "request_id", "unknown")
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "error": {
                "code": "INTERNAL_SERVER_ERROR",
                "message": "An internal ML service error occurred",
            },
            "requestId": request_id,
        },
        headers={"X-Request-Id": request_id},
    )

# Routers
app.include_router(health.router)
app.include_router(internal.router)
app.include_router(categorize.router)
app.include_router(categorize.router, prefix="/api/v1")
app.include_router(forecast.router)
app.include_router(forecast.router, prefix="/api/v1")
app.include_router(goals.router)
app.include_router(goals.router, prefix="/api/v1")
app.include_router(anomalies.router)
app.include_router(anomalies.router, prefix="/api/v1")
app.include_router(recurring.router)
app.include_router(recurring.router, prefix="/api/v1")
app.include_router(recommendations.router)
app.include_router(recommendations.router, prefix="/api/v1")
app.include_router(rag.router)
app.include_router(rag.router, prefix="/api/v1")
app.include_router(pdf_import.router)
app.include_router(pdf_import.router, prefix="/api/v1")
