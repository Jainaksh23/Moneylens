"""
Contract tests for Forecast Request and Response schemas.
Validates shared synthetic fixtures against Pydantic schemas to prevent contract drift between Node.js backend and Python ML service.
"""

from typing import Any
import pytest
from pydantic import ValidationError

from app.config import settings
from app.schemas.forecast import ForecastRequest, ForecastResponse
from app.services.forecaster import generate_forecast, generate_short_history_forecast


# ─────────────────────────────────────────────────────────────────────────────
# Shared Synthetic Fixtures (Identical between Backend and ML Service)
# ─────────────────────────────────────────────────────────────────────────────

def fixture_20_day_short_history() -> dict[str, Any]:
    """20-day daily series (<2 months, >=14 days): short_history mode."""
    return {
        "mode": "short_history",
        "horizon": 3,
        "horizonDays": 90,
        "dailySeries": [
            {
                "date": f"2026-01-{i:02d}",
                "income": 2500.0 if i % 10 == 0 else 0.0,
                "expense": 850.0 + (i * 15.0),
                "net": (2500.0 if i % 10 == 0 else 0.0) - (850.0 + (i * 15.0)),
            }
            for i in range(1, 21)
        ],
    }


def fixture_35_day_short_history() -> dict[str, Any]:
    """35-day daily series (<60 days): short_history mode."""
    days = []
    # 31 days in Jan 2026
    for i in range(1, 32):
        inc = 3000.0 if i in (1, 15) else 0.0
        exp = 900.0 + (i * 10.0)
        days.append({
            "date": f"2026-01-{i:02d}",
            "income": inc,
            "expense": exp,
            "net": inc - exp,
        })
    # 4 days in Feb 2026
    for i in range(1, 5):
        inc = 3000.0 if i == 1 else 0.0
        exp = 950.0
        days.append({
            "date": f"2026-02-{i:02d}",
            "income": inc,
            "expense": exp,
            "net": inc - exp,
        })

    return {
        "mode": "short_history",
        "horizon": 3,
        "horizonDays": 90,
        "dailySeries": days,
    }


def fixture_3_month_baseline() -> dict[str, Any]:
    """3-month series (2-5 months): monthly_baseline mode."""
    return {
        "mode": "monthly_baseline",
        "horizon": 3,
        "series": [
            {"month": "2026-01", "net": 12500.0},
            {"month": "2026-02", "net": 14200.0},
            {"month": "2026-03", "net": 11800.0},
        ],
    }


def fixture_8_month_standard() -> dict[str, Any]:
    """8-month series (>=6 months): monthly_standard mode."""
    return {
        "mode": "monthly_standard",
        "horizon": 3,
        "series": [
            {"month": f"2025-{i:02d}", "net": 15000.0 + (i * 400.0)}
            for i in range(1, 9)
        ],
    }


# ─────────────────────────────────────────────────────────────────────────────
# Contract Tests
# ─────────────────────────────────────────────────────────────────────────────

class TestForecastContract:
    def test_20_day_fixture_matches_pydantic_schema(self):
        payload = fixture_20_day_short_history()
        req = ForecastRequest.model_validate(payload)

        assert req.mode == "short_history"
        assert req.horizon == 3
        assert req.horizonDays == 90
        assert req.dailySeries is not None
        assert len(req.dailySeries) == 20

        # Run forecaster and validate response schema
        res = generate_short_history_forecast(
            [d.model_dump() for d in req.dailySeries],
            horizon=req.horizon,
            horizon_days=req.horizonDays,
        )
        resp_obj = ForecastResponse.model_validate(res)
        assert resp_obj.available is True
        assert resp_obj.mode == "short_history"

    def test_35_day_fixture_matches_pydantic_schema(self):
        payload = fixture_35_day_short_history()
        req = ForecastRequest.model_validate(payload)

        assert req.mode == "short_history"
        assert req.horizon == 3
        assert req.dailySeries is not None
        assert len(req.dailySeries) == 35

        res = generate_short_history_forecast(
            [d.model_dump() for d in req.dailySeries],
            horizon=req.horizon,
            horizon_days=req.horizonDays,
        )
        resp_obj = ForecastResponse.model_validate(res)
        assert resp_obj.available is True
        assert resp_obj.mode == "short_history"

    def test_3_month_fixture_matches_pydantic_schema(self):
        payload = fixture_3_month_baseline()
        req = ForecastRequest.model_validate(payload)

        assert req.mode == "monthly_baseline"
        assert req.horizon == 3
        assert req.series is not None
        assert len(req.series) == 3

        res = generate_forecast(
            [{"month": d.month, "net": d.net} for d in req.series],
            horizon=req.horizon,
            mode=req.mode,
        )
        resp_obj = ForecastResponse.model_validate(res)
        assert resp_obj.available is True
        assert resp_obj.mode == "monthly_baseline"

    def test_8_month_fixture_matches_pydantic_schema(self):
        payload = fixture_8_month_standard()
        req = ForecastRequest.model_validate(payload)

        assert req.mode == "monthly_standard"
        assert req.horizon == 3
        assert req.series is not None
        assert len(req.series) == 8

        res = generate_forecast(
            [{"month": d.month, "net": d.net} for d in req.series],
            horizon=req.horizon,
            mode=req.mode,
        )
        resp_obj = ForecastResponse.model_validate(res)
        assert resp_obj.available is True
        assert resp_obj.mode == "monthly_standard"

    def test_horizon_days_bounded_within_schema_limits(self):
        # Upper limit is 180 days in schema
        valid_payload = {
            "mode": "short_history",
            "horizon": 6,
            "horizonDays": 180,
            "dailySeries": [
                {"date": "2026-01-01", "income": 100.0, "expense": 50.0, "net": 50.0}
            ],
        }
        assert ForecastRequest.model_validate(valid_payload).horizonDays == 180

        # > 180 should fail validation
        invalid_payload = {
            "mode": "short_history",
            "horizon": 7,
            "horizonDays": 210,
            "dailySeries": [
                {"date": "2026-01-01", "income": 100.0, "expense": 50.0, "net": 50.0}
            ],
        }
        with pytest.raises(ValidationError):
            ForecastRequest.model_validate(invalid_payload)


class TestInternalKeyContract:
    def test_env_var_and_header_names(self):
        # Assert internal key env var name is INTERNAL_API_KEY
        field_info = type(settings).model_fields.get("internal_api_key")
        assert field_info is not None
        assert field_info.alias == "INTERNAL_API_KEY"

        # Assert header name is X-Internal-Key
        import inspect
        from app.security import verify_internal_key
        sig = inspect.signature(verify_internal_key)
        param = sig.parameters.get("x_internal_key")
        assert param is not None
        assert param.default.alias == "X-Internal-Key"
