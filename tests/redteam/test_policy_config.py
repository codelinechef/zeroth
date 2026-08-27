"""
Configuration invariants that behaviour alone cannot catch.

Mutation testing found the gap this module closes. Disabling FORCE ROW LEVEL
SECURITY went undetected by every behavioural test, and correctly so: FORCE
only changes what the table OWNER sees, and the access-control suite connects
as zeroth_app, never as the owner. A test that connected as the owner to catch
it would be a test that connects as the owner — the exact mistake the whole
design exists to prevent.

So these are asserted as configuration. Each one is a silent-bypass path: none
of them raises an error when wrong, the policy simply stops applying, and the
observed consequence was a probe returning recall 0.95 with no restriction in
force at all.
"""
from __future__ import annotations

from _harness import Case, AttackSucceeded, OWNER_DSN

TENANT_TABLES = ["chunk", "document"]


def _one(sql: str, params=()):
    import psycopg
    with psycopg.connect(OWNER_DSN) as conn, conn.cursor() as cur:
        cur.execute(sql, params)
        row = cur.fetchone()
        return row[0] if row else None


def cases() -> list[Case]:
    out: list[Case] = []

    for table in TENANT_TABLES:
        def check_enabled(table=table):
            on = _one(
                "SELECT relrowsecurity FROM pg_class c "
                "JOIN pg_namespace n ON n.oid = c.relnamespace "
                "WHERE n.nspname='zeroth' AND c.relname=%s", (table,))
            if not on:
                raise AttackSucceeded(
                    f"row-level security is DISABLED on zeroth.{table}; the "
                    f"policy exists but never applies")
        out.append(Case(
            category="policy-config",
            name=f"RLS enabled on zeroth.{table}",
            check=check_enabled,
            impact="every tenant is readable by every role",
        ))

        def check_forced(table=table):
            forced = _one(
                "SELECT relforcerowsecurity FROM pg_class c "
                "JOIN pg_namespace n ON n.oid = c.relnamespace "
                "WHERE n.nspname='zeroth' AND c.relname=%s", (table,))
            if not forced:
                raise AttackSucceeded(
                    f"FORCE ROW LEVEL SECURITY is off on zeroth.{table}. The "
                    f"table owner is exempt from the policy, and relforcerow"
                    f"security defaults to false — a probe run as the owner "
                    f"returned recall 0.95 with no restriction applied.")
        out.append(Case(
            category="policy-config",
            name=f"FORCE RLS on zeroth.{table}",
            check=check_forced,
            impact="anything running as the table owner reads every tenant",
        ))

        def check_policy(table=table):
            n = _one(
                "SELECT count(*) FROM pg_policies "
                "WHERE schemaname='zeroth' AND tablename=%s "
                "AND cmd='SELECT' AND qual LIKE '%%current_tenants%%'", (table,))
            if not n:
                raise AttackSucceeded(
                    f"no SELECT policy on zeroth.{table} authorises via "
                    f"zeroth.current_tenants(); the authorisation path is not "
                    f"the one the design assumes")
        out.append(Case(
            category="policy-config",
            name=f"policy on zeroth.{table} uses current_tenants()",
            check=check_policy,
            impact="authorisation runs through an unreviewed path",
        ))

    def check_role_privs():
        row = _one(
            "SELECT rolsuper OR rolbypassrls FROM pg_roles WHERE rolname='zeroth_app'")
        if row is None:
            raise AttackSucceeded("the zeroth_app role does not exist")
        if row:
            raise AttackSucceeded(
                "zeroth_app has SUPERUSER or BYPASSRLS; row-level security is "
                "silently inapplicable to every query it runs")
    out.append(Case(
        category="policy-config",
        name="zeroth_app is NOSUPERUSER and NOBYPASSRLS",
        check=check_role_privs,
        impact="the entire policy is bypassed with no error",
    ))

    def check_definer():
        secdef = _one(
            "SELECT prosecdef FROM pg_proc p JOIN pg_namespace n "
            "ON n.oid=p.pronamespace WHERE n.nspname='zeroth' "
            "AND p.proname='current_tenants'")
        if not secdef:
            raise AttackSucceeded(
                "zeroth.current_tenants() is not SECURITY DEFINER, so the "
                "querying role needs SELECT on zeroth.acl and can enumerate "
                "the whole authorisation matrix")
    out.append(Case(
        category="policy-config",
        name="current_tenants() is SECURITY DEFINER",
        check=check_definer,
        impact="the application can read who is allowed to see what",
    ))

    def check_search_path():
        cfg = _one(
            "SELECT array_to_string(proconfig, ',') FROM pg_proc p "
            "JOIN pg_namespace n ON n.oid=p.pronamespace "
            "WHERE n.nspname='zeroth' AND p.proname='current_tenants'")
        if not cfg or "search_path" not in cfg:
            raise AttackSucceeded(
                "zeroth.current_tenants() has no pinned search_path; a "
                "SECURITY DEFINER function without one can be hijacked by a "
                "caller-controlled search_path")
    out.append(Case(
        category="policy-config",
        name="current_tenants() pins its search_path",
        check=check_search_path,
        impact="a caller redirects the authorisation lookup to its own table",
    ))
    return out
