#!/usr/bin/env python3
"""Offline BM25S scorer. Input is pre-tokenized JSON on stdin; output is JSON."""

import json
import sys

try:
    import bm25s
except ImportError as exc:
    raise SystemExit(
        "BM25S is missing. Install it with: python3 -m pip install -r requirements-relevance.txt"
    ) from exc


def field_scores(documents, queries):
    """Return BM25 scores for one field's tokenized documents."""
    if not documents or not queries:
        return [0.0] * len(documents)

    # Empty excerpts must still occupy a document row. A private sentinel cannot
    # match any query token and leaves BM25's document alignment intact.
    corpus = [tokens if tokens else [f"__empty_doc_{index}__"] for index, tokens in enumerate(documents)]
    retriever = bm25s.BM25()
    retriever.index(corpus)
    results, scores = retriever.retrieve([queries], k=len(corpus))
    # Retrieval returns results in score order, not the order of the input corpus.
    # Restore each score to its original document index before combining fields.
    by_document = [0.0] * len(corpus)
    for index, score in zip(results[0].tolist(), scores[0].tolist()):
        by_document[int(index)] = float(score)
    return by_document


def main():
    payload = json.load(sys.stdin)
    excerpt_weight = max(0.0, float(payload.get("excerptWeight", 0.35)))
    top_n = max(1, int(payload.get("topN", 10)))
    output = {}

    for category in payload.get("categories", []):
        name = category["name"]
        queries = sorted(set(category.get("queryTokens", [])))
        if not queries:
            output[name] = {"status": "no_queries", "results": []}
            continue

        docs = category.get("docs", [])
        title_scores = field_scores([doc.get("titleTokens", []) for doc in docs], queries)
        excerpt_scores = field_scores([doc.get("excerptTokens", []) for doc in docs], queries)
        ranked = []
        for doc, title_score, excerpt_score in zip(docs, title_scores, excerpt_scores):
            score = title_score + excerpt_weight * excerpt_score
            if score <= 0:
                continue
            ranked.append({
                "_index": doc.get("_index", 0),
                "url": doc.get("url", ""),
                "title": doc.get("title", ""),
                "source": doc.get("source", ""),
                "score": score,
                "matchedQueries": [],
                "scoreBreakdown": {
                    "title": round(title_score, 6),
                    "excerpt": round(excerpt_weight * excerpt_score, 6),
                },
            })
        ranked.sort(key=lambda item: (-item["score"], item["_index"]))
        for rank, item in enumerate(ranked[:top_n], 1):
            item["rank"] = rank
            item["score"] = round(item["score"], 6)
            item.pop("_index", None)
        output[name] = {"status": "ok" if ranked else "no_matches", "results": ranked[:top_n]}

    json.dump(output, sys.stdout, ensure_ascii=False, separators=(",", ":"))
    sys.stdout.write("\n")
if __name__ == "__main__":
    main()
