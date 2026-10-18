"""
Recurring Charge & Subscription Creep Detector Service.

Methodology:
  1. Groups transactions by normalized merchant.
  2. Evaluates date intervals between charges (25-35 days for monthly cadence).
  3. Checks price constancy or price creep (e.g. recent price increase).
  4. Flags candidate subscriptions with wording: "Review this recurring charge".
"""

from __future__ import annotations

import statistics
from collections import defaultdict
from datetime import datetime

from ..schemas.recurring import (
    RecurringChargeItem,
    RecurringDetectRequest,
    RecurringDetectResponse,
)

MODEL_VERSION = "1.0.0"


def detect_recurring_charges(
    request: RecurringDetectRequest,
) -> RecurringDetectResponse:
    expense_txs = [t for t in request.transactions if t.direction == "expense"]

    # Group by normalized merchant
    by_merchant: dict[str, list] = defaultdict(list)
    for t in expense_txs:
        merchant_key = (t.merchant or "Unknown").strip().lower()
        if merchant_key and merchant_key != "unknown":
            by_merchant[merchant_key].append(t)

    recurring_items: list[RecurringChargeItem] = []
    total_recurring = 0.0
    price_increases_count = 0

    for merchant_key, txs in by_merchant.items():
        if len(txs) < 2:
            continue

        # Sort by date
        sorted_txs = sorted(
            txs, key=lambda t: datetime.strptime(t.date[:10], "%Y-%m-%d")
        )

        dates = [
            datetime.strptime(t.date[:10], "%Y-%m-%d") for t in sorted_txs
        ]
        amounts = [t.amount for t in sorted_txs]

        # Calculate intervals in days
        intervals = [(dates[i] - dates[i - 1]).days for i in range(1, len(dates))]
        median_interval = statistics.median(intervals)

        # Cadence classification
        cadence = "irregular"
        if 24 <= median_interval <= 35:
            cadence = "monthly"
        elif 6 <= median_interval <= 8:
            cadence = "weekly"

        # Check if intervals are reasonably consistent (skip if completely sporadic)
        if cadence not in ("monthly", "weekly") and len(sorted_txs) < 3:
            continue

        avg_amount = round(statistics.mean(amounts), 2)
        last_amount = amounts[-1]
        last_date = sorted_txs[-1].date
        suggested_due_day = dates[-1].day

        # Check for price creep / increase
        is_price_increase = False
        price_diff = None
        price_diff_pct = None
        if len(amounts) >= 2:
            prev_amount = amounts[-2]
            if last_amount > prev_amount:
                is_price_increase = True
                price_diff = round(last_amount - prev_amount, 2)
                price_diff_pct = round((price_diff / prev_amount) * 100, 1)
                price_increases_count += 1

        # Check if newly added subscription (first charge within last 45 days)
        now = datetime.now()
        first_charge_days_ago = (now - dates[0]).days
        is_new_subscription = first_charge_days_ago <= 45 and len(amounts) <= 2

        # Candidate for review
        needs_review = is_price_increase or is_new_subscription
        review_reason = None
        if is_price_increase:
            review_reason = f"Price increased from ₹{amounts[-2]:,.0f} to ₹{last_amount:,.0f} (+{price_diff_pct}%). Review this recurring charge."
        elif is_new_subscription:
            review_reason = "New recurring charge detected. Review this recurring charge to confirm."
        elif cadence == "monthly" and len(amounts) >= 3:
            review_reason = "Active monthly subscription. Review this recurring charge if no longer needed."
            needs_review = True

        display_merchant = sorted_txs[-1].merchant or merchant_key.title()
        category = sorted_txs[-1].category or "Subscription"

        recurring_items.append(
            RecurringChargeItem(
                merchant=display_merchant,
                category=category,
                cadence=cadence,
                averageAmount=avg_amount,
                lastAmount=last_amount,
                lastDate=last_date,
                suggestedDueDay=suggested_due_day,
                occurrences=len(sorted_txs),
                isPriceIncrease=is_price_increase,
                priceIncreaseAmount=price_diff,
                priceIncreasePct=price_diff_pct,
                isNewSubscription=is_new_subscription,
                needsReview=needs_review,
                reviewReason=review_reason,
                transactionIds=[t.id for t in sorted_txs],
            )
        )

        total_recurring += last_amount

    # Sort: items needing review first, then by last amount descending
    recurring_items.sort(
        key=lambda x: (not x.needsReview, -x.lastAmount)
    )

    return RecurringDetectResponse(
        recurringCharges=recurring_items,
        totalRecurringMonthly=round(total_recurring, 2),
        priceIncreasesDetected=price_increases_count,
        modelVersion=MODEL_VERSION,
    )
