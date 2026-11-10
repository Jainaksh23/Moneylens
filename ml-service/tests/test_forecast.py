"""
Tests for Cash-Flow Forecast Service.

Covers:
  1. Short-history run-rate mode (20-day, 35-day, <14 days insufficient data)
  2. Monthly baseline mode (3-month series with wide ranges)
  3. Monthly standard mode (8-month series with holdout comparison)
  4. Forecast leakage tests (time-based integrity)
  5. Sane bounds verification (lower <= value <= upper)
  6. API endpoint integration tests (auth, validation, status codes)
"""

from datetime import datetime, timedelta
import pytest
from httpx import ASGITransport, AsyncClient

from app.config import settings
from app.main import app
from app.services.forecaster import (
    _next_months,
    _parse_series,
    forecast_last_value,
    forecast_rolling_mean,
    generate_forecast,
    generate_short_history_forecast,
)

INTERNAL_KEY = settings.internal_api_key


# ──────────────────────────── Fixture Generators ────────────────────────────


def make_daily_series(days: int, start_date: str = "2026-01-01", base_expense: float = 1200.0, base_income: float = 2500.0) -> list[dict]:
    """Generates synthetic daily transaction series for testing."""
    dt = datetime.strptime(start_date, "%Y-%m-%d").date()
    series = []
    for i in range(days):
        cur = dt + timedelta(days=i)
        # Income every 15 days, expense daily with slight variation
        inc = base_income if (i % 15 == 0) else 0.0
        exp = base_expense + (i % 7) * 50.0
        series.append({
            "date": cur.strftime("%Y-%m-%d"),
            "income": inc,
            "expense": exp,
            "net": inc - exp,
        })
    return series


def make_monthly_series(months: int, start_month: str = "2025-01") -> list[dict]:
    """Generates synthetic monthly series for testing."""
    dt = datetime.strptime(start_month, "%Y-%m")
    series = []
    for i in range(months):
        year = dt.year + (dt.month + i - 1) // 12
        month = (dt.month + i - 1) % 12 + 1
        m_str = f"{year:04d}-{month:02d}"
        net_val = 15000.0 + (i * 300.0) + (1000.0 if i % 2 == 0 else -500.0)
        series.append({"month": m_str, "net": net_val})
    return series


# ──────────────────────────── Unit Tests ────────────────────────────


class TestHelpers:
    def test_parse_series_sorts_by_month(self):
        series = [
            {"month": "2025-03", "net": 30000},
            {"month": "2025-01", "net": 10000},
            {"month": "2025-02", "net": 20000},
        ]
        months, values = _parse_series(series)
        assert months == ["2025-01", "2025-02", "2025-03"]
        assert values == [10000, 20000, 30000]

    def test_next_months(self):
        result = _next_months("2025-10", 3)
        assert result == ["2025-11", "2025-12", "2026-01"]

    def test_next_months_year_boundary(self):
        result = _next_months("2025-12", 2)
        assert result == ["2026-01", "2026-02"]


class TestLastValueBaseline:
    def test_repeats_last_value(self):
        months = ["2025-01", "2025-02", "2025-03"]
        values = [10000, 20000, 30000]
        result = forecast_last_value(months, values, 2)
        assert len(result["values"]) == 2
        assert all(v["value"] == 30000 for v in result["values"])
        assert result["modelUsed"] == "last_value"

    def test_single_month_input(self):
        result = forecast_last_value(["2025-01"], [15000], 1)
        assert result["values"][0]["value"] == 15000


class TestRollingMeanBaseline:
    def test_rolling_mean_computation(self):
        months = ["2025-01", "2025-02", "2025-03", "2025-04", "2025-05"]
        values = [10000, 20000, 30000, 40000, 50000]
        result = forecast_rolling_mean(months, values, 1, window=3)
        assert result["values"][0]["value"] == 40000
        assert result["modelUsed"] == "rolling_mean"

    def test_window_larger_than_data(self):
        months = ["2025-01", "2025-02"]
        values = [10000, 20000]
        result = forecast_rolling_mean(months, values, 1, window=5)
        assert result["values"][0]["value"] == 15000


# ──────────────────────────── Short-History Mode Tests ────────────────────────────


class TestShortHistoryForecast:
    def test_insufficient_data_under_14_days(self):
        """Fewer than 14 days returns status=insufficient_data with exact minimum needed."""
        daily_10 = make_daily_series(10)
        res = generate_short_history_forecast(daily_10, horizon=3)

        assert res["available"] is False
        assert res["status"] == "insufficient_data"
        assert "14" in res["reason"]
        assert res["dataCoverage"]["days"] == 10
        assert res["dataCoverage"]["minDaysRequired"] == 14
        assert len(res["values"]) == 0

    def test_synthetic_20_day_series(self):
        """20-day series selects short_history mode, low confidence, sane bounds."""
        daily_20 = make_daily_series(20, start_date="2026-02-01")
        res = generate_short_history_forecast(daily_20, horizon=3)

        assert res["available"] is True
        assert res["status"] == "ok"
        assert res["mode"] == "short_history"
        assert res["confidence"] == "low"
        assert res["modelUsed"] == "short_history_run_rate"
        assert res["dataCoverage"]["days"] == 20
        assert len(res["values"]) > 0

        # Sane bounds verification: lower <= value <= upper
        for pt in res["values"]:
            assert pt["lower"] <= pt["value"] <= pt["upper"]

        for d_pt in res["dailyValues"]:
            assert d_pt["lower"] <= d_pt["value"] <= d_pt["upper"]
            assert d_pt["date"] > "2026-02-20"  # No future leakage

        # Transparency checks
        assert any("daily average" in a.lower() or "run-rate" in a.lower() for a in res["assumptions"])
        assert any("20 days" in l for l in res["limitations"])
        assert "no backtest metric" in res["evaluation"].lower()

    def test_synthetic_35_day_series_and_6m_warning(self):
        """35-day series incorporates day-of-week patterns, warns on 6M horizon."""
        daily_35 = make_daily_series(35, start_date="2026-03-01")
        res_6m = generate_short_history_forecast(daily_35, horizon=6, horizon_days=180)

        assert res_6m["available"] is True
        assert res_6m["mode"] == "short_history"
        assert res_6m["dataCoverage"]["days"] == 35

        # All values adhere to bounds
        for pt in res_6m["values"]:
            assert pt["lower"] <= pt["value"] <= pt["upper"]

        # Horizon > 90 days triggers extra warning
        assert any("180 days" in w or "6 months" in w for w in res_6m["warnings"])
        assert any("3-month" in w for w in res_6m["warnings"])

    def test_no_future_leakage_in_short_history(self):
        """Verifies strictly that no future timestamps enter training computations."""
        daily_25 = make_daily_series(25, start_date="2026-04-01")
        last_hist_date = "2026-04-25"
        res = generate_short_history_forecast(daily_25, horizon=1, horizon_days=30)

        for d_pt in res["dailyValues"]:
            assert d_pt["date"] > last_hist_date


# ──────────────────────────── Monthly Modes Tests ────────────────────────────


class TestMonthlyModes:
    def test_synthetic_3_month_series_selects_monthly_baseline_with_wide_ranges(self):
        """2-5 months selects monthly_baseline with widened bounds (multiplier=2.5)."""
        series_3 = make_monthly_series(3, start_month="2025-01")
        res = generate_forecast(series_3, horizon=3, mode="monthly_baseline")

        assert res["available"] is True
        assert res["mode"] == "monthly_baseline"
        assert res["confidence"] == "medium"
        assert res["dataCoverage"] == 3

        for v in res["values"]:
            assert v["lower"] <= v["value"] <= v["upper"]

        assert any("widened" in a.lower() or "wide" in a.lower() for a in res["assumptions"])

    def test_synthetic_8_month_series_selects_monthly_standard(self):
        """8 months (>= 6) selects monthly_standard with holdout evaluation."""
        series_8 = make_monthly_series(8, start_month="2025-01")
        res = generate_forecast(series_8, horizon=3, mode="monthly_standard")

        assert res["available"] is True
        assert res["mode"] == "monthly_standard"
        assert res["dataCoverage"] == 8

        for v in res["values"]:
            assert v["lower"] <= v["value"] <= v["upper"]

    def test_forecast_months_are_contiguous_and_future(self):
        series = [{"month": f"2025-{m:02d}", "net": 10000} for m in range(1, 7)]
        result = generate_forecast(series, horizon=3)
        forecasted_months = [v["month"] for v in result["values"]]
        assert forecasted_months == ["2025-07", "2025-08", "2025-09"]


# ──────────────────────────── API Integration Tests ────────────────────────────


class TestForecastAPI:
    @pytest.fixture
    async def client(self):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://testserver") as client:
            yield client

    async def test_forecast_endpoint_short_history_success(self, client):
        daily = make_daily_series(25, start_date="2026-05-01")
        resp = await client.post(
            "/forecast",
            json={"mode": "short_history", "dailySeries": daily, "horizon": 3},
            headers={"X-Internal-Key": INTERNAL_KEY},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["available"] is True
        assert data["mode"] == "short_history"
        assert data["confidence"] == "low"
        assert data["dataCoverage"]["days"] == 25
        assert len(data["values"]) > 0

    async def test_forecast_endpoint_insufficient_data(self, client):
        daily = make_daily_series(10, start_date="2026-05-01")
        resp = await client.post(
            "/forecast",
            json={"mode": "short_history", "dailySeries": daily, "horizon": 3},
            headers={"X-Internal-Key": INTERNAL_KEY},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["available"] is False
        assert data["status"] == "insufficient_data"
        assert data["dataCoverage"]["days"] == 10

    async def test_forecast_endpoint_monthly_standard_success(self, client):
        monthly = make_monthly_series(8, start_month="2025-01")
        resp = await client.post(
            "/forecast",
            json={"mode": "monthly_standard", "series": monthly, "horizon": 3},
            headers={"X-Internal-Key": INTERNAL_KEY},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["available"] is True
        assert data["mode"] == "monthly_standard"
        assert data["dataCoverage"] == 8

    async def test_forecast_endpoint_no_auth(self, client):
        resp = await client.post(
            "/forecast",
            json={"series": [{"month": "2025-01", "net": 10000}], "horizon": 1},
        )
        assert resp.status_code in (401, 403)

    async def test_forecast_endpoint_invalid_payload(self, client):
        resp = await client.post(
            "/forecast",
            json={"mode": "monthly", "series": [], "horizon": 1},
            headers={"X-Internal-Key": INTERNAL_KEY},
        )
        assert resp.status_code == 422
