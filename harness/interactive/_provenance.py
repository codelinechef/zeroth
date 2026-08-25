"""Shared provenance stamp for every precomputed interactive dataset.

Part 5 of the redesign brief requires each committed dataset to say what it is,
how it was generated, and which script regenerates it. Making that part of the
writer rather than a README promise means it cannot drift.
"""
from __future__ import annotations

import json
import os
import subprocess
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "data" / "interactive"


def commit() -> str:
    try:
        return subprocess.run(["git", "rev-parse", "--short", "HEAD"],
                              cwd=ROOT, capture_output=True, text=True,
                              check=True).stdout.strip()
    except Exception:
        return "unknown"


def corpus_id() -> str:
    m = ROOT / "data" / "corpus" / "corpus_manifest.json"
    if not m.exists():
        return "unknown"
    return json.loads(m.read_text()).get("corpus_id", "unknown")


def write(rel: str, payload: dict, *, script: str, describes: str,
          source: dict | None = None) -> Path:
    """Write a dataset with its provenance attached, atomically."""
    doc = {
        "describes": describes,
        "generated_by": {
            "script": script,
            "regenerate": f"python3 {script}",
            "commit": commit(),
            "at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        },
        "source": {"corpus": corpus_id(), **(source or {})},
        **payload,
    }
    path = OUT / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(doc, indent=1))
    os.replace(tmp, path)
    print(f"  wrote {path.relative_to(ROOT)}  ({path.stat().st_size/1024:.0f} KB)")
    return path
