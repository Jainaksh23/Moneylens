# Goal Achievability Scoring — Methodology & Worked Examples

## Overview

MoneyLens uses a **Monte Carlo simulation** approach to score how likely a user is to achieve a savings goal. The score represents the percentage of simulated scenarios where the user reaches their target amount by the deadline.

## Formula

### Required Monthly (Simple Linear)

```
required_monthly = (target - current) / months_left
```

No compounding. This is the simplest possible calculation of what's needed each month.

### Monte Carlo Simulation

**Parameters:**
- `N = 1000` trials (seeded at 42 for reproducibility)
- Historical monthly surplus distribution: `mean(surplus)`, `std(surplus)`

**Each trial:**
```
balance = current_amount
for month in range(months_left):
    sampled_surplus = Normal(mean_surplus, std_surplus)
    balance += sampled_surplus + fixed_monthly_contribution
if balance >= target:
    success += 1
```

**Score:**
```
score = (successes / N) × 100
```

### Band Classification

| Score Range | Band              | Meaning                                    |
|-------------|-------------------|--------------------------------------------|
| 70 – 100    | `on_track`        | Likely achievable with current trajectory   |
| 30 – 69     | `needs_attention` | Possible but requires adjustments           |
| 0 – 29      | `unlikely`        | Significant changes needed to reach goal    |

### SIP Projection (Compounding)

```
r = annual_return / 12 / 100   (monthly rate)
n = months_left

FV_current = current × (1 + r)^n
FV_sip     = contribution × [((1 + r)^n - 1) / r]
projected_corpus = FV_current + FV_sip
```

**⚠ This projection is clearly labelled as an assumption, not a guarantee.**

---

## Worked Examples

### Example 1: On Track — Comfortable Surplus

**Inputs:**
- Target: ₹5,00,000
- Current: ₹1,00,000
- Months left: 12
- Monthly contribution: ₹0
- Historical monthly surplus: [35000, 38000, 42000, 40000, 37000, 39000]

**Calculation:**
- Required monthly: (500000 - 100000) / 12 = **₹33,333.33**
- Mean surplus: (35000+38000+42000+40000+37000+39000)/6 = **₹38,500**
- Std surplus: **≈2,510**

**Monte Carlo (1000 trials):**
- In each trial, for 12 months: sample from N(38500, 2510), accumulate from 100000.
- Mean scenario total: 100000 + 38500 × 12 = 562000 (well above 500000)
- Because the mean surplus (38500) exceeds the required monthly (33333), and the std is relatively low, **most trials succeed**.

**Result:**
- Score: **~95** (most of 1000 trials reach ₹5,00,000)
- Band: **on_track**
- Required monthly: ₹33,333
- Estimated available: ₹38,500

---

### Example 2: Needs Attention — Tight Margins

**Inputs:**
- Target: ₹10,00,000
- Current: ₹2,00,000
- Months left: 24
- Monthly contribution: ₹5,000
- Historical monthly surplus: [30000, 25000, 35000, 20000, 28000, 32000, 22000, 27000]

**Calculation:**
- Required monthly: (1000000 - 200000) / 24 = **₹33,333.33**
- Mean surplus: **₹27,375**
- Std surplus: **≈5,125**
- Effective monthly inflow: surplus + contribution = 27375 + 5000 = **₹32,375**

**Monte Carlo (1000 trials):**
- Mean scenario total: 200000 + 32375 × 24 = 977000 (just short of 1000000)
- With std of ≈5125, roughly half the trials overshoot, half fall short.

**Result:**
- Score: **~45**
- Band: **needs_attention**
- Required monthly: ₹33,333
- Estimated available: ₹27,375

**SIP projection (if contribution = 5000, return = 6%):**
- r = 0.06 / 12 = 0.005
- n = 24
- FV_current = 200000 × (1.005)^24 = ₹2,25,424
- FV_sip = 5000 × (((1.005)^24 - 1) / 0.005) = ₹1,27,160
- Projected corpus: **₹3,52,584** (from SIP + current only, separate from surplus)

---

### Example 3: Unlikely — Large Gap

**Inputs:**
- Target: ₹50,00,000
- Current: ₹1,00,000
- Months left: 12
- Monthly contribution: ₹10,000
- Historical monthly surplus: [15000, 18000, 12000, 20000, 14000, 16000]

**Calculation:**
- Required monthly: (5000000 - 100000) / 12 = **₹4,08,333**
- Mean surplus: **₹15,833**
- Std surplus: **≈2,858**
- Effective monthly inflow: 15833 + 10000 = **₹25,833** (vs required ₹408,333)

**Monte Carlo (1000 trials):**
- Mean scenario total: 100000 + 25833 × 12 = 410000 (far below 5000000)
- Virtually no trials reach the target.

**Result:**
- Score: **~0**
- Band: **unlikely**
- Required monthly: ₹4,08,333
- Estimated available: ₹15,833

---

## Fallback (No Historical Data)

When fewer than 3 months of surplus data exist, Monte Carlo cannot run. A deterministic heuristic is used:

| Condition                             | Score |
|---------------------------------------|-------|
| Goal already met (current ≥ target)   | 100   |
| Contribution ≥ required monthly       | 85    |
| Contribution ≥ 50% of required        | 50    |
| Otherwise                             | 20    |

A warning is always shown when this fallback is used.

## Assumptions & Limitations

1. **Past performance ≠ future results.** Historical surplus distribution may not hold.
2. **No inflation adjustment.** Purchasing power erosion is not modelled.
3. **No tax implications.** Returns are modelled pre-tax.
4. **SIP projections assume fixed return.** Actual returns vary.
5. **Irregular expenses** (medical emergencies, windfalls) are not modelled.
6. **Minimum 3 months of data** required for Monte Carlo. 12+ recommended.
7. **Seed is fixed (42)** for reproducibility — same inputs always give same score.
