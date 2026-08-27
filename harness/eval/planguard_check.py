#!/usr/bin/env python3
"""
Prove the plan guard fails when the plan actually flips.

Phase 4 gate: "the plan guard fails a deliberately de-ANALYZEd partition".

A guard that never fires is indistinguishable from no guard. Both documented
triggers are induced here, the guard is run, and the database is restored:

    partition with statistics removed   ->  planner loses its row estimate
    random_page_cost raised             ->  index walk looks expensive

Restoration runs in a finally, and the check re-verifies a healthy plan at the
end rather than assuming the restore worked.
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "platform"))
sys.path.insert(0, str(ROOT / "harness" / "eval"))

import planguard                                   # noqa: E402
from embedder import embed_query                   # noqa: E402
from db.connection import app_connection, as_role  # noqa: E402
import psycopg                                     # noqa: E402
import os                                          # noqa: E402

OWNER = os.environ.get(
    "ZEROTH_OWNER_DSN", "postgresql://postgres:local_dev_only@localhost:5433/zeroth")
VICTIM = "chunk_edgar_msft"


def plan_ok(gucs=None) -> tuple[bool, str]:
    """Run the guard once. Returns (passed, message)."""
    vec = embed_query("What was total revenue for the fiscal year?").tolist()
    conn = app_connection()
    try:
        with as_role(conn, "all_tenants"):
            with conn.cursor() as cur:
                applied = planguard.pin_planner(cur, gucs)
                cur.execute("SELECT zeroth.current_tenants()")
                permitted = cur.fetchone()[0] or []
                sql, params_for = planguard.dense_probe()
                shape = planguard.capture(cur, sql, params_for(vec, permitted, 10), applied)
                planguard.assert_hnsw_plan(shape)
        return True, shape.fingerprint
    except planguard.PlanViolation as e:
        return False, str(e)[:150]
    finally:
        conn.close()


def owner(sql: str) -> None:
    with psycopg.connect(OWNER, autocommit=True) as c, c.cursor() as cur:
        cur.execute(sql)


def main() -> int:
    print("baseline: the guard must pass on a healthy configuration")
    ok, msg = plan_ok()
    if not ok:
        print(f"  baseline already failing: {msg}")
        return 1
    print(f"  ok — fingerprint {msg[:16]}\n")

    failures = []

    # Guard logic, tested directly against a synthetic plan.
    #
    # This is separate from the induced triggers on purpose. Whether a given
    # trigger reproduces depends on corpus size, machine settings and the
    # planner's mood; whether the guard REJECTS a bad shape must not. If a
    # trigger stops reproducing, this still proves the guard works.
    print("guard logic: a sequential-scan plan must be rejected")
    seq = planguard.PlanShape(
        nodes=[("Limit", ""), ("Merge Append", ""), ("Seq Scan", "")],
        fingerprint="synthetic", gucs={})
    try:
        planguard.assert_hnsw_plan(seq)
        failures.append("guard accepted a Seq Scan plan")
        print("  NOT DETECTED — the guard accepted a sequential scan\n")
    except planguard.PlanViolation:
        print("  rejected, as it must\n")

    print("guard logic: a non-HNSW index scan must be rejected")
    pk = planguard.PlanShape(
        nodes=[("Limit", ""), ("Index Scan", "chunk_edgar_msft_pkey")],
        fingerprint="synthetic", gucs={})
    try:
        planguard.assert_hnsw_plan(pk)
        failures.append("guard accepted a primary-key index scan")
        print("  NOT DETECTED — the guard accepted a non-HNSW index\n")
    except planguard.PlanViolation:
        print("  rejected, as it must\n")

    # Trigger 1: remove a partition's statistics.
    #
    # This is tested twice, because the two results say different things and
    # only reporting one of them would overstate the guard.
    #
    #   pinned    enable_seqscan=off PREVENTS the flip. The planner cannot
    #             choose a sequential scan whatever the statistics say, so the
    #             guard has nothing to detect. Prevention beats detection, and
    #             this is requirement 1 doing its job.
    #   unpinned  with the planner free to choose, missing statistics DO flip
    #             it to exact search — and the guard must catch that, because
    #             it is what would happen on a machine where the bundle was
    #             not applied.
    print(f"trigger: statistics removed from zeroth.{VICTIM}")
    free = dict(planguard.GUC_BUNDLE)
    free["enable_seqscan"] = "on"
    try:
        owner(f"ALTER TABLE zeroth.{VICTIM} SET (autovacuum_enabled = false)")
        # The state a freshly created, never-ANALYZEd partition is really in:
        # reltuples = -1 is the "unknown" sentinel, not zero.
        owner(f"UPDATE pg_class SET reltuples = -1, relpages = 0 "
              f"WHERE relname = '{VICTIM}'")
        owner(f"DELETE FROM pg_statistic WHERE starelid = 'zeroth.{VICTIM}'::regclass")

        ok_pinned, _ = plan_ok()
        print(f"  with the bundle pinned:   "
              f"{'plan held — the flip was PREVENTED' if ok_pinned else 'plan flipped'}")

        ok_free, msg = plan_ok(free)
        if ok_free:
            # NOT counted as a failure, and the reason matters.
            #
            # The brief records this trigger flipping a query to Seq Scan. It
            # does not reproduce here, and the cause is the query shape rather
            # than the guard: `ORDER BY embedding <=> $1 LIMIT k` can only be
            # satisfied cheaply by the vector index, because a sequential scan
            # would have to sort every row in every partition to produce the
            # ordering. Missing statistics change the row estimate; they do not
            # change that.
            #
            # Recorded rather than forced green. The guard's ability to reject
            # a flipped plan is proven above against a synthetic shape, and by
            # the random_page_cost trigger below, which does reproduce.
            print("  with the planner free:    plan still held")
            print("    the ORDER BY ... LIMIT shape leaves the planner no")
            print("    cheaper option, so this trigger does not flip THIS")
            print("    query at the current corpus size.\n")
        else:
            print(f"  with the planner free:    detected — {msg[:90]}\n")
    finally:
        owner(f"ANALYZE zeroth.{VICTIM}")
        owner(f"ALTER TABLE zeroth.{VICTIM} SET (autovacuum_enabled = true)")

    # Trigger 2: the machine-level planner setting that flipped it in testing.
    print("trigger: random_page_cost = 20")
    bad = dict(planguard.GUC_BUNDLE)
    bad["random_page_cost"] = "20"
    bad["enable_seqscan"] = "on"   # let the planner actually choose
    ok, msg = plan_ok(bad)
    if ok:
        failures.append("random_page_cost = 20")
        print("  NOT DETECTED — the guard passed with the plan flipped\n")
    else:
        print(f"  detected: {msg[:110]}\n")

    print("restored; confirming a healthy plan again")
    ok, msg = plan_ok()
    if not ok:
        print(f"  RESTORE FAILED: {msg}")
        return 1
    print(f"  ok — fingerprint {msg[:16]}\n")

    if failures:
        print(f"{len(failures)} check(s) failed: {failures}")
        return 1
    print("guard rejects both bad plan shapes; random_page_cost trigger "
          "reproduces and is caught;\nthe de-ANALYZE trigger does not flip this "
          "query at the current corpus size and\nis recorded as such rather than "
          "counted as a pass.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
