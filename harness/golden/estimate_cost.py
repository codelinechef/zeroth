#!/usr/bin/env python3
"""
Golden-set generation: call volume and API cost estimate (brief §9 Phase 1).

Measures the real chunk corpus rather than assuming token counts, so the
estimate is grounded in what will actually be sent.

    python3 harness/golden/estimate_cost.py
"""
from __future__ import annotations
import json, statistics, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CHUNKS = ROOT / "data" / "corpus" / "chunks" / "fixed-512.jsonl"

QUERY_MIX = {                      # brief §9 Phase 1
    "single-chunk factual": (60, 1),
    "multi-chunk synthesis": (60, 4),
    "cross-document": (30, 3),
    "tenant-scoped": (20, 3),
    "unanswerable": (30, 2),
}
CANDIDATES_PER_QUERY = 50          # pooled by BM25, then graded 0-3
CHUNKS_PER_JUDGE_CALL = 5          # amortises the rubric across candidates
RUBRIC_TOKENS = 250
DRAFT_INSTRUCTION_TOKENS = 300
DRAFT_OUTPUT_TOKENS = 300
JUDGE_OUTPUT_TOKENS_PER_CHUNK = 30
RETRY_MARGIN = 1.10

PRICES = {                         # per 1M tokens, verified 2026-08-23
    "Gemini 2.5 Flash-Lite":  (0.10, 0.40),
    "Gemini 2.5 Flash":       (0.30, 2.50),
    "Gemini 3.1 Flash-Lite":  (0.25, 1.50),
    "Gemini 3.7 Flash":       (0.75, 3.75),
    "Groq Llama-3.3-70B":     (0.59, 0.79),
    "Groq Llama-3.3-70B batch": (0.295, 0.395),
}


def main() -> int:
    if not CHUNKS.exists():
        print(f"chunks not found: {CHUNKS}"); return 1
    toks = []
    with open(CHUNKS) as fh:
        for line in fh:
            toks.append(json.loads(line)["n_tokens"])
    mean_tok = statistics.mean(toks)
    print(f"corpus: {len(toks):,} chunks, mean {mean_tok:.0f} tokens "
          f"(median {statistics.median(toks):.0f}, max {max(toks)})\n")

    draft_in = draft_out = draft_calls = 0
    for label, (count, used) in QUERY_MIX.items():
        tin = (used * mean_tok + DRAFT_INSTRUCTION_TOKENS) * count
        draft_in += tin; draft_out += DRAFT_OUTPUT_TOKENS * count
        draft_calls += count
        print(f"  draft {label:<24} {count:>4} calls  {tin/1e6:>6.2f}M in")

    queries = sum(c for c, _ in QUERY_MIX.values())
    judgments = queries * CANDIDATES_PER_QUERY
    judge_calls = judgments // CHUNKS_PER_JUDGE_CALL
    judge_in = judge_calls * (CHUNKS_PER_JUDGE_CALL * mean_tok + RUBRIC_TOKENS + 40)
    judge_out = judgments * JUDGE_OUTPUT_TOKENS_PER_CHUNK
    print(f"\n  judge {judgments:,} candidates ({queries} queries x "
          f"{CANDIDATES_PER_QUERY}) in {judge_calls:,} calls of {CHUNKS_PER_JUDGE_CALL}")
    print(f"        {judge_in/1e6:.2f}M in, {judge_out/1e6:.2f}M out")

    tin = (draft_in + judge_in) * RETRY_MARGIN
    tout = (draft_out + judge_out) * RETRY_MARGIN
    calls = int((draft_calls + judge_calls) * RETRY_MARGIN)
    print(f"\n  TOTAL (incl. {int((RETRY_MARGIN-1)*100)}% retry margin)")
    print(f"    calls   {calls:,}\n    input   {tin/1e6:.2f}M tokens"
          f"\n    output  {tout/1e6:.2f}M tokens")
    print(f"\n  {'model':<28} {'cost':>8}   {'floor @250k TPM':>16}")
    for name, (pi, po) in PRICES.items():
        print(f"    {name:<26} ${tin/1e6*pi + tout/1e6*po:>7.2f}   "
              f"{tin/250_000:>13.0f} min")
    return 0


if __name__ == "__main__":
    sys.exit(main())
