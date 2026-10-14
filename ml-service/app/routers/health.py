from fastapi import APIRouter
from pydantic import BaseModel, Field

router = APIRouter(tags=["Health"])


class HealthResponse(BaseModel):
    status: str = Field(default="ok")
    modelVersions: dict[str, str] = Field(default_factory=dict)


@router.get("/health", response_model=HealthResponse)
async def get_health() -> HealthResponse:
    """
    Public health check endpoint.
    Returns status: ok and dictionary of loaded ML model versions.
    """
    return HealthResponse(
        status="ok",
        modelVersions={
            "categorizer": "v1.0.0-rule-hybrid",
            "forecaster": "v1.0.0-time-series",
            "goalScorer": "v1.0.0-deterministic",
        },
    )
