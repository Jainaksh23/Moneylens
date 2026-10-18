# MoneyLens — Phase 3 Implementation Report: Transactions Domain, CSV Import & Analytics

## Executive Summary
Phase 3 delivers the complete Transactions domain for MoneyLens:
1. **Backend Mongoose Data Models**: Securely scoped by `userId` and indexed for low-latency pagination, queries, and analytics.
2. **Deterministic Rules & Deduplication Engine**:
   - Single sign/direction normalization (strictly positive amounts, avoiding double-negation).
   - `Asia/Kolkata` timezone enforcement for midnight timestamps.
   - SHA-256 fingerprinting (`userId + date + amount + normalizedMerchant`) flagging duplicates without silent deletion.
   - Rule-based keyword categorization for Indian merchants with fallback to `unknown`.
3. **Two-Step CSV Import Engine**: Preview with row-level validation (accepted, rejected, duplicates) followed by user confirmation under a strict rate limiter.
4. **Financial Analytics Service**: Dynamic aggregation calculating total income, expenses, net cash-flow, savings rate, category breakdowns, and monthly trends.
5. **Synthetic Indian Dataset**: Seeded, reproducible Python script generating 669 realistic transactions spanning 12 months.
6. **Frontend Experience**:
   - **Import Page**: Template download, multi-stat cards, preview table with filter tabs, and confirmation.
   - **Transactions Page**: Search, multi-filtering, sorting, pagination, manual creation, and category feedback modal.
   - **Dashboard v1**: Summary metric cards, Recharts category breakdown donut chart, monthly trend bar chart, date filters, and explicit distinctions between loading skeletons, zero activity, and fetch error states.
7. **Quality Assurance**: 32/32 tests passing across all test suites, plus end-to-end sample CSV import verification.

---

## 1. Architecture & Domain Models

### 1.1 `Transaction` Model (`backend/src/models/Transaction.ts`)
| Field | Type | Description |
| :--- | :--- | :--- |
| `userId` | `ObjectId` (ref: `User`) | Scoped owner, strictly enforced across all operations |
| `date` | `Date` | Normalized midnight `Asia/Kolkata` timestamp |
| `amount` | `Number` | Strictly positive number (`amount > 0`) |
| `currency` | `String` | Default `"INR"` |
| `direction` | `"income" \| "expense"` | Single normalized direction |
| `merchant` | `String` | Cleaned merchant name, defaults to `"unknown"` |
| `description` | `String` | User-provided or statement description |
| `category` | `String` | Financial category (e.g. `"Groceries"`, `"Food & Dining"`) |
| `categorySource`| `"model" \| "user" \| "rule" \| "unknown"` | Audit trail for categorization source |
| `categoryConfidence` | `Number` | Confidence score between 0.0 and 1.0 |
| `modelVersion` | `String` | Optional model version identifier |
| `source` | `"manual" \| "csv"` | Origin of the transaction |
| `fingerprint` | `String` | SHA-256 hash: `userId:YYYY-MM-DD:amount:merchant` |
| `isDuplicate` | `Boolean` | Flag indicating duplicate collision with existing records |

**Compound Indexes**:
- `{ userId: 1, date: -1 }` (default chronological feed)
- `{ userId: 1, fingerprint: 1 }` (instant duplicate candidate check)
- `{ userId: 1, category: 1 }` (category filtering)
- `{ userId: 1, direction: 1 }` (income vs. expense filtering)

### 1.2 `ImportJob` Model (`backend/src/models/ImportJob.ts`)
Maintains an audit trail of CSV uploads without storing raw statement contents:
- `userId`: Owner of the upload.
- `filename`: Uploaded file name.
- `status`: `"pending" | "processing" | "preview" | "confirmed" | "failed"`.
- `counts`: `{ totalRows, accepted, rejected, duplicates }`.
- `errors`: Array of `{ rowNumber, rawRow, reason }` ensuring invalid rows are reported rather than dropped silently.
- `startedAt` & `completedAt`: Timestamps.

---

## 2. API Endpoints Under `/api/v1`

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/transactions` | Paginated listing with `page`, `pageSize`, `from`, `to`, `category`, `direction`, `q`, and `sort` |
| `POST` | `/transactions` | Create manual transaction (rule categorization + duplicate detection) |
| `PATCH` | `/transactions/:id` | Edit transaction or correct category (`categorySource: "user"`) |
| `DELETE` | `/transactions/:id` | Delete transaction with strict user ownership verification |
| `POST` | `/transactions/import` | Two-step preview: validates CSV, detects duplicates, stages job |
| `POST` | `/transactions/import/confirm` | Commits previewed transactions with optional duplicate inclusion |
| `GET` | `/analytics/summary` | Aggregates income, expense, net, savings rate, categories, & monthly trend |

---

## 3. Seeded Synthetic Indian Dataset

- **Generator Script**: `docs/generate_synthetic_data.py`
  - Random seed fixed to `42` for exact reproducibility.
  - Generates realistic Indian spending behavior across 12 calendar months.
  - Major merchants: Swiggy, Zomato, Zepto, Blinkit, BigBasket, Uber, Ola, IRCTC, Amazon, Flipkart, Jio, Airtel, Netflix, Spotify, Tata Power, BESCOM, HDFC Home Loan EMI, Salary credit, Zerodha SIP, etc.
- **Output File**: `docs/sample_transactions.csv`
  - Total records: **669 rows**
  - Columns: `date,description,amount,type,merchant`

---

## 4. Verification & Test Suite Results

### 4.1 Jest & Supertest Suite (`backend/tests/transactions.test.ts`)
Ran full suite with 100% pass rate:
```text
Test Suites: 3 passed, 3 total
Tests:       32 passed, 32 total
Snapshots:   0 total
Time:        38.935 s
```

#### Test Coverage Matrix:
- `POST /api/v1/transactions` validation: rejects negative/zero amounts and missing descriptions.
- Manual transaction creation: rule categorizer automatically assigns category & source.
- Duplicate detection: flags collisions based on SHA-256 fingerprint.
- **Ownership Isolation**: Confirms User B receives `404 NOT_FOUND` when attempting to read, update, or delete User A's transactions.
- Pagination & Filters: Validates `page`, `pageSize`, `direction`, and full-text keyword search `q`.
- Category Feedback: Verifies `PATCH /transactions/:id` persists recategorization with `categorySource: "user"`.
- Import Preview & Confirm: Exercises multi-row CSV upload, duplicate flagging, and batch insertion.
- Analytics Aggregation: Verifies income, expense, net cash-flow, savings rate formula, and category breakdown against a deterministic fixed fixture.

### 4.2 End-to-End Sample CSV Ingestion (`docs/verify_import_e2e.ts`)
Executed live against the running backend server:
```text
--- Phase 3 E2E Sample CSV Import Verification ---
1. Registering test user: test.e2e.1791995849647@example.com
✓ User registered and auth cookie received.
2. Uploading sample CSV from: D:\Moneylens\docs\sample_transactions.csv
✓ CSV Preview Results:
   - Total Rows: 669
   - Accepted: 669
   - Duplicates: 0
   - Rejected: 0
   - Import Job ID: 6acfafca454a014ca400021f
3. Confirming import...
✓ Confirmed: 669 transactions imported.
4. Financial Analytics Summary:
   - Total Income: ₹12,58,249.27
   - Total Expenses: ₹14,03,486.53
   - Net Cash-Flow: ₹-1,45,237.26
   - Savings Rate: -11.5%
   - Transaction Count: 669
   - Top Categories (10):
     * Housing: ₹2,64,000 (18.8%)
     * Debt & Loans: ₹2,22,000 (15.8%)
     * Shopping: ₹1,84,550 (13.1%)
     * Investments: ₹1,80,000 (12.8%)
     * Transportation: ₹1,57,634 (11.2%)
   - Months in Trend: 12 months
5. Testing Search and Recategorization Feedback...
   - First Item: "Nature's Basket Organic Fruits & Cheese" | Category: "Groceries" (rule)
   - Updated Category: "Housing" (user)

🎉 ALL PHASE 3 END-TO-END ACCEPTANCE CHECKS PASSED SUCCESSFULLY!
```

---

## 5. Frontend Screens & Components

1. **Import Page** (`frontend/src/pages/ImportPage.tsx`):
   - Drag-and-drop / file selector supporting `.csv`.
   - "Download Template" button exporting compliant sample header and example rows.
   - Dynamic stage indicator: Step 1 (Upload & Validate) -> Step 2 (Preview & Review) -> Step 3 (Confirmation).
   - Metric badge cards: Accepted, Duplicate Candidates, Rejected Rows.
   - Filter tabs allowing inspection of accepted vs duplicate vs rejected items with specific error reasons.
   - Option to include/exclude duplicate candidates on confirmation.

2. **Transactions Page** (`frontend/src/pages/TransactionsPage.tsx`):
   - Real-time search by keyword (`q`).
   - Direction filter (All, Income, Expense) and Category dropdown.
   - Sort selector (Newest, Oldest, Amount: High to Low, Amount: Low to High).
   - "Add Transaction" modal for manual entries.
   - "Edit / Recategorize" modal displaying origin audit info and saving user feedback.
   - Delete confirmation with instant optimistic state update.
   - Paginated footer with record range display and previous/next navigation.

3. **Dashboard v1** (`frontend/src/pages/DashboardPage.tsx`):
   - Financial KPI Summary cards: Total Income, Total Expenses, Net Cash-Flow, Savings Rate.
   - Recharts Donut chart visualizing top expense categories with percentage badges.
   - Recharts Dual-bar chart visualizing monthly cash inflow vs outflow across 12 months.
   - Date range selector presets (30 Days, 90 Days, 6 Months, 12 Months, All Time).
   - High-fidelity state management:
     - **Loading Skeleton**: Shimmer cards and chart skeletons during data retrieval.
     - **Zero Activity Empty State**: Welcomes new users and provides a direct CTA to "Import Your First Statement".
     - **Error State**: Displays informative error message with a "Retry" button, distinguishing server/network errors from empty datasets.
