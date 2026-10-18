"""
Script to ingest all approved financial education markdown files into ChromaDB.
Usage:
    python scripts/ingest_knowledge.py [--force]
"""

import sys
import argparse
from pathlib import Path

# Add ml-service to path
current_dir = Path(__file__).resolve().parent
ml_service_dir = current_dir.parent
sys.path.insert(0, str(ml_service_dir))

from app.services.rag_service import rag_service  # noqa: E402


def main():
    parser = argparse.ArgumentParser(description="Ingest MoneyLens approved financial knowledge docs")
    parser.add_argument("--force", action="store_true", help="Force reindexing of the entire collection")
    parser.add_argument("--test-query", type=str, default="What is the 50 30 20 rule?", help="Test query after ingestion")
    args = parser.parse_args()

    print("======================================================================")
    print("  MoneyLens RAG Knowledge Base Ingestion")
    print("======================================================================")
    print(f"  Source directory: {rag_service.knowledge_dir}")
    print(f"  ChromaDB persist: {rag_service.persist_dir}")
    print(f"  Current chunk count: {rag_service.count()}")
    print("----------------------------------------------------------------------")
    print("Ingesting markdown documents...")

    result = rag_service.ingest_all(force_reindex=args.force)

    print(f"  [OK] Processed {result.get('files_processed', 0)} files")
    print(f"  [OK] Ingested {result.get('chunks_ingested', 0)} chunks")
    print(f"  [OK] Total collection count: {result.get('total_collection_count', 0)}")
    print("======================================================================")

    if args.test_query:
        print(f"\nTesting sample query: '{args.test_query}'")
        res = rag_service.retrieve(query=args.test_query, top_k=2)
        print(f"Found {res.count} relevant chunk(s) (Weak retrieval: {res.isWeakRetrieval}):")
        for idx, chunk in enumerate(res.chunks, 1):
            print(f"\n[{idx}] {chunk.title} (similarity: {chunk.similarity})")
            print(f"    Source: {chunk.source} | Category: {chunk.category}")
            preview = chunk.content[:200].replace('\n', ' ')
            print(f"    Preview: {preview}...")

    print("\n[OK] RAG Ingestion Complete.")


if __name__ == "__main__":
    main()
