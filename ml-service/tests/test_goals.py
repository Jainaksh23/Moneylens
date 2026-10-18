"""
Tests for Goal Scoring Service.

Covers:
  1. Goal formula against fixed examples (from docs/goal_score.md)
  2. SIP compounding calculation
  3. Band classification
  4. Monte Carlo reproducibility (seeded)
  5. API endpoint integration
  6. ML-down fallback (no historical data)
"""


import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.services.goal_scorer import (
    classify_band,
    compute_required_monthly,
    compute_sip_projection,
    monte_carlo_score,
    score_goal,
)

INTERNAL_KEY = "moneylens-internal-secret-key-32-chars-dev"


# ──────────────────────────── Unit Tests ────────────────────────────


class TestRequiredMonthly:
    def test_basic_calculation(self):
        # (500000 - 100000) / 12 = 33333.33
        result = compute_required_monthly(500000, 100000, 12)
        assert result == 33333.33

    def test_goal_already_met(self):
        result = compute_required_monthly(100000, 150000, 12)
        assert result == 0.0

    def test_zero_current(self):
        result = compute_required_monthly(100000, 0, 10)
        assert result == 10000.0


class TestSIPProjection:
    def test_basic_compounding(self):
        """Verify against hand-calculated values."""
        result = compute_sip_projection(
            current=200000,
            monthly_contribution=5000,
            months_left=24,
            annual_return=6.0,
        )
        # r = 0.005, n = 24
        # FV_current = 200000 * (1.005)^24 ≈ 225,424.32
        # FV_sip = 5000 * (((1.005)^24 - 1) / 0.005) ≈ 127,160.07
        # Total ≈ 352,584
        assert abs(result["projectedCorpus"] - 352584) < 100  # within ₹100

    def test_zero_return(self):
        """With 0% return, compounding = simple sum."""
        result = compute_sip_projection(
            current=100000,
            monthly_contribution=10000,
            months_left=12,
            annual_return=0.0,
        )
        assert result["projectedCorpus"] == 220000.0
        assert result["interestEarned"] == 0.0

    def test_projection_has_disclaimer(self):
        result = compute_sip_projection(100000, 5000, 12, 6.0)
        assert "NOT a guarantee" in result["disclaimer"]


class TestBandClassification:
    def test_on_track(self):
        assert classify_band(95) == "on_track"
        assert classify_band(70) == "on_track"

    def test_needs_attention(self):
        assert classify_band(50) == "needs_attention"
        assert classify_band(30) == "needs_attention"

    def test_unlikely(self):
        assert classify_band(20) == "unlikely"
        assert classify_band(0) == "unlikely"


class TestMonteCarloScore:
    def test_already_met(self):
        score = monte_carlo_score(100000, 150000, 12, [10000, 20000, 15000])
        assert score == 100.0

    def test_reproducibility(self):
        """Same inputs should always give same score (seeded RNG)."""
        surplus = [35000, 38000, 42000, 40000, 37000, 39000]
        score1 = monte_carlo_score(500000, 100000, 12, surplus)
        score2 = monte_carlo_score(500000, 100000, 12, surplus)
        assert score1 == score2

    def test_example1_on_track(self):
        """Worked example 1 from docs/goal_score.md."""
        surplus = [35000, 38000, 42000, 40000, 37000, 39000]
        score = monte_carlo_score(500000, 100000, 12, surplus)
        # Mean surplus 38500 > required 33333 → most trials succeed
        assert score >= 70, f"Expected on_track (>=70), got {score}"
        assert classify_band(score) == "on_track"

    def test_example3_unlikely(self):
        """Worked example 3 from docs/goal_score.md."""
        surplus = [15000, 18000, 12000, 20000, 14000, 16000]
        score = monte_carlo_score(5000000, 100000, 12, surplus, 10000)
        # Required ₹408,333/mo vs available ~₹25,833 → virtually 0 trials succeed
        assert score < 10, f"Expected unlikely (<10), got {score}"
        assert classify_band(score) == "unlikely"


class TestScoreGoal:
    def test_full_response_structure(self):
        result = score_goal(
            target=500000,
            current=100000,
            months_left=12,
            monthly_contribution=5000,
            expected_annual_return=8.0,
            historical_monthly_surplus=[35000, 38000, 42000, 40000, 37000, 39000],
        )
        assert "requiredMonthly" in result
        assert "estimatedMonthlyAvailable" in result
        assert "band" in result
        assert "score" in result
        assert "sipProjection" in result
        assert "assumptions" in result
        assert "limitations" in result
        assert "methodology" in result

    def test_no_historical_data_fallback(self):
        """Without historical data, should use deterministic heuristic."""
        result = score_goal(
            target=500000,
            current=100000,
            months_left=12,
            monthly_contribution=40000,
        )
        # contribution (40000) > required (33333) → deterministic score = 85
        assert result["score"] == 85.0
        assert result["estimatedMonthlyAvailable"] is None
        assert any("insufficient" in a.lower() for a in result["assumptions"])

    def test_no_contribution_no_history(self):
        result = score_goal(
            target=500000,
            current=0,
            months_left=12,
        )
        # No contribution, required is huge → score = 20
        assert result["score"] == 20.0
        assert result["band"] == "unlikely"

    def test_sip_projection_only_when_contribution(self):
        result_no_sip = score_goal(
            target=500000, current=100000, months_left=12
        )
        assert result_no_sip["sipProjection"] is None

        result_with_sip = score_goal(
            target=500000,
            current=100000,
            months_left=12,
            monthly_contribution=10000,
        )
        assert result_with_sip["sipProjection"] is not None


# ──────────────────────────── API Integration Tests ────────────────────────────


class TestGoalScoreAPI:
    @pytest.fixture
    async def client(self):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://testserver") as client:
            yield client

    async def test_score_endpoint_success(self, client):
        payload = {
            "target": 500000,
            "current": 100000,
            "monthsLeft": 12,
            "monthlyContribution": 5000,
            "expectedAnnualReturn": 8.0,
            "historicalMonthlySurplus": [35000, 38000, 42000, 40000, 37000, 39000],
        }
        resp = await client.post(
            "/goals/score",
            json=payload,
            headers={"X-Internal-Key": INTERNAL_KEY},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["band"] in ("on_track", "needs_attention", "unlikely")
        assert 0 <= data["score"] <= 100
        assert data["sipProjection"] is not None

    async def test_score_endpoint_no_auth(self, client):
        payload = {"target": 100000, "current": 0, "monthsLeft": 12}
        resp = await client.post("/goals/score", json=payload)
        assert resp.status_code in (401, 403)

    async def test_score_endpoint_validation(self, client):
        # target must be > 0
        resp = await client.post(
            "/goals/score",
            json={"target": -100, "current": 0, "monthsLeft": 12},
            headers={"X-Internal-Key": INTERNAL_KEY},
        )
        assert resp.status_code == 422

    async def test_score_without_historical_data(self, client):
        """ML-down fallback: no historical data → deterministic heuristic."""
        payload = {
            "target": 500000,
            "current": 100000,
            "monthsLeft": 12,
            "monthlyContribution": 40000,
        }
        resp = await client.post(
            "/goals/score",
            json=payload,
            headers={"X-Internal-Key": INTERNAL_KEY},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["score"] == 85.0  # deterministic fallback
        assert data["estimatedMonthlyAvailable"] is None
