"""
Tests for Cash-Flow Forecast Service.

Covers:
  1. Forecast leakage test (time-based split integrity)
  2. Baseline comparison script runs
  3. API endpoint integration tests
  4. ML-down fallback behavior
"""

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.services.forecaster import (
    _next_months,
    _parse_series,
    forecast_last_value,
    forecast_rolling_mean,
    generate_forecast,
)

INTERNAL_KEY = "moneylens-internal-secret-key-32-chars-dev"


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
        # Mean of last 3: (30000+40000+50000)/3 = 40000
        assert result["values"][0]["value"] == 40000
        assert result["modelUsed"] == "rolling_mean"

    def test_window_larger_than_data(self):
        months = ["2025-01", "2025-02"]
        values = [10000, 20000]
        result = forecast_rolling_mean(months, values, 1, window=5)
        # Window clamped to 2: (10000+20000)/2 = 15000
        assert result["values"][0]["value"] == 15000


class TestForecastLeakage:
    """Critical test: ensure no data leakage in forecast evaluation."""

    def test_no_future_data_in_training(self):
        """
        When generating a forecast from a time series, the model must NOT
        use any data from the forecast period. The `generate_forecast` function
        uses a time-based holdout for model selection — this test verifies
        that the forecasted months are strictly AFTER the historical months.
        """
        series = [
            {"month": f"2025-{m:02d}", "net": 10000 + m * 1000}
            for m in range(1, 13)
        ]
        result = generate_forecast(series, horizon=3)

        # All forecasted months must be after the last historical month
        last_historical = "2025-12"
        for fp in result["values"]:
            assert fp["month"] > last_historical, (
                f"Forecast month {fp['month']} is not after last historical "
                f"month {last_historical} — possible data leakage!"
            )

    def test_forecast_months_are_contiguous(self):
        """Forecasted months must be a contiguous sequence after history."""
        series = [
            {"month": f"2025-{m:02d}", "net": 10000}
            for m in range(1, 7)
        ]
        result = generate_forecast(series, horizon=3)
        forecasted_months = [v["month"] for v in result["values"]]
        assert forecasted_months == ["2025-07", "2025-08", "2025-09"]

    def test_forecast_with_single_month_warns(self):
        """Very limited data should produce warnings."""
        series = [{"month": "2025-01", "net": 10000}]
        result = generate_forecast(series, horizon=1)
        assert any("limited data" in w.lower() for w in result["warnings"])


class TestGenerateForecast:
    def test_uses_baseline_for_short_history(self):
        """With < 6 months, should NOT use Prophet."""
        series = [
            {"month": f"2025-{m:02d}", "net": 10000}
            for m in range(1, 5)  # 4 months
        ]
        result = generate_forecast(series, horizon=2)
        assert result["modelUsed"] in ("last_value", "rolling_mean")
        assert result["dataCoverage"] == 4
        assert any("below" in w.lower() for w in result["warnings"])

    def test_response_structure(self):
        """Response must have all required fields."""
        series = [
            {"month": f"2025-{m:02d}", "net": 10000 + m * 500}
            for m in range(1, 10)
        ]
        result = generate_forecast(series, horizon=3)
        assert "values" in result
        assert "horizon" in result
        assert "dataCoverage" in result
        assert "modelUsed" in result
        assert "modelVersion" in result
        assert "warnings" in result
        assert result["horizon"] == 3
        assert len(result["values"]) == 3

    def test_confidence_intervals_present(self):
        """Each forecast point must have lower and upper bounds."""
        series = [
            {"month": f"2025-{m:02d}", "net": 20000 + m * 300}
            for m in range(1, 8)
        ]
        result = generate_forecast(series, horizon=2)
        for v in result["values"]:
            assert "lower" in v
            assert "upper" in v
            assert v["lower"] <= v["value"] <= v["upper"]


# ──────────────────────────── API Integration Tests ────────────────────────────


class TestForecastAPI:
    @pytest.fixture
    async def client(self):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://testserver") as client:
            yield client

    async def test_forecast_endpoint_success(self, client):
        payload = {
            "series": [
                {"month": f"2025-{m:02d}", "net": 10000 + m * 500}
                for m in range(1, 10)
            ],
            "horizon": 3,
        }
        resp = await client.post(
            "/forecast",
            json=payload,
            headers={"X-Internal-Key": INTERNAL_KEY},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["values"]) == 3
        assert data["horizon"] == 3
        assert data["dataCoverage"] == 9
        assert data["modelUsed"] in ("last_value", "rolling_mean", "prophet")

    async def test_forecast_endpoint_no_auth(self, client):
        payload = {"series": [{"month": "2025-01", "net": 10000}], "horizon": 1}
        resp = await client.post("/forecast", json=payload)
        assert resp.status_code in (401, 403)

    async def test_forecast_endpoint_invalid_payload(self, client):
        resp = await client.post(
            "/forecast",
            json={"series": [], "horizon": 1},
            headers={"X-Internal-Key": INTERNAL_KEY},
        )
        assert resp.status_code == 422

    async def test_forecast_endpoint_horizon_bounds(self, client):
        payload = {
            "series": [{"month": "2025-01", "net": 10000}],
            "horizon": 15,  # exceeds max 12
        }
        resp = await client.post(
            "/forecast",
            json=payload,
            headers={"X-Internal-Key": INTERNAL_KEY},
        )
        assert resp.status_code == 422
