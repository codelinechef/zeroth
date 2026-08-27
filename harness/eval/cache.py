"""
Embedding cache, keyed by (chunk_checksum, model_id) — brief §4.

Nine benchmark runs over the same corpus re-embed the same chunks nine times.
The key is deliberately the CONTENT checksum and the model, not the chunk id:

  * chunk_id  changes when the chunking strategy changes, so a fixed-512 and a
              section-aware run would miss each other's cache even where the
              text is byte-identical.
  * checksum  is the text itself. Two chunks with the same bytes have the same
              embedding under the same model, whatever they are called.
  * model_id  must be in the key or a run with a different embedder silently
              reads vectors produced by another one. That is the failure this
              cache could most easily cause, and it would be invisible.

Stored as one .npy per model plus a JSON index, so a model can be evicted
without touching the others.
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
CACHE_DIR = ROOT / "data" / "cache" / "embeddings"


def checksum(text: str) -> str:
    """Content hash of a chunk body. sha256, truncated — collision risk over a
    few hundred thousand chunks is negligible and the key stays readable."""
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:32]


def _safe(model_id: str) -> str:
    return model_id.replace("/", "__").replace(":", "_")


class EmbeddingCache:
    def __init__(self, model_id: str, dim: int, root: Path | None = None):
        self.model_id = model_id
        self.dim = dim
        self.root = root or CACHE_DIR
        self.root.mkdir(parents=True, exist_ok=True)
        self._vec_path = self.root / f"{_safe(model_id)}.npy"
        self._idx_path = self.root / f"{_safe(model_id)}.index.json"
        self._index: dict[str, int] = {}
        self._vectors: np.ndarray | None = None
        self.hits = 0
        self.misses = 0
        self._load()

    def _load(self) -> None:
        if self._idx_path.exists() and self._vec_path.exists():
            meta = json.loads(self._idx_path.read_text())
            if meta.get("model_id") != self.model_id or meta.get("dim") != self.dim:
                # A cache written by a different model or dimension is not a
                # cache for this run. Discard rather than serve wrong vectors.
                self._index, self._vectors = {}, None
                return
            self._index = meta["index"]
            self._vectors = np.load(self._vec_path)

    def get(self, text: str) -> np.ndarray | None:
        i = self._index.get(checksum(text))
        if i is None or self._vectors is None:
            self.misses += 1
            return None
        self.hits += 1
        return self._vectors[i]

    def put_many(self, texts: list[str], vectors: np.ndarray) -> None:
        if len(texts) != len(vectors):
            raise ValueError("texts and vectors must be the same length")
        rows = [] if self._vectors is None else [self._vectors]
        start = 0 if self._vectors is None else len(self._vectors)
        fresh = []
        for offset, t in enumerate(texts):
            key = checksum(t)
            if key in self._index:
                continue
            self._index[key] = start + len(fresh)
            fresh.append(vectors[offset])
        if fresh:
            rows.append(np.asarray(fresh, dtype=np.float32))
            self._vectors = np.concatenate(rows, axis=0)

    def save(self) -> None:
        if self._vectors is None:
            return
        np.save(self._vec_path, self._vectors)
        self._idx_path.write_text(json.dumps({
            "model_id": self.model_id,
            "dim": self.dim,
            "count": len(self._index),
            "index": self._index,
        }))

    @property
    def stats(self) -> dict:
        total = self.hits + self.misses
        return {
            "model_id": self.model_id,
            "entries": len(self._index),
            "hits": self.hits,
            "misses": self.misses,
            "hit_rate": round(self.hits / total, 4) if total else 0.0,
        }
