from fastapi import APIRouter, Response, status
from pydantic import BaseModel, Field

from app.services.categorizer import CategorizerService

router = APIRouter(tags=["Health"])


class HealthResponse(BaseModel):
    status: str = Field(default="ok")
    modelVersions: dict[str, str] = Field(default_factory=dict)


class ReadinessResponse(BaseModel):
    status: str
    checks: dict[str, str] = Field(default_factory=dict)


@router.get("/health", response_model=HealthResponse)
@router.get("/live", response_model=HealthResponse)
async def get_health() -> HealthResponse:
    """
    Public liveness check endpoint.
    Returns status: ok and dictionary of loaded ML model versions.
    """
    cat_service = CategorizerService.get_instance()
    return HealthResponse(
        status="ok",
        modelVersions={
            "categorizer": cat_service.model_version,
            "forecaster": "v1.0.0-time-series",
            "goalScorer": "v1.0.0-deterministic",
        },
    )


@router.get("/health/ready", response_model=ReadinessResponse)
@router.get("/ready", response_model=ReadinessResponse)
async def get_readiness(response: Response) -> ReadinessResponse:
    """
    Readiness probe: validates that ML models are properly loaded in memory.
    Returns 200 OK when ready to serve predictions, or 503 Service Unavailable during startup/failure.
    """
    cat_service = CategorizerService.get_instance()
    is_loaded = cat_service.model is not None

    if is_loaded:
        return ReadinessResponse(
            status="ok",
            checks={
                "model": "loaded",
                "modelVersion": cat_service.model_version,
            },
        )
    else:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        return ReadinessResponse(
            status="unavailable",
            checks={
                "model": "not_loaded",
            },
        )
