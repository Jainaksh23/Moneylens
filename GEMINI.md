# MoneyLens — Workspace Master Rules & Engineering Constraints

You are the lead engineer on **MoneyLens**: a personal financial intelligence web app for Indian users (INR) — a final-year B.Tech AI/ML project. Build it phase by phase following these rules in EVERY phase.

---

## 🎯 PRODUCT
- Users register, import transactions (CSV / digital PDF / manual), get auto-categorization, dashboard, cash-flow forecast, savings goals with achievability score + SIP what-if simulator, anomaly alerts, rule-based recommendations, EMI/recurring reminders, and a RAG chat grounded in their own data and approved financial-education docs.
- **Educational decision support only**, never regulated financial/tax/investment advice.
- Every insight must show basis, date range, assumptions, and limitations.

---

## 🏛️ ARCHITECTURE (Monorepo)
- `frontend/`: React + Vite + TypeScript + Tailwind + Recharts
- `backend/`: Node.js + Express (public API gateway), Mongoose, MongoDB Atlas
- `ml-service/`: Python FastAPI (categorize, forecast, goal-score, anomaly, recommendations features, RAG/ChromaDB)
- `rag/knowledge/`: approved finance-education markdown docs
- `docs/`: architecture, API contracts, data dictionary, evaluation, privacy, demo script
- Root: `docker-compose.yml`, `.env.example`, `README.md`, `.github/workflows/`

**Perimeter Security Rule**:
Browser talks **ONLY** to the backend. Backend talks to ML service using a shared secret header `X-Internal-Key`. Browser never calls MongoDB, Groq, or ML service directly.

---

## ⚙️ ENGINEERING RULES

1. **Strict Type Safety**: Use TypeScript in frontend and backend (`strict: true`). Python 3.11 with explicit type hints and Pydantic v2 schemas.
2. **Server-Side Validation**: Validate every request on the server (`zod` in Node.js, `Pydantic` in FastAPI).
   Consistent error shape:
   ```json
   {
     "error": {
       "code": "STRING_ERROR_CODE",
       "message": "Human readable message",
       "details": []
     },
     "requestId": "uuid"
   }
   ```
3. **Authentication & Session Hardening**: JWT in `httpOnly` + `Secure` (production) + `SameSite=Lax` cookie (never in `localStorage`). Passwords hashed with `bcrypt`. Every DB query scoped by authenticated `userId`. State-changing routes require `X-Requested-With: moneylens` header and Origin verification.
4. **Zero Secrets in Code**: Never commit secrets. Only `.env.example` with safe placeholders. Never put sensitive keys in `VITE_` variables.
5. **Structured JSON Logs**: Structured JSON logging (`pino` in Node, `logging/structlog` JSON in Python) with `requestId`, route, status, duration. Never log passwords, tokens, API keys, raw files, or full financial records.
6. **Deterministic Math**: All numeric and financial calculations (savings rate, interest, goal feasibility, net cash flow) are done in deterministic code, never by the LLM. LLM only explains computed facts. If evidence is missing, state so transparently.
7. **Empirical & Verifiable Metrics**: No fabricated metrics. Any accuracy, MAE, or F1 numbers in docs must come from a reproducible script in the repo. Use time-based sequential splits for forecasting and always compare against a naive baseline.
8. **Graceful Degradation**: If the LLM provider (Groq) or ML service is unreachable, the rest of the application remains fully functional, and the UI displays a clear unavailable / degraded state.
9. **Automated Verification**: Every phase must include automated tests. If something fails, fix the root cause; never claim success without showing real command output.
10. **Clean Commit History**: Keep commits small with clear messages. Update `README.md` and `docs/` continuously. Do not refactor or delete working code outside the phase scope.
11. **Privacy-First Synthetic Data**: Use only synthetic demo data with realistic Indian merchants and UPI narratives. Never commit real personal financial records.
12. **Phase Completion Reporting**: At the end of each phase, output:
    - What was built
    - Files changed / created
    - How to run and test
    - Real command output
    - Known limitations
    - What the next phase needs
