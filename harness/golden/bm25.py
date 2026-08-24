#!/usr/bin/env python3
"""
BM25 over the chunk corpus, for pooling judgment candidates.

Hand-rolled and stdlib-only for the same reason the eval harness is (§6): the
scoring logic is the credibility, so it has to be readable. Postings live in
`array` rather than lists of tuples — 51k chunks carry ~15M postings, and the
tuple form costs gigabytes of object overhead for no benefit.

This is a Phase 1 pooling device, not the Phase 2 retriever. Phase 2 runs
lexical search inside Postgres so RLS applies to it identically (§6).
"""
from __future__ import annotations

import json
import math
import re
from array import array
from collections import Counter
from pathlib import Path

STOPWORDS = {
    "the", "and", "for", "that", "this", "with", "from", "not", "any", "all",
    "shall", "will", "may", "such", "which", "has", "have", "had", "was", "were",
    "are", "our", "its", "his", "her", "their", "been", "other", "under", "into",
    "upon", "than", "then", "there", "these", "those", "each", "also", "including",
}
TOKEN = re.compile(r"[a-z0-9]+")
K1, B = 1.5, 0.75


def tokenize(text: str) -> list[str]:
    return [t for t in TOKEN.findall(text.lower())
            if len(t) > 2 and t not in STOPWORDS]


class BM25:
    def __init__(self):
        self.chunk_ids: list[str] = []
        self.doc_len = array("i")
        self.postings: dict[str, array] = {}   # term -> [chunk_idx, tf, ...]
        self.avg_len = 0.0

    def build(self, chunks_path: Path, progress_every: int = 20000) -> "BM25":
        for i, line in enumerate(open(chunks_path)):
            c = json.loads(line)
            self.chunk_ids.append(c["chunk_id"])
            toks = tokenize(c["text"])
            self.doc_len.append(len(toks))
            for term, tf in Counter(toks).items():
                p = self.postings.get(term)
                if p is None:
                    p = self.postings[term] = array("i")
                p.append(i)
                p.append(tf)
            if progress_every and (i + 1) % progress_every == 0:
                print(f"    indexed {i+1:,} chunks, {len(self.postings):,} terms",
                      flush=True)
        self.avg_len = sum(self.doc_len) / max(1, len(self.doc_len))
        return self

    def search(self, query: str, k: int = 50,
               allowed: set[int] | None = None) -> list[tuple[int, float]]:
        n = len(self.chunk_ids)
        scores: dict[int, float] = {}
        for term in set(tokenize(query)):
            p = self.postings.get(term)
            if p is None:
                continue
            df = len(p) // 2
            idf = math.log(1 + (n - df + 0.5) / (df + 0.5))
            for j in range(0, len(p), 2):
                idx, tf = p[j], p[j + 1]
                if allowed is not None and idx not in allowed:
                    continue
                dl = self.doc_len[idx]
                denom = tf + K1 * (1 - B + B * dl / self.avg_len)
                scores[idx] = scores.get(idx, 0.0) + idf * (tf * (K1 + 1)) / denom
        return sorted(scores.items(), key=lambda kv: -kv[1])[:k]
