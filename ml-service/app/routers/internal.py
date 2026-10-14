from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.security import verify_internal_key

router = APIRouter(
    prefix="/api/v1/internal",
    tags=["Internal ML Services"],
    dependencies=[Depends(verify_internal_key)],
)


class InternalPingResponse(BaseModel):
    message: str = Field(default="ML Service internal gateway accessible")
    authorized: bool = Field(default=True)


@router.get("/ping", response_model=InternalPingResponse)
async def internal_ping() -> InternalPingResponse:
    """Protected endpoint verifying internal service communication."""
    return InternalPingResponse()
