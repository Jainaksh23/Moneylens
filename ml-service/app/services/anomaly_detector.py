"""
Explainable Anomaly Detection Service for MoneyLens.

Methodology:
  1. Per-category rolling median + MAD (Median Absolute Deviation) -> robust z-score:
       MAD = median(|x_i - median(X)|)
       sigma_hat = 1.4826 * MAD
       robust_z = (x - median) / sigma_hat
  2. Reason Codes:
       - AMOUNT_ABOVE_USUAL: Transaction amount significantly exceeds historical category median.
       - CATEGORY_SPIKE: Category spend in recent period surged vs previous baseline.
       - NEW_MERCHANT_LARGE: First time seeing this merchant, with a high amount.
  3. Safety & Wording:
       - Strictly NEVER labeled as fraud.
       - Wording: "unusual compared to your history".
"""

from __future__ import annotations

import statistics
from datetime import datetime, timedelta

from ..schemas.anomalies import (
    AnomalyDetectRequest,
    AnomalyDetectResponse,
    AnomalyItem,
)

MODEL_VERSION = "1.0.0"


def compute_median_and_mad(values: list[float]) -> tuple[float, float]:
    """Compute median and robust Median Absolute Deviation (MAD).

    If MAD is 0 (e.g. repeated identical transactions), returns a small
    fraction of median or 1.0 to ensure numerical stability without division by zero.
    """
    if not values:
        return 0.0, 1.0

    med = float(statistics.median(values))
    abs_deviations = [abs(x - med) for x in values]
    mad = float(statistics.median(abs_deviations))

    # Fallback scale if MAD is zero
    if mad == 0.0:
        mean_dev = (
            statistics.mean(abs_deviations)
            if abs_deviations
            else 0.0
        )
        mad = mean_dev if mean_dev > 0 else max(med * 0.1, 1.0)

    return round(med, 2), round(mad, 2)


def compute_robust_z(amount: float, median: float, mad: float) -> float:
    """Calculate robust z-score: (amount - median) / (1.4826 * mad)."""
    sigma_hat = 1.4826 * mad
    if sigma_hat <= 0:
        return 0.0
    return round((amount - median) / sigma_hat, 2)


def normalize_anomaly_score(robust_z: float) -> float:
    """Map robust z-score to a 0-100 anomaly confidence score."""
    # z = 3.0 -> ~50, z = 5.0 -> ~80, z >= 7.0 -> ~98
    if robust_z <= 0:
        return 0.0
    # Logistic-like scaling
    score = 100.0 * (robust_z / (robust_z + 3.0))
    return round(min(100.0, max(0.0, score)), 1)


def determine_severity(robust_z: float, amount_ratio: float) -> str:
    if robust_z >= 5.0 or amount_ratio >= 4.0:
        return "high"
    if robust_z >= 3.5 or amount_ratio >= 2.5:
        return "medium"
    return "low"


def detect_anomalies(request: AnomalyDetectRequest) -> AnomalyDetectResponse:
    """Detect unusual transactions using explainable rolling median + MAD."""
    txs = sorted(request.transactions, key=lambda t: t.date)
    if not txs:
        return AnomalyDetectResponse(
            anomalies=[],
            transactionsEvaluated=0,
            anomaliesFound=0,
            modelVersion=MODEL_VERSION,
        )

    # Determine cutoff date for recent evaluation horizon
    latest_date = datetime.strptime(txs[-1].date[:10], "%Y-%m-%d")
    cutoff_date = latest_date - timedelta(days=request.evaluateHorizonDays)

    # Filter expense transactions
    expense_txs = [t for t in txs if t.direction == "expense"]
    all_merchants_seen_prior: set[str] = set()

    # Pre-gather all overall expense amounts for global fallback
    overall_amounts = [t.amount for t in expense_txs]
    overall_median, overall_mad = compute_median_and_mad(overall_amounts)

    anomalies: list[AnomalyItem] = []
    evaluated_count = 0

    # Build historical knowledge chronologically
    history_by_category: dict[str, list[float]] = {}

    for t in expense_txs:
        t_date = datetime.strptime(t.date[:10], "%Y-%m-%d")
        is_in_eval_horizon = t_date >= cutoff_date
        if is_in_eval_horizon:
            evaluated_count += 1

        cat = t.category or "Uncategorized"
        merchant_norm = (t.merchant or "Unknown").strip().lower()

        # Check for anomalies only if in evaluation horizon and we have some prior data
        if is_in_eval_horizon:
            cat_history = history_by_category.get(cat, [])
            prior_count = len(cat_history)

            # Use category history if available (>= 3 points), else overall history
            if prior_count >= 3:
                med, mad = compute_median_and_mad(cat_history)
                comp_source = f"{cat} category history ({prior_count} transactions)"
            else:
                med, mad = overall_median, overall_mad
                comp_source = f"overall spending history ({len(overall_amounts)} transactions)"

            robust_z = compute_robust_z(t.amount, med, mad)
            amount_ratio = round(t.amount / med, 2) if med > 0 else 1.0

            # 1. NEW_MERCHANT_LARGE
            if (
                merchant_norm not in all_merchants_seen_prior
                and t.amount >= 5000.0
                and t.amount >= 2.0 * overall_median
            ):
                robust_z_val = max(robust_z, 3.2)
                score = normalize_anomaly_score(robust_z_val)
                explanation = (
                    f"New merchant '{t.merchant}' with amount ₹{t.amount:,.0f} is unusual compared to your history "
                    f"(overall median spending ₹{overall_median:,.0f})."
                )
                supporting_values = {
                    "actualAmount": t.amount,
                    "usualMedian": overall_median,
                    "mad": overall_mad,
                    "robustZ": robust_z_val,
                    "category": cat,
                    "merchant": t.merchant,
                    "isNewMerchant": True,
                }
                anomalies.append(
                    AnomalyItem(
                        transactionId=t.id,
                        date=t.date,
                        amount=t.amount,
                        category=cat,
                        merchant=t.merchant,
                        anomalyScore=score,
                        robustZScore=robust_z_val,
                        reasonCode="NEW_MERCHANT_LARGE",
                        explanation=explanation,
                        comparisonPeriod="overall spending history",
                        supportingValues=supporting_values,
                        severity="medium" if t.amount < 15000 else "high",
                    )
                )

            # 2. AMOUNT_ABOVE_USUAL
            elif robust_z >= request.zScoreThreshold and t.amount > med:
                score = normalize_anomaly_score(robust_z)
                severity = determine_severity(robust_z, amount_ratio)

                explanation = (
                    f"Amount of ₹{t.amount:,.0f} for {t.merchant} is unusual compared to your history "
                    f"(typical median ₹{med:,.0f} in {cat})."
                )

                supporting_values = {
                    "actualAmount": t.amount,
                    "usualMedian": med,
                    "mad": mad,
                    "robustZ": robust_z,
                    "amountRatio": amount_ratio,
                    "category": cat,
                    "merchant": t.merchant,
                    "priorTxCount": prior_count,
                }

                anomalies.append(
                    AnomalyItem(
                        transactionId=t.id,
                        date=t.date,
                        amount=t.amount,
                        category=cat,
                        merchant=t.merchant,
                        anomalyScore=score,
                        robustZScore=robust_z,
                        reasonCode="AMOUNT_ABOVE_USUAL",
                        explanation=explanation,
                        comparisonPeriod=comp_source,
                        supportingValues=supporting_values,
                        severity=severity,
                    )
                )

        # Update historical state for future transactions
        if cat not in history_by_category:
            history_by_category[cat] = []
        history_by_category[cat].append(t.amount)
        if merchant_norm and merchant_norm != "unknown":
            all_merchants_seen_prior.add(merchant_norm)

    return AnomalyDetectResponse(
        anomalies=anomalies,
        transactionsEvaluated=evaluated_count,
        anomaliesFound=len(anomalies),
        modelVersion=MODEL_VERSION,
    )
