"""Schemas for Goal Scoring + SIP What-If endpoint."""

from typing import Literal

from pydantic import BaseModel, Field


class GoalScoreRequest(BaseModel):
    """Inputs for goal achievability scoring with optional SIP what-if."""

    target: float = Field(gt=0, description="Target amount for the goal")
    current: float = Field(ge=0, description="Amount already saved towards this goal")
    monthsLeft: int = Field(gt=0, le=600, description="Months remaining until target date")
    monthlyContribution: float | None = Field(
        default=None,
        ge=0,
        description="Optional fixed monthly SIP contribution (user-editable)",
    )
    expectedAnnualReturn: float | None = Field(
        default=None,
        ge=0,
        le=100,
        description="Optional expected annual return % for SIP compounding (default: conservative 6%)",
    )
    historicalMonthlySurplus: list[float] | None = Field(
        default=None,
        description="Historical monthly surplus values (income - expense) for Monte Carlo scoring. "
        "Only provided when backend has sufficient data.",
    )


class SIPProjection(BaseModel):
    """Compound-interest SIP projection — clearly labelled as an assumption."""

    monthlyContribution: float
    expectedAnnualReturn: float
    projectedCorpus: float = Field(description="Projected total corpus at deadline with compounding")
    totalInvested: float = Field(description="Total amount invested (contribution × months)")
    interestEarned: float = Field(description="Projected interest earned")
    disclaimer: str = Field(
        default="This projection assumes a fixed annual return compounded monthly. "
        "Actual returns will vary. This is NOT a guarantee of future performance.",
    )


class GoalScoreResponse(BaseModel):
    """Full goal achievability assessment with transparent methodology."""

    requiredMonthly: float = Field(
        description="Amount needed per month to reach target (simple linear, no compounding)"
    )
    estimatedMonthlyAvailable: float | None = Field(
        default=None,
        description="Estimated monthly surplus from historical data (mean). "
        "Null if insufficient data.",
    )
    band: Literal["on_track", "needs_attention", "unlikely"]
    score: float = Field(
        ge=0,
        le=100,
        description="Probability-style achievability score (0-100) from Monte Carlo simulation",
    )
    sipProjection: SIPProjection | None = Field(
        default=None,
        description="SIP compounding projection if monthlyContribution is provided",
    )
    assumptions: list[str]
    limitations: list[str]
    methodology: str = Field(
        default="Monte Carlo simulation (1000 trials) sampling from historical monthly surplus "
        "distribution. See docs/goal_score.md for formula and worked examples.",
    )
