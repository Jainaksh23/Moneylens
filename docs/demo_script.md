# MoneyLens 10-Minute Capstone Demonstration Script

This script provides a structured, minute-by-minute guide for evaluating or demonstrating the MoneyLens financial intelligence application. It covers end-to-end features, technical highlights, architectural boundaries, and an explicit **failure-state demonstration**.

---

## ⏱️ Demonstration Timeline Overview

| Minute | Segment | Focus Area |
| :---: | :--- | :--- |
| **00:00 – 01:00** | **Perimeter Architecture** | System topology, container security, zero client vector leakage |
| **01:00 – 02:30** | **Onboarding & CSV Ingestion** | Drag-and-drop import, deduplication, ML categorizer preview |
| **02:30 – 03:30** | **Active Learning Feedback** | One-click category correction, feedback loop (`categorySource="user"`) |
| **03:30 – 05:00** | **Financial Health Dashboard** | Income, expense, net savings rate, 50/30/20 category allocations |
| **05:00 – 06:30** | **Forecasting & Goal Simulation** | 3-month forecast, Monte Carlo goal simulation, what-if sliders |
| **06:30 – 07:30** | **Anomalies & Recurring Reminders**| Robust MAD anomaly detection, marking "expected", bill detection |
| **07:30 – 08:30** | **Grounded Financial Chat (RAG)** | Tool-verified Q&A, source citation chips, non-advice disclaimer |
| **08:30 – 09:30** | **Failure-State Demonstration** | Simulating LLM provider outage; verifying deterministic resilience |
| **09:30 – 10:00** | **Privacy & Cascade Deletion** | CAS CSV/JSON data export, single-click permanent purge |

---

## 🎙️ Step-by-Step Script & Narration

### Minute 00:00 – 01:00 | System Architecture & Perimeter
- **Screen**: Display the Architecture Diagram (from README) or landing page.
- **Presenter Narrative**:
  > *"Welcome to MoneyLens. MoneyLens is a privacy-first personal financial intelligence system engineered specifically for Indian salaried professionals and household budgets. Before looking at features, note our perimeter architecture:
  > 1. All services run in isolated Docker containers with non-root security.
  > 2. The client browser communicates exclusively through our Nginx reverse proxy on port 5173, which forwards API calls to our Express gateway on port 5000.
  > 3. User financial data is NEVER converted to vector embeddings or uploaded to public AI models. All sensitive computations are strictly isolated in local databases."*
- **Action**: Open browser at `http://localhost:5173`. Click **"Create Account"**.

---

### Minute 01:00 – 02:30 | Ingestion & ML Categorization Preview
- **Screen**: Registration Page → Transactions Page → Import CSV Modal.
- **Presenter Narrative**:
  > *"Let's register an account and ingest a real-world multi-month bank statement. We'll drag and drop our sample CSV containing 670 transactions spanning salary credits, UPI dining, groceries, rent, and investments."*
- **Actions**:
  1. Register with email `demo.user@moneylens.internal`, password `Password123!`, name `Demo User`.
  2. Navigate to **Transactions** → Click **"Import CSV"**.
  3. Drag and drop [`docs/sample_transactions.csv`](file:///d:/Moneylens/docs/sample_transactions.csv).
- **What Evaluators See**:
  - The preview table parses all 670 rows instantly.
  - The Scikit-Learn TF-IDF model categorizes Indian narratives with high confidence (e.g. `Swiggy` → `Food & Dining`, `Zepto` → `Groceries`, `Infosys` → `Income`).
  - Zero duplicate rows detected on first import.
- **Action**: Click **"Confirm Import"**. Notice instant persistence.

---

### Minute 02:30 – 03:30 | User-in-the-Loop Active Learning
- **Screen**: Transactions Ledger.
- **Presenter Narrative**:
  > *"Machine learning models shouldn't act like black boxes. In MoneyLens, low-confidence predictions are flagged for review. More importantly, whenever a user manually edits a transaction category, MoneyLens flags it as `categorySource="user"`. This protects user preferences from being overridden and feeds directly into our offline retraining pipeline."*
- **Actions**:
  1. Filter transactions by `Shopping`. Click on an item (e.g. `Amazon Prime Video Subscription`).
  2. Change category from `Shopping` to `Entertainment`.
  3. Click **"Save Changes"**.
- **What Evaluators See**:
  - Badge updates to `Entertainment` with an indicator showing user-confirmed origin.
  - Aggregations and category totals update immediately.

---

### Minute 03:30 – 05:00 | Financial Health Dashboard
- **Screen**: Dashboard Page (`/dashboard`).
- **Presenter Narrative**:
  > *"The dashboard delivers an immediate financial snapshot. Here we see our computed total income of ₹2,85,000, expenses of ₹1,43,210, and a healthy savings rate of nearly 50%. The category doughnut breakdown visualizes spending distribution across Indian expenditure heads."*
- **Actions**:
  1. Hover over the **Category Breakdown** doughnut chart to show Food, Rent, and Utilities percentages.
  2. Scroll through the **Monthly Trend** chart showing income vs expense across sequential calendar months.

---

### Minute 05:00 – 06:30 | Forecasting & Monte Carlo Goal What-If
- **Screen**: Forecast Page & Goals Page (`/forecast`, `/goals`).
- **Presenter Narrative**:
  > *"Next, we look at forward-looking planning. Our forecasting engine computes a 3-month moving surplus trajectory with statistical upper and lower confidence intervals.
  > Let's create an 'Emergency Fund' goal of ₹3,00,000 and run a live 1,000-trial Monte Carlo simulation to evaluate feasibility."*
- **Actions**:
  1. Go to **Goals** → Click **"Add Goal"**.
  2. Input: Name = `Emergency Fund`, Target = `300000`, Current = `60000`, Date = `2027-12-31`, Monthly Contribution = `8000`.
  3. View the generated score badge: `on_track` with an 84% probability score.
  4. Open the **What-If Simulator**: Adjust monthly contribution slider from `₹8,000` to `₹12,000`.
- **What Evaluators See**:
  - The probability score increases dynamically, showing the required monthly amount without compounding and displaying the optional SIP compounding projection with clear assumption disclaimers.

---

### Minute 06:30 – 07:30 | Anomaly Detection & Recurring Bills
- **Screen**: Anomalies & Reminders (`/anomalies`, `/reminders`).
- **Presenter Narrative**:
  > *"Instead of noisy alerts based on simple mean/std deviation, MoneyLens uses Median Absolute Deviation (MAD) robust z-scores ($z \ge 3.5$) to detect true spikes while avoiding outlier skew. Let's inspect an alert and provide feedback."*
- **Actions**:
  1. Navigate to **Anomalies**: Point to the flagged large electronic purchase.
  2. Click **"Mark as Expected"**. Status updates to `expected` and removes the alert banner.
  3. Navigate to **Reminders**: Point to the automated recurring commitments (e.g. Cult.fit monthly gym membership and HDFC EMI).

---

### Minute 07:30 – 08:30 | Grounded Conversational AI Assistant (RAG)
- **Screen**: Chat Page (`/chat`).
- **Presenter Narrative**:
  > *"The MoneyLens AI assistant does not invent numbers. It uses Retrieval-Augmented Generation over curated Indian financial literature and invokes deterministic backend tools to query user data."*
- **Actions**:
  1. Ask: *"What is the 50/30/20 budgeting rule and how am I doing?"*
  2. Ask: *"How much did I spend on Dining in March?"*
- **What Evaluators See**:
  - The assistant cites approved educational markdown documents (`rag/knowledge/budgeting_50_30_20.md`).
  - It queries `getCategorySpend` for exact numbers and displays a regulatory non-advice disclaimer.

---

### Minute 08:30 – 09:30 | Failure-State Demonstration & Graceful Degradation
- **Screen**: Browser DevTools / Terminal + Application Dashboard.
- **Presenter Narrative**:
  > *"A critical software engineering requirement for financial applications is resilience under dependency failures. What happens when the external LLM provider experiences an outage, network disconnect, or invalid API key?"*
- **Demonstration Steps**:
  1. In the chat interface, send a message while simulating an offline LLM state (or with an unset Groq API key).
  2. The chat assistant does **not crash** the page; it renders an informative fallback message:
     *"AI Conversational Service is currently operating in offline mode. Core financial calculations remain fully active."*
  3. Navigate back to **Dashboard**, **Transactions**, **Forecast**, and **Goals**.
- **What Evaluators See**:
  - Every deterministic feature (analytics summary, transaction lists, category math, Monte Carlo goal calculations, and CSV exports) continues functioning with 100% precision. The application never fails catastrophically due to AI provider downtime.

---

### Minute 09:30 – 10:00 | Privacy Controls & Right to be Forgotten
- **Screen**: Settings Page (`/settings`).
- **Presenter Narrative**:
  > *"Finally, we demonstrate data sovereignty and privacy. The user has full control to export their entire ledger and permanently erase their footprint."*
- **Actions**:
  1. Click **"Export CSV"** and **"Export JSON"** to download personal records.
  2. Click **"Delete Account & All Data"** → Confirm modal prompt.
- **What Evaluators See**:
  - The backend executes a complete cascade deletion across all 7 MongoDB collections.
  - The session cookie is purged, redirecting to the login screen with a confirmation banner.
  - Zero ghost records remain in the system.
