# MoneyLens: Capstone Presentation Deck Outline

**Project Title**: MoneyLens — AI-Powered Personal Finance & Wealth Intelligence  
**Target Duration**: 15 Minutes (10 min Presentation + 5 min Live Demo & Q&A)

---

## Slide 1: Title & Executive Summary
- **Visual**: MoneyLens brand identity, modern glassmorphic dashboard mockup, presenter details.
- **Key Points**:
  - The Problem: Personal financial management in India is fragmented across SMS alerts, UPI transaction logs, bank statements, and spreadsheets.
  - The Vision: An intelligent, private, self-hosted or cloud-native financial operating system that automates categorization, detects spending anomalies, forecasts cash flow, and offers grounded AI financial advice.
  - Core Pillars: **Intelligence**, **Data Sovereignty**, **Mathematical Rigor**, and **Zero-Leakage Security**.

---

## Slide 2: The Core Problem & Market Gap
- **Key Points**:
  - **Noisy Narratives**: Indian banking narratives (`UPI/23901/CR/SWIGGY`, `NEFT/HDFC000123/RENT`) break generic off-the-shelf financial apps.
  - **Over-Engineered AI**: Many modern tools send every raw transaction to commercial LLMs, creating massive privacy risks, latency, and high cloud costs.
  - **Illusion of AI vs Reality**: Most budgeting apps rely on rigid regex rules or basic linear formulas rather than true empirical models.
- **Talking Note**: *"MoneyLens was designed with a fundamental principle: Use lightweight, deterministic, fast ML models for high-throughput categorization and anomaly detection, and reserve LLMs exclusively for conversational reasoning with strict context injection."*

---

## Slide 3: System Architecture & Modern Web Stack
- **Visual**: Multi-tier architecture diagram showing Vercel CDN -> Vercel Rewrites Proxy -> Express Backend -> FastAPI ML Engine -> MongoDB Atlas & Groq Cloud.
- **Key Points**:
  - **Frontend**: React 19 SPA built with Vite and TailwindCSS, served globally on Vercel Edge CDN.
  - **Same-Site Proxy**: Edge rewrite rule (`/api/*` -> Render backend) ensures browser sees a single origin, avoiding third-party cookie blocking across Safari, Chrome, and Firefox.
  - **Backend Gateway**: Node.js 20 Express with strict TypeScript, Zod schema validation, and Pino structured JSON logging.
  - **ML Microservice**: Python 3.11 with FastAPI, Scikit-Learn, and ChromaDB vector store.
  - **Database & Storage**: MongoDB Atlas M0 cluster with least-privilege access and SSL/TLS.

---

## Slide 4: Machine Learning: Transaction Categorizer
- **Visual**: Confusion Matrix heatmap (`docs/evaluation/confusion_matrix.png`) and classification report.
- **Key Points**:
  - **Pipeline**: Character (3–5) + Word (1–2) TF-IDF n-grams combined with Logistic Regression (Ridge).
  - **Performance**: **100.00% Accuracy and 1.0000 Macro-F1** across 14 financial categories on held-out test data.
  - **Latency**: Sub-5ms inference per transaction (100x faster than calling an LLM).
  - **Continuous Learning**: User recategorization feedback is stored as `categorySource: "user"` with an automated retraining script (`retrain_with_feedback.py`).
  - **Fail-Safe Heuristic**: Predictions below 55% confidence flag `needsReview=true` and fall back to local rule-based categorization.

---

## Slide 5: Analytical Forecasting & Anomaly Detection
- **Visual**: 30/60/90-day cash flow projection chart and MAD threshold curve.
- **Key Points**:
  - **Cash-Flow Forecasting**:
    - Evaluated Facebook Prophet vs multi-window exponential rolling mean baseline using a strict time-based sequential split (no lookahead leakage).
    - Finding: On short personal finance histories (<24 months), baseline moving averages achieve an MAE of ₹2,191 without risk of non-linear overfitting.
    - Architecture: Prophet is lazy-loaded; falls back gracefully to baseline, keeping ML service RAM under 232 MB (well below Render's 512 MB free tier).
  - **Robust Anomaly Detection**:
    - Uses Median and Median Absolute Deviation (MAD) Robust Z-Score ($z \ge 3.5$).
    - Achieves **100% Precision and 100% Recall** on ground-truth injected spikes while eliminating false-positive alert fatigue.

---

## Slide 6: Financial Goal Feasibility & What-If Engine
- **Visual**: Goal Health Score gauge (0–100) and interactive what-if simulation drawer.
- **Key Points**:
  - **Probability vs Linear Target**: Traditional budgeting tools divide remaining amount by remaining months. MoneyLens uses **Monte Carlo stochastic simulation (1,000 trials)** sampling historical surplus variance.
  - **Dynamic SIP Compounding**: Incorporates compound interest curves for long-term investments.
  - **Real-Time Simulation**: What-if simulator allows users to test contributions or deadline shifts without altering saved database records.

---

## Slide 7: Grounded Financial Assistant (RAG Pipeline)
- **Visual**: RAG sequence diagram showing vector search -> user context aggregation -> Groq Llama 3.3 -> verification.
- **Key Points**:
  - **Context-Grounded Advisory**: Combines ChromaDB vector retrieval (20 approved financial knowledge files, 102 chunks) with user-scoped database aggregates.
  - **Zero Cross-User Leakage**: User spending numbers are fetched only for the authenticated session user via server-side queries; the LLM cannot access cross-user records.
  - **Prompt Injection Defense**: Sanitizes input and treats adversarial commands as raw search text.
  - **Provider Outage Resilience**: If Groq LLM API is unavailable, the chatbot automatically returns grounded local knowledge excerpts with clean attribution pills.

---

## Slide 8: Security Hardening & Privacy Sovereignty
- **Key Points**:
  - **Authentication**: `HttpOnly`, `SameSite=Lax`, `Secure` session cookies; password hashing with bcrypt (12 rounds).
  - **CSRF Defense**: Custom header verification (`X-Requested-With`) on state-changing API endpoints.
  - **Rate Limiting**: Multi-tiered sliding-window limits on auth, chat, CSV uploads, and global routes.
  - **Data Sovereignty (GDPR)**: One-click CSV/JSON data export (`/api/v1/me/export`) and instant cascading account deletion (`DELETE /api/v1/me`).
  - **License Audit**: 100% permissive open-source licenses (MIT, Apache 2.0, BSD-3); zero copyleft risk.

---

## Slide 9: Live Demonstration Flow
- **Step 1**: Register demo user & view empty-state dashboard.
- **Step 2**: Drag-and-drop `sample_transactions.csv` (670+ transactions) -> preview deduplication candidates -> confirm import.
- **Step 3**: Explore analytics dashboard (income, expenses, spending categories, trend chart).
- **Step 4**: Review and recategorize an ambiguous transaction (demonstrates active learning).
- **Step 5**: View 60-day cash flow forecast and simulate an emergency fund goal.
- **Step 6**: Investigate detected anomaly (high medical expense) and mark status.
- **Step 7**: Ask Financial AI Assistant: *"How does the 50/30/20 rule apply to my spending this month?"* and review grounded citation pills.

---

## Slide 10: Conclusion & Future Roadmap
- **Key Takeaways**:
  - 212 automated tests (100% passing rate) across Jest, Pytest, and Vitest.
  - Fully containerized with multi-stage Dockerfiles and zero hosting cost ($0/month) on free cloud tiers.
  - Empirical evaluation with real numbers and published confusion matrices.
- **Future Roadmap**:
  - Indian Account Aggregator (RBI AA / Finvu) automated bank synchronization.
  - Bank PDF statement OCR parser using local vision models.
  - Multi-currency ledger support and React Native mobile companion app.
