"""Schemas for Cash-Flow Forecast endpoint."""

from typing import Literal, Optional, Union
from pydantic import BaseModel, Field


class CashFlowDataPoint(BaseModel):
    """A single month's net cash-flow aggregate sent by the backend."""

    month: str = Field(description="YYYY-MM formatted month string")
    net: float = Field(description="Net cash flow (income - expense) for this month")


class DailyCashFlowDataPoint(BaseModel):
    """A single day's cash-flow aggregate sent by the backend for short-history mode."""

    date: str = Field(description="YYYY-MM-DD formatted date string")
    income: float = Field(default=0.0, description="Total income for this day")
    expense: float = Field(default=0.0, description="Total expense for this day")
    net: float = Field(description="Net cash flow (income - expense) for this day")


class ForecastRequest(BaseModel):
    """Request payload for cash-flow forecasting."""

    mode: Literal["monthly", "short_history", "monthly_baseline", "monthly_standard"] = Field(
        default="monthly",
        description="Forecast mode based on history length",
    )
    series: Optional[list[CashFlowDataPoint]] = Field(
        default=None,
        description="Monthly net cash-flow series for monthly mode",
    )
    dailySeries: Optional[list[DailyCashFlowDataPoint]] = Field(
        default=None,
        description="Daily cash-flow series for short-history mode",
    )
    horizon: int = Field(
        default=3,
        ge=1,
        le=12,
        description="Number of periods (months) to forecast",
    )
    horizonDays: Optional[int] = Field(
        default=None,
        ge=1,
        le=180,
        description="Number of days to forecast in short-history mode (default: horizon * 30)",
    )


class ForecastDataPoint(BaseModel):
    """Single forecasted data point with confidence interval."""

    month: Optional[str] = Field(default=None, description="YYYY-MM of the forecasted month")
    date: Optional[str] = Field(default=None, description="YYYY-MM-DD of the forecasted day")
    value: float = Field(description="Point forecast of net cash flow")
    lower: float = Field(description="Lower bound of prediction interval")
    upper: float = Field(description="Upper bound of prediction interval")


class DataCoverageDetails(BaseModel):
    """Rich data coverage metadata."""

    firstDate: Optional[str] = Field(default=None, description="Earliest date observed")
    lastDate: Optional[str] = Field(default=None, description="Latest date observed")
    days: int = Field(description="Number of active/observed days")
    monthsSpan: Optional[int] = Field(default=None, description="Calendar months span")
    minDaysRequired: Optional[int] = Field(default=None, description="Minimum days required")


class ForecastResponse(BaseModel):
    """Full forecast response with metadata and transparency."""

    available: bool = Field(default=True, description="Whether forecast generation succeeded")
    status: Literal["ok", "insufficient_data"] = Field(default="ok", description="Status code")
    values: list[ForecastDataPoint] = Field(default_factory=list)
    horizon: int
    dataCoverage: Union[int, DataCoverageDetails] = Field(
        description="Number of months or detailed coverage metadata",
    )
    modelUsed: str = Field(description="Identifier of model used")
    modelVersion: str = Field(description="Version string of forecaster engine")
    mode: Literal["monthly", "short_history", "monthly_baseline", "monthly_standard"] = Field(
        default="monthly",
        description="Active forecasting mode",
    )
    confidence: Literal["low", "medium", "high"] = Field(
        default="medium",
        description="Estimated confidence level",
    )
    assumptions: list[str] = Field(default_factory=list, description="Explicit modeling assumptions")
    limitations: list[str] = Field(default_factory=list, description="Known modeling limitations")
    warnings: list[str] = Field(default_factory=list, description="Warnings or caveats")
    evaluation: Optional[str] = Field(default=None, description="Backtesting evaluation note")
    runRateDaily: Optional[dict[str, float]] = Field(default=None, description="Daily run-rate figures")
    dailyValues: Optional[list[ForecastDataPoint]] = Field(
        default=None,
        description="Optional daily forecast values in short-history mode",
    )
    reason: Optional[str] = Field(default=None, description="Reason if not available")
