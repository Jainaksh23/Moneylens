# MoneyLens ML Service — Synthetic Training Dataset

> **NOTICE: SYNTHETIC DATASET**  
> All records in `training_transactions.csv` are **100% synthetically generated** for academic research and model demonstration purposes (MoneyLens Final-Year B.Tech AI/ML Project).  
> **No real personal banking records, financial statements, customer names, or live account numbers are stored or used.**

---

## Dataset Overview

- **Source**: `scripts/generate_training_data.py`
- **Random Seed**: `42` (Deterministic and reproducible)
- **Total Records**: 3,640 transactions
- **Target Classes**: 14 distinct personal finance categories:
  1. `Food`
  2. `Groceries`
  3. `Transport`
  4. `Shopping`
  5. `Bills & Utilities`
  6. `Entertainment`
  7. `Health`
  8. `Education`
  9. `Rent`
  10. `EMI/Loans`
  11. `Investments/SIP`
  12. `Travel`
  13. `Income`
  14. `Other`

## Noise Simulation Methodology

Real Indian bank statements and UPI payment records contain idiosyncratic prefixes, suffixes, card identifiers, and punctuation. The generator simulates:
- **UPI Channels & VPAs**: `UPI/swiggy@icici/...`, `@okaxis`, `@paytm`, `@ybl`, etc.
- **NEFT / IMPS / ACH / CMS Prefixes**: e.g. `NEFT CR-INFOSYS LIMITED-SALARY`, `ACH W/D-HDFC HOME LOAN EMI`.
- **Card POS Logs**: `POS 4819 ZEPTOPAY MUMBAI IN`.
- **Reference Codes & Trailing Numbers**: e.g. `Ref#84729183`, `TXN981273`.
- **Casing Variations**: Mixture of UPPERCASE, Title Case, and lowercase.
