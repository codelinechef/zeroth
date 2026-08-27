#!/usr/bin/env python3
"""
Per-query review — the Phase 4 gate's hand-check.

The gate reads: "the owner has hand-checked ten per-query results and agrees
the scoring is correct." That is not something a test can assert, so this
prints every scoring decision with the arithmetic beside it, in the order a
person would check it:

    what was asked
    what came back, in rank order, with each chunk's grade and who graded it
    what each metric computed, and the arithmetic that produced it

Nothing here recomputes the metrics differently to "confirm" them — that would
only prove two copies of the same mistake agree. It shows the inputs and the
working so a wrong scorer is visible as a wrong number beside its own terms.

    python3 harness/eval/review.py --run <results.json>
    python3 harness/eval/review.py --run <results.json> --query single-chunk-000
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "harness" / "eval"))

import scorers  # noqa: E402

GOLDEN = ROOT / "data" / "golden"


def jsonl(name):
    p = GOLDEN / name
    return [json.loads(l) for l in p.read_text().splitlines() if l.strip()] if p.exists() else []


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--run", required=True)
    ap.add_argument("--query", default="")
    ap.add_argument("--top", type=int, default=10)
    args = ap.parse_args()

    run = json.loads(Path(args.run).read_text())
    queries = {q["query_id"]: q for q in jsonl("queries.jsonl")}
    chunks = {}
    for j in jsonl("judgments.jsonl"):
        chunks[(j["query_id"], j["chunk_id"])] = {
            "grade": j["grade"], "by": j["judged_by"], "why": j.get("why", ""),
            "is_source": j.get("is_source", False),
        }
    for v in jsonl("verification.jsonl"):
        key = (v["query_id"], v["chunk_id"])
        prev = chunks.get(key, {})
        chunks[key] = {
            **prev,
            "grade": v["grade"], "by": "HUMAN",
            "model_grade": v["model_grade"],
        }

    rows = [p for p in run["per_query"] if not args.query or p["query_id"] == args.query]
    judged = [p for p in rows if p["judged"]]

    print("=" * 78)
    print(f"PER-QUERY REVIEW — {run['clause']} {run.get('label','')}")
    print(f"run {run['run_id']}  commit {run['commit']}  corpus {run['corpus']['id']}")
    print(f"plan fingerprint {run['plan']['fingerprint']}  uniform={run['plan']['uniform']}")
    print("=" * 78)
    print()
    print("RUBRIC   3 fully answers · 2 substantial part · 1 related only · 0 not relevant")
    print(f"RELEVANT means grade >= {scorers.RELEVANT_AT}. Grade 1 does NOT count.")
    print()

    for p in rows:
        qid = p["query_id"]
        q = queries.get(qid, {})
        print("-" * 78)
        print(f"{qid}   [{p.get('category')}]   answerable={p.get('answerable')}")
        print("-" * 78)
        print(f"Q: {q.get('question','')[:300]}")
        if not p["judged"]:
            print("\n  NO JUDGMENTS EXIST FOR THIS QUERY.")
            print("  Excluded from every metric. Scoring it 0 would report a")
            print("  retrieval failure where nobody has said what success is.")
            print()
            continue

        print(f"\n  judged chunks: {p['judged_chunks']}   "
              f"graded >= {scorers.RELEVANT_AT}: {p['relevant_available']}")
        print(f"\n  {'rank':>4}  {'grade':>5}  {'by':<22} {'src':>3}  chunk")
        for i, cid in enumerate(p["retrieved"][:args.top], start=1):
            c = chunks.get((qid, cid))
            g = c["grade"] if c else 0
            by = (c or {}).get("by", "unjudged")
            src = "yes" if (c or {}).get("is_source") else ""
            mark = " <-- relevant" if g >= scorers.RELEVANT_AT else ""
            print(f"  {i:>4}  {g:>5}  {by:<22} {src:>3}  {cid[:52]}{mark}")

        grades = [chunks.get((qid, c), {}).get("grade", 0) for c in p["retrieved"][:args.top]]
        first_rel = next((i for i, g in enumerate(grades, 1) if g >= scorers.RELEVANT_AT), None)
        n_rel = sum(1 for g in grades if g >= scorers.RELEVANT_AT)

        print(f"\n  working:")
        print(f"    grades in rank order        {grades}")
        print(f"    recall@5   = {p['recall_at_5']:.0f}   "
              f"(any grade>=2 in ranks 1-5? {'yes' if any(g>=2 for g in grades[:5]) else 'no'})")
        print(f"    recall@10  = {p['recall_at_10']:.0f}   "
              f"(any grade>=2 in ranks 1-10? {'yes' if any(g>=2 for g in grades[:10]) else 'no'})")
        print(f"    mrr@10     = {p['mrr_at_10']:.4f}   "
              f"(first relevant at rank {first_rel}, 1/{first_rel} = "
              f"{1/first_rel:.4f})" if first_rel else
              f"    mrr@10     = {p['mrr_at_10']:.4f}   (no relevant chunk in top 10)")
        print(f"    ctx prec   = {p['context_precision']:.4f}   "
              f"({n_rel} relevant / {len(grades)} returned)")
        all_g = sorted((chunks.get((qid, c), {}).get("grade", 0)
                        for c in {k[1] for k in chunks if k[0] == qid}), reverse=True)
        print(f"    ndcg@10    = {p['ndcg_at_10']:.4f}")
        print(f"      dcg(returned) = {scorers.dcg(grades):.4f}")
        print(f"      ideal grades  = {all_g[:args.top]}")
        print(f"      idcg          = {scorers.dcg(all_g[:args.top]):.4f}")
        print(f"    latency    = {p['latency_ms']:.0f} ms")
        print()

    print("=" * 78)
    print(f"SCORED {len(judged)} of {len(rows)} queries. "
          f"{len(rows)-len(judged)} excluded as unjudged.")
    print("Aggregate metrics below are computed over the SCORED queries only.")
    print("=" * 78)
    for name, m in run["metrics"].items():
        if "ci95" in m:
            print(f"  {name:20s} {m['value']:.4f}   95% CI [{m['ci95'][0]:.4f}, "
                  f"{m['ci95'][1]:.4f}]   n={m['n']}")
    print()
    print("To agree the scoring is correct, check for each query above that:")
    print("  1. the grade beside each retrieved chunk matches the golden set")
    print("  2. recall is 1 only when a grade >= 2 appears in the top k")
    print("  3. mrr equals 1/rank of the FIRST grade >= 2")
    print("  4. context precision equals (count of grade >= 2) / (chunks returned)")
    print("  5. ndcg equals dcg(returned) / idcg, using ALL judged grades for ideal")
    return 0


if __name__ == "__main__":
    sys.exit(main())
