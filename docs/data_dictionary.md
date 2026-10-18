# MoneyLens Data Dictionary & Schema Specification

This document provides the complete data dictionary for all persistent entities in the MoneyLens ecosystem, including MongoDB collections and ChromaDB vector embeddings.

---

## 🗄️ MongoDB Collections

### 1. `users` Collection (`User` Model)
Stores authenticated user accounts, encrypted credentials, and regional presentation preferences.

| Field | BSON Type | Required | Default | Indexed | Constraints / Valid Values | Description |
| :--- | :--- | :---: | :---: | :---: | :--- | :--- |
| `_id` | ObjectId | Yes | Auto | Primary | 24-character hexadecimal | Unique user identifier |
| `email` | String | Yes | None | Unique | Lowercase, valid email regex | User login email address |
| `passwordHash` | String | Yes | None | No | Bcrypt hash (cost: 12) | Salted password hash. Never returned in API responses. |
| `name` | String | Yes | None | No | Trimmed, 1–100 chars | Full display name |
| `preferences.currency` | String | No | `"INR"` | No | Standard ISO-4217 code (`INR`, `USD`, `EUR`, `GBP`) | Currency symbol used for calculations |
| `preferences.dateFormat` | String | No | `"DD/MM/YYYY"` | No | `"DD/MM/YYYY"`, `"YYYY-MM-DD"` | Date formatting pattern across UI |
| `createdAt` | Date | Yes | Auto | No | UTC timestamp | Account registration timestamp |
| `updatedAt` | Date | Yes | Auto | No | UTC timestamp | Last account update timestamp |

---

### 2. `transactions` Collection (`Transaction` Model)
The primary ledger of financial inflows and outflows.

| Field | BSON Type | Required | Default | Indexed | Constraints / Valid Values | Description |
| :--- | :--- | :---: | :---: | :---: | :--- | :--- |
| `_id` | ObjectId | Yes | Auto | Primary | Hexadecimal | Transaction identifier |
| `userId` | ObjectId | Yes | None | Yes | Ref `User` | Tenant owner identifier |
| `date` | Date | Yes | None | Yes | Valid Date | Date transaction occurred |
| `amount` | Number | Yes | None | No | Positive float, min 0.01 | Transaction value in account currency |
| `currency` | String | No | `"INR"` | No | 3-letter currency code | Transaction currency |
| `direction` | String | Yes | None | Yes | `"income"` \| `"expense"` | Cash flow direction |
| `merchant` | String | No | `""` | No | Trimmed string | Merchant, vendor, or employer name |
| `description` | String | Yes | None | Yes (Text) | Trimmed string | Bank statement description or narration |
| `category` | String | Yes | `"Other"` | Yes | 14 standard categories | Expenditure category |
| `categorySource` | String | Yes | `"unknown"` | No | `"model"` \| `"user"` \| `"rule"` \| `"unknown"` | Origin of the category assignment |
| `categoryConfidence` | Number | No | `null` | No | Float between 0.0 and 1.0 | Model prediction probability |
| `modelVersion` | String | No | `null` | No | Version string (e.g. `"v1.0.0"`) | Model version that made the prediction |
| `source` | String | Yes | `"manual"` | No | `"manual"` \| `"csv"` | Method of transaction creation |
| `fingerprint` | String | Yes | None | Compound | SHA-256 hash | Deduplication hash (`date + amount + description`) |
| `isDuplicate` | Boolean | No | `false` | No | Boolean | Flag set when duplicate hash is found |
| `needsReview` | Boolean | No | `false` | Yes | Boolean | Flagged true when model confidence < 0.55 |
| `createdAt` | Date | Yes | Auto | No | UTC timestamp | Record creation timestamp |
| `updatedAt` | Date | Yes | Auto | No | UTC timestamp | Record modification timestamp |

**Indexes**:
- `{ userId: 1, date: -1 }`: Fast historical time-range queries.
- `{ userId: 1, fingerprint: 1 }`: Fast duplicate detection.
- `{ userId: 1, needsReview: 1 }`: Quick retrieval of transactions awaiting user review.

---

### 3. `importjobs` Collection (`ImportJob` Model)
Ephemeral staging store for multi-step CSV file uploads and previews.

| Field | BSON Type | Required | Default | Description |
| :--- | :--- | :---: | :---: | :--- |
| `_id` | ObjectId | Yes | Auto | Unique staging job identifier |
| `userId` | ObjectId | Yes | None | Tenant owner identifier |
| `filename` | String | Yes | None | Original uploaded file name |
| `status` | String | Yes | `"preview"` | `"preview"` \| `"completed"` \| `"failed"` |
| `counts.accepted` | Number | Yes | 0 | Count of valid new rows |
| `counts.rejected` | Number | Yes | 0 | Count of rows with formatting or parse errors |
| `counts.duplicates` | Number | Yes | 0 | Count of identified duplicate rows |
| `errors` | Array[Object] | No | `[]` | List of line-numbered validation errors |
| `previewTransactions`| Array[Object] | Yes | `[]` | Staged parsed rows with ML categorization suggestions |
| `startedAt` | Date | Yes | Auto | Job creation timestamp (auto-expires in 24h) |

---

### 4. `goals` Collection (`Goal` Model)
Tracks financial savings goals and computes Monte Carlo achievability scores.

| Field | BSON Type | Required | Default | Description |
| :--- | :--- | :---: | :---: | :--- |
| `_id` | ObjectId | Yes | Auto | Goal identifier |
| `userId` | ObjectId | Yes | None | Ref `User` |
| `name` | String | Yes | None | Name of financial target (e.g., "Emergency Fund") |
| `targetAmount` | Number | Yes | None | Total target corpus in INR |
| `currentAmount` | Number | No | 0 | Amount accumulated so far |
| `targetDate` | Date | Yes | None | Target deadline date |
| `category` | String | Yes | `"Other"` | Goal category (e.g., "Emergency Fund", "Housing", "Retirement") |
| `monthlyContribution`| Number | No | 0 | Planned recurring monthly deposit |
| `priority` | String | No | `"medium"` | `"low"` \| `"medium"` \| `"high"` |
| `status` | String | No | `"active"` | `"active"` \| `"achieved"` \| `"paused"` |

---

### 5. `insights` Collection (`Insight` Model)
Stores detected expenditure anomalies and rule-based savings recommendations.

| Field | BSON Type | Required | Default | Description |
| :--- | :--- | :---: | :---: | :--- |
| `_id` | ObjectId | Yes | Auto | Insight identifier |
| `userId` | ObjectId | Yes | None | Ref `User` |
| `type` | String | Yes | None | `"anomaly"` \| `"recommendation"` \| `"recurring"` |
| `period` | String | Yes | None | Applicable monthly period (e.g. `"2026-03"`) |
| `severity` | String | No | `"medium"` | `"low"` \| `"medium"` \| `"high"` |
| `explanation` | String | Yes | None | Human-readable explanation of the finding |
| `evidence` | Object | Yes | `{}` | Key-value metrics ($z$-score, median, actual amount) |
| `status` | String | No | `"open"` | `"open"` \| `"expected"` \| `"incorrect"` \| `"dismissed"` |
| `modelVersion` | String | No | `"v1.0.0"` | Detection algorithm version |

---

### 6. `reminders` Collection (`Reminder` Model)
Tracks upcoming monthly commitments, bills, and EMI schedules.

| Field | BSON Type | Required | Default | Description |
| :--- | :--- | :---: | :---: | :--- |
| `_id` | ObjectId | Yes | Auto | Reminder identifier |
| `userId` | ObjectId | Yes | None | Ref `User` |
| `title` | String | Yes | None | Description of bill (e.g. "HDFC Home Loan EMI") |
| `amount` | Number | Yes | None | Monthly recurring amount in INR |
| `dueDay` | Number | Yes | None | Day of month (1 to 31) when payment is due |
| `nextDueDate` | Date | No | Calculated | Calculated timestamp of the next occurrence |
| `category` | String | No | `"Bills & Utilities"`| Expense category |
| `type` | String | No | `"bill"` | `"bill"` \| `"subscription"` \| `"emi"` |
| `isAutoDetected` | Boolean | No | `false` | True if discovered by ML recurring scan |
| `status` | String | No | `"active"` | `"active"` \| `"dismissed"` \| `"confirmed"` |

---

### 7. `chatmessages` Collection (`ChatMessage` Model)
Persists user queries and grounded assistant responses.

| Field | BSON Type | Required | Default | Description |
| :--- | :--- | :---: | :---: | :--- |
| `_id` | ObjectId | Yes | Auto | Message identifier |
| `userId` | ObjectId | Yes | None | Ref `User` |
| `role` | String | Yes | None | `"user"` \| `"assistant"` \| `"system"` |
| `content` | String | Yes | None | Text content of query or response |
| `toolsUsed` | Array[String]| No | `[]` | Deterministic tools invoked (e.g. `getCategorySpend`) |
| `sources` | Array[Object]| No | `[]` | Citing educational markdown chunks with references |
| `timestamp` | Date | Yes | Auto | Message creation timestamp |

---

## 🧠 ChromaDB Vector Collection (`KnowledgeChunk`)

The ML subsystem utilizes a standalone, persistent ChromaDB collection for generic financial education literature.

| Attribute | Type | Description |
| :--- | :--- | :--- |
| `id` | String | Unique document chunk identifier (e.g., `budgeting_50_30_20_chunk_01`) |
| `document` | String | Cleaned textual markdown content of the educational paragraph |
| `embedding` | Vector (384-dim) | Dense vector generated by ONNX `all-MiniLM-L6-v2` transformer |
| `metadata.title` | String | Title of topic (e.g., "50/30/20 Budgeting Rule") |
| `metadata.category` | String | Financial topic domain (e.g., `budgeting`, `tax`, `investing`, `debt`) |
| `metadata.source_file` | String | File path within `rag/knowledge/` |
| `metadata.chunk_id` | Number | Sequential paragraph index within source file |

> **Strict Privacy Guarantee**: User transaction amounts, personal identity, and bank account numbers are **NEVER converted into vector embeddings** and are **NEVER stored in ChromaDB**. ChromaDB strictly contains curated, generic educational literature.
