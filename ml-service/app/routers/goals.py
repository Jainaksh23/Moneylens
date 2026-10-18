"""Router for Goal Scoring + SIP What-If endpoint."""

from fastapi import APIRouter, Depends, status

from app.schemas.goals import GoalScoreRequest, GoalScoreResponse
from app.security import verify_internal_key
from app.services.goal_scorer import score_goal

router = APIRouter(
    tags=["Goals"],
    dependencies=[Depends(verify_internal_key)],
)


@router.post(
    "/goals/score",
    response_model=GoalScoreResponse,
    status_code=status.HTTP_200_OK,
    summary="Goal Achievability Score + SIP What-If",
    description="Computes goal achievability via Monte Carlo simulation over historical "
    "monthly surplus variation. Optionally projects SIP corpus with compounding. "
    "See docs/goal_score.md for methodology and worked examples.",
)
async def score_goal_endpoint(payload: GoalScoreRequest) -> GoalScoreResponse:
    result = score_goal(
        target=payload.target,
        current=payload.current,
        months_left=payload.monthsLeft,
        monthly_contribution=payload.monthlyContribution,
        expected_annual_return=payload.expectedAnnualReturn,
        historical_monthly_surplus=payload.historicalMonthlySurplus,
    )
    return GoalScoreResponse(**result)
