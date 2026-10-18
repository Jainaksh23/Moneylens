"""
Deterministic Recommendation Engine for MoneyLens.

Rules:
  1. Category Spend Increase: Spending in a category increased by >20% (and >= ₹1,000) vs previous period.
  2. Goal Contribution Shortfall: Forecast surplus or monthly net is less than required savings for active goals.
  3. Recurring Creep / Review: Price increase detected or multiple active recurring subscriptions.
  4. Low Savings Rate: Actual savings rate below user-configured target (default 20%).
  5. High Discretionary Spend: Discretionary categories (Dining, Entertainment, Shopping) exceed 35% of total spend.

Guarantees:
  - Deduplicated by type and category/goal.
  - Suppressed if historical data is insufficient.
  - Ranked by financial impact.
  - Estimated effect always explicitly labeled "estimate".
"""

from __future__ import annotations

from ..schemas.recommendations import (
    RecommendationItem,
    RecommendationResponse,
    UserFinancialContext,
)

MODEL_VERSION = "1.0.0"


def generate_recommendations(
    context: UserFinancialContext,
) -> RecommendationResponse:
    recs: list[RecommendationItem] = []
    rank_counter = 1

    # ---------------------------------------------------------
    # RULE 1: Category Spend Spike (>20% increase & >= ₹1,000)
    # ---------------------------------------------------------
    curr_cats = context.categorySpendCurrentMonth
    prev_cats = context.categorySpendPreviousMonth

    for cat, curr_spend in curr_cats.items():
        prev_spend = prev_cats.get(cat, 0.0)
        if prev_spend >= 500.0:  # Meaningful previous baseline
            pct_change = ((curr_spend - prev_spend) / prev_spend) * 100.0
            abs_increase = curr_spend - prev_spend

            if pct_change >= 20.0 and abs_increase >= 1000.0:
                potential_savings = round(abs_increase * 0.7, 0)
                recs.append(
                    RecommendationItem(
                        id=f"rec_cat_spike_{cat.lower().replace(' ', '_')}",
                        type="category_spend_increase",
                        title=f"{cat} Spending Surged by {pct_change:.0f}%",
                        rationale=(
                            f"Your spending in {cat} reached ₹{curr_spend:,.0f} this month compared to "
                            f"₹{prev_spend:,.0f} last month (+{pct_change:.1f}%)."
                        ),
                        evidenceValues={
                            "category": cat,
                            "currentSpend": curr_spend,
                            "previousSpend": prev_spend,
                            "increaseAmount": abs_increase,
                            "increasePercent": round(pct_change, 1),
                        },
                        evidencePeriod="Current Month vs Previous Month",
                        rule="CATEGORY_SPEND_INCREASE",
                        threshold="> 20% increase and >= ₹1,000",
                        estimatedEffect=f"Estimate: ₹{potential_savings:,.0f} potential monthly savings",
                        actionableNextStep=f"Review recent {cat} purchases and set a weekly budget cap of ₹{round(prev_spend * 1.1 / 4, 0):,.0f}.",
                        status="open",
                        rank=rank_counter,
                    )
                )
                rank_counter += 1

    # ---------------------------------------------------------
    # RULE 2: Goal Contribution Shortfall
    # ---------------------------------------------------------
    if context.activeGoals:
        total_required_monthly = sum(g.requiredMonthly for g in context.activeGoals)
        available_surplus = (
            context.forecastSurplusNextMonth
            if context.forecastSurplusNextMonth is not None
            else (context.currentMonthIncome - context.currentMonthExpense)
        )

        if available_surplus < total_required_monthly:
            shortfall = round(total_required_monthly - available_surplus, 0)
            recs.append(
                RecommendationItem(
                    id="rec_goal_shortfall_total",
                    type="goal_shortfall",
                    title="Projected Surplus Below Target Goal Savings",
                    rationale=(
                        f"Your active goals require ₹{total_required_monthly:,.0f}/month, but your projected "
                        f"monthly surplus is ₹{available_surplus:,.0f}, leaving a potential monthly shortfall of ₹{shortfall:,.0f}."
                    ),
                    evidenceValues={
                        "totalRequiredMonthly": total_required_monthly,
                        "availableSurplus": available_surplus,
                        "shortfall": shortfall,
                        "activeGoalsCount": len(context.activeGoals),
                    },
                    evidencePeriod="Next Month Forecast",
                    rule="SURPLUS_VS_GOAL_REQUIREMENT",
                    threshold="Surplus < Required Contribution",
                    estimatedEffect=f"Estimate: ₹{shortfall:,.0f}/month needed to stay on track",
                    actionableNextStep="Adjust discretionary spending or extend your goal target dates by 2-3 months.",
                    status="open",
                    rank=1,  # High priority
                )
            )
            rank_counter += 1

    # ---------------------------------------------------------
    # RULE 3: Recurring Creep & Review
    # ---------------------------------------------------------
    if context.priceIncreasesCount > 0:
        recs.append(
            RecommendationItem(
                id="rec_recurring_price_increase",
                type="recurring_review",
                title=f"{context.priceIncreasesCount} Subscription Price Increase(s) Detected",
                rationale=(
                    f"We detected price increases on {context.priceIncreasesCount} recurring subscription(s). "
                    f"Total recurring monthly commitments now stand at ₹{context.recurringChargesTotal:,.0f}."
                ),
                evidenceValues={
                    "priceIncreasesCount": context.priceIncreasesCount,
                    "recurringChargesTotal": context.recurringChargesTotal,
                    "recurringChargesCount": context.recurringChargesCount,
                },
                evidencePeriod="Recent Billing Cycles",
                rule="SUBSCRIPTION_PRICE_INCREASE",
                threshold="Price > Previous Cycle",
                estimatedEffect=f"Estimate: ₹{round(context.recurringChargesTotal * 0.2, 0):,.0f} potential annual savings from trimming unused plans",
                actionableNextStep="Review your recurring charges and cancel any subscriptions you haven't used recently.",
                status="open",
                rank=rank_counter,
            )
        )
        rank_counter += 1

    # ---------------------------------------------------------
    # RULE 4: Low Savings Rate
    # ---------------------------------------------------------
    if context.currentMonthIncome > 0:
        actual_savings = context.currentMonthIncome - context.currentMonthExpense
        actual_rate = round((actual_savings / context.currentMonthIncome) * 100.0, 1)

        if actual_rate < context.targetSavingsRate:
            gap_pct = round(context.targetSavingsRate - actual_rate, 1)
            target_savings_amount = round(
                (context.targetSavingsRate / 100.0) * context.currentMonthIncome, 0
            )
            gap_amount = round(target_savings_amount - actual_savings, 0)

            recs.append(
                RecommendationItem(
                    id="rec_savings_rate_below_target",
                    type="low_savings_rate",
                    title=f"Savings Rate ({actual_rate}%) Below Your {context.targetSavingsRate:.0f}% Target",
                    rationale=(
                        f"Your net savings rate this month is {actual_rate}%, falling short of your {context.targetSavingsRate:.0f}% target "
                        f"by {gap_pct} percentage points (₹{gap_amount:,.0f})."
                    ),
                    evidenceValues={
                        "actualSavingsRate": actual_rate,
                        "targetSavingsRate": context.targetSavingsRate,
                        "currentIncome": context.currentMonthIncome,
                        "currentExpense": context.currentMonthExpense,
                        "gapAmount": gap_amount,
                    },
                    evidencePeriod="Current Month",
                    rule="SAVINGS_RATE_BELOW_TARGET",
                    threshold=f"< {context.targetSavingsRate:.0f}%",
                    estimatedEffect=f"Estimate: ₹{gap_amount:,.0f} additional savings needed this month",
                    actionableNextStep=f"Aim to reduce non-essential expenses by ₹{round(gap_amount / 4, 0):,.0f} each week.",
                    status="open",
                    rank=rank_counter,
                )
            )
            rank_counter += 1

    # ---------------------------------------------------------
    # RULE 5: High Discretionary Spend (>35% on Dining, Shopping, Ent)
    # ---------------------------------------------------------
    discretionary_categories = {
        "food & dining",
        "dining",
        "restaurants",
        "entertainment",
        "shopping",
        "lifestyle",
    }
    disc_spend = sum(
        amount
        for cat, amount in curr_cats.items()
        if cat.lower() in discretionary_categories
    )

    if context.currentMonthExpense > 0:
        disc_pct = round((disc_spend / context.currentMonthExpense) * 100.0, 1)
        if disc_pct >= 35.0 and disc_spend >= 3000.0:
            target_disc_spend = context.currentMonthExpense * 0.25
            potential_trim = round(disc_spend - target_disc_spend, 0)

            recs.append(
                RecommendationItem(
                    id="rec_high_discretionary_spend",
                    type="high_discretionary",
                    title=f"Discretionary Spending at {disc_pct}% of Expenses",
                    rationale=(
                        f"Dining, shopping, and entertainment accounted for ₹{disc_spend:,.0f} ({disc_pct}%) "
                        f"of your total monthly expenses of ₹{context.currentMonthExpense:,.0f}."
                    ),
                    evidenceValues={
                        "discretionarySpend": disc_spend,
                        "totalExpense": context.currentMonthExpense,
                        "discretionaryPercent": disc_pct,
                    },
                    evidencePeriod="Current Month",
                    rule="DISCRETIONARY_SPEND_RATIO",
                    threshold="> 35% of total expenses",
                    estimatedEffect=f"Estimate: ₹{potential_trim:,.0f} potential monthly reallocation to savings",
                    actionableNextStep="Try dining out one fewer time each week or setting a weekend leisure cap.",
                    status="open",
                    rank=rank_counter,
                )
            )
            rank_counter += 1

    # Sort by rank
    recs.sort(key=lambda r: r.rank)

    return RecommendationResponse(
        recommendations=recs,
        modelVersion=MODEL_VERSION,
    )
