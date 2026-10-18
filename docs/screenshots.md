# MoneyLens Visual Screens & User Interface Catalog

This document details all core application screens, their corresponding routes, visual layouts, key interactive components, and demonstration flows in **MoneyLens**.

---

## 1. Authentication & Onboarding

### 1.1 Login Screen (`/login`)
- **Route**: `/login`
- **Visual Design**: Sleek dark-mode card with backdrop glassmorphism, gradient brand mark (`MoneyLens`), email input with icon, password input with toggleable visibility, and "Sign In" button with loading state.
- **Key Elements**:
  - Email & password client-side schema validation (Zod).
  - Generic authentication failure callouts (anti-enumeration).
  - Rate-limit countdown notification on repeated failed attempts.
  - Link to `/register` and demo credentials hint.

### 1.2 Registration Screen (`/register`)
- **Route**: `/register`
- **Visual Design**: High-contrast modern signup card.
- **Key Elements**:
  - Full Name input.
  - Work/Personal Email input.
  - Password input with real-time policy checklist (min 8 chars, at least 1 letter, at least 1 number).
  - CSRF custom request header defense (`X-Requested-With`).
  - Automatic session cookie issuance and redirection to Onboarding.

### 1.3 Onboarding Flow (`/onboarding`)
- **Route**: `/onboarding`
- **Visual Design**: 3-step interactive onboarding wizard with progress tracker.
- **Key Elements**:
  - Step 1: Currency & Locale selection (INR ₹ default).
  - Step 2: Monthly savings target & emergency fund goals.
  - Step 3: Quick CSV upload drag-and-drop zone or "Explore with Demo Data" 1-click button.

---

## 2. Core Financial Intelligence Dashboards

### 2.1 Financial Overview Dashboard (`/dashboard`)
- **Route**: `/dashboard`
- **Visual Design**: Multi-column grid containing financial telemetry, KPI cards, and responsive SVG charts (Recharts).
- **Key Elements**:
  - **KPI Cards**: Total Income, Total Expenses, Net Savings, and Savings Rate % with monthly delta indicators.
  - **Spending Trend Chart**: Interactive Area Chart displaying income vs expense trajectories over time.
  - **Category Breakdown**: Donut / Pie Chart showing proportional expenditure (Food, Housing, Utilities, Transportation, Entertainment, Investment).
  - **Date Preset Selector**: Instant filter buttons (`30d`, `3m`, `6m`, `YTD`, `All`).
  - **Recent Transactions Widget**: Latest 5 ledger entries with category badges and click-to-edit drawer.
  - **Top Anomaly & Reminder Callouts**: Real-time alerts for impending dues or unusual spending surges.

### 2.2 Transactions Ledger & Categorization (`/transactions`)
- **Route**: `/transactions`
- **Visual Design**: High-density interactive data table with sticky header, pagination, and multi-filter toolbar.
- **Key Elements**:
  - **Search & Filters**: Full-text search (merchant/description), Direction filter (All, Income, Expense), Category dropdown.
  - **Needs Review Badge**: Amber warning tag for machine-learning predictions with confidence < 75%.
  - **Category Source Indicator**: Distinguishes `model`, `rules`, and `user` corrected categories.
  - **Inline Feedback Recategorization**: Dropdown to correct any category; automatically retrains system heuristics and sets source to `user`.
  - **Pagination Controls**: Previous/Next with page size selector (10, 25, 50).

### 2.3 CSV Statement Importer (`/import`)
- **Route**: `/import`
- **Visual Design**: Dual-stage upload and reconciliation workbench.
- **Key Elements**:
  - **Stage 1 (Upload)**: Drag-and-drop CSV zone with file format validation and 5MB size guard.
  - **Stage 2 (Preview & Deduplication)**: Preview table displaying parsed rows, detected categories, and duplicate candidates flagged by fingerprint hash (`date + amount + description`).
  - **Include Duplicates Toggle**: Checkbox allowing users to exclude or import flagged duplicate rows.
  - **Confirmation Action**: Persists transactions to MongoDB with batch categorization in under 200ms.

---

## 3. Advanced ML & AI Advisory Views

### 3.1 Cash Flow Forecasting (`/forecast`)
- **Route**: `/forecast`
- **Visual Design**: Predictive projection chart featuring historical data, forward forecast line, and confidence interval cones (80% and 95% uncertainty bands).
- **Key Elements**:
  - **Horizon Selector**: 30-day, 60-day, or 90-day predictive windows.
  - **Model Architecture Badge**: Indicates active forecasting engine (`Prophet Seasonality` or `Multi-Window Rolling Mean Fallback`).
  - **Projected Net Cash Balance**: Summary card estimating future cash position at the end of the selected horizon.

### 3.2 Financial Goals & What-If Simulator (`/goals`)
- **Route**: `/goals`
- **Visual Design**: Goal progress cards with animated radial progress bars and an interactive what-if calculation drawer.
- **Key Elements**:
  - **Goal Card**: Target name (e.g. Emergency Fund, New Car), target amount, accumulated savings, and deadline.
  - **Goal Health Score**: 0 to 100 numerical score categorized into color-coded bands:
    - `Excellent` (80–100, Green)
    - `Good` (65–79, Blue)
    - `At Risk` (40–64, Amber)
    - `Critical` (0–39, Rose)
  - **What-If Simulation Slider**: Real-time slider adjusting monthly contribution or target date to immediately observe score change and required SIP amount.

### 3.3 Anomaly Detection Hub (`/anomalies`)
- **Route**: `/anomalies`
- **Visual Design**: Security and anomaly feed with severity badges (Critical, Warning, Notice).
- **Key Elements**:
  - Displays outliers identified by Isolation Forest and Category-IQR engines.
  - Contextual explanation (e.g., *"₹18,500 is 340% higher than your median Food expenditure of ₹450"*).
  - Feedback action buttons: `Mark as Expected`, `Incorrect Detection`, `Dismiss`.

### 3.4 Smart Recommendations (`/recommendations`)
- **Route**: `/recommendations`
- **Visual Design**: Categorized action cards with financial impact metrics.
- **Key Elements**:
  - Rule-based financial health advice based on 50/30/20 guidelines, debt-to-income ratios, and subscription audits.
  - Estimated potential monthly savings attached to each recommendation.

### 3.5 Grounded Financial AI Chatbot (`/chat`)
- **Route**: `/chat`
- **Visual Design**: Real-time conversational interface with streaming markdown, financial disclaimer banner, and evidence attribution drawers.
- **Key Elements**:
  - **Grounded Responses**: Context injected from user's personal aggregations and curated vector knowledge.
  - **Attribution Drawer**: Expandable pills showing exact source knowledge documents (e.g. `[budgeting_50_30_20.md]`, `[emergency_fund.md]`).
  - **Disclaimer Callout**: Educational disclaimer clarifying non-SEBI registered advice.
  - **Outage Fallback**: If Groq LLM is unreachable, returns deterministic grounded financial excerpts without crashing.

---

## 4. User Profile & Data Sovereignty

### 4.1 Settings & Account Management (`/settings`)
- **Route**: `/settings`
- **Visual Design**: Tabbed settings interface for preferences, privacy, and account security.
- **Key Elements**:
  - **Profile Information**: Name and email display.
  - **One-Click Data Export**: Download full transaction ledger as `.csv` or entire user account data as `.json` (GDPR compliance).
  - **Permanent Account Deletion (Danger Zone)**: Red-bordered modal requiring confirmation to cascade delete user and all transactions, goals, and chat messages.
