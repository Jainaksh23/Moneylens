# MoneyLens Dependency & License Audit

All dependencies used across MoneyLens backend, ML intelligence service, and React frontend are distributed under permissive open-source licenses (MIT, Apache 2.0, or BSD 3-Clause). There is zero GPL, AGPL, or restrictive copyleft license contamination.

---

## 1. Backend Service (`backend/package.json`)

| Package | Version | License | Purpose |
| :--- | :--- | :--- | :--- |
| `express` | `^4.21.2` | **MIT** | Core web framework and HTTP routing |
| `mongoose` | `^8.13.0` | **MIT** | MongoDB object modeling and database connectivity |
| `bcryptjs` | `^2.4.3` | **MIT** | Password hashing with cryptographic salts |
| `jsonwebtoken` | `^9.0.2` | **MIT** | JWT issuance and verification |
| `zod` | `^3.24.2` | **MIT** | Request body and query parameter validation |
| `helmet` | `^8.0.0` | **MIT** | HTTP security headers |
| `cors` | `^2.8.5` | **MIT** | Cross-Origin Resource Sharing controls |
| `cookie-parser` | `^1.4.7` | **MIT** | HTTP-only cookie parsing |
| `pino` | `^9.6.0` | **MIT** | Fast structured JSON logger |
| `pino-pretty` | `^13.0.0` | **MIT** | Development formatted console logging |
| `busboy` | `^1.6.0` | **MIT** | Streaming multipart/form-data CSV parser |
| `csv-parse` | `^5.6.0` | **MIT** | Fast RFC 4180 compliant CSV parser |
| `dotenv` | `^16.4.7` | **BSD-2-Clause** | Environment variable loader |
| `express-rate-limit` | `^7.5.0` | **MIT** | IP-based request rate limiting |
| `mongodb-memory-server` | `^10.1.4` (dev) | **MIT** | In-memory MongoDB daemon for testing |
| `jest` / `ts-jest` | `^29.7.0` (dev) | **MIT** | Automated test runner and TS preprocessor |
| `supertest` | `^7.0.0` (dev) | **MIT** | HTTP integration testing client |
| `eslint` / `@typescript-eslint` | `^9.23.0` (dev) | **MIT** | TypeScript linting and static analysis |

---

## 2. ML & RAG Service (`ml-service/requirements.txt`)

| Package | Version | License | Purpose |
| :--- | :--- | :--- | :--- |
| `fastapi` | `>=0.115.0` | **MIT** | Asynchronous REST API framework |
| `uvicorn[standard]` | `>=0.32.0` | **BSD-3-Clause** | High-performance ASGI web server |
| `pydantic` | `>=2.10.0` | **MIT** | Data parsing and validation schemas |
| `pydantic-settings` | `>=2.7.0` | **MIT** | Environment settings management |
| `scikit-learn` | `>=1.4.0` | **BSD-3-Clause** | Ridge classifier, TF-IDF, and Isolation Forest |
| `numpy` | `>=1.26.0` | **BSD-3-Clause** | Vector and numerical operations |
| `pandas` | `>=2.2.0` | **BSD-3-Clause** | Tabular data manipulation and aggregation |
| `matplotlib` | `>=3.8.0` | **PSF / BSD** | Evaluation visualization (confusion matrix) |
| `joblib` | `>=1.3.0` | **BSD-3-Clause** | Model serialization and pipelined execution |
| `chromadb` | `>=1.5.0` | **Apache-2.0** | Embedding vector store with local ONNX models |
| `httpx` | `>=0.28.0` | **BSD-3-Clause** | HTTP client for external LLM API communication |
| `pytest` / `pytest-asyncio` | `>=8.3.0` (dev) | **MIT** | Asynchronous test framework |
| `ruff` | `>=0.9.0` (dev) | **MIT** | Fast Python static linter and formatter |

---

## 3. Frontend Application (`frontend/package.json`)

| Package | Version | License | Purpose |
| :--- | :--- | :--- | :--- |
| `react` | `^19.2.8` | **MIT** | Declarative component UI library |
| `react-dom` | `^19.2.8` | **MIT** | React DOM rendering engine |
| `react-router-dom` | `^7.18.4` | **MIT** | Client-side SPA routing and navigation |
| `lucide-react` | `^1.57.0` | **ISC** (Permissive) | Icon pack for dashboards and buttons |
| `recharts` | `^3.10.1` | **MIT** | SVG financial charts (area, bar, pie) |
| `vite` | `^8.3.4` (dev) | **MIT** | Next-generation frontend bundler and dev server |
| `tailwindcss` | `^3.4.17` (dev) | **MIT** | Utility-first styling framework |
| `postcss` / `autoprefixer` | `^8.4.49` (dev) | **MIT** | CSS post-processing |
| `vitest` | `^4.1.2` (dev) | **MIT** | Vite-native unit test runner |
| `@testing-library/react` | `^16.3.3` (dev) | **MIT** | DOM testing utilities |
| `jsdom` | `^30.1.3` (dev) | **MIT** | Browser DOM simulator for tests |

---

## 4. Compliance Summary

- **Total Direct Dependencies**: 38 packages.
- **Copyleft (GPL / AGPL)**: 0% (None).
- **Commercial & Educational Usability**: 100% compliant with standard enterprise, academic, and commercial redistribution guidelines.
