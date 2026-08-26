"""
Cross-encoder reranking.

A bi-encoder embeds query and passage separately, so each passage is compressed
into a vector before it knows what was asked. A cross-encoder reads both at
once and scores relevance directly, which is measurably more accurate and far
too expensive to run over a whole corpus — so it runs over the shortlist
retrieval already produced.
"""
from __future__ import annotations

import time
from dataclasses import dataclass

MODEL = "BAAI/bge-reranker-base"
_state: dict = {}


@dataclass
class RerankResult:
    hits: list
    elapsed_ms: float
    model: str


def _load():
    if "model" not in _state:
        import torch
        from transformers import (AutoTokenizer, AutoModelForSequenceClassification,
                                  logging as hf)
        hf.set_verbosity_error()
        dev = "cuda" if torch.cuda.is_available() else "cpu"
        tok = AutoTokenizer.from_pretrained(MODEL)
        model = AutoModelForSequenceClassification.from_pretrained(MODEL)
        model = (model.half() if dev == "cuda" else model).to(dev).eval()
        _state.update(tok=tok, model=model, dev=dev, torch=torch)
    return _state


def rerank(question: str, hits: list, *, top_k: int = 10,
           depth: int = 50, batch: int = 16) -> RerankResult:
    """Reorder `hits` by cross-encoder relevance. Only the first `depth`
    candidates are scored — cost grows with shortlist depth, not corpus size."""
    if not hits:
        return RerankResult(hits=[], elapsed_ms=0.0, model=MODEL)
    st = _load()
    torch = st["torch"]
    shortlist = hits[:depth]
    t0 = time.time()
    scores: list[float] = []
    with torch.inference_mode():
        for i in range(0, len(shortlist), batch):
            part = shortlist[i:i + batch]
            enc = st["tok"]([[question, h.body] for h in part],
                            padding=True, truncation=True, max_length=512,
                            return_tensors="pt").to(st["dev"])
            logits = st["model"](**enc).logits.view(-1).float().cpu().tolist()
            scores.extend(logits)
    for h, s in zip(shortlist, scores):
        h.score = float(s)
    ordered = sorted(shortlist, key=lambda h: -h.score)[:top_k]
    return RerankResult(hits=ordered,
                        elapsed_ms=round((time.time() - t0) * 1000, 1),
                        model=MODEL)
