# ==========================================
# MoneyLens ML Service - Production Dockerfile
# Python 3.11-slim with non-root user & pre-downloaded embeddings
# ==========================================

FROM python:3.11-slim

WORKDIR /app

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=off \
    HOME=/home/mluser

# Install system dependencies including curl for healthcheck
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user and home directory
RUN useradd -m -u 1000 -s /bin/bash mluser \
    && mkdir -p /app/chroma_data /home/mluser/.cache \
    && chown -R mluser:mluser /app /home/mluser

# Copy and install python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Switch to non-root user
USER mluser

# Pre-download default Chroma ONNX embedding model during image build
# to eliminate runtime cold-start download delay and internet dependency
RUN python -c "import chromadb.utils.embedding_functions as ef; fn = ef.DefaultEmbeddingFunction(); fn(['warmup'])"

# Copy application source code
COPY --chown=mluser:mluser . .

# Pre-ingest knowledge base during image build so ChromaDB collection is populated and cached
RUN python -c "from app.services.rag_service import rag_service; rag_service.ensure_ingested_on_startup()" || true

# Expose FastAPI ML service port
EXPOSE 8000

# Healthcheck probe using model readiness endpoint
HEALTHCHECK --interval=10s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -f http://localhost:8000/health/ready || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
