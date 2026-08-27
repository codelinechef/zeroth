"""
The plan guard — a determinism requirement, not a nicety.

The same retrieval query executes two ways depending on table statistics and
machine-level planner settings. Both triggers were reproduced during the
investigation:

    partition ingested, ANALYZE not yet run   ->  Seq Scan (exact, not HNSW)
    random_page_cost = 20                     ->  Seq Scan (exact, not HNSW)

Partitioning does not remove this. It makes it finer-grained: each partition is
costed independently, so one query can mix exact and approximate scans across
tenants.

The flip is silent and it flips TOWARD better recall, so it never looks like a
bug. A run simply scores higher on one machine than another for reasons
unrelated to the configuration under test — which is a direct attack on the
claim that a stranger can clone the repository and reproduce the numbers.

Four requirements, all implemented here:

  1. pin_planner()        pins the GUC bundle on the retrieval connection
  2. assert_hnsw_plan()   walks the plan tree and checks every leaf scan
  3. raises PlanViolation so the caller discards the run rather than warning
  4. fingerprint()        md5 over ordered (node type, index name) pairs plus
                          the GUC bundle, recorded in the results JSON
"""
from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field

#: Pinned on every retrieval connection. Never inherited from the server or the
#: machine: random_page_cost alone was enough to flip the plan in testing.
GUC_BUNDLE: dict[str, str] = {
    "hnsw.ef_search": "200",
    "hnsw.iterative_scan": "off",
    "random_page_cost": "1.1",
    "enable_seqscan": "off",
}

#: Scan nodes that mean the planner did NOT use the vector index.
EXACT_SCANS = {"Seq Scan", "Bitmap Heap Scan", "Parallel Seq Scan"}


class PlanViolation(RuntimeError):
    """The executed plan is not the shape the run claims to measure."""


@dataclass
class PlanShape:
    nodes: list[tuple[str, str]] = field(default_factory=list)
    fingerprint: str = ""
    gucs: dict[str, str] = field(default_factory=dict)

    def as_dict(self) -> dict:
        return {
            "fingerprint": self.fingerprint,
            "nodes": [{"node": n, "index": i} for n, i in self.nodes],
            "gucs": self.gucs,
        }


def pin_planner(cur, gucs: dict[str, str] | None = None) -> dict[str, str]:
    """Apply the GUC bundle to this transaction and return what was set.

    set_config(..., is_local => true) is the parameterisable form of SET LOCAL.
    SET itself takes no bind parameters, and building the statement by string
    interpolation would put a config value into SQL text.
    """
    gucs = dict(gucs or GUC_BUNDLE)
    for name, value in gucs.items():
        cur.execute("SELECT set_config(%s, %s, true)", (name, value))
    return gucs


def _walk(node: dict, out: list[tuple[str, str]]) -> None:
    out.append((node.get("Node Type", "?"), node.get("Index Name", "")))
    for child in node.get("Plans", []) or []:
        _walk(child, out)


def capture(cur, sql: str, params: tuple, gucs: dict[str, str] | None = None) -> PlanShape:
    """EXPLAIN the query under the pinned planner state and summarise it.

    COSTS OFF because the cost numbers are machine-dependent and would make the
    fingerprint differ between machines that executed identically. The shape is
    what has to match, not the estimate.
    """
    applied = dict(gucs or GUC_BUNDLE)
    cur.execute("EXPLAIN (FORMAT JSON, COSTS OFF) " + sql, params)
    raw = cur.fetchone()[0]
    plan = raw[0]["Plan"] if isinstance(raw, list) else raw["Plan"]
    nodes: list[tuple[str, str]] = []
    _walk(plan, nodes)

    payload = json.dumps(
        {"nodes": nodes, "gucs": sorted(applied.items())}, sort_keys=True)
    return PlanShape(
        nodes=nodes,
        fingerprint=hashlib.md5(payload.encode()).hexdigest(),
        gucs=applied,
    )


def assert_hnsw_plan(shape: PlanShape, *, context: str = "retrieval") -> None:
    """Every leaf scan over a chunk partition must be an HNSW index scan.

    Raises rather than warning. A run whose plan shape does not match is not
    comparable to any other run, so continuing would produce a number that
    looks like a result and is not one.
    """
    exact = [n for n, _ in shape.nodes if n in EXACT_SCANS]
    if exact:
        raise PlanViolation(
            f"{context}: the planner chose {exact} instead of an HNSW index "
            f"scan. That is EXACT search, so recall is inflated relative to "
            f"any approximate run and the two cannot be compared. Usual cause: "
            f"a partition was ingested and never ANALYZEd, or random_page_cost "
            f"is set high on this machine. Plan: {shape.nodes}")

    index_scans = [(n, i) for n, i in shape.nodes if "Index Scan" in n]
    if not index_scans:
        raise PlanViolation(
            f"{context}: no index scan in the plan at all. Plan: {shape.nodes}")

    non_hnsw = [i for n, i in index_scans if i and "hnsw" not in i.lower()]
    if non_hnsw:
        raise PlanViolation(
            f"{context}: index scans used non-HNSW indexes {non_hnsw}. The run "
            f"is not measuring approximate vector retrieval.")


#: The guard EXPLAINs the REAL retrieval query, imported from the retrieval
#: module rather than restated here.
#:
#: An earlier version of this file carried its own lookalike probe with the
#: tenant predicate dropped, on the reasoning that row-level security supplies
#: the restriction anyway. That was wrong in a way worth recording: without the
#: predicate the planner cannot PRUNE partitions, so it plans across all 47 and
#: — with enable_seqscan off — walks each partition's primary key index instead
#: of its HNSW index. The guard then failed a run whose actual retrieval was
#: perfectly healthy.
#:
#: A plan guard that EXPLAINs a query the run does not execute is not a guard.
def dense_probe():
    """(sql, param_builder) for the query the run actually executes."""
    from retrieval.retrieve import DENSE_SQL
    # DENSE_SQL takes (vector, permitted_tenants, vector, k) — the vector twice
    # because it appears in both the projection and the ORDER BY.
    return DENSE_SQL, lambda vec, permitted, k: (vec, permitted, vec, k)
