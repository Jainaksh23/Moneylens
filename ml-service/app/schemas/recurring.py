"""
Pydantic schemas for Recurring Transaction & Subscription Creep Detection.
"""

from __future__ import annotations

from typing import Literal
from pydantic import BaseModel, Field
from .anomalies import TransactionItem


class RecurringDetectRequest(BaseModel):
    transactions: list[TransactionItem] = Field(
        ..., min_length=2, description="Transactions to analyze for recurring patterns"
    )


class RecurringChargeItem(BaseModel):
    merchant: str
    category: str
    cadence: Literal["monthly", "weekly", "irregular"]
    averageAmount: float
    lastAmount: float
    lastDate: str
    suggestedDueDay: int  # Day of month (1-31)
    occurrences: int
    isPriceIncrease: bool = False
    priceIncreaseAmount: float | None = None
    priceIncreasePct: float | None = None
    isNewSubscription: bool = False
    needsReview: bool = False
    reviewReason: str | None = None
    transactionIds: list[str] = Field(default_factory=list)


class RecurringDetectResponse(BaseModel):
    recurringCharges: list[RecurringChargeItem]
    totalRecurringMonthly: float
    priceIncreasesDetected: int
    modelVersion: str
