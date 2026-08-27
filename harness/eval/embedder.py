"""
Query embedding, matching the ingestion path exactly.

The query vector MUST be produced the same way the chunk vectors were, or
cosine similarity compares two different spaces and every retrieval number is
meaningless. Three details are load-bearing and all three are copied from
harness/interactive/embed.py rather than reimplemented from memory:

  * bge uses the CLS token, not mean pooling.
  * the vector is L2-normalised, which is what makes a dot product a cosine.
  * fp16 on CUDA, matching how the corpus was embedded.

The model is loaded once and held. Loading per query would dominate the
latency measurement and report a number that is mostly model loading.
"""
from __future__ import annotations

import numpy as np

MODEL = "BAAI/bge-small-en-v1.5"
DIM = 384

_tok = None
_model = None
_dev = None


def _load():
    global _tok, _model, _dev
    if _model is not None:
        return
    import torch
    from transformers import AutoTokenizer, AutoModel, logging as hf
    hf.set_verbosity_error()
    _dev = "cuda" if torch.cuda.is_available() else "cpu"
    _tok = AutoTokenizer.from_pretrained(MODEL)
    m = AutoModel.from_pretrained(MODEL)
    if _dev == "cuda":
        m = m.half()
    _model = m.to(_dev).eval()


def embed_query(text: str) -> np.ndarray:
    """One query vector, float32, L2-normalised, 384 dimensions."""
    import torch
    _load()
    with torch.inference_mode():
        enc = _tok([text], padding=True, truncation=True, max_length=512,
                   return_tensors="pt").to(_dev)
        h = _model(**enc).last_hidden_state[:, 0]
        h = torch.nn.functional.normalize(h, dim=-1)
        return h.float().cpu().numpy()[0]


def device() -> str:
    _load()
    return _dev or "cpu"
