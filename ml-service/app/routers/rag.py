"""
Router for RAG Knowledge Retrieval.
Protected by internal API key (backend service-to-service communication only).
"""

from fastapi import APIRouter, Security

from ..schemas.rag import RagStatusResponse, RetrieveRequest, RetrieveResponse
from ..security import verify_internal_key
from ..services.rag_service import rag_service

router = APIRouter(prefix="/rag", tags=["rag"])


@router.get("/status", response_model=RagStatusResponse)
def get_rag_status(
    _key: str = Security(verify_internal_key),
) -> RagStatusResponse:
    """
    Returns RAG ChromaDB collection readiness status and chunk count.
    Protected by X-Internal-Key.
    """
    try:
        count = rag_service.count()
        return RagStatusResponse(
            collection_ready=(count > 0),
            chunk_count=count,
        )
    except Exception:
        return RagStatusResponse(
            collection_ready=False,
            chunk_count=0,
        )


@router.post("/retrieve", response_model=RetrieveResponse)
def retrieve_knowledge(
    req: RetrieveRequest,
    _key: str = Security(verify_internal_key),
) -> RetrieveResponse:
    """
    Retrieves top-k relevant knowledge chunks from approved MoneyLens documents.
    Applies minimum similarity threshold. Returns source metadata.
    """
    return rag_service.retrieve(
        query=req.query,
        top_k=req.topK,
        min_similarity=req.minSimilarity,
    )


@router.post("/ingest")
def trigger_ingest(
    force: bool = False,
    _key: str = Security(verify_internal_key),
) -> dict:
    """
    Manually triggers re-ingestion of knowledge markdown files.
    """
    return rag_service.ingest_all(force_reindex=force)
