"""Router for Cash-Flow Forecast endpoint."""

from fastapi import APIRouter, Depends, HTTPException, status

from app.schemas.forecast import ForecastRequest, ForecastResponse
from app.security import verify_internal_key
from app.services.forecaster import (
    generate_forecast,
    generate_short_history_forecast,
)

router = APIRouter(
    tags=["Forecasting"],
    dependencies=[Depends(verify_internal_key)],
)


@router.post(
    "/forecast",
    response_model=ForecastResponse,
    status_code=status.HTTP_200_OK,
    summary="Cash-Flow Forecast",
    description="Generates a cash-flow forecast using pluggable models based on history length. "
    "Supports 'short_history' (< 2 months, daily granularity run-rate), 'monthly_baseline' "
    "(2-5 months with wide intervals), and 'monthly_standard' (>= 6 months, Prophet vs baseline).",
)
async def forecast(payload: ForecastRequest) -> ForecastResponse:
    # 1. Short-history mode: daily granularity
    if payload.mode == "short_history" or payload.dailySeries is not None:
        if not payload.dailySeries or len(payload.dailySeries) == 0:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="dailySeries is required for short_history mode",
            )
        daily_dicts = [dp.model_dump() for dp in payload.dailySeries]
        result = generate_short_history_forecast(
            daily_dicts,
            horizon=payload.horizon,
            horizon_days=payload.horizonDays,
        )
        return ForecastResponse(**result)

    # 2. Monthly modes (monthly_baseline, monthly_standard, or default monthly)
    if not payload.series or len(payload.series) == 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="series is required for monthly forecast modes",
        )

    series_dicts = [{"month": dp.month, "net": dp.net} for dp in payload.series]
    result = generate_forecast(
        series_dicts,
        horizon=payload.horizon,
        mode=payload.mode,
    )
    return ForecastResponse(**result)
