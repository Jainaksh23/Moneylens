"""
Pydantic schemas for Recommendation Engine Features & Rules.
"""

from __future__ import annotations

from typing import Any, Literal
from pydantic import BaseModel, Field


class GoalInfo(BaseModel):
    id: str
    name: str
    targetAmount: float
    currentAmount: float
    targetDate: str
    requiredMonthly: float
    status: str = "active"


class UserFinancialContext(BaseModel):
    currentMonthIncome: float = 0.0
    currentMonthExpense: float = 0.0
    previousMonthIncome: float = 0.0
    previousMonthExpense: float = 0.0
    categorySpendCurrentMonth: dict[str, float] = Field(default_factory=dict)
    categorySpendPreviousMonth: dict[str, float] = Field(default_factory=dict)
    forecastSurplusNextMonth: float | None = None
    activeGoals: list[GoalInfo] = Field(default_factory=list)
    recurringChargesCount: int = 0
    recurringChargesTotal: float = 0.0
    priceIncreasesCount: int = 0
    targetSavingsRate: float = 20.0  # Default 20%


class RecommendationItem(BaseModel):
    id: str
    type: Literal[
        "category_spend_increase",
        "goal_shortfall",
        "recurring_review",
        "low_savings_rate",
        "high_discretionary",
    ]
    title: str
    rationale: str
    evidenceValues: dict[str, Any]
    evidencePeriod: str
    rule: str
    threshold: str
    estimatedEffect: str  # Always labelled "estimate", e.g. "Estimate: ₹3,200 potential monthly savings"
    actionableNextStep: str
    status: Literal["open", "dismissed", "done"] = "open"
    rank: int


class RecommendationResponse(BaseModel):
    recommendations: list[RecommendationItem]
    modelVersion: str
