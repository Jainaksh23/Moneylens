"""
Pydantic schemas for RAG (Retrieval-Augmented Generation) Knowledge Retrieval.
"""

from __future__ import annotations

from typing import Any
from pydantic import BaseModel, Field


class RetrieveRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=1000, description="User search query")
    topK: int = Field(default=4, ge=1, le=10, description="Max number of chunks to return")
    minSimilarity: float = Field(default=0.35, ge=0.0, le=1.0, description="Minimum similarity threshold")


class RetrievedChunk(BaseModel):
    id: str
    title: str
    source: str
    category: str
    content: str
    similarity: float
    lastUpdated: str = "2026-10-15"
    metadata: dict[str, Any] = Field(default_factory=dict)


class RetrieveResponse(BaseModel):
    query: str
    chunks: list[RetrievedChunk]
    count: int
    isWeakRetrieval: bool
    thresholdApplied: float


class RagStatusResponse(BaseModel):
    collection_ready: bool = Field(..., description="True if ChromaDB collection is initialized and has chunks")
    chunk_count: int = Field(..., description="Total number of chunks in the collection")
