#!/usr/bin/env python3
"""
Human verification of the golden set — brief §9 Phase 1.

Presents a STRATIFIED 25% sample: 25% drawn from each of the five query
categories independently, not 50 random draws from the pool. A random sample
would under-represent tenant-scoped (20 queries) and could miss a category
almost entirely, and the agreement rate is published per category.

    python3 harness/golden/verify.py              # grade the sample
    python3 harness/golden/verify.py --report     # agreement rate, no grading
    python3 harness/golden/verify.py --reset      # start the sample over

Saves after EVERY judgment. Stop with Ctrl-C or `q` at any prompt and re-run to
pick up exactly where you left off, across sessions.

Writes:
    data/golden/verification.jsonl    your grades (committed)
    data/golden/.verify_state.json    position in the sample (gitignored)
"""
from __future__ import annotations

import argparse
import json
import os
import random
import sys
import time
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
GOLDEN = ROOT / "data" / "golden"
CHUNKS = ROOT / "data" / "corpus" / "chunks" / "fixed-512.jsonl"
QUERIES = GOLDEN / "queries.jsonl"
JUDGMENTS = GOLDEN / "judgments.jsonl"
VERIFICATION = GOLDEN / "verification.jsonl"
STATE = GOLDEN / ".verify_state.json"

SAMPLE_FRACTION = 0.25
SEED = 20260824
CANDIDATES_SHOWN = 8      # highest-graded candidates per query
CATEGORIES = ["single-chunk", "multi-chunk", "cross-document",
              "tenant-scoped", "unanswerable"]

RUBRIC = """\
  3 = fully answers the question on its own
  2 = contains a substantial part of the answer
  1 = related context, but does not contain the answer
  0 = not relevant

Relevance is ABSOLUTE: a property of the passage and the question alone. It does
not depend on who is asking or what they may see."""


def atomic_write(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(text)
    os.replace(tmp, path)


def load_jsonl(path: Path) -> list[dict]:
    if not path.exists():
        return []
    return [json.loads(l) for l in path.read_text().splitlines() if l.strip()]


def stratified_sample(queries: list[dict]) -> list[str]:
    """25% of EACH category, so every category is represented in the published
    agreement rate. Deterministic under SEED: the same sample every run."""
    rng = random.Random(SEED)
    picked: list[str] = []
    by_cat: dict[str, list[dict]] = defaultdict(list)
    for q in queries:
        by_cat[q["category"]].append(q)
    for cat in CATEGORIES:
        pool = sorted(by_cat.get(cat, []), key=lambda q: q["query_id"])
        if not pool:
            continue
        n = max(1, round(len(pool) * SAMPLE_FRACTION))
        picked += [q["query_id"] for q in rng.sample(pool, min(n, len(pool)))]
    return sorted(picked)


def wrap(text: str, width: int = 96, indent: str = "      ") -> str:
    import textwrap
    return "\n".join(textwrap.fill(p, width, initial_indent=indent,
                                   subsequent_indent=indent)
                     for p in text.split("\n") if p.strip())


def ask(prompt: str, valid: set[str]) -> str:
    while True:
        try:
            v = input(prompt).strip().lower()
        except EOFError:
            return "q"
        if v in valid:
            return v
        print(f"      expected one of: {' '.join(sorted(valid))}")


def report(queries, judgments, verified) -> None:
    by_q = {q["query_id"]: q for q in queries}
    model = {(j["query_id"], j["chunk_id"]): j["grade"] for j in judgments}

    per_cat: dict[str, list[tuple[int, int]]] = defaultdict(list)
    for v in verified:
        key = (v["query_id"], v["chunk_id"])
        if key in model:
            per_cat[by_q[v["query_id"]]["category"]].append((model[key], v["grade"]))

    print("\n" + "=" * 68)
    print("  AGREEMENT RATE — model-drafted judgments vs human verification")
    print("=" * 68)
    if not per_cat:
        print("  Nothing verified yet.")
        return

    tot_exact = tot_binary = tot_n = 0
    print(f"  {'category':<17}{'n':>6}{'exact':>9}{'±1':>9}{'relevant':>11}")
    for cat in CATEGORIES:
        pairs = per_cat.get(cat, [])
        if not pairs:
            continue
        n = len(pairs)
        ex = sum(1 for m, h in pairs if m == h)
        w1 = sum(1 for m, h in pairs if abs(m - h) <= 1)
        bi = sum(1 for m, h in pairs if (m >= 2) == (h >= 2))
        tot_exact += ex; tot_binary += bi; tot_n += n
        print(f"  {cat:<17}{n:>6}{ex/n:>8.1%}{w1/n:>9.1%}{bi/n:>11.1%}")
    print("  " + "-" * 64)
    print(f"  {'ALL':<17}{tot_n:>6}{tot_exact/tot_n:>8.1%}{'':>9}{tot_binary/tot_n:>11.1%}")
    print("\n  'relevant' is agreement on the >=2 boundary, which is what")
    print("  Recall@k and NDCG@10 actually depend on.")
    print("=" * 68)


def main() -> int:
    ap = argparse.ArgumentParser(description="Golden set human verification")
    ap.add_argument("--report", action="store_true", help="agreement rate only")
    ap.add_argument("--reset", action="store_true", help="discard progress")
    args = ap.parse_args()

    queries = load_jsonl(QUERIES)
    judgments = load_jsonl(JUDGMENTS)
    if not queries:
        print(f"No queries at {QUERIES}. Run harness/golden/generate.py first.")
        return 1

    verified = load_jsonl(VERIFICATION)
    if args.reset:
        VERIFICATION.unlink(missing_ok=True)
        STATE.unlink(missing_ok=True)
        verified = []
        print("  progress reset")

    if args.report:
        report(queries, judgments, verified)
        return 0

    chunks = {}
    for line in open(CHUNKS):
        c = json.loads(line)
        chunks[c["chunk_id"]] = c

    by_q = {q["query_id"]: q for q in queries}
    j_by_q: dict[str, list[dict]] = defaultdict(list)
    for j in judgments:
        j_by_q[j["query_id"]].append(j)

    sample = stratified_sample(queries)
    done = {(v["query_id"], v["chunk_id"]) for v in verified}

    counts = defaultdict(int)
    for qid in sample:
        counts[by_q[qid]["category"]] += 1
    print("\n" + "=" * 68)
    print("  GOLDEN SET VERIFICATION — stratified 25% sample")
    print("=" * 68)
    for cat in CATEGORIES:
        tot = sum(1 for q in queries if q["category"] == cat)
        print(f"  {cat:<17} {counts[cat]:>3} of {tot:>3}")
    print(f"  {'total':<17} {len(sample):>3} of {len(queries):>3} queries")
    print(f"\n  Saved after every judgment. Ctrl-C or 'q' to stop; re-run to resume.")
    print(RUBRIC)
    print("=" * 68)

    remaining = [qid for qid in sample
                 if any((qid, j["chunk_id"]) not in done
                        for j in j_by_q.get(qid, []))]
    if not remaining:
        print("\n  Sample fully verified.")
        report(queries, judgments, verified)
        return 0

    for n, qid in enumerate(remaining, 1):
        q = by_q[qid]
        cands = sorted(j_by_q.get(qid, []), key=lambda j: -j["grade"])[:CANDIDATES_SHOWN]
        cands = [c for c in cands if (qid, c["chunk_id"]) not in done]
        if not cands:
            continue

        print("\n" + "=" * 68)
        print(f"  QUERY {n}/{len(remaining)}   [{q['category']}]   {qid}")
        print("=" * 68)
        print(wrap(q["question"], indent="  "))
        if not q.get("answerable"):
            print(f"\n  Drafted as UNANSWERABLE.")
            if q.get("why_unanswerable"):
                print(wrap(f"Reason given: {q['why_unanswerable']}", indent="  "))
        elif q.get("answer"):
            print(wrap(f"Drafted answer: {q['answer']}", indent="  "))
        print(f"\n  source passages: {', '.join(q['source_chunk_ids'])}")

        for i, cand in enumerate(cands, 1):
            ch = chunks.get(cand["chunk_id"])
            if ch is None:
                continue
            print("\n" + "-" * 68)
            print(f"  [{i}/{len(cands)}] {cand['chunk_id']}")
            print(f"  {ch['doc_id']}  ·  tenant {ch['tenant']}  ·  "
                  f"page {ch['page']}  ·  section \"{ch['section'][:40]}\"")
            flag = "  <- passage the query was written from" if cand["is_source"] else ""
            print(f"  model grade: {cand['grade']}  ({cand['why']}){flag}")
            print("-" * 68)
            print(wrap(ch["text"]))
            print("-" * 68)

            v = ask("      your grade [0-3, s=skip, q=quit]: ",
                    {"0", "1", "2", "3", "s", "q"})
            if v == "q":
                print("\n  Stopped. Progress saved — re-run to resume.")
                report(queries, judgments, verified)
                return 0
            if v == "s":
                continue

            verified.append({
                "query_id": qid,
                "chunk_id": cand["chunk_id"],
                "grade": int(v),
                "model_grade": cand["grade"],
                "category": q["category"],
                "verified_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            })
            # save after EVERY judgment, not per query
            atomic_write(VERIFICATION,
                         "\n".join(json.dumps(x) for x in verified) + "\n")
            atomic_write(STATE, json.dumps(
                {"completed": len(verified), "sample_size": len(sample),
                 "updated": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}))
            done.add((qid, cand["chunk_id"]))
            if int(v) != cand["grade"]:
                print(f"      recorded {v}  (model said {cand['grade']})")

    print("\n  Sample complete.")
    report(queries, judgments, verified)
    return 0


if __name__ == "__main__":
    sys.exit(main())
