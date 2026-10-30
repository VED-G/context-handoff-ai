"""
TF-IDF based knowledge base retrieval.
Uses scikit-learn TfidfVectorizer to find the most relevant KB documents
for a given query (item title + description).
"""
import logging
from typing import Optional

logger = logging.getLogger(__name__)


def get_tfidf_candidates(
    query: str,
    documents: list[dict],  # list of {id, title, content}
    top_k: int = 5,
) -> list[dict]:
    """
    Return top_k KB documents most similar to query using TF-IDF cosine similarity.
    Falls back to first top_k documents if scikit-learn is unavailable or too few docs.
    
    Each result: {document_id, title, content_snippet, score}
    """
    if not documents:
        return []

    try:
        from sklearn.feature_extraction.text import TfidfVectorizer
        from sklearn.metrics.pairwise import cosine_similarity
        import numpy as np
    except ImportError:
        logger.warning("scikit-learn not available; returning top documents without ranking")
        return [
            {
                "document_id": d["id"],
                "title": d["title"],
                "content_snippet": d["content"][:200],
                "score": 0.5,
            }
            for d in documents[:top_k]
        ]

    # Build corpus: combine title and content for each document
    corpus = [f"{d['title']} {d['content']}" for d in documents]

    try:
        vectorizer = TfidfVectorizer(
            max_features=5000,
            stop_words="english",
            ngram_range=(1, 2),
        )
        tfidf_matrix = vectorizer.fit_transform(corpus)
        query_vec = vectorizer.transform([query])
        scores = cosine_similarity(query_vec, tfidf_matrix)[0]

        # Get top_k indices sorted by score descending
        top_indices = scores.argsort()[::-1][:top_k]

        results = []
        for idx in top_indices:
            if scores[idx] < 0.01:  # skip near-zero relevance
                continue
            doc = documents[idx]
            results.append({
                "document_id": doc["id"],
                "title": doc["title"],
                "content_snippet": doc["content"][:300],
                "score": float(scores[idx]),
            })

        logger.debug(f"TF-IDF retrieved {len(results)} candidates for query (length={len(query)})")
        return results

    except Exception as e:
        logger.error(f"TF-IDF retrieval failed: {e}", exc_info=True)
        return []

