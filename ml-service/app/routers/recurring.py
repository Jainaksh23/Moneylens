"""
Recurring Charges & Subscription Creep detection router.
"""

from fastapi import APIRouter, Security
from ..schemas.recurring import RecurringDetectRequest, RecurringDetectResponse
from ..security import verify_internal_key
from ..services.recurring_detector import detect_recurring_charges

router = APIRouter(prefix="/recurring", tags=["Recurring"])


@router.post(
    "/detect",
    response_model=RecurringDetectResponse,
    dependencies=[Security(verify_internal_key)],
    summary="Detect recurring charges, subscriptions, and price increases",
)
async def detect_recurring(
    request: RecurringDetectRequest,
) -> RecurringDetectResponse:
    return detect_recurring_charges(request)
