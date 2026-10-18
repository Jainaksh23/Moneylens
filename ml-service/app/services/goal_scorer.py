"""
Goal Scoring Service.

Achievability scoring via Monte Carlo simulation over historical monthly surplus.
SIP what-if compounding projections clearly labelled as assumptions.

See docs/goal_score.md for full methodology, formula, and worked examples.
"""

from __future__ import annotations

import logging
import statistics

import numpy as np

logger = logging.getLogger("moneylens.goals")

MONTE_CARLO_TRIALS = 1000
DEFAULT_ANNUAL_RETURN = 6.0  # Conservative default %
SCORE_VERSION = "v1.0.0-deterministic"


def compute_required_monthly(target: float, current: float, months_left: int) -> float:
    """Simple linear required monthly = (target - current) / monthsLeft."""
    gap = target - current
    if gap <= 0:
        return 0.0
    return round(gap / months_left, 2)


def compute_sip_projection(
    current: float,
    monthly_contribution: float,
    months_left: int,
    annual_return: float,
) -> dict:
    """
    Future value with monthly compounding.

    FV = current × (1+r)^n + contribution × [((1+r)^n - 1) / r]
    where r = annual_return / 12 / 100, n = months_left
    """
    r = annual_return / 12.0 / 100.0
    n = months_left

    if r > 0:
        fv_current = current * ((1 + r) ** n)
        fv_sip = monthly_contribution * (((1 + r) ** n - 1) / r)
    else:
        fv_current = current
        fv_sip = monthly_contribution * n

    projected_corpus = round(fv_current + fv_sip, 2)
    total_invested = round(current + monthly_contribution * n, 2)
    interest_earned = round(projected_corpus - total_invested, 2)

    return {
        "monthlyContribution": monthly_contribution,
        "expectedAnnualReturn": annual_return,
        "projectedCorpus": projected_corpus,
        "totalInvested": total_invested,
        "interestEarned": interest_earned,
        "disclaimer": (
            "This projection assumes a fixed annual return compounded monthly. "
            "Actual returns will vary. This is NOT a guarantee of future performance."
        ),
    }


def monte_carlo_score(
    target: float,
    current: float,
    months_left: int,
    historical_surplus: list[float],
    monthly_contribution: float = 0.0,
) -> float:
    """
    Monte Carlo simulation (MONTE_CARLO_TRIALS trials).

    Each trial:
      1. Start with `current`.
      2. For each month in `months_left`, sample a surplus from
         N(mean_surplus, std_surplus) and add it plus fixed contribution.
      3. Count how many trials reach `target`.

    Score = (trials_reaching_target / total_trials) × 100

    If std is 0 (constant surplus), use deterministic check.
    """
    if current >= target:
        return 100.0

    mean_surplus = statistics.mean(historical_surplus)
    std_surplus = statistics.stdev(historical_surplus) if len(historical_surplus) >= 2 else 0.0

    rng = np.random.default_rng(seed=42)  # Reproducible
    successes = 0

    for _ in range(MONTE_CARLO_TRIALS):
        balance = current
        for _ in range(months_left):
            if std_surplus > 0:
                sampled = rng.normal(mean_surplus, std_surplus)
            else:
                sampled = mean_surplus
            balance += sampled + monthly_contribution
        if balance >= target:
            successes += 1

    return round((successes / MONTE_CARLO_TRIALS) * 100, 1)


def classify_band(score: float) -> str:
    """Classify score into actionable bands."""
    if score >= 70:
        return "on_track"
    elif score >= 30:
        return "needs_attention"
    else:
        return "unlikely"


def score_goal(
    target: float,
    current: float,
    months_left: int,
    monthly_contribution: float | None = None,
    expected_annual_return: float | None = None,
    historical_monthly_surplus: list[float] | None = None,
) -> dict:
    """
    Main entry point for goal scoring.

    Returns requiredMonthly, estimatedMonthlyAvailable, band, score,
    sipProjection (if contribution provided), assumptions, and limitations.
    """
    contribution = monthly_contribution or 0.0
    annual_return = expected_annual_return if expected_annual_return is not None else DEFAULT_ANNUAL_RETURN
    has_history = historical_monthly_surplus is not None and len(historical_monthly_surplus) >= 3

    required = compute_required_monthly(target, current, months_left)

    # Estimated monthly available from historical data
    estimated_available: float | None = None
    if has_history:
        estimated_available = round(statistics.mean(historical_monthly_surplus), 2)

    # Monte Carlo score
    assumptions: list[str] = []
    limitations: list[str] = []

    if has_history:
        score = monte_carlo_score(
            target, current, months_left, historical_monthly_surplus, contribution
        )
        assumptions.append(
            f"Future monthly surplus is sampled from historical distribution "
            f"(mean={estimated_available}, std={round(statistics.stdev(historical_monthly_surplus) if len(historical_monthly_surplus) >= 2 else 0, 2)})"
        )
        assumptions.append(
            f"Monte Carlo simulation with {MONTE_CARLO_TRIALS} trials, seeded for reproducibility"
        )
    else:
        # Without historical data, use a deterministic heuristic
        if required <= 0:
            score = 100.0
        elif contribution >= required:
            score = 85.0  # Likely but uncertain without history
        elif contribution >= required * 0.5:
            score = 50.0
        else:
            score = 20.0
        assumptions.append(
            "Insufficient historical surplus data for Monte Carlo simulation. "
            "Using deterministic heuristic based on contribution vs required monthly."
        )
        limitations.append(
            "Score accuracy is significantly reduced without historical data. "
            "Import more transactions to improve scoring."
        )

    band = classify_band(score)

    # SIP projection (if contribution provided)
    sip_proj = None
    if monthly_contribution is not None and monthly_contribution > 0:
        sip_proj = compute_sip_projection(current, contribution, months_left, annual_return)
        assumptions.append(
            f"SIP projection uses {annual_return}% annual return compounded monthly. "
            f"This is an assumption, not a guarantee."
        )

    limitations.append("Past surplus patterns may not predict future performance.")
    limitations.append("Does not account for inflation, tax implications, or irregular expenses.")
    if has_history and len(historical_monthly_surplus) < 12:
        limitations.append(
            f"Only {len(historical_monthly_surplus)} months of surplus data. "
            f"12+ months recommended for robust scoring."
        )

    return {
        "requiredMonthly": required,
        "estimatedMonthlyAvailable": estimated_available,
        "band": band,
        "score": score,
        "sipProjection": sip_proj,
        "assumptions": assumptions,
        "limitations": limitations,
        "methodology": (
            f"Monte Carlo simulation ({MONTE_CARLO_TRIALS} trials) sampling from historical "
            f"monthly surplus distribution. See docs/goal_score.md for formula and worked examples."
        ),
    }
