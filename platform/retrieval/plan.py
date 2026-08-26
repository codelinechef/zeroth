"""
Plan assertion — the determinism guarantee.

The same retrieval query can execute two ways. With useful statistics the
planner picks an index scan and the result is approximate; without them it
picks a sequential scan and the result is exact. Recall moves UPWARD when it
flips to exact, so it never looks like a bug — a run simply scores higher on
one machine than another, and nothing in the output says why.

Reproducibility is this project's central claim, so the executed plan is
captured, asserted against the shape the run expects, and recorded alongside
the results. A mismatch fails the run rather than producing a number that
cannot be compared with any other.
"""
from __future__ import annotations

import json
from dataclasses import dataclass


@dataclass
class Plan:
    shape: str
    node_types: list[str]
    index_names: list[str]
    used_index: bool
    seq_scanned: bool
    raw: dict

    def matches(self, expect: str) -> bool:
        return expect in self.shape


def _walk(node: dict, out: list[str], idx: list[str]) -> None:
    out.append(node.get("Node Type", "?"))
    if node.get("Index Name"):
        idx.append(node["Index Name"])
    for child in node.get("Plans", []) or []:
        _walk(child, out, idx)


def capture(cur, sql: str, params: tuple) -> Plan:
    """EXPLAIN the query without executing it, and summarise the shape."""
    cur.execute("EXPLAIN (FORMAT JSON, COSTS OFF) " + sql, params)
    raw = cur.fetchone()[0]
    root = raw[0]["Plan"] if isinstance(raw, list) else raw["Plan"]
    nodes: list[str] = []
    idx: list[str] = []
    _walk(root, nodes, idx)
    used_index = any(n == "Index Scan" for n in nodes)
    seq = any(n == "Seq Scan" for n in nodes)
    # Collapse repeats: a 47-partition Append produces 47 identical node names
    # and the signature is only useful if it is readable.
    seen, compact = set(), []
    for n in nodes:
        if n not in seen:
            seen.add(n); compact.append(n)
    return Plan(shape=" > ".join(compact), node_types=nodes,
                index_names=sorted(set(idx)), used_index=used_index,
                seq_scanned=seq, raw=root)


class PlanMismatch(RuntimeError):
    """The executed plan is not the one this run's numbers assume."""


def assert_shape(plan: Plan, must_contain: str, context: str) -> None:
    # Exact node-type match. A substring test would let "Bitmap Index Scan"
    # satisfy a requirement for "Index Scan", which is a different access
    # method with different recall behaviour — that slipped through once.
    if must_contain not in plan.node_types:
        raise PlanMismatch(
            f"{context}: expected a plan containing {must_contain!r} but the "
            f"planner chose {plan.shape!r} (indexes: {plan.index_names or 'none'}). "
            f"Recall is not comparable across "
            f"these two plans, so the run is stopped rather than reported."
        )
