#!/usr/bin/env python3
"""
Forecast Model Evaluation Script.

Time-based split (NO shuffling, NO leakage):
  - Training: first (N - horizon) months
  - Test: last `horizon` months

Reports MAE and RMSE for every model vs baseline.
If Prophet is not better than baseline, says so explicitly.

Usage:
    python scripts/evaluate_forecast.py [--months 12] [--horizon 3]
    python scripts/evaluate_forecast.py --file data/monthly_series.json
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

# Add project root to path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.services.forecaster import (
    MIN_MONTHS_FOR_PROPHET,
    forecast_last_value,
    forecast_prophet,
    forecast_rolling_mean,
)


def generate_synthetic_series(n_months: int) -> tuple[list[str], list[float]]:
    """Generate synthetic monthly net cash-flow for testing."""
    import numpy as np

    rng = np.random.default_rng(seed=123)
    base = 25000  # Base monthly surplus
    months = []
    values = []

    for i in range(n_months):
        year = 2025 + i // 12
        month = (i % 12) + 1
        months.append(f"{year:04d}-{month:02d}")
        # Slight upward trend + seasonal + noise
        trend = i * 200
        seasonal = 3000 * math.sin(2 * math.pi * i / 12)
        noise = rng.normal(0, 2000)
        values.append(round(base + trend + seasonal + noise, 2))

    return months, values


def compute_mae(actual: list[float], predicted: list[float]) -> float:
    return round(sum(abs(a - p) for a, p in zip(actual, predicted)) / len(actual), 2)


def compute_rmse(actual: list[float], predicted: list[float]) -> float:
    mse = sum((a - p) ** 2 for a, p in zip(actual, predicted)) / len(actual)
    return round(math.sqrt(mse), 2)


def evaluate(months: list[str], values: list[float], horizon: int) -> dict:
    """Run time-based evaluation. Returns structured results."""
    n = len(values)
    if n < horizon + 2:
        print(f"ERROR: Need at least {horizon + 2} months, got {n}.")
        sys.exit(1)

    # Strict time-based split — NO shuffling
    train_months = months[:-horizon]
    train_values = values[:-horizon]
    actual = values[-horizon:]
    test_months = months[-horizon:]

    print(f"\n{'='*60}")
    print("  FORECAST MODEL EVALUATION")
    print(f"{'='*60}")
    print(f"  Total months:     {n}")
    print(f"  Training months:  {len(train_values)} ({train_months[0]} to {train_months[-1]})")
    print(f"  Test months:      {horizon} ({test_months[0]} to {test_months[-1]})")
    print(f"  Actual test vals: {actual}")
    print(f"{'='*60}\n")

    results: dict[str, dict] = {}

    # 1. Last Value Baseline
    lv = forecast_last_value(train_months, train_values, horizon)
    lv_preds = [v["value"] for v in lv["values"]]
    results["last_value"] = {
        "predictions": lv_preds,
        "mae": compute_mae(actual, lv_preds),
        "rmse": compute_rmse(actual, lv_preds),
    }

    # 2. Rolling Mean Baseline
    rm = forecast_rolling_mean(train_months, train_values, horizon)
    rm_preds = [v["value"] for v in rm["values"]]
    results["rolling_mean"] = {
        "predictions": rm_preds,
        "mae": compute_mae(actual, rm_preds),
        "rmse": compute_rmse(actual, rm_preds),
    }

    # 3. Prophet (if eligible)
    if len(train_values) >= MIN_MONTHS_FOR_PROPHET:
        prophet_result = forecast_prophet(train_months, train_values, horizon)
        if prophet_result is not None:
            p_preds = [v["value"] for v in prophet_result["values"]]
            if len(p_preds) == horizon:
                results["prophet"] = {
                    "predictions": p_preds,
                    "mae": compute_mae(actual, p_preds),
                    "rmse": compute_rmse(actual, p_preds),
                }
            else:
                print("  [!] Prophet returned wrong number of predictions. Skipped.\n")
        else:
            print("  [!] Prophet not installed or failed. Skipped.\n")
    else:
        print(f"  [!] Only {len(train_values)} training months. Prophet requires {MIN_MONTHS_FOR_PROPHET}. Skipped.\n")

    # Print results table
    print(f"  {'Model':<15} {'MAE':>10} {'RMSE':>10} {'Predictions'}")
    print(f"  {'-'*15} {'-'*10} {'-'*10} {'-'*30}")
    for model, data in results.items():
        print(f"  {model:<15} {data['mae']:>10.2f} {data['rmse']:>10.2f} {data['predictions']}")

    # Determine best model
    best_model = min(results, key=lambda k: results[k]["mae"])
    best_baseline = min(
        [k for k in results if k != "prophet"],
        key=lambda k: results[k]["mae"],
    )

    print(f"\n  [OK] Best baseline: {best_baseline} (MAE={results[best_baseline]['mae']})")
    print(f"  [OK] Best overall:  {best_model} (MAE={results[best_model]['mae']})")

    if "prophet" in results:
        if best_model == "prophet":
            improvement = results[best_baseline]["mae"] - results["prophet"]["mae"]
            print(f"  [OK] Prophet outperforms baseline by MAE={improvement:.2f}")
        else:
            deficit = results["prophet"]["mae"] - results[best_baseline]["mae"]
            print(f"  [!] Prophet does NOT outperform baseline (worse by MAE={deficit:.2f})")
            print(f"  -> Recommending {best_baseline} as default model.")

    print(f"\n{'='*60}\n")

    return {
        "results": results,
        "best_model": best_model,
        "best_baseline": best_baseline,
        "data_months": n,
        "train_months": len(train_values),
        "test_months": horizon,
    }


def main():
    parser = argparse.ArgumentParser(description="Evaluate forecast models")
    parser.add_argument("--months", type=int, default=18, help="Synthetic data months")
    parser.add_argument("--horizon", type=int, default=3, help="Forecast horizon")
    parser.add_argument("--file", type=str, help="Path to JSON file with series data")
    args = parser.parse_args()

    if args.file:
        with open(args.file) as f:
            data = json.load(f)
        series = sorted(data, key=lambda x: x["month"])
        months = [s["month"] for s in series]
        values = [s["net"] for s in series]
    else:
        months, values = generate_synthetic_series(args.months)

    evaluate(months, values, args.horizon)


if __name__ == "__main__":
    main()
