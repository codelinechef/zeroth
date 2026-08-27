"""
Metric correctness, against hand-computed values.

A scorer that is silently wrong produces numbers that look fine and are not,
and no amount of pipeline testing catches it. Every expected value below is
worked out by hand in the comment beside it.

    python3 tests/test_scorers.py
    pytest tests/test_scorers.py
"""
from __future__ import annotations

import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "harness" / "eval"))

from scorers import (  # noqa: E402
    Judged, AnswerRecord, recall_at_k, mrr_at_k, ndcg_at_k, dcg,
    context_precision, citation_accuracy, citation_coverage,
    abstention_correct, percentile, cost_per_query,
)

FAILURES: list[str] = []


def check(name: str, got, want, tol=1e-9):
    ok = (abs(got - want) <= tol) if isinstance(want, float) else (got == want)
    print(f"  {'ok  ' if ok else 'FAIL'}  {name}: got {got!r}, want {want!r}")
    if not ok:
        FAILURES.append(name)


def main() -> int:
    # ranks:      1    2    3    4    5
    # grades:     0    3    1    2    0
    j = Judged("q1", ["a", "b", "c", "d", "e"],
               {"a": 0, "b": 3, "c": 1, "d": 2, "e": 0, "z": 3})

    print("retrieval")
    check("recall@1  (rank 1 is grade 0)", recall_at_k(j, 1), 0.0)
    check("recall@2  (rank 2 is grade 3)", recall_at_k(j, 2), 1.0)
    check("recall@10", recall_at_k(j, 10), 1.0)
    # first relevant (>=2) is at rank 2 -> 1/2
    check("mrr@10", mrr_at_k(j, 10), 0.5)
    # grade 1 must NOT count as relevant: only b(3) and d(2) qualify -> 2/5
    check("context precision@5", context_precision(j, 5), 2 / 5)

    # dcg over [0,3,1,2,0]:
    #   (2^0-1)/log2(2)=0
    #   (2^3-1)/log2(3)=7/1.5849625=4.416508
    #   (2^1-1)/log2(4)=1/2=0.5
    #   (2^2-1)/log2(5)=3/2.3219281=1.292030
    #   (2^0-1)/log2(6)=0
    got_dcg = dcg([0, 3, 1, 2, 0])
    want_dcg = 7 / math.log2(3) + 1 / math.log2(4) + 3 / math.log2(5)
    check("dcg", got_dcg, want_dcg, tol=1e-9)

    # ideal uses ALL judged grades: z=3,b=3,d=2,c=1,a=0,e=0 -> [3,3,2,1,0,0][:5]
    ideal = dcg([3, 3, 2, 1, 0])
    check("ndcg@5", ndcg_at_k(j, 5), got_dcg / ideal, tol=1e-9)

    # a query with no relevant chunk anywhere scores 0, not a division error
    empty = Judged("q2", ["x"], {"x": 0})
    check("ndcg with no relevant chunk", ndcg_at_k(empty, 10), 0.0)
    check("recall with no relevant chunk", recall_at_k(empty, 10), 0.0)
    check("mrr with no relevant chunk", mrr_at_k(empty, 10), 0.0)

    # unjudged chunks count as 0, not as unknown
    unj = Judged("q3", ["never-graded"], {"other": 3})
    check("unjudged chunk scores 0", recall_at_k(unj, 10), 0.0)

    print("\ngrounding")
    good = AnswerRecord("q", True, False, "yes",
                        [{"resolved": True, "verified": True},
                         {"resolved": True, "verified": True}], 2)
    check("citation accuracy all good", citation_accuracy(good), 1.0)
    check("citation coverage all cited", citation_coverage(good), 1.0)

    half = AnswerRecord("q", True, False, "yes",
                        [{"resolved": True, "verified": True},
                         {"resolved": True, "verified": False}], 4)
    check("citation accuracy 1 of 2", citation_accuracy(half), 0.5)
    check("citation coverage 2 of 4 claims", citation_coverage(half), 0.5)

    # resolved but unverified is NOT accurate: the chunk exists, the quote does not
    forged = AnswerRecord("q", True, False, "y",
                          [{"resolved": False, "verified": False}], 1)
    check("unresolved citation is not accurate", citation_accuracy(forged), 0.0)

    none = AnswerRecord("q", True, False, "y", [], 0)
    check("no citations -> None, not 0.0", citation_accuracy(none), None)
    check("no claims -> None, not 0.0", citation_coverage(none), None)

    print("\nabstention")
    check("declined an unanswerable query",
          abstention_correct(AnswerRecord("q", False, True, "", [], 0)), 1.0)
    check("answered an unanswerable query",
          abstention_correct(AnswerRecord("q", False, False, "x", [], 1)), 0.0)
    check("declined an answerable query",
          abstention_correct(AnswerRecord("q", True, True, "", [], 0)), 0.0)
    check("answered an answerable query",
          abstention_correct(AnswerRecord("q", True, False, "x", [], 1)), 1.0)

    print("\nlatency and cost")
    check("p50 of 1..5", percentile([1, 2, 3, 4, 5], 50), 3.0)
    check("p95 of 1..100", percentile(list(range(1, 101)), 95), 95.05, tol=1e-9)
    check("percentile of empty", percentile([], 95), 0.0)
    check("single value", percentile([7.0], 99), 7.0)
    check("local model costs 0", cost_per_query(1000, 500, 0.0, 0.0), 0.0)
    # 1,000,000 in at $2 + 1,000,000 out at $6 = $8
    check("hosted rate arithmetic",
          cost_per_query(1_000_000, 1_000_000, 2.0, 6.0), 8.0)

    print(f"\n{'PASS' if not FAILURES else 'FAIL: ' + ', '.join(FAILURES)}")
    return 1 if FAILURES else 0


if __name__ == "__main__":
    sys.exit(main())
