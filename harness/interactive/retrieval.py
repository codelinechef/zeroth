#!/usr/bin/env python3
"""
Precompute the retrieval walkthrough — brief Part 3, demo 1.

For each golden-set query, captures the real intermediate state of every stage:
BM25 top-20 with scores, dense top-20 with scores, the RRF fusion showing how
each rank contributes, and the cross-encoder reordering.

Nothing here is synthesised. Every score comes from running the real retriever
over the real corpus.

    python3 harness/interactive/retrieval.py
"""
from __future__ import annotations

import importlib.util
import json
import sys
import time
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from _provenance import ROOT, write  # noqa: E402

spec = importlib.util.spec_from_file_location("bm25mod", ROOT / "harness" / "golden" / "bm25.py")
bm = importlib.util.module_from_spec(spec); sys.modules["bm25mod"] = bm
spec.loader.exec_module(bm)

CHUNKS = ROOT / "data" / "corpus" / "chunks" / "fixed-512.jsonl"
EMB = ROOT / "data" / "corpus" / "embeddings"
GOLDEN = ROOT / "data" / "golden" / "queries.jsonl"
EMBED_MODEL = "BAAI/bge-small-en-v1.5"
RERANK_MODEL = "BAAI/bge-reranker-base"
DEPTH, RRF_K, RERANK_DEPTH = 20, 60, 50


def main() -> int:
    chunks = [json.loads(l) for l in open(CHUNKS)]
    by_id = {c["chunk_id"]: c for c in chunks}
    vecs = np.load(EMB / "fixed-512.npy")
    ids = json.loads((EMB / "fixed-512.ids.json").read_text())
    assert ids == [c["chunk_id"] for c in chunks], "embeddings do not match chunks"
    queries = [json.loads(l) for l in open(GOLDEN)]
    print(f"  {len(chunks):,} chunks · {len(queries)} queries")

    print("  building BM25 index")
    idx = bm.BM25().build(CHUNKS, progress_every=0)

    import torch
    from transformers import AutoTokenizer, AutoModel, AutoModelForSequenceClassification, logging as hf
    hf.set_verbosity_error()
    dev = "cuda" if torch.cuda.is_available() else "cpu"
    etok = AutoTokenizer.from_pretrained(EMBED_MODEL)
    emodel = AutoModel.from_pretrained(EMBED_MODEL)
    emodel = (emodel.half() if dev == "cuda" else emodel).to(dev).eval()
    rtok = AutoTokenizer.from_pretrained(RERANK_MODEL)
    rmodel = AutoModelForSequenceClassification.from_pretrained(RERANK_MODEL)
    rmodel = (rmodel.half() if dev == "cuda" else rmodel).to(dev).eval()
    print(f"  {EMBED_MODEL} + {RERANK_MODEL} on {dev}")

    def embed(text: str) -> np.ndarray:
        with torch.inference_mode():
            enc = etok([text], padding=True, truncation=True, max_length=512,
                       return_tensors="pt").to(dev)
            h = emodel(**enc).last_hidden_state[:, 0]
            return torch.nn.functional.normalize(h, dim=-1).float().cpu().numpy()[0]

    def brief(cid: str, extra: dict) -> dict:
        c = by_id[cid]
        return {"chunk_id": cid, "doc_id": c["doc_id"], "tenant": c["tenant"],
                "page": c["page"], "section": c["section"][:70],
                "n_tokens": c["n_tokens"], "excerpt": c["text"][:300], **extra}

    index = []
    for q in queries:
        t0 = time.time()
        question = q["question"]

        lex = idx.search(question, k=DEPTH)
        lex_ids = [idx.chunk_ids[i] for i, _ in lex]
        lex_scores = {idx.chunk_ids[i]: round(float(s), 4) for i, s in lex}

        qv = embed(question)
        sims = vecs @ qv                       # unit vectors, so this is cosine
        top = np.argsort(-sims)[:DEPTH]
        dense_ids = [ids[i] for i in top]
        dense_scores = {ids[i]: round(float(sims[i]), 4) for i in top}

        # Reciprocal Rank Fusion: rank position, never raw score, because BM25
        # and cosine are not on comparable scales.
        contrib: dict[str, dict] = {}
        for rank, cid in enumerate(lex_ids, 1):
            contrib.setdefault(cid, {})["lexical_rank"] = rank
            contrib[cid]["lexical_contribution"] = round(1 / (RRF_K + rank), 6)
        for rank, cid in enumerate(dense_ids, 1):
            contrib.setdefault(cid, {})["dense_rank"] = rank
            contrib[cid]["dense_contribution"] = round(1 / (RRF_K + rank), 6)
        for cid, c in contrib.items():
            c["rrf_score"] = round(c.get("lexical_contribution", 0)
                                   + c.get("dense_contribution", 0), 6)
        fused = sorted(contrib.items(), key=lambda kv: -kv[1]["rrf_score"])

        rr_ids = [cid for cid, _ in fused[:RERANK_DEPTH]]
        with torch.inference_mode():
            enc = rtok([[question, by_id[c]["text"]] for c in rr_ids],
                       padding=True, truncation=True, max_length=512,
                       return_tensors="pt").to(dev)
            logits = rmodel(**enc).logits.view(-1).float().cpu().numpy()
        reranked = sorted(zip(rr_ids, logits), key=lambda kv: -kv[1])
        rerank_pos = {cid: i + 1 for i, (cid, _) in enumerate(reranked)}
        fused_pos = {cid: i + 1 for i, (cid, _) in enumerate(fused)}

        payload = {
            "query_id": q["query_id"], "category": q["category"], "question": question,
            "config": {"depth": DEPTH, "rrf_k": RRF_K, "rerank_depth": RERANK_DEPTH,
                       "embedding_model": EMBED_MODEL, "reranker": RERANK_MODEL},
            "stages": {
                "lexical": [brief(c, {"rank": i + 1, "score": lex_scores[c]})
                            for i, c in enumerate(lex_ids)],
                "dense": [brief(c, {"rank": i + 1, "score": dense_scores[c]})
                          for i, c in enumerate(dense_ids)],
                "fused": [brief(c, {"rank": i + 1, **d}) for i, (c, d) in enumerate(fused[:DEPTH])],
                "reranked": [brief(c, {"rank": i + 1, "score": round(float(s), 4),
                                       "moved_from_fused": fused_pos.get(c),
                                       "movement": (fused_pos.get(c, 0) - (i + 1))})
                             for i, (c, s) in enumerate(reranked[:DEPTH])],
            },
            "overlap": {
                "lexical_only": sorted(set(lex_ids) - set(dense_ids)),
                "dense_only": sorted(set(dense_ids) - set(lex_ids)),
                "both": sorted(set(lex_ids) & set(dense_ids)),
            },
            "rerank_movement": {
                "max_promotion": max((fused_pos.get(c, 0) - (i + 1)
                                      for i, (c, _) in enumerate(reranked[:DEPTH])), default=0),
                "unchanged_top10": sum(1 for i, (c, _) in enumerate(reranked[:10])
                                       if rerank_pos.get(c) == fused_pos.get(c)),
            },
            "elapsed_s": round(time.time() - t0, 3),
        }
        write(f"retrieval/{q['query_id']}.json", payload,
              script="harness/interactive/retrieval.py",
              describes="Real intermediate state of every retrieval stage for one golden-set query.",
              source={"query_id": q["query_id"], "chunks": len(chunks)})
        index.append({"query_id": q["query_id"], "category": q["category"],
                      "question": question[:150],
                      "lexical_only": len(payload["overlap"]["lexical_only"]),
                      "dense_only": len(payload["overlap"]["dense_only"]),
                      "both": len(payload["overlap"]["both"])})

    write("retrieval/index.json", {"queries": index,
          "note": "The retrieval platform is Phase 2. These captures were produced "
                  "by running the real embedder, BM25 index and cross-encoder over "
                  "the committed corpus offline.",
          "code": "harness/interactive/retrieval.py"},
          script="harness/interactive/retrieval.py",
          describes="Index of precomputed retrieval walkthroughs.")
    ov = sum(d["both"] for d in index) / len(index)
    print(f"  mean overlap between lexical and dense top-{DEPTH}: {ov:.1f} of {DEPTH}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
