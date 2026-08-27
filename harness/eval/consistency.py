#!/usr/bin/env python3
"""
Internal consistency of the golden set.

Found during the Phase 4 hand-check: query `unanswerable-000` is marked
answerable=false, and eight of its chunks carry a HUMAN grade of 3 — "fully
answers the question on its own". Those two statements cannot both be true. If
a chunk fully answers the question, the query is answerable.

That matters beyond one query. The site currently reports the human and the
model disagreeing on 28 of 32 verified judgments, with the human grading
higher, and reads that as the model under-grading. On this query the model's
stated reasoning is right and the verification is wrong, which means the
disagreement figure is measuring at least two different things.

    python3 harness/eval/consistency.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
GOLDEN = ROOT / "data" / "golden"
RELEVANT_AT = 2


def jsonl(name):
    p = GOLDEN / name
    return [json.loads(l) for l in p.read_text().splitlines() if l.strip()] if p.exists() else []


def main() -> int:
    queries = {q["query_id"]: q for q in jsonl("queries.jsonl")}
    grades: dict[str, dict[str, tuple[int, str]]] = {}
    for j in jsonl("judgments.jsonl"):
        grades.setdefault(j["query_id"], {})[j["chunk_id"]] = (j["grade"], j["judged_by"])
    for v in jsonl("verification.jsonl"):
        grades.setdefault(v["query_id"], {})[v["chunk_id"]] = (v["grade"], "HUMAN")

    problems = []

    # 1. An unanswerable query cannot have a chunk that answers it.
    for qid, q in queries.items():
        if q.get("answerable", True):
            continue
        rel = [(c, g, by) for c, (g, by) in grades.get(qid, {}).items() if g >= RELEVANT_AT]
        if rel:
            problems.append((
                "unanswerable query has relevant chunks", qid,
                f"{len(rel)} chunk(s) graded >= {RELEVANT_AT} "
                f"({sorted({by for _, _, by in rel})}). A chunk that answers the "
                f"question contradicts answerable=false — one of the two is wrong."))

    # 2. A query's declared source chunks should be graded relevant.
    for qid, q in queries.items():
        if not q.get("answerable", True):
            continue
        srcs = q.get("source_chunk_ids") or []
        graded = grades.get(qid, {})
        missed = [s for s in srcs if s in graded and graded[s][0] < RELEVANT_AT]
        if missed:
            problems.append((
                "declared source graded irrelevant", qid,
                f"{len(missed)} of {len(srcs)} source chunk(s) the query itself "
                f"names as its answer are graded below {RELEVANT_AT}."))

    # 3. A query with judgments but nothing relevant cannot score anything.
    for qid, g in grades.items():
        if g and not any(gr >= RELEVANT_AT for gr, _ in g.values()):
            problems.append((
                "no relevant chunk at all", qid,
                f"{len(g)} chunks judged, none >= {RELEVANT_AT}. Every retrieval "
                f"metric for this query is 0 by construction."))

    # 4. Queries with no judgments cannot be scored.
    unjudged = [q for q in queries if q not in grades or not grades[q]]
    if unjudged:
        problems.append((
            "queries with no judgments", ", ".join(sorted(unjudged)),
            f"{len(unjudged)} of {len(queries)} queries have no relevance "
            f"judgments and cannot contribute to any metric."))

    # Emit for the site, so the page renders findings rather than a
    # transcription of them. Written whether or not there are problems: an
    # empty findings list is itself a published claim.
    import argparse, datetime, subprocess
    ap = argparse.ArgumentParser()
    ap.add_argument("--json", help="write findings here")
    args, _ = ap.parse_known_args()
    if args.json:
        commit = subprocess.run(["git", "rev-parse", "--short", "HEAD"],
                                capture_output=True, text=True,
                                cwd=ROOT).stdout.strip() or "unknown"
        Path(args.json).parent.mkdir(parents=True, exist_ok=True)
        Path(args.json).write_text(json.dumps({
            "describes": "Internal contradictions in the golden set, found by harness/eval/consistency.py.",
            "generated_by": {
                "script": "harness/eval/consistency.py",
                "regenerate": "python3 harness/eval/consistency.py --json content/golden/consistency.json",
                "commit": commit,
                "at": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            },
            "source": {"queries": len(queries)},
            "issues": [{"kind": k, "where": w, "detail": d} for k, w, d in problems],
        }, indent=2) + "\n")

    if not problems:
        print(f"consistency: {len(queries)} queries, no contradictions found")
        return 0

    print(f"consistency: {len(problems)} issue(s) in the golden set\n")
    for kind, where, detail in problems:
        print(f"  [{kind}]")
        print(f"    {where}")
        print(f"    {detail}\n")
    print("These are data problems, not code problems. Published metrics")
    print("computed over this set inherit every one of them.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
