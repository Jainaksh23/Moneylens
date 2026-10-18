# MoneyLens Capstone Submission Checklist & Artifact Directory

This document serves as the master submission index for **MoneyLens: AI-Powered Personal Finance & Wealth Intelligence**. Every required artifact, model evaluation, architecture diagram, security audit, and documentation deliverable maps directly to an existing, verifiable file in this repository.

---

## 📌 Master Artifact Index

| # | Required Item | Primary Artifact File | Supplementary References | Description & Verification |
| :-: | :--- | :--- | :--- | :--- |
| **1** | **System Architecture Diagram** | [`docs/deployment.md`](file:///d:/Moneylens/docs/deployment.md) | [`README.md`](file:///d:/Moneylens/README.md) | Complete multi-tier architecture diagram (Vercel CDN -> Vercel Rewrites Same-Site Proxy -> Node.js Express Gateway -> FastAPI ML Engine -> MongoDB Atlas & Groq Cloud). |
| **2** | **Complete REST API Specification** | [`docs/api.md`](file:///d:/Moneylens/docs/api.md) | [`backend/src/routes/`](file:///d:/Moneylens/backend/src/routes) | Detailed request/response schemas, error status codes, pagination params, and authentication requirements for all 25+ endpoints. |
| **3** | **Data Dictionary & Schema Catalog** | [`docs/data_dictionary.md`](file:///d:/Moneylens/docs/data_dictionary.md) | [`backend/src/models/`](file:///d:/Moneylens/backend/src/models) | Field-by-field definitions, types, default values, and index specifications for `User`, `Transaction`, `Goal`, `Reminder`, `Insight`, and `ChatMessage`. |
| **4** | **CSV & PDF Statement Import Samples** | [`docs/sample_transactions.csv`](file:///d:/Moneylens/docs/sample_transactions.csv)<br>[`docs/sample_bank_statement.pdf`](file:///d:/Moneylens/docs/sample_bank_statement.pdf)<br>[`docs/sample_credit_card_statement.pdf`](file:///d:/Moneylens/docs/sample_credit_card_statement.pdf) | [`docs/demo_script.md`](file:///d:/Moneylens/docs/demo_script.md)<br>[`scripts/generate_sample_pdf_statements.py`](file:///d:/Moneylens/scripts/generate_sample_pdf_statements.py) | RFC 4180 CSV ledger (670+ rows) and digital PDF statements (Standard Bank Statement & Credit Card Statement parsed via `pdfplumber` in `ml-service`), plus scanned PDF rejection fixture. |
| **5** | **Synthetic Dataset & Generator** | [`ml-service/data/training_transactions.csv`](file:///d:/Moneylens/ml-service/data/training_transactions.csv) | [`docs/generate_synthetic_data.py`](file:///d:/Moneylens/docs/generate_synthetic_data.py) | 3,584 curated synthetic banking transactions with realistic noise and UPI/NEFT narratives, plus the reproducible generator script. |
| **6** | **Categorizer Evaluation & Confusion Matrix** | [`docs/evaluation/evaluation_report.md`](file:///d:/Moneylens/docs/evaluation/evaluation_report.md) | [`docs/evaluation/confusion_matrix.png`](file:///d:/Moneylens/docs/evaluation/confusion_matrix.png)<br>[`docs/evaluation.md`](file:///d:/Moneylens/docs/evaluation.md) | Empirically measured Stratified 80/20 test metrics: **Macro-F1: 1.0000**, Accuracy: 100.00% across 14 categories with high-resolution visual confusion matrix. |
| **7** | **Forecast Metrics vs Baseline** | [`docs/evaluation.md`](file:///d:/Moneylens/docs/evaluation.md#2-cash-flow-forecast-evaluation) | [`docs/evaluation/evaluation_report.md`](file:///d:/Moneylens/docs/evaluation/evaluation_report.md) | Sequential time-based split comparison (no leakage): Rolling Window MAE ₹2,191.49 vs Naive Baseline MAE ₹2,136.02 on real 18-month test series. |
| **8** | **Goal Feasibility Formula & Examples** | [`docs/goal_score.md`](file:///d:/Moneylens/docs/goal_score.md) | [`docs/evaluation.md`](file:///d:/Moneylens/docs/evaluation.md#4-goal-feasibility-monte-carlo-evaluation) | Complete mathematical formulation, Monte Carlo simulation model, scoring bands (0–100), and 3 real worked personas. |
| **9** | **Anomaly Detection Method & Thresholds** | [`docs/evaluation.md`](file:///d:/Moneylens/docs/evaluation.md#3-anomaly-detection-evaluation) | [`ml-service/app/services/anomaly_detector.py`](file:///d:/Moneylens/ml-service/app/services/anomaly_detector.py) | Median Absolute Deviation (MAD) robust Z-score threshold curve ($z \ge 3.5$ achieves 100% recall with 0 false positives). |
| **10** | **Smart Recommendation Rules** | [`docs/evaluation.md`](file:///d:/Moneylens/docs/evaluation.md#6-smart-recommendations-engine) | [`ml-service/app/services/recommendation_engine.py`](file:///d:/Moneylens/ml-service/app/services/recommendation_engine.py) | Deterministic financial health rules for emergency funds, high savings opportunities, EMI debt burden (>40%), and category surges. |
| **11** | **RAG Pipeline, Citations & Failure Modes** | [`docs/evaluation.md`](file:///d:/Moneylens/docs/evaluation.md#5-rag-financial-assistant-architecture--evaluation) | [`docs/api.md`](file:///d:/Moneylens/docs/api.md)<br>[`ml-service/app/services/rag_service.py`](file:///d:/Moneylens/ml-service/app/services/rag_service.py) | Mermaid diagram, ChromaDB MiniLM embedding corpus, prompt injection defense, and graceful degradation during LLM outage. |
| **12** | **Test Execution Report (219 Tests)** | [`docs/test_report.md`](file:///d:/Moneylens/docs/test_report.md) | [`.github/workflows/ci.yml`](file:///d:/Moneylens/.github/workflows/ci.yml) | Pass/fail summary of 123 Backend Jest tests, 82 ML Pytest tests, and 14 Frontend Vitest tests with security regression proofs. |
| **13** | **Known Defects & Mitigations** | [`docs/known_issues.md`](file:///d:/Moneylens/docs/known_issues.md) | [`README.md`](file:///d:/Moneylens/README.md) | Transparent catalog of free-tier cold starts, short-history Prophet limitations, and digital-only PDF extraction boundaries (no OCR in v1). |
| **14** | **Screenshots & UI Catalog** | [`docs/screenshots.md`](file:///d:/Moneylens/docs/screenshots.md) | [`frontend/src/pages/`](file:///d:/Moneylens/frontend/src/pages) | Comprehensive catalog of all 11 user interface views, layout structures, and accessibility features. |
| **15** | **Repository README** | [`README.md`](file:///d:/Moneylens/README.md) | [`render.yaml`](file:///d:/Moneylens/render.yaml) | Setup instructions, Docker Compose commands, testing commands, environment configuration, and project overview. |
| **16** | **Privacy & Security Checklist** | [`docs/privacy.md`](file:///d:/Moneylens/docs/privacy.md) | [`docs/licenses.md`](file:///d:/Moneylens/docs/licenses.md) | OWASP top 10 controls, GDPR data export/deletion (`/me`), cookie hardening, rate limiting, and 100% permissive license audit. |
| **17** | **Presentation Outline & Slides** | [`docs/presentation_outline.md`](file:///d:/Moneylens/docs/presentation_outline.md) | [`docs/viva_questions.md`](file:///d:/Moneylens/docs/viva_questions.md) | 10-slide capstone presentation outline detailing problem, architecture, ML results, and live demo. |
| **18** | **Comprehensive Viva Q&A (30 Questions)** | [`docs/viva_questions.md`](file:///d:/Moneylens/docs/viva_questions.md) | Codebase | 30 technical questions and codebase-accurate answers covering algorithmic choices, security, and edge cases. |

---

## 🔒 Verification & Compliance Summary

- **Secrets in Version Control**: **0** (Audited via `git log -p -S`).
- **Real Financial Records Committed**: **0** (100% synthetic datasets).
- **Test Pass Rate**: **219 / 219 tests passing (100%)**.
- **License Contamination**: **0% copyleft** (All 38 packages licensed under MIT, Apache 2.0, or BSD).
- **Containerization**: Multi-stage Dockerfiles validated with non-root execution.
- **CI/CD Pipeline**: GitHub Actions continuous integration workflow active on all branches and pull requests.
