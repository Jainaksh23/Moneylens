"""
Cash-Flow Forecast Service.

Pluggable model selection:
  - Short-history run-rate mode (< 2 months, >= 14 days): daily granularity,
    run-rate projections with variation bounds, no Prophet, transparent assumptions.
  - Monthly baseline mode (2-5 months): monthly rolling/last value with widened bounds.
  - Monthly standard mode (>= 6 months): Prophet (if installed) vs baselines, time-based holdout evaluation.

The service compares models and picks the best one automatically.
"""

from __future__ import annotations

import logging
import math
import statistics
from datetime import datetime, timedelta
from typing import Any

logger = logging.getLogger("moneylens.forecast")

MODEL_VERSION = "v2.0.0-multi-granularity"
MIN_MONTHS_FOR_PROPHET = 6
MIN_DAYS_FOR_SHORT_HISTORY = 14
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
    months: list[str], values: list[float], horizon: int, multiplier: float = 1.5
) -> dict:
    """Naive baseline: repeat the last observed value."""
    last_val = values[-1]
    future_months = _next_months(months[-1], horizon)
    forecasts = []
    for m in future_months:
        lower, upper = _confidence_interval(values, last_val, multiplier=multiplier)
        forecasts.append(
            {"month": m, "value": round(last_val, 2), "lower": lower, "upper": upper}
        )
    return {
        "values": forecasts,
        "modelUsed": "last_value",
    }


def forecast_rolling_mean(
    months: list[str],
    values: list[float],
    horizon: int,
    window: int = ROLLING_WINDOW,
    multiplier: float = 1.5,
) -> dict:
    """Rolling mean baseline: average of last `window` months."""
    effective_window = min(window, len(values))
    mean_val = statistics.mean(values[-effective_window:])
    future_months = _next_months(months[-1], horizon)
    forecasts = []
    for m in future_months:
        lower, upper = _confidence_interval(values, mean_val, multiplier=multiplier)
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


def generate_short_history_forecast(
    daily_series: list[dict[str, Any]],
    horizon: int = 3,
    horizon_days: int | None = None,
) -> dict:
    """
    Transparent Short-History Forecast (< 2 months of data, >= 14 days required).

    Never uses Prophet. Computes daily run-rate (income, expense, net),
    detects day-of-week patterns if sufficient data (>= 21 days),
    and projects the next 30/60/90/180 days with variance-based confidence bounds.
    """
    if not daily_series or len(daily_series) == 0:
        return {
            "available": False,
            "status": "insufficient_data",
            "mode": "short_history",
            "reason": "Need at least 14 days of transaction history to generate a forecast, but found 0 days.",
            "dataCoverage": {"days": 0, "minDaysRequired": MIN_DAYS_FOR_SHORT_HISTORY},
            "values": [],
            "horizon": horizon,
            "modelUsed": "short_history_run_rate",
            "modelVersion": MODEL_VERSION,
            "confidence": "low",
            "assumptions": [],
            "limitations": ["No transaction data available."],
            "warnings": ["Insufficient data: at least 14 days required."],
            "evaluation": "No backtest metric available for short-history mode.",
        }

    sorted_daily = sorted(daily_series, key=lambda x: x["date"])
    first_date_str = sorted_daily[0]["date"]
    last_date_str = sorted_daily[-1]["date"]

    dt_start = datetime.strptime(first_date_str, "%Y-%m-%d").date()
    dt_end = datetime.strptime(last_date_str, "%Y-%m-%d").date()
    num_calendar_days = (dt_end - dt_start).days + 1

    # Threshold check: < 14 days of data returns insufficient_data
    if num_calendar_days < MIN_DAYS_FOR_SHORT_HISTORY:
        return {
            "available": False,
            "status": "insufficient_data",
            "mode": "short_history",
            "reason": (
                f"Need at least {MIN_DAYS_FOR_SHORT_HISTORY} days of transaction history to generate a forecast, "
                f"but found {num_calendar_days} days."
            ),
            "dataCoverage": {
                "firstDate": first_date_str,
                "lastDate": last_date_str,
                "days": num_calendar_days,
                "minDaysRequired": MIN_DAYS_FOR_SHORT_HISTORY,
            },
            "values": [],
            "horizon": horizon,
            "modelUsed": "short_history_run_rate",
            "modelVersion": MODEL_VERSION,
            "confidence": "low",
            "assumptions": [],
            "limitations": [f"Insufficient data: {num_calendar_days} days found, minimum {MIN_DAYS_FOR_SHORT_HISTORY} days required."],
            "warnings": [f"Need at least {MIN_DAYS_FOR_SHORT_HISTORY} days of data to generate a short-history forecast."],
            "evaluation": "No backtest metric available for short-history mode.",
        }

    # Map daily entries by date string
    daily_map = {item["date"]: item for item in sorted_daily}

    # Fill full calendar date range (missing days default to 0 income/expense/net)
    filled_days: list[dict[str, Any]] = []
    for day_offset in range(num_calendar_days):
        cur_date = dt_start + timedelta(days=day_offset)
        d_str = cur_date.strftime("%Y-%m-%d")
        if d_str in daily_map:
            item = daily_map[d_str]
            filled_days.append({
                "date": d_str,
                "income": float(item.get("income", 0.0)),
                "expense": float(item.get("expense", 0.0)),
                "net": float(item.get("net", item.get("income", 0.0) - item.get("expense", 0.0))),
                "dow": cur_date.weekday(),
            })
        else:
            filled_days.append({
                "date": d_str,
                "income": 0.0,
                "expense": 0.0,
                "net": 0.0,
                "dow": cur_date.weekday(),
            })

    total_income = sum(d["income"] for d in filled_days)
    total_expense = sum(d["expense"] for d in filled_days)
    total_net = sum(d["net"] for d in filled_days)

    avg_daily_income = total_income / num_calendar_days
    avg_daily_expense = total_expense / num_calendar_days
    avg_daily_net = total_net / num_calendar_days

    daily_net_values = [d["net"] for d in filled_days]
    std_daily_net = (
        statistics.stdev(daily_net_values)
        if len(daily_net_values) > 1
        else max(abs(avg_daily_net) * 0.5, 100.0)
    )

    # Day-of-week adjustment if enough data (>= 21 days)
    dow_adjustments: dict[int, float] = {}
    if num_calendar_days >= 21:
        dow_groups: dict[int, list[float]] = {}
        for d in filled_days:
            dow_groups.setdefault(d["dow"], []).append(d["net"])
        for dow, vals in dow_groups.items():
            if len(vals) >= 2:
                # Dampen day-of-week deviation to prevent extreme swings
                dow_adjustments[dow] = round((statistics.mean(vals) - avg_daily_net) * 0.4, 2)

    # Determine projection length in days
    total_project_days = horizon_days if horizon_days is not None else (horizon * 30)
    total_project_days = max(30, min(total_project_days, 180))

    daily_forecasts: list[dict[str, Any]] = []
    for day_i in range(1, total_project_days + 1):
        future_dt = dt_end + timedelta(days=day_i)
        dow = future_dt.weekday()
        dow_adj = dow_adjustments.get(dow, 0.0)
        expected_net = avg_daily_net + dow_adj

        # Uncertainty expands slightly over time: sqrt(1 + day_i / 30)
        time_factor = math.sqrt(1.0 + (day_i / 30.0))
        margin = 1.645 * std_daily_net * time_factor
        lower = round(expected_net - margin, 2)
        upper = round(expected_net + margin, 2)
        val = round(expected_net, 2)

        daily_forecasts.append({
            "date": future_dt.strftime("%Y-%m-%d"),
            "value": val,
            "lower": lower,
            "upper": upper,
        })

    # Group projections into monthly buckets for standard chart & table consistency
    # (Matches ForecastDataPoint schema: month: "YYYY-MM", value, lower, upper)
    month_buckets: dict[str, list[dict[str, Any]]] = {}
    for df in daily_forecasts:
        m_key = df["date"][:7]  # YYYY-MM
        month_buckets.setdefault(m_key, []).append(df)

    monthly_forecasts: list[dict[str, Any]] = []
    for m_key, day_pts in month_buckets.items():
        k = len(day_pts)
        m_val = round(sum(p["value"] for p in day_pts), 2)
        # Variance of sum of k daily independent variables is k * var_daily
        m_spread = round(1.96 * math.sqrt(k) * std_daily_net, 2)
        monthly_forecasts.append({
            "month": m_key,
            "value": m_val,
            "lower": round(m_val - m_spread, 2),
            "upper": round(m_val + m_spread, 2),
        })

    warnings: list[str] = [
        f"Low confidence forecast: based on only {num_calendar_days} days of data."
    ]
    if total_project_days > 90:
        warnings.append(
            "Projecting 6 months (180 days) from short history has very high uncertainty. "
            "We recommend using a 3-month horizon."
        )

    assumptions = [
        f"Assumes spending continues at your observed daily run-rate (₹{round(avg_daily_expense, 2)}/day average expense, ₹{round(avg_daily_income, 2)}/day average income).",
        "One-off large items or sudden irregular expenses are not treated specially.",
        "Assumes regular income cash flow recurs on a consistent pattern.",
    ]
    if dow_adjustments:
        assumptions.append("Day-of-week spending patterns are factored into daily projections.")
    else:
        assumptions.append("Day-of-week patterns require at least 21 days of history.")

    limitations = [
        f"Based on only {num_calendar_days} days of data; seasonal and annual patterns cannot be detected.",
        "Uncertainty increases substantially beyond a 30-day forecast horizon.",
        "No backtest metric (MAE/RMSE) is available for short-history mode.",
    ]

    return {
        "available": True,
        "status": "ok",
        "mode": "short_history",
        "confidence": "low",
        "values": monthly_forecasts,
        "dailyValues": daily_forecasts,
        "horizon": horizon,
        "dataCoverage": {
            "firstDate": first_date_str,
            "lastDate": last_date_str,
            "days": num_calendar_days,
            "minDaysRequired": MIN_DAYS_FOR_SHORT_HISTORY,
        },
        "modelUsed": "short_history_run_rate",
        "modelVersion": MODEL_VERSION,
        "runRateDaily": {
            "avgDailyIncome": round(avg_daily_income, 2),
            "avgDailyExpense": round(avg_daily_expense, 2),
            "avgDailyNet": round(avg_daily_net, 2),
        },
        "assumptions": assumptions,
        "limitations": limitations,
        "warnings": warnings,
        "evaluation": "No backtest metric available for short-history mode.",
    }


def generate_forecast(
    series: list[dict],
    horizon: int = 3,
    mode: str = "monthly",
) -> dict:
    """
    Main entry point for monthly series forecasts.

    - mode="monthly_baseline" (2-5 months): monthly baseline with widened ranges (multiplier=2.5).
    - mode="monthly_standard" or "monthly" (>= 6 months): compares baseline vs Prophet with holdout validation.
    """
    months, values = _parse_series(series)
    n = len(values)
    warnings: list[str] = []

    # Mode classification based on history length if not explicitly specified
    if mode == "monthly_baseline" or (2 <= n < MIN_MONTHS_FOR_PROPHET):
        effective_mode = "monthly_baseline"
        confidence = "medium"
        multiplier = 2.5  # wide ranges for 2-5 months
    elif n >= MIN_MONTHS_FOR_PROPHET:
        effective_mode = "monthly_standard"
        confidence = "medium"
        multiplier = 1.5
    else:
        effective_mode = "monthly_baseline"
        confidence = "low"
        multiplier = 2.5

    if n < 3:
        warnings.append(
            f"Very limited data ({n} months). Forecast reliability is low."
        )

    # Generate candidate forecasts
    candidates: dict[str, dict] = {}
    candidates["last_value"] = forecast_last_value(months, values, horizon, multiplier=multiplier)
    candidates["rolling_mean"] = forecast_rolling_mean(months, values, horizon, multiplier=multiplier)

    # Try Prophet only if history >= 6 months and in standard mode
    prophet_eligible = n >= MIN_MONTHS_FOR_PROPHET and effective_mode == "monthly_standard"
    if not prophet_eligible:
        warnings.append(
            f"Data coverage ({n} months) is below {MIN_MONTHS_FOR_PROPHET} months. "
            f"Using baseline model with wide ranges. Collect more data for improved forecasting."
        )

    if prophet_eligible:
        prophet_result = forecast_prophet(months, values, horizon)
        if prophet_result is not None:
            candidates["prophet"] = prophet_result
            confidence = "high"
        else:
            warnings.append(
                "Prophet model unavailable or failed. Using baseline model."
            )

    # Model selection via time-based holdout if we have enough data (>= 4 months)
    best_model: str = "rolling_mean"

    if n >= 4:
        holdout_size = min(horizon, n // 3, n - 2)
        if holdout_size >= 1:
            train_values = values[:-holdout_size]
            train_months = months[:-holdout_size]
            actual = values[-holdout_size:]

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

            if "prophet" in scores and best_model != "prophet":
                warnings.append(
                    "Prophet model did not outperform the baseline on holdout validation. "
                    "Using the better-performing baseline model."
                )

    chosen = candidates[best_model]

    assumptions = [
        "Historical monthly net trends form the basis for future monthly run-rates.",
        "Uncertainty intervals expand over longer forecast horizons.",
    ]
    limitations = [
        f"Data span is {n} months. Predictions cannot account for unobserved seasonal cycles.",
    ]
    if effective_mode == "monthly_baseline":
        assumptions.append("Prediction intervals are widened (2.5x standard deviation) to account for limited 2-5 month history.")
        limitations.append("Holdout validation is limited with under 6 months of data.")

    return {
        "available": True,
        "status": "ok",
        "values": chosen["values"],
        "horizon": horizon,
        "dataCoverage": n,
        "modelUsed": chosen["modelUsed"],
        "modelVersion": MODEL_VERSION,
        "mode": effective_mode,
        "confidence": confidence,
        "assumptions": assumptions,
        "limitations": limitations,
        "warnings": warnings,
        "evaluation": f"Best model selected by MAE: {chosen['modelUsed']}.",
    }
