"""
Cash-Flow Forecast Service.

Pluggable model selection:
  - Prophet (if installed AND history >= 6 months)
  - Rolling mean baseline (default for shorter history)
  - Last-value baseline (always available)

The service compares models and picks the best one automatically.
"""

from __future__ import annotations

import logging
import math
import statistics
from datetime import datetime


logger = logging.getLogger("moneylens.forecast")

MODEL_VERSION = "v1.0.0-time-series"
MIN_MONTHS_FOR_PROPHET = 6
ROLLING_WINDOW = 3


def _try_import_prophet():
    """Attempt to import Prophet. Returns None if not installed."""
    try:
        from prophet import Prophet  # type: ignore[import-untyped]

        return Prophet
    except ImportError:
        return None


def _parse_series(series: list[dict]) -> tuple[list[str], list[float]]:
    """Extract sorted months and values from series data."""
    sorted_series = sorted(series, key=lambda x: x["month"])
    months = [s["month"] for s in sorted_series]
    values = [s["net"] for s in sorted_series]
    return months, values


def _next_months(last_month: str, horizon: int) -> list[str]:
    """Generate the next N months after last_month (YYYY-MM format)."""
    dt = datetime.strptime(last_month, "%Y-%m")
    result = []
    for i in range(1, horizon + 1):
        year = dt.year + (dt.month + i - 1) // 12
        month = (dt.month + i - 1) % 12 + 1
        result.append(f"{year:04d}-{month:02d}")
    return result


def _confidence_interval(
    values: list[float], point: float, multiplier: float = 1.5
) -> tuple[float, float]:
    """Compute a simple confidence interval based on historical std dev."""
    if len(values) < 2:
        spread = abs(point) * 0.3 if point != 0 else 1000.0
    else:
        spread = statistics.stdev(values) * multiplier
    return round(point - spread, 2), round(point + spread, 2)


def forecast_last_value(
    months: list[str], values: list[float], horizon: int
) -> dict:
    """Naive baseline: repeat the last observed value."""
    last_val = values[-1]
    future_months = _next_months(months[-1], horizon)
    forecasts = []
    for m in future_months:
        lower, upper = _confidence_interval(values, last_val)
        forecasts.append(
            {"month": m, "value": round(last_val, 2), "lower": lower, "upper": upper}
        )
    return {
        "values": forecasts,
        "modelUsed": "last_value",
    }


def forecast_rolling_mean(
    months: list[str], values: list[float], horizon: int, window: int = ROLLING_WINDOW
) -> dict:
    """Rolling mean baseline: average of last `window` months."""
    effective_window = min(window, len(values))
    mean_val = statistics.mean(values[-effective_window:])
    future_months = _next_months(months[-1], horizon)
    forecasts = []
    for m in future_months:
        lower, upper = _confidence_interval(values, mean_val)
        forecasts.append(
            {"month": m, "value": round(mean_val, 2), "lower": lower, "upper": upper}
        )
    return {
        "values": forecasts,
        "modelUsed": "rolling_mean",
    }


def forecast_prophet(
    months: list[str], values: list[float], horizon: int
) -> dict | None:
    """Prophet model forecast. Returns None if Prophet unavailable or fails."""
    ProphetClass = _try_import_prophet()
    if ProphetClass is None:
        return None

    try:
        import pandas as pd

        # Prophet requires 'ds' and 'y' columns
        df = pd.DataFrame(
            {
                "ds": pd.to_datetime([f"{m}-01" for m in months]),
                "y": values,
            }
        )

        model = ProphetClass(
            yearly_seasonality=True if len(values) >= 12 else False,
            weekly_seasonality=False,
            daily_seasonality=False,
            interval_width=0.80,
        )
        model.fit(df)

        future = model.make_future_dataframe(periods=horizon, freq="MS")
        prediction = model.predict(future)

        # Extract only the forecast horizon
        forecast_df = prediction.tail(horizon)
        forecasts = []
        for _, row in forecast_df.iterrows():
            m = row["ds"].strftime("%Y-%m")
            forecasts.append(
                {
                    "month": m,
                    "value": round(float(row["yhat"]), 2),
                    "lower": round(float(row["yhat_lower"]), 2),
                    "upper": round(float(row["yhat_upper"]), 2),
                }
            )

        return {
            "values": forecasts,
            "modelUsed": "prophet",
        }
    except Exception as e:
        logger.warning("Prophet forecast failed: %s. Falling back to baseline.", e)
        return None


def _compute_mae(actual: list[float], predicted: list[float]) -> float:
    """Mean Absolute Error."""
    return sum(abs(a - p) for a, p in zip(actual, predicted)) / len(actual)


def _compute_rmse(actual: list[float], predicted: list[float]) -> float:
    """Root Mean Squared Error."""
    mse = sum((a - p) ** 2 for a, p in zip(actual, predicted)) / len(actual)
    return math.sqrt(mse)


def generate_forecast(
    series: list[dict], horizon: int = 3
) -> dict:
    """
    Main entry point: pluggable model selection.

    1. Always generate baselines (last_value, rolling_mean).
    2. If Prophet is available and history >= 6 months, also run Prophet.
    3. Pick the model with the best in-sample validation (if enough data for a split).
    4. Return the best forecast with metadata.
    """
    months, values = _parse_series(series)
    n = len(values)
    warnings: list[str] = []

    if n < 3:
        warnings.append(
            f"Very limited data ({n} months). Forecast reliability is low."
        )

    # Generate candidate forecasts
    candidates: dict[str, dict] = {}
    candidates["last_value"] = forecast_last_value(months, values, horizon)
    candidates["rolling_mean"] = forecast_rolling_mean(months, values, horizon)

    # Try Prophet if enough data
    prophet_eligible = n >= MIN_MONTHS_FOR_PROPHET
    if not prophet_eligible:
        warnings.append(
            f"Data coverage ({n} months) is below {MIN_MONTHS_FOR_PROPHET} months. "
            f"Using baseline model. Collect more data for improved forecasting."
        )

    if prophet_eligible:
        prophet_result = forecast_prophet(months, values, horizon)
        if prophet_result is not None:
            candidates["prophet"] = prophet_result
        else:
            warnings.append(
                "Prophet model unavailable or failed. Using baseline model."
            )

    # Model selection via time-based holdout if we have enough data
    best_model: str = "rolling_mean"

    if n >= 4:
        # Hold out the last `horizon` points (or fewer if not enough)
        holdout_size = min(horizon, n // 3, n - 2)
        if holdout_size >= 1:
            train_values = values[:-holdout_size]
            train_months = months[:-holdout_size]
            actual = values[-holdout_size:]

            # Score each candidate on holdout
            scores: dict[str, float] = {}

            # Last value
            lv_pred = [train_values[-1]] * holdout_size
            scores["last_value"] = _compute_mae(actual, lv_pred)

            # Rolling mean
            eff_window = min(ROLLING_WINDOW, len(train_values))
            rm_pred = [statistics.mean(train_values[-eff_window:])] * holdout_size
            scores["rolling_mean"] = _compute_mae(actual, rm_pred)

            # Prophet on training subset
            if "prophet" in candidates and len(train_values) >= MIN_MONTHS_FOR_PROPHET:
                prophet_train = forecast_prophet(train_months, train_values, holdout_size)
                if prophet_train is not None:
                    p_pred = [v["value"] for v in prophet_train["values"][:holdout_size]]
                    if len(p_pred) == holdout_size:
                        scores["prophet"] = _compute_mae(actual, p_pred)

            # Pick best by MAE
            best_model = min(scores, key=lambda k: scores[k])

            # If Prophet isn't better than baseline, warn
            if "prophet" in scores and best_model != "prophet":
                warnings.append(
                    "Prophet model did not outperform the baseline on holdout validation. "
                    "Using the better-performing baseline model."
                )

    chosen = candidates[best_model]

    return {
        "values": chosen["values"],
        "horizon": horizon,
        "dataCoverage": n,
        "modelUsed": chosen["modelUsed"],
        "modelVersion": MODEL_VERSION,
        "warnings": warnings,
    }
