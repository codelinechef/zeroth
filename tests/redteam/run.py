#!/usr/bin/env python3
"""
Run the red-team suite and report the pass rate honestly.

    python3 tests/redteam/run.py              # run everything
    python3 tests/redteam/run.py --json out.json

Reports the rate whatever it is. A security section showing 100% with no
failures ever displayed is the least believable thing this project could
publish, so the runner prints what happened, including the categories that
found nothing.

Exit code is non-zero on any failure, so CI gates on it.
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from _harness import Report  # noqa: E402

MODULES = [
    "test_policy_config",
    "test_cross_tenant",
    "test_role_escalation",
    "test_defence_in_depth",
    "test_injection",
    "test_answer_integrity",
]


def collect():
    cases = []
    for name in MODULES:
        mod = __import__(name)
        cases.extend(mod.cases())
    return cases


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--json", help="write the report to this path")
    args = ap.parse_args()

    started = time.time()
    cases = collect()
    report = Report()

    for c in cases:
        try:
            c.check()
            report.add(c, True)
        except Exception as e:
            report.add(c, False, str(e))

    elapsed = time.time() - started

    by_cat: dict[str, list] = {}
    for r in report.results:
        by_cat.setdefault(r.case.category, []).append(r)

    print(f"\nZeroth red-team suite — {report.total} cases in {elapsed:.1f}s\n")
    width = max(len(c) for c in by_cat)
    for cat in sorted(by_cat):
        rs = by_cat[cat]
        ok = sum(1 for r in rs if r.passed)
        mark = "ok  " if ok == len(rs) else "FAIL"
        print(f"  {mark}  {cat:<{width}}  {ok}/{len(rs)}")

    if report.failed:
        print(f"\n{len(report.failed)} attack(s) succeeded:\n")
        for r in report.failed:
            print(f"  [{r.case.category}] {r.case.name}")
            print(f"    impact: {r.case.impact}")
            print(f"    {r.detail}\n")

    rate = 100.0 * report.passed / report.total if report.total else 0.0
    print(f"\n{report.passed}/{report.total} withstood ({rate:.1f}%)\n")

    if args.json:
        Path(args.json).write_text(json.dumps({
            "total": report.total,
            "passed": report.passed,
            "rate": round(rate, 2),
            "elapsed_s": round(elapsed, 2),
            "by_category": {
                c: {"total": len(rs), "passed": sum(1 for r in rs if r.passed)}
                for c, rs in by_cat.items()
            },
            "failures": [
                {"category": r.case.category, "name": r.case.name,
                 "impact": r.case.impact, "detail": r.detail}
                for r in report.failed
            ],
        }, indent=2) + "\n")

    return 1 if report.failed else 0


if __name__ == "__main__":
    sys.exit(main())
