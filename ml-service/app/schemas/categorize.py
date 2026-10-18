from typing import List, Optional
from pydantic import BaseModel, Field


class TransactionPredictItem(BaseModel):
    id: str = Field(description="Unique identifier for correlation (transaction ID or temp index)")
    description: str = Field(description="Transaction narration / description")
    merchant: Optional[str] = Field(default=None, description="Identified or raw merchant name if available")


class BatchPredictRequest(BaseModel):
    items: List[TransactionPredictItem] = Field(description="Batch of transactions to classify")
    confidenceThreshold: Optional[float] = Field(
        default=None,
        ge=0.0,
        le=1.0,
        description="Optional custom confidence cutoff. Predictions below this return 'unknown' with needsReview=True",
    )


class TransactionPrediction(BaseModel):
    id: str
    category: str
    confidence: float
    needsReview: bool
    modelVersion: str


class BatchPredictResponse(BaseModel):
    predictions: List[TransactionPrediction]
    modelVersion: str
