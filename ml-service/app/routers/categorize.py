from typing import List, Union
from fastapi import APIRouter, Depends, status

from app.schemas.categorize import (
    BatchPredictRequest,
    BatchPredictResponse,
    TransactionPredictItem,
)
from app.security import verify_internal_key
from app.services.categorizer import CategorizerService

router = APIRouter(
    tags=["Categorization"],
    dependencies=[Depends(verify_internal_key)],
)


@router.post(
    "/predict/category",
    response_model=BatchPredictResponse,
    status_code=status.HTTP_200_OK,
    summary="Batch Predict Categories",
    description="Classifies a list of transactions using TF-IDF + Logistic Regression. "
    "Flags predictions below the confidence threshold as 'unknown' with needsReview=True.",
)
async def predict_category(
    payload: Union[BatchPredictRequest, List[TransactionPredictItem]],
) -> BatchPredictResponse:
    service = CategorizerService.get_instance()

    if isinstance(payload, list):
        items = payload
        threshold = None
    else:
        items = payload.items
        threshold = payload.confidenceThreshold

    predictions = service.predict_batch(items=items, confidence_threshold=threshold)

    return BatchPredictResponse(
        predictions=predictions,
        modelVersion=service.model_version,
    )
