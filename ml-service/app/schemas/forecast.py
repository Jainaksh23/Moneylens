"""Schemas for Cash-Flow Forecast endpoint."""

from typing import Literal

from pydantic import BaseModel, Field


class CashFlowDataPoint(BaseModel):
    """A single month's net cash-flow aggregate sent by the backend."""

    month: str = Field(description="YYYY-MM formatted month string")
    net: float = Field(description="Net cash flow (income - expense) for this month")


class ForecastRequest(BaseModel):
    """Backend sends pre-aggregated monthly net cash-flow series."""

    series: list[CashFlowDataPoint] = Field(
        min_length=1,
        description="Monthly net cash-flow series, sorted chronologically",
    )
    horizon: int = Field(
        default=3,
        ge=1,
        le=12,
        description="Number of months to forecast",
    )


class ForecastDataPoint(BaseModel):
    """Single forecasted data point with confidence interval."""

    month: str = Field(description="YYYY-MM of the forecasted month")
    value: float = Field(description="Point forecast of net cash flow")
    lower: float = Field(description="Lower bound of prediction interval")
    upper: float = Field(description="Upper bound of prediction interval")


class ForecastResponse(BaseModel):
    """Full forecast response with metadata and transparency."""

    values: list[ForecastDataPoint]
    horizon: int
    dataCoverage: int = Field(description="Number of months of historical data used")
    modelUsed: Literal["last_value", "rolling_mean", "prophet"]
    modelVersion: str
    warnings: list[str] = Field(default_factory=list)
