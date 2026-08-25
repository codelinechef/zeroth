#!/usr/bin/env python3
"""
Precompute the verification-chain dataset.

Walks real golden-set queries through draft -> blind judge -> human sample,
showing the actual grades and where they diverged. Only queries that have
human-verified judgments are included; nothing is inferred.

    python3 harness/interactive/verification.py
"""
from __future__ import annotations

import json
import sys
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from _provenance import ROOT, write  # noqa: E402

GOLDEN = ROOT / "data" / "golden"
CHUNKS = ROOT / "data" / "corpus" / "chunks" / "fixed-512.jsonl"


def jsonl(p: Path) -> list[dict]:
    return [json.loads(l) for l in p.read_text().splitlines() if l.strip()] if p.exists() else []


def main() -> int:
    queries = {q["query_id"]: q for q in jsonl(GOLDEN / "queries.jsonl")}
    judgments = defaultdict(dict)
    for j in jsonl(GOLDEN / "judgments.jsonl"):
        judgments[j["query_id"]][j["chunk_id"]] = j
    verified = defaultdict(dict)
    for v in jsonl(GOLDEN / "verification.jsonl"):
        verified[v["query_id"]][v["chunk_id"]] = v

    if not verified:
        write("verification/index.json",
              {"state": "unavailable",
               "reason": "No judgments have been human-verified yet."},
              script="harness/interactive/verification.py",
              describes="Verification chain: awaiting human grading.")
        print("  no human-verified judgments yet — wrote unavailable state")
        return 0

    wanted = {cid for q in verified.values() for cid in q}
    text = {}
    with open(CHUNKS) as f:
        for line in f:
            c = json.loads(line)
            if c["chunk_id"] in wanted:
                text[c["chunk_id"]] = c

    index, agree_exact, agree_binary, total = [], 0, 0, 0
    for qid, human in sorted(verified.items()):
        q = queries.get(qid)
        if not q:
            continue
        rows = []
        for cid, v in sorted(human.items(), key=lambda kv: -kv[1]["grade"]):
            j = judgments[qid].get(cid, {})
            c = text.get(cid, {})
            mg, hg = j.get("grade"), v["grade"]
            if mg is not None:
                total += 1
                agree_exact += mg == hg
                agree_binary += (mg >= 2) == (hg >= 2)
            rows.append({
                "chunk_id": cid,
                "model_grade": mg,
                "human_grade": hg,
                "diverged": mg is not None and mg != hg,
                "crosses_relevance_boundary": mg is not None and (mg >= 2) != (hg >= 2),
                "model_reason": j.get("why"),
                "is_source": bool(j.get("is_source")),
                "doc_id": c.get("doc_id"), "page": c.get("page"),
                "section": c.get("section"), "tenant": c.get("tenant"),
                "excerpt": (c.get("text") or "")[:320],
            })
        payload = {
            "query_id": qid,
            "category": q["category"],
            "question": q["question"],
            "answerable": q.get("answerable", True),
            "drafted_by": q.get("drafted_by"),
            "judged_by": next(iter(judgments[qid].values()), {}).get("judged_by"),
            # The drafter knew which passages the query came from. The judge did
            # not: the judging prompt interpolates only the question and the
            # passage text. That is what makes the agreement number mean
            # something rather than measuring conformity.
            "source_chunk_ids": q.get("source_chunk_ids", []),
            "judge_saw_source_labels": False,
            "candidates": rows,
        }
        write(f"verification/{qid}.json", payload,
              script="harness/interactive/verification.py",
              describes=f"One golden-set query through draft, blind judging and human verification.",
              source={"query_id": qid})
        index.append({"query_id": qid, "category": q["category"],
                      "question": q["question"][:140],
                      "verified": len(human),
                      "diverged": sum(1 for r in rows if r["diverged"])})

    # An agreement rate is only meaningful if the human sample actually
    # discriminates. If nearly every human grade is the same value, the number
    # measures the grading session rather than the judge, and publishing it
    # would put a figure on the site that cannot be defended either way.
    human_grades = [v["grade"] for q in verified.values() for v in q.values()]
    dist = defaultdict(int)
    for g in human_grades:
        dist[g] += 1
    modal_share = max(dist.values()) / len(human_grades) if human_grades else 0
    MIN_SAMPLE, MAX_MODAL_SHARE = 60, 0.80
    publishable = total >= MIN_SAMPLE and modal_share <= MAX_MODAL_SHARE

    reasons = []
    if total < MIN_SAMPLE:
        reasons.append(f"only {total} judgments verified, below the {MIN_SAMPLE} minimum")
    if modal_share > MAX_MODAL_SHARE:
        top = max(dist, key=dist.__getitem__)
        reasons.append(
            f"{modal_share:.0%} of human grades are the single value {top}, "
            f"so the sample does not discriminate between relevant and irrelevant "
            f"passages and cannot measure a judge either way")

    write("verification/index.json",
          {"state": "available",
           "queries": index,
           "agreement_publishable": publishable,
           "agreement_withheld_because": reasons or None,
           "observed": {
               "judgments_compared": total,
               "human_grade_distribution": dict(sorted(dist.items())),
               "exact_matches": agree_exact,
               "relevance_boundary_matches": agree_binary,
           },
           "caveat": "Verification is in progress. Nothing here is the published "
                     "agreement rate; the figures above are raw counts of what has "
                     "been graded so far.",
           "code": "harness/golden/verify.py"},
          script="harness/interactive/verification.py",
          describes="Index of verified queries. Agreement is withheld until the "
                    "human sample is large enough and actually discriminates.")
    print(f"  {len(index)} queries, {total} judgments compared")
    print(f"  human grade distribution: {dict(sorted(dist.items()))}")
    print(f"  exact {agree_exact}/{total} · relevance-boundary {agree_binary}/{total}")
    print(f"  agreement publishable: {publishable}")
    for r in reasons:
        print(f"    withheld: {r}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
