"""Router for Cash-Flow Forecast endpoint."""

from fastapi import APIRouter, Depends, status

from app.schemas.forecast import ForecastRequest, ForecastResponse
from app.security import verify_internal_key
from app.services.forecaster import generate_forecast

router = APIRouter(
    tags=["Forecasting"],
    dependencies=[Depends(verify_internal_key)],
)


@router.post(
    "/forecast",
    response_model=ForecastResponse,
    status_code=status.HTTP_200_OK,
    summary="Cash-Flow Forecast",
    description="Generates a monthly net cash-flow forecast using pluggable models. "
    "Backend sends pre-aggregated monthly data. Prophet is used only if available "
    "and history >= 6 months; otherwise baselines are used.",
)
async def forecast(payload: ForecastRequest) -> ForecastResponse:
    series_dicts = [{"month": dp.month, "net": dp.net} for dp in payload.series]
    result = generate_forecast(series_dicts, horizon=payload.horizon)
    return ForecastResponse(**result)
