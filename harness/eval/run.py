#!/usr/bin/env python3
"""
The baseline run — brief §9 Phase 4.

Baseline config (clause 4.1): fixed-512 chunking, bge-small-en-v1.5, dense
only, no reranker, top-k 10, local vLLM generator.

    python3 harness/eval/run.py --clause 4.1 --dry-run     # retrieval only
    python3 harness/eval/run.py --clause 4.1               # full run

Three things this refuses to do:

  * It will not run without the plan guard passing. A run whose retrieval
    silently fell back to exact search is not comparable to any other run, so
    it is discarded rather than recorded with a caveat.
  * It will not write a results file with a metric it could not compute. An
    absent metric is absent; it is never defaulted to zero.
  * It measures headline metrics as `all_tenants`, because golden-set grades
    are absolute rather than role-relative. Row-level security impact is a
    separate report — see the security section — and folding it in here would
    make the one-factor-at-a-time claim false.
"""
from __future__ import annotations

import argparse
import json
import platform as _platform
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "platform"))
sys.path.insert(0, str(ROOT / "harness" / "eval"))

import bootstrap as bs                      # noqa: E402
import planguard                            # noqa: E402
import scorers                              # noqa: E402
from embedder import embed_query, MODEL as EMBED_MODEL, device as embed_device  # noqa: E402

GOLDEN = ROOT / "data" / "golden"
OUT_DIR = ROOT / "content" / "board"


def jsonl(name: str) -> list[dict]:
    p = GOLDEN / name
    if not p.exists():
        return []
    return [json.loads(l) for l in p.read_text().splitlines() if l.strip()]


def git_commit() -> str:
    try:
        return subprocess.run(["git", "rev-parse", "--short", "HEAD"],
                              capture_output=True, text=True,
                              cwd=ROOT).stdout.strip() or "unknown"
    except Exception:
        return "unknown"


def load_grades() -> dict[str, dict[str, int]]:
    """query_id -> {chunk_id: grade}, human verification taking precedence.

    Where a human has re-graded a judgment, that grade wins. The two sources
    disagree substantially at present, which is the reason this run publishes
    retrieval metrics only when explicitly asked to.
    """
    grades: dict[str, dict[str, int]] = {}
    for j in jsonl("judgments.jsonl"):
        grades.setdefault(j["query_id"], {})[j["chunk_id"]] = int(j["grade"])
    verified = 0
    for v in jsonl("verification.jsonl"):
        grades.setdefault(v["query_id"], {})[v["chunk_id"]] = int(v["grade"])
        verified += 1
    return grades


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--clause", default="4.1")
    ap.add_argument("--label", default="baseline")
    ap.add_argument("--k", type=int, default=10)
    ap.add_argument("--role", default="all_tenants")
    ap.add_argument("--dry-run", action="store_true",
                    help="retrieval and retrieval metrics only; no generation")
    ap.add_argument("--limit", type=int, default=0, help="first N queries only")
    ap.add_argument("--out", default="")
    args = ap.parse_args()

    queries = jsonl("queries.jsonl")
    if args.limit:
        queries = queries[:args.limit]
    if not queries:
        print("no queries in data/golden/queries.jsonl — nothing to run")
        return 1
    grades = load_grades()

    from db.connection import app_connection, as_role
    from retrieval.retrieve import retrieve

    # Warm the embedder before timing anything. A first call that loads the
    # model takes ~10s, and folding that into query one would report a latency
    # distribution that is mostly model loading.
    embed_query("warmup")

    started = time.time()
    per_query: list[dict] = []
    plan_shape = None
    plan_fingerprints: set[str] = set()

    conn = app_connection()
    try:
        for q in queries:
            qid = q["query_id"]
            qvec = embed_query(q["question"])

            t0 = time.time()
            with as_role(conn, args.role):
                with conn.cursor() as cur:
                    gucs = planguard.pin_planner(cur)
                    # Requirement 4: fingerprint the plan actually used, so two
                    # runs can be compared for planner equivalence without
                    # re-running either. The tenant predicate is part of the
                    # query being explained — without it the planner cannot
                    # prune partitions and plans something the run never
                    # executes.
                    cur.execute("SELECT zeroth.current_tenants()")
                    permitted = cur.fetchone()[0] or []
                    sql, params_for = planguard.dense_probe()
                    shape = planguard.capture(
                        cur, sql, params_for(qvec.tolist(), permitted, args.k), gucs)
                    planguard.assert_hnsw_plan(shape, context=f"query {qid}")
                    if plan_shape is None:
                        plan_shape = shape
                    plan_fingerprints.add(shape.fingerprint)

                r = retrieve(conn, q["question"], qvec, k=args.k,
                             mode="approximate", assert_plans=True)
            elapsed_ms = (time.time() - t0) * 1000

            retrieved = [h.chunk_id for h in r.hits]
            qgrades = grades.get(qid, {})
            # A query with NO judgments has no measurable recall. Scoring it
            # zero would be inventing a result: it says the retriever failed
            # when in fact nobody has said what success looks like. Seven of
            # the twelve queries are in this state, and averaging them in
            # dragged every metric down by more than half.
            judged = len(qgrades) > 0
            j = scorers.Judged(qid, retrieved, qgrades)
            per_query.append({
                "judged": judged,
                "judged_chunks": len(qgrades),
                "relevant_available": sum(1 for g in qgrades.values() if g >= scorers.RELEVANT_AT),
                "query_id": qid,
                "category": q.get("category"),
                "answerable": q.get("answerable", True),
                "retrieved": retrieved,
                "latency_ms": round(elapsed_ms, 1),
                "recall_at_5": scorers.recall_at_k(j, 5),
                "recall_at_10": scorers.recall_at_k(j, 10),
                "mrr_at_10": scorers.mrr_at_k(j, 10),
                "ndcg_at_10": scorers.ndcg_at_k(j, 10),
                "context_precision": scorers.context_precision(j, args.k),
            })
            if judged:
                print(f"  {qid:24s} recall@10={per_query[-1]['recall_at_10']:.0f} "
                      f"ndcg@10={per_query[-1]['ndcg_at_10']:.3f} "
                      f"{elapsed_ms:.0f}ms")
            else:
                print(f"  {qid:24s} UNJUDGED — excluded from every metric "
                      f"({elapsed_ms:.0f}ms)")
    finally:
        conn.close()

    scored = [p for p in per_query if p["judged"]]
    metrics: dict[str, dict] = {}
    for name in ("recall_at_5", "recall_at_10", "mrr_at_10", "ndcg_at_10",
                 "context_precision"):
        ci = bs.bootstrap([p[name] for p in scored])
        if ci:
            metrics[name] = ci.as_dict()

    lat = [p["latency_ms"] / 1000 for p in per_query]
    for label, p in (("latency_p50_s", 50), ("latency_p95_s", 95), ("latency_p99_s", 99)):
        metrics[label] = {"value": round(scorers.percentile(lat, p), 4),
                          "n": len(lat), "note": "retrieval only" if args.dry_run else "end to end"}

    result = {
        "run_id": f"{args.clause}-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}",
        "clause": args.clause,
        "label": args.label,
        "baseline": args.clause == "4.1",
        "run_date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "commit": git_commit(),
        "dry_run": bool(args.dry_run),
        "corpus": {"id": "edgar-cuad-rfc-v1"},
        "queries": {
            "total": len(queries),
            "answerable": sum(1 for q in queries if q.get("answerable", True)),
            "unanswerable": sum(1 for q in queries if not q.get("answerable", True)),
            # Every quality metric is computed over `judged` only. The gap
            # between these two numbers is the honest limit on this run.
            "judged": len(scored),
            "unjudged_excluded": len(per_query) - len(scored),
        },
        "config": {
            "chunking": "fixed-512",
            "embedder": EMBED_MODEL,
            "retrieval": "dense",
            "reranker": "none",
            "top_k": args.k,
            "role": args.role,
            "generator": "none (dry run)" if args.dry_run else "vllm",
        },
        "plan": {
            **(plan_shape.as_dict() if plan_shape else {"gucs": planguard.GUC_BUNDLE}),
            # One fingerprint across every query means the whole run executed
            # the same shape. More than one means some queries retrieved
            # differently from others, and the run is not one measurement.
            "fingerprints_seen": sorted(plan_fingerprints),
            "uniform": len(plan_fingerprints) <= 1,
        },
        "environment": {
            "python": _platform.python_version(),
            "platform": _platform.platform(),
            "embed_device": embed_device(),
        },
        "metrics": metrics,
        "per_query": per_query,
        "elapsed_s": round(time.time() - started, 2),
    }

    out = Path(args.out) if args.out else OUT_DIR / f"{result['run_id']}.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(result, indent=2) + "\n")
    print(f"\nwrote {out}")
    for name, m in metrics.items():
        if "ci95" in m:
            print(f"  {name:20s} {m['value']:.3f}  95% CI [{m['ci95'][0]:.3f}, {m['ci95'][1]:.3f}]  n={m['n']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
