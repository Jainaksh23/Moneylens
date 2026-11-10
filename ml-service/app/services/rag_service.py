"""
RAG Service for MoneyLens Knowledge Base.

Principles:
1. Approved Knowledge Only: ChromaDB holds ONLY curated financial education markdown documents.
   User-specific data is NEVER stored as embeddings.
2. Idempotent Ingestion: Chunks documents by sections, attaches rich metadata, and upserts with deterministic IDs.
3. Auto-startup Ingestion: If collection is empty on service startup, ingestion executes automatically.
4. Thresholded Retrieval: Converts distances to similarity, filters out low-relevance results, and flags weak retrieval.
"""

from __future__ import annotations

import os
import re
from pathlib import Path
from typing import Any
import chromadb
from chromadb.config import Settings

from ..logging_config import logger
from ..schemas.rag import RetrievedChunk, RetrieveResponse

COLLECTION_NAME = "moneylens_financial_knowledge"


class RAGService:
    def __init__(self, persist_dir: Path | str | None = None, knowledge_dir: Path | str | None = None):
        base_dir = Path(__file__).resolve().parent.parent.parent  # ml-service root
        workspace_root = base_dir.parent  # Moneylens root

        env_persist = os.environ.get("CHROMA_PERSIST_DIR")
        if persist_dir is not None:
            self.persist_dir = Path(persist_dir)
        elif env_persist:
            self.persist_dir = Path(env_persist)
        else:
            self.persist_dir = base_dir / "data" / "chroma_db"

        # Resolve knowledge directory robustly across local dev, monorepo root, and Docker
        candidate_dirs = [
            Path(knowledge_dir) if knowledge_dir is not None else None,
            Path(os.environ.get("KNOWLEDGE_DIR", "")) if os.environ.get("KNOWLEDGE_DIR") else None,
            base_dir / "rag" / "knowledge",
            workspace_root / "rag" / "knowledge",
            base_dir / "knowledge",
            Path.cwd() / "rag" / "knowledge",
            Path.cwd() / "knowledge",
            Path("/app/rag/knowledge"),
            Path("/app/knowledge"),
        ]
        chosen_dir = None
        for cand in candidate_dirs:
            if cand and cand.exists() and any(f for f in cand.glob("*.md") if f.name.lower() != "readme.md"):
                chosen_dir = cand
                break
        self.knowledge_dir = chosen_dir if chosen_dir is not None else (base_dir / "knowledge")

        self.persist_dir.mkdir(parents=True, exist_ok=True)

        # Initialize persistent ChromaDB client
        self.client = chromadb.PersistentClient(
            path=str(self.persist_dir),
            settings=Settings(anonymized_telemetry=False, is_persistent=True),
        )
        self.collection = self.client.get_or_create_collection(
            name=COLLECTION_NAME,
            metadata={"description": "Curated MoneyLens financial education knowledge base"},
        )

    def count(self) -> int:
        return self.collection.count()

    def parse_markdown_document(self, file_path: Path) -> list[dict[str, Any]]:
        """
        Parses a markdown document into structured sections with inherited metadata.
        Uses heading-based semantic chunking with sub-chunking for long sections.
        """
        text = file_path.read_text(encoding="utf-8")
        filename = file_path.name

        # Extract title
        title_match = re.search(r"^#\s+(.+)$", text, re.MULTILINE)
        doc_title = title_match.group(1).strip() if title_match else filename.replace(".md", "").replace("_", " ").title()

        # Extract author
        author_match = re.search(r"\*\*Author\*\*:\s*(.+)$", text, re.MULTILINE)
        author = author_match.group(1).strip() if author_match else "MoneyLens team"

        # Extract last updated
        updated_match = re.search(r"\*\*Last Updated\*\*:\s*(.+)$", text, re.MULTILINE)
        last_updated = updated_match.group(1).strip() if updated_match else "2026-10-15"

        # Extract category
        category_match = re.search(r"\*\*Category\*\*:\s*(.+)$", text, re.MULTILINE)
        category = category_match.group(1).strip() if category_match else "Financial Education"

        # Split into sections based on ## headers
        sections = re.split(r"\n(?=##\s+)", text)
        chunks: list[dict[str, Any]] = []

        chunk_idx = 0
        for section in sections:
            section_clean = section.strip()
            if not section_clean:
                continue

            # Check if this is the frontmatter/intro header block
            header_match = re.match(r"^##\s+(.+)$", section_clean, re.MULTILINE)
            if header_match:
                section_header = header_match.group(1).strip()
            else:
                section_header = "Overview"

            # Clean markdown formatting for pure textual embedding
            body = re.sub(r"^#+\s+.*$", "", section_clean, flags=re.MULTILINE).strip()
            if len(body) < 40:
                continue

            # Sub-chunk if section is particularly long (>900 chars)
            max_chunk_len = 800
            overlap = 150
            if len(body) > max_chunk_len:
                start = 0
                sub_idx = 0
                while start < len(body):
                    end = min(start + max_chunk_len, len(body))
                    # Break at nearest space or newline if possible
                    if end < len(body):
                        nearest_space = body.rfind(" ", start, end)
                        if nearest_space > start + 300:
                            end = nearest_space
                    sub_text = body[start:end].strip()
                    if len(sub_text) >= 40:
                        chunk_id = f"{filename}_{chunk_idx}_{sub_idx}"
                        searchable_text = f"[{doc_title} - {section_header}]\nCategory: {category}\n\n{sub_text}"
                        chunks.append({
                            "id": chunk_id,
                            "document": searchable_text,
                            "metadata": {
                                "doc_id": filename,
                                "title": f"{doc_title}: {section_header}",
                                "source": f"rag/knowledge/{filename}",
                                "category": category,
                                "author": author,
                                "last_updated": last_updated,
                            },
                        })
                        sub_idx += 1
                    if end >= len(body):
                        break
                    start = max(end - overlap, start + 1)
            else:
                chunk_id = f"{filename}_{chunk_idx}"
                searchable_text = f"[{doc_title} - {section_header}]\nCategory: {category}\n\n{body}"
                chunks.append({
                    "id": chunk_id,
                    "document": searchable_text,
                    "metadata": {
                        "doc_id": filename,
                        "title": f"{doc_title}: {section_header}",
                        "source": f"rag/knowledge/{filename}",
                        "category": category,
                        "author": author,
                        "last_updated": last_updated,
                    },
                })
            chunk_idx += 1

        return chunks

    def ingest_all(self, force_reindex: bool = False) -> dict[str, Any]:
        """
        Ingests all approved markdown files in knowledge directory into ChromaDB.
        Idempotent: uses deterministic chunk IDs.
        """
        if not self.knowledge_dir.exists():
            return {
                "status": "error",
                "message": f"Knowledge directory does not exist: {self.knowledge_dir}",
                "chunks_ingested": 0,
            }

        md_files = [f for f in self.knowledge_dir.glob("*.md") if f.name.lower() != "readme.md"]
        if not md_files:
            return {
                "status": "warning",
                "message": "No markdown files found in knowledge directory",
                "chunks_ingested": 0,
            }

        if force_reindex:
            try:
                self.client.delete_collection(name=COLLECTION_NAME)
            except Exception:
                pass
            self.collection = self.client.get_or_create_collection(
                name=COLLECTION_NAME,
                metadata={"description": "Curated MoneyLens financial education knowledge base"},
            )

        all_ids: list[str] = []
        all_docs: list[str] = []
        all_metas: list[dict[str, Any]] = []

        for md_file in md_files:
            doc_chunks = self.parse_markdown_document(md_file)
            for c in doc_chunks:
                all_ids.append(c["id"])
                all_docs.append(c["document"])
                all_metas.append(c["metadata"])

        if all_ids:
            # Upsert into ChromaDB in batches of 50
            batch_size = 50
            for i in range(0, len(all_ids), batch_size):
                end = i + batch_size
                self.collection.upsert(
                    ids=all_ids[i:end],
                    documents=all_docs[i:end],
                    metadatas=all_metas[i:end],
                )

        return {
            "status": "success",
            "files_processed": len(md_files),
            "chunks_ingested": len(all_ids),
            "total_collection_count": self.collection.count(),
        }

    def ensure_ingested_on_startup(self) -> int:
        """
        Checks if the collection has documents. If empty, automatically runs ingestion.
        Crucial for zero-configuration, containerized, or ephemeral deployments.
        Logs chunk count and any embedding-model load error without secrets.
        """
        try:
            current_count = self.count()
            if current_count == 0:
                logger.info(
                    "ChromaDB knowledge collection is empty. Starting startup ingestion...",
                    extra={"knowledge_dir": str(self.knowledge_dir)},
                )
                ingest_res = self.ingest_all(force_reindex=False)
                current_count = self.count()
                logger.info(
                    "Startup RAG ingestion completed",
                    extra={
                        "chunk_count": current_count,
                        "files_processed": ingest_res.get("files_processed", 0),
                        "collection_ready": current_count > 0,
                    },
                )
            else:
                logger.info(
                    "ChromaDB knowledge collection ready",
                    extra={
                        "chunk_count": current_count,
                        "collection_ready": True,
                    },
                )
            return current_count
        except Exception as err:
            logger.error(
                "RAG startup ingestion / embedding model load error: %s",
                str(err),
                extra={"collection_ready": False, "chunk_count": 0},
            )
            return 0

    def retrieve(
        self,
        query: str,
        top_k: int = 4,
        min_similarity: float = 0.35,
    ) -> RetrieveResponse:
        """
        Retrieves top-k relevant knowledge chunks with cosine similarity thresholding.
        """
        if self.count() == 0:
            self.ensure_ingested_on_startup()

        total_in_collection = self.count()
        if total_in_collection == 0:
            return RetrieveResponse(
                query=query,
                chunks=[],
                count=0,
                isWeakRetrieval=True,
                thresholdApplied=min_similarity,
            )

        n_results = min(top_k * 2, total_in_collection)
        results = self.collection.query(
            query_texts=[query],
            n_results=n_results,
            include=["documents", "metadatas", "distances"],
        )

        docs = results.get("documents", [[]])[0]
        metadatas = results.get("metadatas", [[]])[0]
        distances = results.get("distances", [[]])[0]
        ids = results.get("ids", [[]])[0]

        filtered_chunks: list[RetrievedChunk] = []

        for cid, doc, meta, dist in zip(ids, docs, metadatas, distances):
            # Chroma default L2/cosine distance conversion to normalized similarity:
            # For cosine distance: distance is 1 - cos(theta) where cos in [-1, 1], distance in [0, 2]
            # Similarity = max(0.0, 1.0 - (dist / 2.0))
            sim = max(0.0, min(1.0, 1.0 - (float(dist) / 2.0)))

            if sim >= min_similarity:
                filtered_chunks.append(
                    RetrievedChunk(
                        id=cid,
                        title=meta.get("title", "Financial Knowledge"),
                        source=meta.get("source", "MoneyLens Knowledge Base"),
                        category=meta.get("category", "Financial Education"),
                        content=doc,
                        similarity=round(sim, 4),
                        lastUpdated=meta.get("last_updated", "2026-10-15"),
                        metadata={k: v for k, v in meta.items() if k not in ("title", "source", "category", "last_updated")},
                    )
                )

        # Sort descending by similarity and slice to top_k
        filtered_chunks.sort(key=lambda c: c.similarity, reverse=True)
        top_chunks = filtered_chunks[:top_k]

        is_weak = len(top_chunks) == 0 or (len(top_chunks) > 0 and top_chunks[0].similarity < 0.45)

        return RetrieveResponse(
            query=query,
            chunks=top_chunks,
            count=len(top_chunks),
            isWeakRetrieval=is_weak,
            thresholdApplied=min_similarity,
        )


# Global singleton instance
rag_service = RAGService()
