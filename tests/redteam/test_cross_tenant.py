"""
Cross-tenant retrieval: every role against every tenant.

The core access-control claim. For each (role, tenant) pair the suite asks the
database directly for chunks in that tenant, under that role, and checks the
answer against the authorisation matrix — which the test reads as the owner,
because the application role deliberately cannot read zeroth.acl.

Two failure directions, both tested:

  * leak      — the role saw a tenant it is not entitled to. A breach.
  * over-deny — the role saw nothing for a tenant it IS entitled to. Not a
                breach, but it means the policy is not doing what the test
                thinks it is, and a suite that only tests for leaks would call
                a completely broken policy a pass.
"""
from __future__ import annotations

from _harness import Case, AttackSucceeded, app_connection, as_role, OWNER_DSN


def _matrix() -> dict[str, set[str]]:
    """role -> permitted tenants, read as the owner."""
    import psycopg
    with psycopg.connect(OWNER_DSN) as conn, conn.cursor() as cur:
        cur.execute("SELECT role_name, tenant FROM zeroth.acl")
        out: dict[str, set[str]] = {}
        for role, tenant in cur.fetchall():
            out.setdefault(role, set()).add(tenant)
        cur.execute("SELECT role_name FROM zeroth.role")
        for (role,) in cur.fetchall():
            out.setdefault(role, set())
        return out


def _tenants() -> list[str]:
    import psycopg
    with psycopg.connect(OWNER_DSN) as conn, conn.cursor() as cur:
        cur.execute("SELECT tenant FROM zeroth.tenant ORDER BY tenant")
        return [t for (t,) in cur.fetchall()]


def cases() -> list[Case]:
    matrix = _matrix()
    tenants = _tenants()
    out: list[Case] = []

    for role in sorted(matrix):
        permitted = matrix[role]
        for tenant in tenants:
            allowed = tenant in permitted

            def check(role=role, tenant=tenant, allowed=allowed):
                conn = app_connection()
                try:
                    with as_role(conn, role):
                        with conn.cursor() as cur:
                            cur.execute(
                                "SELECT count(*) FROM zeroth.chunk WHERE tenant = %s",
                                (tenant,))
                            seen = cur.fetchone()[0]
                finally:
                    conn.close()

                if not allowed and seen > 0:
                    raise AttackSucceeded(
                        f"role {role!r} read {seen} chunks from unauthorised "
                        f"tenant {tenant!r}")
                if allowed and seen == 0:
                    raise AttackSucceeded(
                        f"role {role!r} is authorised for tenant {tenant!r} but "
                        f"read nothing — the policy denies more than it should, "
                        f"so a leak test against it proves nothing")

            out.append(Case(
                category="cross-tenant",
                name=f"{role} -> {tenant} ({'allow' if allowed else 'deny'})",
                check=check,
                impact="one role reads another tenant's documents",
            ))
    return out
