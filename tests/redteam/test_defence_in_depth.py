"""
Row-level security must hold on its own.

The retrieval SQL carries an EXPLICIT tenant predicate — `tenant = ANY(%s)` —
built from the permitted list. That predicate is a performance and clarity
device, not the security boundary. If it were the boundary, a bug that dropped
it would silently expose every tenant and every access-control test written
against the application path would still pass.

So these cases run the real retrieval shapes with the explicit predicate
REMOVED, leaving only the policy. Same query, same role, no application filter.
Anything returned outside the role's tenants means RLS was never doing the work.

This is the Phase 3 gate condition: "the suite still passes with the explicit
tenant predicate removed".
"""
from __future__ import annotations

from _harness import Case, AttackSucceeded, app_connection, as_role, OWNER_DSN

# The retrieval shapes, stripped of the application's tenant filter.
UNFILTERED = {
    "dense (no tenant predicate)": """
        SELECT tenant, count(*) FROM zeroth.chunk
        WHERE embedding IS NOT NULL
        GROUP BY tenant
    """,
    "lexical (no tenant predicate)": """
        SELECT tenant, count(*) FROM zeroth.chunk
        WHERE tsv IS NOT NULL
        GROUP BY tenant
    """,
    "documents (no tenant predicate)": """
        SELECT tenant, count(*) FROM zeroth.document GROUP BY tenant
    """,
    "unbounded scan": """
        SELECT tenant, count(*) FROM zeroth.chunk GROUP BY tenant
    """,
    "order-by-vector, no filter": """
        SELECT tenant, count(*) FROM (
            SELECT tenant FROM zeroth.chunk
            WHERE embedding IS NOT NULL
            ORDER BY embedding <=> (SELECT embedding FROM zeroth.chunk
                                    WHERE embedding IS NOT NULL LIMIT 1)
            LIMIT 500
        ) s GROUP BY tenant
    """,
}


def _permitted() -> dict[str, set[str]]:
    import psycopg
    with psycopg.connect(OWNER_DSN) as conn, conn.cursor() as cur:
        cur.execute("SELECT role_name, tenant FROM zeroth.acl")
        out: dict[str, set[str]] = {}
        for role, tenant in cur.fetchall():
            out.setdefault(role, set()).add(tenant)
        return out


def cases() -> list[Case]:
    permitted = _permitted()
    out: list[Case] = []
    for role in sorted(permitted):
        allowed = permitted[role]
        for label, sql in UNFILTERED.items():
            def check(role=role, sql=sql, allowed=allowed, label=label):
                conn = app_connection()
                try:
                    with as_role(conn, role):
                        with conn.cursor() as cur:
                            cur.execute(sql)
                            seen = {t for t, _ in cur.fetchall()}
                finally:
                    conn.close()
                leaked = seen - allowed
                if leaked:
                    raise AttackSucceeded(
                        f"with the application's tenant predicate removed, role "
                        f"{role!r} saw {len(leaked)} unauthorised tenant(s) via "
                        f"{label}: {sorted(leaked)[:3]}. The explicit predicate, "
                        f"not RLS, was providing the isolation.")
            out.append(Case(
                category="defence-in-depth",
                name=f"{role}: {label}",
                check=check,
                impact="isolation depends on an application filter a bug can drop",
            ))
    return out
