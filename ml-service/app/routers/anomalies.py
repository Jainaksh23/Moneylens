"""
Anomaly Detection router.
"""

from fastapi import APIRouter, Security
from ..schemas.anomalies import AnomalyDetectRequest, AnomalyDetectResponse
from ..security import verify_internal_key
from ..services.anomaly_detector import detect_anomalies

router = APIRouter(prefix="/anomalies", tags=["Anomalies"])


@router.post(
    "/detect",
    response_model=AnomalyDetectResponse,
    dependencies=[Security(verify_internal_key)],
    summary="Detect unusual transactions using rolling median + MAD",
)
async def detect_unusual_transactions(
    request: AnomalyDetectRequest,
) -> AnomalyDetectResponse:
    return detect_anomalies(request)
