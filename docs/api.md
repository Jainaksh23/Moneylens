# MoneyLens API Reference Specification

This document provides complete documentation for the MoneyLens REST API (`/api/v1`). All state-changing requests (`POST`, `PUT`, `PATCH`, `DELETE`) require the CSRF defense-in-depth header `X-Requested-With: moneylens`. Protected endpoints require the `moneylens_token` authentication cookie.

---

## 📑 Table of Contents
1. [Core & Health](#1-core--health)
2. [Authentication & Session](#2-authentication--session)
3. [User Profile & Data Management](#3-user-profile--data-management)
4. [Transactions & CSV Import](#4-transactions--csv-import)
5. [Analytics & Financial Health](#5-analytics--financial-health)
6. [Forecasting](#6-forecasting)
7. [Goals & Simulation](#7-goals--simulation)
8. [Insights & Anomalies](#8-insights--anomalies)
9. [Reminders & Recurring Commitments](#9-reminders--recurring-commitments)
10. [Conversational AI & RAG Chat](#10-conversational-ai--rag-chat)

---

## 1. Core & Health

### `GET /health` or `GET /api/v1/health`
- **Description**: Public liveness probe. Checks if the API gateway process is responsive.
- **Response `200 OK`**:
```json
{
  "status": "ok"
}
```

### `GET /health/ready` or `GET /api/v1/health/ready`
- **Description**: Readiness probe. Validates MongoDB connectivity without leaking internal topology or credentials.
- **Response `200 OK`** (Healthy):
```json
{
  "status": "ok",
  "checks": {
    "database": "connected"
  }
}
```
- **Response `503 Service Unavailable`** (Disconnected):
```json
{
  "status": "unavailable",
  "checks": {
    "database": "disconnected"
  }
}
```

---

## 2. Authentication & Session

### `POST /api/v1/auth/register`
- **Description**: Registers a new user account and automatically sets an `httpOnly` session cookie.
- **Headers**: `Content-Type: application/json`, `X-Requested-With: moneylens`
- **Request Body**:
```json
{
  "email": "priya.sharma@example.com",
  "password": "SecurePassword123!",
  "name": "Priya Sharma"
}
```
- **Response `201 Created`**:
```json
{
  "message": "User registered successfully",
  "user": {
    "id": "6734a1b2c3d4e5f6a7b8c9d0",
    "email": "priya.sharma@example.com",
    "name": "Priya Sharma"
  }
}
```

### `POST /api/v1/auth/login`
- **Description**: Authenticates user credentials and issues the signed `moneylens_token` cookie.
- **Headers**: `Content-Type: application/json`, `X-Requested-With: moneylens`
- **Request Body**:
```json
{
  "email": "priya.sharma@example.com",
  "password": "SecurePassword123!"
}
```
- **Response `200 OK`**:
```json
{
  "message": "Login successful",
  "user": {
    "id": "6734a1b2c3d4e5f6a7b8c9d0",
    "email": "priya.sharma@example.com",
    "name": "Priya Sharma"
  }
}
```

### `POST /api/v1/auth/logout`
- **Description**: Clears the authentication cookie and ends the session.
- **Headers**: `X-Requested-With: moneylens`
- **Response `200 OK`**:
```json
{
  "message": "Logged out successfully"
}
```

---

## 3. User Profile & Data Management

### `GET /api/v1/me`
- **Description**: Returns authenticated user profile, settings, and account metadata.
- **Response `200 OK`**:
```json
{
  "user": {
    "id": "6734a1b2c3d4e5f6a7b8c9d0",
    "email": "priya.sharma@example.com",
    "name": "Priya Sharma",
    "preferences": {
      "currency": "INR",
      "dateFormat": "DD/MM/YYYY"
    },
    "createdAt": "2026-03-01T10:00:00.000Z"
  }
}
```

### `PATCH /api/v1/me`
- **Description**: Updates profile details and financial preferences.
- **Request Body**:
```json
{
  "name": "Priya S. Sharma",
  "preferences": {
    "currency": "INR",
    "dateFormat": "YYYY-MM-DD"
  }
}
```

### `GET /api/v1/me/export?format=csv|json`
- **Description**: Exports the user's entire financial dataset (transactions, goals, anomalies, reminders, chat messages) as standard CSV or full structured JSON.

### `DELETE /api/v1/me`
- **Description**: Right-to-be-forgotten cascade deletion. Permanently purges user account and all personal collections.
- **Response `200 OK`**:
```json
{
  "message": "Account and all associated financial data permanently deleted",
  "purged": {
    "transactions": 450,
    "goals": 3,
    "insights": 12,
    "reminders": 5,
    "chatMessages": 24
  }
}
```

---

## 4. Transactions & CSV Import

### `GET /api/v1/transactions`
- **Query Parameters**:
  - `page`: default `1`
  - `pageSize`: default `20` (max `100`)
  - `direction`: `income` | `expense`
  - `category`: string filter
  - `search`: description or merchant search string
  - `from`, `to`: ISO date filters (`YYYY-MM-DD`)
- **Response `200 OK`**:
```json
{
  "transactions": [
    {
      "id": "6734a2e5c3d4e5f6a7b8c9d1",
      "date": "2026-03-15T00:00:00.000Z",
      "amount": 1250,
      "currency": "INR",
      "direction": "expense",
      "merchant": "Swiggy",
      "description": "Swiggy Gourmet Order",
      "category": "Food & Dining",
      "categorySource": "model",
      "categoryConfidence": 0.94,
      "needsReview": false
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "total": 450,
    "totalPages": 23
  }
}
```

### `POST /api/v1/transactions/import`
- **Description**: Uploads CSV (`.csv`) or digital PDF (`.pdf`) statement file (multipart/form-data under key `file`). For PDFs, forwards file buffer to `ml-service` (`/parse/pdf-statement`) for `pdfplumber` text extraction and tabular parsing into canonical schema (`date`, `description`, `amount`, `direction`, `merchant`, `category`). Sanitizes records, performs duplicate fingerprinting, and returns row-level preview.
- **Supported PDF Statement Types (Tested Synthetic Samples)**:
  - Standard Bank Account Statement (`docs/sample_bank_statement.pdf`): tabular format with columns Date, Narration/Description, Chq/Ref No, Withdrawal, Deposit, Balance.
  - Standard Credit Card Statement (`docs/sample_credit_card_statement.pdf`): tabular format with columns Date, Description, Amount, CR/DR indicator.
- **Unsupported / Scanned PDFs**: Returns `422 Unprocessable Content` with message `"Scanned or image-only PDF detected. Text extraction requires a digital text PDF statement (OCR is not supported in v1)."`
- **Response `200 OK`**:
```json
{
  "importJobId": "6734a3f1c3d4e5f6a7b8c9d2",
  "filename": "sample_bank_statement.pdf",
  "counts": {
    "accepted": 15,
    "rejected": 0,
    "duplicates": 0,
    "totalRows": 15
  },
  "errors": [],
  "sampleAccepted": [
    {
      "date": "2026-03-01",
      "description": "Salary Credit - TechCorp India",
      "amount": 75000,
      "direction": "income",
      "merchant": "Techcorp India",
      "category": "Income",
      "source": "pdf",
      "isDuplicate": false
    }
  ],
  "sampleDuplicates": []
}
```

### `POST /api/v1/transactions/import/confirm`
- **Description**: Persists staged transactions from an import preview into the database, preserving provenance (`source: "csv" | "pdf"`).
- **Request Body**:
```json
{
  "importJobId": "6734a3f1c3d4e5f6a7b8c9d2",
  "includeDuplicates": false
}
```
- **Response `200 OK`**:
```json
{
  "message": "Transactions successfully imported",
  "importedCount": 15,
  "importJobId": "6734a3f1c3d4e5f6a7b8c9d2"
}
```

### `PATCH /api/v1/transactions/:id`
- **Description**: Updates category and flags `categorySource="user"` for active feedback loop retraining.
- **Request Body**:
```json
{
  "category": "Entertainment"
}
```

---

## 5. Analytics & Financial Health

### `GET /api/v1/analytics/summary`
- **Query Parameters**: `from` (optional), `to` (optional)
- **Response `200 OK`**:
```json
{
  "income": 285000,
  "expense": 143210,
  "net": 141790,
  "savingsRate": 49.75,
  "transactionCount": 450,
  "categoryTotals": [
    {
      "category": "Food & Dining",
      "amount": 28500,
      "count": 42,
      "percentage": 19.9
    },
    {
      "category": "Rent & Housing",
      "amount": 35000,
      "count": 3,
      "percentage": 24.4
    }
  ],
  "monthlyTrend": [
    {
      "month": "2026-01",
      "income": 95000,
      "expense": 48200,
      "net": 46800,
      "savingsRate": 49.26
    }
  ],
  "currency": "INR"
}
```

---

## 6. Forecasting

### `GET /api/v1/forecast?horizon=3`
- **Description**: Generates statistical cash-flow forecasts with confidence intervals, selected adaptively by history length with distinct error classification.
- **Mode Selection by History**:
  - `< 2 months` (including 1 month, >= 14 days): `mode="short_history"`, daily run-rate extrapolation with variation bounds, no Prophet, no fabricated backtest metrics.
  - `2–5 months`: `mode="monthly_baseline"` with widened confidence intervals (±2.5× std).
  - `>= 6 months`: `mode="monthly_standard"`, rolling-mean vs last-value vs Prophet with sequential time-based holdout evaluation.
- **Error States & Graceful Degradation**:
  - `status: "ml_unavailable"`: ML service cold-start / timeout; UI displays waking up message with retry button (`retryable: true`).
  - `status: "generation_failed"`: ML service 4xx response; UI displays generation failed message (`retryable: false`).
  - `status: "insufficient_data"`: Fewer than 14 days of history; UI displays exact days available vs 14 minimum required.
- **Response `200 OK` (Short-History Mode)**:
```json
{
  "available": true,
  "status": "ok",
  "forecast": {
    "available": true,
    "mode": "short_history",
    "confidence": "low",
    "modelUsed": "short_history_run_rate",
    "modelVersion": "1.0.0",
    "horizon": 3,
    "dataCoverage": {
      "firstDate": "2026-01-01",
      "lastDate": "2026-01-25",
      "days": 25
    },
    "values": [
      { "month": "2026-02", "value": 12000, "lower": 9000, "upper": 15000 },
      { "month": "2026-03", "value": 12000, "lower": 8000, "upper": 16000 },
      { "month": "2026-04", "value": 12000, "lower": 7000, "upper": 17000 }
    ],
    "runRateDaily": {
      "avgDailyIncome": 1500,
      "avgDailyExpense": 1100,
      "avgDailyNet": 400
    },
    "assumptions": [
      "Assumes spending continues at observed daily run-rate.",
      "One-off large items are not treated specially."
    ],
    "limitations": [
      "Based on only 25 days of data; seasonal cycles cannot be inferred."
    ],
    "warnings": [],
    "evaluation": "No backtest metric available for short-history mode."
  },
  "monthlyTrend": [
    { "month": "2026-01", "income": 37500, "expense": 27500, "net": 10000, "savingsRate": 26.7 }
  ],
  "dailyHistory": [
    { "date": "2026-01-01", "income": 1500, "expense": 800, "net": 700 }
  ]
}
```

---

## 7. Goals & Simulation

### `POST /api/v1/goals`
- **Request Body**:
```json
{
  "name": "Down Payment for Flat",
  "targetAmount": 1500000,
  "currentAmount": 350000,
  "targetDate": "2028-12-31",
  "category": "Housing",
  "monthlyContribution": 25000,
  "priority": "high"
}
```

### `POST /api/v1/goals/:id/score`
- **Description**: Runs 1,000-trial Monte Carlo simulation using historical cash-flow surplus with what-if scenario overrides.
- **Request Body**:
```json
{
  "monthlyContribution": 30000
}
```
- **Response `200 OK`**:
```json
{
  "goalId": "6734a4c1c3d4e5f6a7b8c9d3",
  "probabilityScore": 82,
  "band": "on_track",
  "requiredMonthly": 34848,
  "estimatedAvailable": 38500,
  "sipProjection": {
    "projectedCorpus": 1642850,
    "annualReturnAssumption": 10.0,
    "note": "Projection is based on mathematical assumptions and is not a guaranteed return."
  }
}
```

---

## 8. Insights & Anomalies

### `GET /api/v1/insights/anomalies`
- **Description**: Retrieves transactions flagged as expenditure spikes using Median + MAD robust z-scores ($z \ge 3.5$).
- **Response `200 OK`**:
```json
{
  "anomalies": [
    {
      "id": "6734a5d1c3d4e5f6a7b8c9d4",
      "period": "2026-03",
      "severity": "high",
      "explanation": "Expenditure of ₹18,400 at Reliance Digital is 4.2x above typical Shopping transactions (Median: ₹1,500).",
      "evidence": {
        "amount": 18400,
        "categoryMedian": 1500,
        "zScore": 4.21
      },
      "status": "open"
    }
  ]
}
```

### `PATCH /api/v1/insights/anomalies/:id`
- **Description**: User feedback marking (`status: "expected" | "incorrect" | "dismissed"`).

### `GET /api/v1/insights/recommendations`
- **Description**: Returns deterministic financial optimization rules (50/30/20 budget allocations, high-interest debt payoffs, emergency fund benchmarks).

---

## 9. Reminders & Recurring Commitments

### `GET /api/v1/reminders`
- **Description**: Returns active bill, subscription, and EMI reminders sorted by calendar due day.

### `POST /api/v1/reminders/detect`
- **Description**: Scans historical transactions for monthly repeating charges (cadence: 28–32 days) and registers them as reminders.

---

## 10. Conversational AI & RAG Chat

### `POST /api/v1/chat`
- **Description**: Financial conversational assistant powered by RAG over curated knowledge chunks with deterministic tool verification.
- **Headers**: `Content-Type: application/json`, `X-Requested-With: moneylens`
- **Request Body**:
```json
{
  "message": "How much did I spend on Dining in March?"
}
```
- **Response `200 OK`**:
```json
{
  "data": {
    "response": "According to your recorded transactions for March 2026, you spent ₹14,250 across 18 transactions in Food & Dining.",
    "toolsUsed": ["getCategorySpend"],
    "sources": [
      {
        "title": "Conscious Spending & Budget Tracking",
        "reference": "rag/knowledge/budgeting_50_30_20.md"
      }
    ],
    "disclaimer": "MoneyLens provides informational decision support and is not a SEBI-registered investment advisor."
  }
}
```

### `GET /api/v1/chat/history?page=1&limit=20`
- **Description**: Returns paginated chat message history for the authenticated user.

### `DELETE /api/v1/chat/history`
- **Description**: Purges all conversational message history for the current user.

---

## 11. ML Service Internal Endpoints (`ml-service`)

Protected by `X-Internal-Key` header for service-to-service communication.

### `POST /parse/pdf-statement`
- **Description**: Parses a digital bank or credit card statement PDF using `pdfplumber` text extraction, maps columns into the MoneyLens canonical transaction schema (`date`, `description`, `amount`, `direction`, `merchant`), and categorizes rows using the ML Categorizer pipeline.
- **Headers**: `X-Internal-Key: <INTERNAL_API_KEY>`
- **Request**: Multipart form data with key `file` (PDF file).
- **Security & Extraction Guarantees**:
  - Rejects non-PDF file formats with `400 Bad Request`.
  - Rejects password-protected/encrypted PDFs with `422 Unprocessable Content`.
  - Rejects scanned / image-only PDFs (`len(extracted_text) < 20`) with clear `422 Unprocessable Content`: `"Scanned or image-only PDF detected. Text extraction requires a digital text PDF statement (OCR is not supported in v1)."`
- **Response `200 OK`**:
```json
{
  "success": true,
  "statementType": "bank_statement",
  "totalExtracted": 15,
  "validRows": 15,
  "errorRows": 0,
  "transactions": [
    {
      "date": "2026-03-01",
      "description": "Salary Credit - TechCorp India",
      "merchant": "Techcorp India",
      "amount": 75000,
      "direction": "income",
      "type": "credit",
      "category": "Income",
      "categoryConfidence": 0.95,
      "needsReview": false,
      "modelVersion": "tfidf-lr-v1.0"
    }
  ],
  "errors": []
}
```
