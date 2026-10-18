"""
Pydantic schemas for Anomaly Detection.
"""

from __future__ import annotations

from typing import Any, Literal
from pydantic import BaseModel, Field


class TransactionItem(BaseModel):
    id: str
    date: str  # YYYY-MM-DD
    amount: float
    category: str = "Uncategorized"
    merchant: str = "Unknown"
    direction: Literal["income", "expense"] = "expense"
    description: str | None = None


class AnomalyDetectRequest(BaseModel):
    transactions: list[TransactionItem] = Field(
        ..., min_length=1, description="List of transactions to evaluate"
    )
    evaluateHorizonDays: int = Field(
        default=30,
        ge=1,
        le=365,
        description="Number of most recent days to evaluate for anomalies",
    )
    zScoreThreshold: float = Field(
        default=3.0,
        ge=1.5,
        le=10.0,
        description="Robust z-score threshold for AMOUNT_ABOVE_USUAL",
    )


class AnomalyItem(BaseModel):
    transactionId: str
    date: str
    amount: float
    category: str
    merchant: str
    anomalyScore: float = Field(..., ge=0, le=100)
    robustZScore: float
    reasonCode: Literal["AMOUNT_ABOVE_USUAL", "CATEGORY_SPIKE", "NEW_MERCHANT_LARGE"]
    explanation: str
    comparisonPeriod: str
    supportingValues: dict[str, Any]
    severity: Literal["low", "medium", "high"]


class AnomalyDetectResponse(BaseModel):
    anomalies: list[AnomalyItem]
    transactionsEvaluated: int
    anomaliesFound: int
    modelVersion: str
    disclaimer: str = "Unusual spending patterns compared to your history. Not flagged as fraud."
