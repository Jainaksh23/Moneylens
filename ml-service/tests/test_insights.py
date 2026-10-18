"""
Tests for Anomaly Detection, Recurring Charges & Recommendation Engine Services.

Covers:
  1. MAD logic on fixed fixtures (including zero MAD and scaling).
  2. Anomaly detection endpoint and wording (no fraud, strictly 'unusual compared to your history').
  3. Recurring charge detection and subscription creep.
  4. Recommendation rule evaluation and threshold gating.
"""

from fastapi.testclient import TestClient

from app.config import settings
from app.main import app
from app.schemas.anomalies import AnomalyDetectRequest, TransactionItem
from app.schemas.recommendations import GoalInfo, UserFinancialContext
from app.schemas.recurring import RecurringDetectRequest
from app.services.anomaly_detector import compute_median_and_mad, compute_robust_z, detect_anomalies
from app.services.recommendation_engine import generate_recommendations
from app.services.recurring_detector import detect_recurring_charges

client = TestClient(app)
AUTH_HEADERS = {"X-Internal-Key": settings.internal_api_key}


# ======================================================================
# 1. MAD LOGIC ON FIXED FIXTURES
# ======================================================================
class TestMADCalculations:
    def test_standard_distribution(self):
        # Known sequence: [100, 100, 100, 120, 150, 180, 200]
        # Sorted: [100, 100, 100, 120, 150, 180, 200] -> median = 120
        # abs diffs: [20, 20, 20, 0, 30, 60, 80]
        # sorted diffs: [0, 20, 20, 20, 30, 60, 80] -> median diff (MAD) = 20
        values = [100.0, 100.0, 100.0, 120.0, 150.0, 180.0, 200.0]
        med, mad = compute_median_and_mad(values)
        assert med == 120.0
        assert mad == 20.0

    def test_zero_mad_fallback(self):
        # All identical values: MAD would naturally be 0.0
        values = [299.0, 299.0, 299.0, 299.0, 299.0]
        med, mad = compute_median_and_mad(values)
        assert med == 299.0
        # Fallback should be positive to avoid division by zero
        assert mad > 0.0

    def test_robust_z_score(self):
        # Median 100, MAD 10 -> sigma_hat = 14.826
        # Value 130 -> (130 - 100) / 14.826 = 2.023
        z = compute_robust_z(130.0, 100.0, 10.0)
        assert 2.0 <= z <= 2.05


# ======================================================================
# 2. ANOMALY DETECTION & NON-FRAUD WORDING GUARANTEES
# ======================================================================
class TestAnomalyDetection:
    def test_amount_above_usual_detected(self):
        txs = [
            TransactionItem(
                id=f"tx_{i}",
                date=f"2026-08-{i+1:02d}",
                amount=500.0 + (i * 20),
                category="Dining",
                merchant="Cafe",
                direction="expense",
            )
            for i in range(15)
        ]
        # Injected anomaly in recent period
        txs.append(
            TransactionItem(
                id="tx_spike",
                date="2026-08-25",
                amount=9500.0,
                category="Dining",
                merchant="Cafe",
                direction="expense",
            )
        )

        req = AnomalyDetectRequest(transactions=txs, evaluateHorizonDays=10, zScoreThreshold=3.0)
        resp = detect_anomalies(req)

        assert resp.anomaliesFound >= 1
        spike_anomaly = next((a for a in resp.anomalies if a.transactionId == "tx_spike"), None)
        assert spike_anomaly is not None
        assert spike_anomaly.reasonCode == "AMOUNT_ABOVE_USUAL"
        assert spike_anomaly.amount == 9500.0

        # Verify wording rule: NEVER labeled as fraud
        explanation_lower = spike_anomaly.explanation.lower()
        assert "fraud" not in explanation_lower
        assert "scam" not in explanation_lower
        assert "unusual compared to your history" in explanation_lower

    def test_new_merchant_large(self):
        txs = [
            TransactionItem(
                id=f"tx_{i}",
                date=f"2026-07-{i+1:02d}",
                amount=1000.0,
                category="Electronics",
                merchant="OldStore",
                direction="expense",
            )
            for i in range(10)
        ]
        # Injected high-amount new merchant
        txs.append(
            TransactionItem(
                id="tx_new_big",
                date="2026-07-28",
                amount=25000.0,
                category="Electronics",
                merchant="BrandNewStore",
                direction="expense",
            )
        )

        req = AnomalyDetectRequest(transactions=txs, evaluateHorizonDays=10, zScoreThreshold=3.0)
        resp = detect_anomalies(req)

        assert any(a.reasonCode == "NEW_MERCHANT_LARGE" for a in resp.anomalies)

    def test_api_endpoint(self):
        txs = [
            {
                "id": f"tx_{i}",
                "date": f"2026-08-{i+1:02d}",
                "amount": 200.0,
                "category": "Coffee",
                "merchant": "Shop",
                "direction": "expense",
            }
            for i in range(10)
        ]
        res = client.post(
            "/anomalies/detect",
            headers=AUTH_HEADERS,
            json={"transactions": txs, "evaluateHorizonDays": 30},
        )
        assert res.status_code == 200
        data = res.json()
        assert "anomalies" in data
        assert "disclaimer" in data


# ======================================================================
# 3. RECURRING CHARGES & SUBSCRIPTION CREEP
# ======================================================================
class TestRecurringCharges:
    def test_detects_monthly_cadence_and_price_increase(self):
        txs = [
            TransactionItem(
                id="r1",
                date="2026-06-15",
                amount=649.0,
                merchant="Netflix",
                category="Entertainment",
                direction="expense",
            ),
            TransactionItem(
                id="r2",
                date="2026-07-15",
                amount=649.0,
                merchant="Netflix",
                category="Entertainment",
                direction="expense",
            ),
            TransactionItem(
                id="r3",
                date="2026-08-15",
                amount=799.0,  # Price creep!
                merchant="Netflix",
                category="Entertainment",
                direction="expense",
            ),
        ]

        req = RecurringDetectRequest(transactions=txs)
        resp = detect_recurring_charges(req)

        assert len(resp.recurringCharges) == 1
        item = resp.recurringCharges[0]
        assert item.merchant == "Netflix"
        assert item.cadence == "monthly"
        assert item.isPriceIncrease is True
        assert item.priceIncreaseAmount == 150.0
        assert item.priceIncreasePct == round((150 / 649) * 100, 1)
        assert "Review this recurring charge" in (item.reviewReason or "")

    def test_recurring_api_endpoint(self):
        txs = [
            {
                "id": "s1",
                "date": "2026-06-05",
                "amount": 119.0,
                "merchant": "Spotify",
                "category": "Entertainment",
                "direction": "expense",
            },
            {
                "id": "s2",
                "date": "2026-07-05",
                "amount": 119.0,
                "merchant": "Spotify",
                "category": "Entertainment",
                "direction": "expense",
            },
        ]
        res = client.post(
            "/recurring/detect",
            headers=AUTH_HEADERS,
            json={"transactions": txs},
        )
        assert res.status_code == 200
        data = res.json()
        assert len(data["recurringCharges"]) >= 1


# ======================================================================
# 4. RECOMMENDATION ENGINE & RULES
# ======================================================================
class TestRecommendationEngine:
    def test_category_spike_rule(self):
        ctx = UserFinancialContext(
            currentMonthIncome=60000.0,
            currentMonthExpense=45000.0,
            previousMonthIncome=60000.0,
            previousMonthExpense=35000.0,
            categorySpendCurrentMonth={"Food": 15000.0, "Utilities": 3000.0},
            categorySpendPreviousMonth={"Food": 8000.0, "Utilities": 3000.0},
        )

        resp = generate_recommendations(ctx)
        spike_rec = next((r for r in resp.recommendations if r.type == "category_spend_increase"), None)
        assert spike_rec is not None
        assert "Food" in spike_rec.title
        assert "estimate" in spike_rec.estimatedEffect.lower()

    def test_goal_shortfall_rule(self):
        ctx = UserFinancialContext(
            currentMonthIncome=50000.0,
            currentMonthExpense=42000.0,  # Surplus = 8,000
            forecastSurplusNextMonth=7000.0,
            activeGoals=[
                GoalInfo(
                    id="g1",
                    name="Emergency Fund",
                    targetAmount=200000.0,
                    currentAmount=50000.0,
                    targetDate="2027-01-01",
                    requiredMonthly=12000.0,  # Needs 12,000 > 7,000
                )
            ],
        )

        resp = generate_recommendations(ctx)
        goal_rec = next((r for r in resp.recommendations if r.type == "goal_shortfall"), None)
        assert goal_rec is not None
        assert goal_rec.evidenceValues["shortfall"] == 5000.0
        assert "estimate" in goal_rec.estimatedEffect.lower()

    def test_recommendations_api_endpoint(self):
        ctx = {
            "currentMonthIncome": 80000.0,
            "currentMonthExpense": 72000.0,
            "targetSavingsRate": 20.0,
        }
        res = client.post(
            "/recommendations/features",
            headers=AUTH_HEADERS,
            json=ctx,
        )
        assert res.status_code == 200
        data = res.json()
        assert "recommendations" in data
        assert any(r["type"] == "low_savings_rate" for r in data["recommendations"])
