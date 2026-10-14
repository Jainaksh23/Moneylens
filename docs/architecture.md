# MoneyLens System Architecture

MoneyLens is a Personal Financial Intelligence Web Application tailored for Indian users (INR), designed with strict security boundaries, isolated analytical computation, and educational decision support.

## High-Level Architecture Diagram

```mermaid
flowchart TB
    subgraph Client["Client Tier (Browser)"]
        UI["React 18 + Vite + TypeScript\n(Tailwind CSS + Recharts)"]
    end

    subgraph BackendGateway["Backend API Gateway Tier (Node.js + Express)"]
        Gateway["Express Router (/api/v1)"]
        ReqId["Request-ID Middleware"]
        PinoLogger["Structured Pino Logger"]
        AuthMiddleware["Auth & CSRF Middleware\n(httpOnly Cookie JWT)"]
        ZodValidator["Zod Schema Validation"]
        MongooseORM["Mongoose ODM\n(User Scoped Queries)"]
        MLClient["Internal ML HTTP Client\n(Header: X-Internal-Key)"]
    end

    subgraph DatabaseTier["Data Tier"]
        MongoDB[("MongoDB Atlas\n(User data, Transactions, Goals, Audit)")]
    end

    subgraph MLTier["ML & Intelligence Tier (Python 3.11 FastAPI)"]
        FastAPIRouter["FastAPI Service (/health, /api/v1/...)"]
        InternalKeyAuth["Security Middleware\n(X-Internal-Key Validation)"]
        Categorizer["Transaction Categorization Engine\n(Hybrid Regex + Embeddings)"]
        Forecaster["Cash-Flow Forecaster\n(Time-series + Naive Baseline)"]
        GoalScorer["Savings Goal & SIP Simulator\n(Deterministic Mathematical Engine)"]
        AnomalyDetector["Anomaly Detection Engine\n(Z-Score / Isolation Forest)"]
        RAGPipeline["RAG Engine (LangChain/ChromaDB)\n+ Groq LLM (Llama 3.3 70B)"]
    end

    subgraph KnowledgeTier["Knowledge & Vector Store"]
        CuratedDocs["Approved Finance Knowledge\n(rag/knowledge/*.md)"]
        ChromaDB[("ChromaDB Vector Store\n(Persisted Embeddings)")]
    end

    %% Communications
    UI -- "HTTPS / JSON\nCredentials: include (httpOnly JWT)\nCustom CSRF Header" --> Gateway
    Gateway --> ReqId --> PinoLogger --> AuthMiddleware --> ZodValidator
    ZodValidator --> MongooseORM --> MongoDB
    ZodValidator --> MLClient

    MLClient -- "Internal REST (HTTP)\nHeader: X-Internal-Key\nHeader: X-Request-Id" --> FastAPIRouter
    FastAPIRouter --> InternalKeyAuth
    InternalKeyAuth --> Categorizer
    InternalKeyAuth --> Forecaster
    InternalKeyAuth --> GoalScorer
    InternalKeyAuth --> AnomalyDetector
    InternalKeyAuth --> RAGPipeline

    CuratedDocs -.->|"Ingested / Indexed"| ChromaDB
    RAGPipeline <--> ChromaDB
```

## Security & Architecture Principles

1. **Strict Perimeter Isolation**:
   - The browser communicates **exclusively** with the Node.js Express backend.
   - The browser never communicates directly with MongoDB, the FastAPI ML service, or external LLM providers (Groq).
   - The FastAPI ML service is non-public and protected by a shared secret header `X-Internal-Key`.
2. **Authentication & Session Security**:
   - JWT tokens are stored exclusively in `httpOnly`, `Secure`, and `SameSite` cookies to prevent XSS exfiltration.
   - All state-changing requests enforce CSRF protection via SameSite cookies combined with custom request header validation.
3. **Database Scoping**:
   - Every single MongoDB query is explicitly scoped by the authenticated user's `userId`.
4. **Deterministic Financial Computations**:
   - Financial figures, cash-flow projections, compound interest, and goal scores are calculated deterministically in code (Node/Python). The LLM is never relied on for mathematical calculation; it only provides grounded explanations of pre-computed numbers.
5. **Traceability & Logging**:
   - Structured JSON logging (`pino` in Node, JSON format in Python) tracks `requestId`, route, HTTP status, and response duration across service hops.
   - No PII, passwords, bank account numbers, or raw financial files are ever logged.
6. **Graceful Degradation**:
   - If the ML service or LLM provider experiences an outage, core transactional and budgeting features remain operational, and the UI displays clear informational status cards.
