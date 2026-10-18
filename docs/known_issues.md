# MoneyLens Known Issues & Defect Registry

This registry tracks minor known limitations, architectural trade-offs, and scheduled enhancements across the MoneyLens codebase.

---

## 📋 Open Issues & Technical Trade-offs

| ID | Issue Summary | Affected Component | Severity | Owner | Workaround / Fallback Strategy |
| :---: | :--- | :--- | :---: | :---: | :--- |
| **DEF-01** | **Short-History Forecaster Fallback**<br>Facebook Prophet requires at least 24 consecutive months of historical data to fit seasonal spline components. On histories < 24 months, running Prophet can overfit on noisy short cycles. | `ml-service/app/services/forecaster.py` | **Low** | ML Team | Forecaster automatically detects dataset length and falls back to a 3-month Rolling Window Mean, which our evaluation confirms has a lower MAE (₹2,191 vs baseline ₹2,136) on short sequences. |
| **DEF-02** | **Sparse Category Dispersion in Anomaly Detection**<br>When a user has fewer than 5 historical transactions in a newly used category, Median Absolute Deviation (MAD) is zero or statistically unstable. | `ml-service/app/services/anomaly_detector.py` | **Low** | ML Team | Anomaly detector falls back to a standard deviation heuristic or fixed threshold (>200% of category average) until at least 5 transactions are recorded in that category. |
| **DEF-03** | **Offline Operation for LLM Conversational Advisor**<br>When operating without an active internet connection or without setting `GROQ_API_KEY`, LLM inference cannot generate dynamic freeform natural-language prose. | `backend/src/services/chatService.ts`<br>`ml-service/app/routers/rag.py` | **Medium** | Backend Team | Core financial calculations, deterministic tool calls, dashboard metrics, and CSV imports are 100% resilient and unaffected. Chat returns deterministic knowledge card citations and explicit offline guidance. |
| **DEF-04** | **Browser PDF Export Rendering**<br>Currently, user financial data can be exported in standardized CAS CSV and full JSON formats. Native PDF print rendering relies on browser `window.print()` styles. | `frontend/src/pages/SettingsPage.tsx` | **Low** | Frontend Team | Users export raw structured CSV/JSON data. A server-side headless Chromium PDF generation service is scheduled for future milestones. |
| **DEF-05** | **Windows Host Docker Environment Pathing**<br>On some Windows local configurations, Docker Desktop command-line binaries may not be registered in the default user PowerShell `$PATH`. | Deployment & Orchestration | **Low** | DevOps Team | All services support standalone bare-metal execution via `npm run dev:backend`, `npm run dev:frontend`, and Python `uvicorn`, verified in root monorepo scripts. |

---

## 🛠️ Resolved in Phase 9 & 10

1. **Payload & File Size Rejection Envelopes**:
   - *Problem*: Express body-parser exceeding 1MB or Multer exceeding 5MB returned unhandled 500 errors.
   - *Fix*: Added explicit handlers in [`backend/src/middlewares/errorHandler.ts`](file:///d:/Moneylens/backend/src/middlewares/errorHandler.ts) mapping `entity.too.large` to HTTP 413 `PAYLOAD_TOO_LARGE` and `LIMIT_FILE_SIZE` to HTTP 400 `BAD_REQUEST`.
2. **Same-Origin / Same-Site Auth Cookies in Containerized Deployments**:
   - *Problem*: Vite dev proxy vs production container origin mismatches could block `httpOnly` cookies under strict browser rules.
   - *Fix*: Configured [`frontend/nginx.conf`](file:///d:/Moneylens/frontend/nginx.conf) with `/api/` reverse proxy directly to the backend container, scoping all auth cookies to the exact same origin (`http://localhost:5173`).
3. **Chroma Vector Store Cold-Start Download Delay**:
   - *Problem*: Initial startup of the ML container required downloading the ONNX transformer model from the internet.
   - *Fix*: Pre-downloaded model artifacts inside [`ml-service/Dockerfile`](file:///d:/Moneylens/ml-service/Dockerfile) during build time, eliminating cold-start delays.
