#!/usr/bin/env python3
"""
Anomaly Detection Evaluation Script for MoneyLens.

Methodology:
  1. Generates realistic synthetic personal finance transactions across categories.
  2. Injects ground-truth synthetic anomalies (amount spikes, unexpected large merchants).
  3. Evaluates Precision, Recall, F1, and Alert Rate across robust z-score thresholds.
  4. Recommends an optimal threshold that minimizes alert fatigue while retaining high recall.
"""

from __future__ import annotations

import argparse
import random
import sys
from pathlib import Path

# Add project root
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.schemas.anomalies import AnomalyDetectRequest, TransactionItem
from app.services.anomaly_detector import detect_anomalies


def generate_evaluation_dataset(
    n_normal: int = 400, n_anomalies: int = 25, seed: int = 42
) -> tuple[list[TransactionItem], set[str]]:
    """Generate synthetic transactions with known injected ground-truth anomalies."""
    rng = random.Random(seed)

    categories = {
        "Food & Dining": {"median": 650, "std": 200, "merchants": ["Swiggy", "Zomato", "Starbucks", "Local Cafe"]},
        "Groceries": {"median": 2200, "std": 600, "merchants": ["Blinkit", "Zepto", "BigBasket", "DMart"]},
        "Utilities": {"median": 1800, "std": 400, "merchants": ["Electricity Board", "Water Supply", "Airtel Broadband"]},
        "Shopping": {"median": 1500, "std": 700, "merchants": ["Amazon", "Flipkart", "Myntra", "Zara"]},
        "Transportation": {"median": 350, "std": 120, "merchants": ["Uber", "Ola", "Metro Rail", "Petrol Pump"]},
    }

    transactions: list[TransactionItem] = []
    ground_truth_anomaly_ids: set[str] = set()

    # 1. Normal transactions
    for i in range(n_normal):
        cat_name = rng.choice(list(categories.keys()))
        cfg = categories[cat_name]

        # Log-normal or clipped normal
        base_amt = max(50.0, rng.gauss(cfg["median"], cfg["std"]))
        merchant = rng.choice(cfg["merchants"])

        day_offset = (i * 120) // n_normal  # Span 120 days
        year = 2026
        month = 6 + (day_offset // 30)
        day = (day_offset % 28) + 1
        date_str = f"{year:04d}-{month:02d}-{day:02d}"

        tx_id = f"tx_norm_{i:04d}"
        transactions.append(
            TransactionItem(
                id=tx_id,
                date=date_str,
                amount=round(base_amt, 2),
                category=cat_name,
                merchant=merchant,
                direction="expense",
                description=f"{merchant} purchase",
            )
        )

    # 2. Inject ground truth anomalies in the recent horizon (last 30 days)
    for j in range(n_anomalies):
        cat_name = rng.choice(list(categories.keys()))
        cfg = categories[cat_name]

        # 3x to 8x normal median
        spike_factor = rng.uniform(4.0, 9.0)
        spike_amount = round(cfg["median"] * spike_factor, 2)

        day = rng.randint(1, 28)
        date_str = f"2026-09-{day:02d}"

        if j % 2 == 0:
            merchant = rng.choice(cfg["merchants"])
        else:
            merchant = f"UnusualMerchant_{j}"

        tx_id = f"tx_anomaly_{j:04d}"
        ground_truth_anomaly_ids.add(tx_id)
        transactions.append(
            TransactionItem(
                id=tx_id,
                date=date_str,
                amount=spike_amount,
                category=cat_name,
                merchant=merchant,
                direction="expense",
                description=f"Injected anomaly: {merchant}",
            )
        )

    # Sort chronologically
    transactions.sort(key=lambda t: t.date)
    return transactions, ground_truth_anomaly_ids


def evaluate_thresholds(
    transactions: list[TransactionItem],
    ground_truth_anomaly_ids: set[str],
    thresholds: list[float],
) -> dict:
    """Evaluate precision, recall, F1 across thresholds."""
    results = []

    for thresh in thresholds:
        req = AnomalyDetectRequest(
            transactions=transactions,
            evaluateHorizonDays=45,
            zScoreThreshold=thresh,
        )
        resp = detect_anomalies(req)

        detected_ids = {a.transactionId for a in resp.anomalies}

        tp = len(detected_ids & ground_truth_anomaly_ids)
        fp = len(detected_ids - ground_truth_anomaly_ids)
        fn = len(ground_truth_anomaly_ids - detected_ids)
        _tn = resp.transactionsEvaluated - (tp + fp + fn)

        precision = (tp / (tp + fp)) * 100.0 if (tp + fp) > 0 else 0.0
        recall = (tp / (tp + fn)) * 100.0 if (tp + fn) > 0 else 0.0
        f1 = (
            (2 * precision * recall) / (precision + recall)
            if (precision + recall) > 0
            else 0.0
        )
        alert_rate = (len(detected_ids) / max(1, resp.transactionsEvaluated)) * 100.0

        results.append(
            {
                "threshold": thresh,
                "tp": tp,
                "fp": fp,
                "fn": fn,
                "detected": len(detected_ids),
                "precision": round(precision, 1),
                "recall": round(recall, 1),
                "f1": round(f1, 1),
                "alert_rate": round(alert_rate, 1),
            }
        )

    return {"results": results, "total_ground_truth": len(ground_truth_anomaly_ids)}


def main():
    parser = argparse.ArgumentParser(description="Evaluate Anomaly Detector Precision/Recall")
    parser.add_argument("--normal", type=int, default=450, help="Normal transactions count")
    parser.add_argument("--anomalies", type=int, default=25, help="Ground truth anomalies count")
    args = parser.parse_args()

    txs, gt_ids = generate_evaluation_dataset(n_normal=args.normal, n_anomalies=args.anomalies)

    thresholds = [2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0]
    eval_data = evaluate_thresholds(txs, gt_ids, thresholds)

    print("\n" + "=" * 70)
    print("  ANOMALY DETECTION EVALUATION (Median + MAD Robust Z-Score)")
    print("=" * 70)
    print(f"  Total Transactions: {len(txs)}")
    print(f"  Ground Truth Injected Anomalies: {len(gt_ids)}")
    print("=" * 70)
    print(
        f"  {'Z-Thresh':<10} {'Alerts':>8} {'TP':>6} {'FP':>6} {'FN':>6} "
        f"{'Precision':>10} {'Recall':>8} {'F1':>8} {'AlertRate'}"
    )
    print("  " + "-" * 68)

    best_thresh = None
    best_f1 = -1.0

    for r in eval_data["results"]:
        thresh_str = f"z >= {r['threshold']:.1f}"
        print(
            f"  {thresh_str:<10} {r['detected']:>8} {r['tp']:>6} {r['fp']:>6} {r['fn']:>6} "
            f"{r['precision']:>9.1f}% {r['recall']:>7.1f}% {r['f1']:>7.1f}% {r['alert_rate']:>8.1f}%"
        )
        if r["f1"] > best_f1:
            best_f1 = r["f1"]
            best_thresh = r

    print("=" * 70)
    if best_thresh:
        print(f"\n  [OK] Optimal Operating Threshold: z >= {best_thresh['threshold']:.1f}")
        print(
            f"       Precision: {best_thresh['precision']}%  |  Recall: {best_thresh['recall']}%  |  F1: {best_thresh['f1']}%"
        )
        print(
            f"       Alert Fatigue Control: Only {best_thresh['alert_rate']}% of transactions flagged ({best_thresh['fp']} false positives)."
        )
    print("=" * 70 + "\n")


if __name__ == "__main__":
    main()
