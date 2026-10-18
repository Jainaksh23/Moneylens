"""
Recommendation Engine router.
"""

from fastapi import APIRouter, Security
from ..schemas.recommendations import RecommendationResponse, UserFinancialContext
from ..security import verify_internal_key
from ..services.recommendation_engine import generate_recommendations

router = APIRouter(prefix="/recommendations", tags=["Recommendations"])


@router.post(
    "/features",
    response_model=RecommendationResponse,
    dependencies=[Security(verify_internal_key)],
    summary="Generate deterministic recommendations from financial context",
)
async def get_recommendation_features(
    context: UserFinancialContext,
) -> RecommendationResponse:
    return generate_recommendations(context)
