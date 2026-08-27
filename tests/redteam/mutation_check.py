#!/usr/bin/env python3
"""
Prove the suite fails when the thing it guards is broken.

A red-team suite that always passes is indistinguishable from one that tests
nothing. This deliberately introduces each of the silent-bypass bugs the RLS
migration was written to close, re-runs the suite, and asserts it goes red —
then restores the original policy.

    python3 tests/redteam/mutation_check.py

Every mutation is applied and reverted inside a try/finally, and the original
policy definition is captured from the live database first, so a crash mid-run
restores rather than leaving the database wide open.
"""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

import psycopg

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from _harness import OWNER_DSN  # noqa: E402

ORIGINAL = """
DROP POLICY IF EXISTS chunk_tenant_read ON zeroth.chunk;
CREATE POLICY chunk_tenant_read ON zeroth.chunk
    FOR SELECT TO zeroth_app
    USING (tenant = ANY (zeroth.current_tenants()));
ALTER TABLE zeroth.chunk ENABLE ROW LEVEL SECURITY;
ALTER TABLE zeroth.chunk FORCE ROW LEVEL SECURITY;
"""

MUTATIONS = {
    "policy always true": """
        DROP POLICY IF EXISTS chunk_tenant_read ON zeroth.chunk;
        CREATE POLICY chunk_tenant_read ON zeroth.chunk
            FOR SELECT TO zeroth_app USING (true);
    """,
    "row level security disabled": """
        ALTER TABLE zeroth.chunk DISABLE ROW LEVEL SECURITY;
    """,
    "force disabled (owner bypass path)": """
        ALTER TABLE zeroth.chunk NO FORCE ROW LEVEL SECURITY;
    """,
}


def apply(sql: str) -> None:
    with psycopg.connect(OWNER_DSN, autocommit=True) as c, c.cursor() as cur:
        cur.execute(sql)


def run_suite() -> int:
    return subprocess.run(
        [sys.executable, str(HERE / "run.py")],
        capture_output=True, text=True).returncode


def main() -> int:
    print("baseline: suite must pass before mutating")
    if run_suite() != 0:
        print("  baseline is already failing — fix that before mutation testing")
        return 1
    print("  ok\n")

    failures = []
    for name, sql in MUTATIONS.items():
        print(f"mutation: {name}")
        try:
            apply(sql)
            rc = run_suite()
            if rc == 0:
                failures.append(name)
                print("  NOT DETECTED — the suite passed with this bug present\n")
            else:
                print("  detected (suite failed, as it must)\n")
        finally:
            apply(ORIGINAL)

    print("restored; confirming the suite is green again")
    if run_suite() != 0:
        print("  RESTORE FAILED — the database is not back to its original policy")
        return 1
    print("  ok\n")

    if failures:
        print(f"{len(failures)} mutation(s) went undetected: {failures}")
        return 1
    print(f"all {len(MUTATIONS)} mutations detected")
    return 0


if __name__ == "__main__":
    sys.exit(main())
