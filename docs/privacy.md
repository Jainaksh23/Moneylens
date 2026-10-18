# MoneyLens Privacy, Security & Data Retention Policy

This document outlines the privacy architecture, zero-leakage security controls, data retention schedule, export mechanisms, and complete account deletion guarantees for MoneyLens.

---

## 1. Zero-Leakage Architecture (Embeddings-Free User Data)

MoneyLens guarantees strict user isolation and privacy:
- **No Vector Embeddings of User Financial Data**: User financial transactions, accounts, merchant details, account balances, and amounts are **NEVER converted into vector embeddings** and are **NEVER saved in ChromaDB or external vector stores**.
- **Tenant Isolation**: All personal financial records (transactions, goals, insights, reminders, chat messages) are stored with a strict `userId` reference and enforced by server-side authentication middleware (`authMiddleware`). Cross-user access is impossible.
- **RAG Architecture with Ephemeral Sandboxing**: In RAG-driven queries, financial data is queried on-demand and supplied only as short-lived, transient context in memory for the single turn. Financial knowledge chunks in vector stores contain strictly curated, generic Indian financial literacy concepts (e.g. RBI regulations, tax sections, standard budgeting rules) and zero customer records.
- **No Third-Party AI Model Training**: User data is never transmitted to train external third-party foundational LLMs or shared with advertising platforms.

---

## 2. Data Retention & Lifecycle Schedule

| Data Category | Collection / Model | Retention Period | Storage Location | Purge Trigger |
| :--- | :--- | :--- | :--- | :--- |
| **User Profile** | `User` | Active membership duration | MongoDB (`users`) | Immediate on `DELETE /api/v1/me` |
| **Transactions & Statements** | `Transaction` | Kept until user deletes or uploads new set | MongoDB (`transactions`) | Immediate on `DELETE /api/v1/me` |
| **Financial Goals & SIP Plans**| `Goal` | Active until goal achieved or deleted | MongoDB (`goals`) | Immediate on `DELETE /api/v1/me` |
| **Intelligence & Anomalies** | `Insight` | Rolling 12 months or user dismiss | MongoDB (`insights`) | Immediate on `DELETE /api/v1/me` |
| **Bills & EMI Reminders** | `Reminder` | Active recurring cycle | MongoDB (`reminders`) | Immediate on `DELETE /api/v1/me` |
| **Assistant Chat History** | `ChatMessage` | Retained for conversation context | MongoDB (`chatmessages`) | Immediate on user clear or `DELETE /api/v1/me` |
| **CSV Import Staging Jobs** | `ImportJob` | Purged automatically after 24 hours | MongoDB (`importjobs`) | 24-hr TTL or `DELETE /api/v1/me` |

---

## 3. Data Portability & Self-Service Export (`/api/v1/me/export`)

MoneyLens upholds your right to data portability. You can export your data at any time from **Settings → Export Data** or via the authenticated REST API:

- **CSV Transaction Export (`GET /api/v1/me/export?format=csv`)**:
  Downloads a clean, UTF-8 CSV containing all recorded transactions (`Date, Amount, Currency, Direction, Merchant, Description, Category, CategorySource, Source`).
- **Comprehensive JSON Export (`GET /api/v1/me/export?format=json`)**:
  Downloads a structured JSON bundle containing:
  - User profile and preferences
  - Complete transaction ledger
  - All financial goals with target dates and contributions
  - Insights, anomalies, and recommendations
  - Upcoming reminders and EMI schedules
  - Complete AI chat assistant conversation logs

---

## 4. Right to Erasure & Account Deletion (`DELETE /api/v1/me`)

MoneyLens provides a permanent, single-click "Right to be Forgotten":
1. **Cascade Purge**: When you confirm deletion in **Settings → Delete Account & Data** (or via `DELETE /api/v1/me`), our backend executes a transactional cascade delete across all personal collections:
   - All transactions
   - All goals and SIP calculators
   - All anomalies and recommendation records
   - All recurring reminders
   - All chat history and conversation threads
   - All temporary import staging jobs
   - Your user identity record
2. **Session Eviction**: The secure `moneylens_token` httpOnly cookie is cleared immediately.
3. **No Ghost Backups**: Backups expire following our encrypted snapshot rotation lifecycle.

---

## 5. Security & Transport Controls

- **Authentication**: Stateless signed JWT stored exclusively in secure, `httpOnly`, `SameSite=Lax` cookies.
- **CSRF Defense**: State-changing requests enforce strict custom header validation (`X-Requested-With: moneylens`).
- **Rate Limiting**: Protects login, registration, and chat endpoints against brute-force attacks and abuse.
- **Input Sanitization**: Strict schema validation via Zod on all endpoints.
