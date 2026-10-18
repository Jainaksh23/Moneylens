# MoneyLens ML Categorizer — Evaluation & Performance Report

**Model Version**: `v1.0.0`  
**Evaluation Date**: 2026-10-18 10:19 UTC  
**Test Set Size**: 717 transactions (20% stratified held-out split)  
**Artifacts Generated**:  
- Confusion Matrix: [`confusion_matrix.png`](./confusion_matrix.png)
- JSON Metrics: [`evaluation_metrics.json`](./evaluation_metrics.json)

## Overall Performance Summary

| Metric | Value |
| :--- | :--- |
| **Overall Accuracy** | **100.00%** |
| **Macro F1-Score** | **1.0000** |
| **Weighted F1-Score** | **1.0000** |
| **Mean Prediction Confidence** | **93.10%** |
| **Confidence Threshold for Review** | **55.00%** |

## Per-Category Performance Breakdown

| Category | Precision | Recall | F1-Score | Support |
| :--- | :---: | :---: | :---: | :---: |
| Bills & Utilities | 1.0000 | 1.0000 | 1.0000 | 52 |
| EMI/Loans | 1.0000 | 1.0000 | 1.0000 | 51 |
| Education | 1.0000 | 1.0000 | 1.0000 | 51 |
| Entertainment | 1.0000 | 1.0000 | 1.0000 | 51 |
| Food | 1.0000 | 1.0000 | 1.0000 | 52 |
| Groceries | 1.0000 | 1.0000 | 1.0000 | 50 |
| Health | 1.0000 | 1.0000 | 1.0000 | 51 |
| Income | 1.0000 | 1.0000 | 1.0000 | 50 |
| Investments/SIP | 1.0000 | 1.0000 | 1.0000 | 51 |
| Other | 1.0000 | 1.0000 | 1.0000 | 52 |
| Rent | 1.0000 | 1.0000 | 1.0000 | 51 |
| Shopping | 1.0000 | 1.0000 | 1.0000 | 52 |
| Transport | 1.0000 | 1.0000 | 1.0000 | 52 |
| Travel | 1.0000 | 1.0000 | 1.0000 | 51 |

## Honest Analysis & Weak Class Insights

1. **High Confidence Performers**:
   - Categories with distinct semantic anchors such as `Food` (Swiggy, Zomato, biryani, dining), `Bills & Utilities` (BESCOM, Tata Power, electricity, broadband), `Rent` (landlord, flat, society maintenance), and `Investments/SIP` (Zerodha, mutual fund, Groww) achieve near 100% precision and recall.

2. **Known Boundary Overlaps & Edge Cases**:
   - **`Shopping` vs `Groceries`**: Hyperlocal platforms like Zepto, Blinkit, and BigBasket occasionally carry electronics, stationery, and apparel, creating lexical overlap.
   - **`Other` (Catch-all)**: Transactions like peer-to-peer UPI payments, ATM withdrawals, and sundry bank charges lack rich merchant descriptors. The model relies heavily on char n-grams here. Unidentified or ambiguous strings that fall below the `0.55` confidence threshold are purposefully assigned `unknown` with `needsReview: true`.
3. **Production Guardrails**:
   - Transactions with prediction confidence below 55% are flagged for user review rather than making unwarranted guesses.
   - User feedback collected via the `PATCH /transactions/:id` endpoint is staged for offline retraining via `scripts/retrain_with_feedback.py`.
