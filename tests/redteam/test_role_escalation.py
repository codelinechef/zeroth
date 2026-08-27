"""
Role escalation through the zeroth.role setting.

The policy authorises via `current_setting('zeroth.role', true)`. Everything an
attacker could put in that setting is tried here: values that do not exist,
values that are empty, the setting left unset entirely, and values shaped like
SQL or like an attempt to widen the match.

The property under test is that every one of them resolves to NO tenants.
Failing closed is the only acceptable default, and the dangerous outcome is not
an error — it is a query that quietly returns rows.
"""
from __future__ import annotations

from _harness import Case, AttackSucceeded, app_connection, as_role

#: Every value that is not a real role name must yield nothing.
FORGED = [
    ("unset", None),
    ("empty string", ""),
    ("whitespace", "   "),
    ("unknown role", "root"),
    ("admin-sounding", "admin"),
    ("superuser-sounding", "postgres"),
    ("wildcard", "*"),
    ("sql wildcard", "%"),
    ("array literal", "{all_tenants}"),
    ("comma list", "all_tenants,single_tenant"),
    ("quote break", "all_tenants' OR '1'='1"),
    ("comment break", "all_tenants'--"),
    ("union attempt", "x' UNION SELECT tenant FROM zeroth.acl--"),
    ("null byte", "all_tenants\x00extra"),
    ("case variant", "ALL_TENANTS"),
    ("leading space", " all_tenants"),
    ("trailing space", "all_tenants "),
    ("unicode lookalike", "аll_tenants"),  # Cyrillic 'а'
    ("path-ish", "../all_tenants"),
    ("json", '{"role":"all_tenants"}'),
]


#: Sentinel for an attack the stack refused before it reached the policy.
REJECTED = -1


def _visible(role):
    """Chunks visible under `role`, or REJECTED if the value never got there.

    A value the driver refuses (a NUL byte, for instance) is withstood, not
    failed: the attack did not reach the database. Reporting that as a failure
    would be a false alarm, and a security suite that cries wolf gets muted.
    """
    conn = app_connection()
    try:
        with as_role(conn, role):
            with conn.cursor() as cur:
                cur.execute("SELECT count(*) FROM zeroth.chunk")
                return cur.fetchone()[0]
    except Exception:
        return REJECTED
    finally:
        conn.close()


def _denied(sql: str, role: str = "all_tenants") -> bool:
    """True when the statement was refused.

    The attempt runs on its own connection because a permission error aborts
    the surrounding transaction; sharing one would make the NEXT probe fail for
    a reason that has nothing to do with the attack it is testing.
    """
    conn = app_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT set_config('zeroth.role', %s, false)", (role,))
            cur.execute(sql)
            cur.fetchall()
        return False
    except Exception:
        return True
    finally:
        conn.close()


def cases() -> list[Case]:
    out: list[Case] = []
    for label, value in FORGED:
        def check(value=value, label=label):
            seen = _visible(value)
            if seen not in (0, REJECTED):
                raise AttackSucceeded(
                    f"role value {label} ({value!r}) returned {seen} chunks; "
                    f"an unrecognised role must resolve to no tenants")
        out.append(Case(
            category="role-escalation",
            name=f"forged role: {label}",
            check=check,
            impact="an attacker who controls the role setting reads any tenant",
        ))

    # The authorisation matrix itself must stay unreadable, or the application
    # can enumerate who is allowed to see what.
    for table in ("acl", "role"):
        def check(table=table):
            if not _denied(f"SELECT count(*) FROM zeroth.{table}"):
                raise AttackSucceeded(
                    f"the application role read zeroth.{table}; it can enumerate "
                    f"the authorisation matrix")
        out.append(Case(
            category="role-escalation",
            name=f"read authorisation table zeroth.{table}",
            check=check,
            impact="the application can enumerate who may see what",
        ))

    # A widely-permitted role must not be able to widen itself further by
    # writing to the tables that decide access.
    def check_write():
        if not _denied(
            "INSERT INTO zeroth.acl(role_name, tenant) "
            "VALUES ('single_tenant', 'edgar-retail')", role="single_tenant"):
            raise AttackSucceeded(
                "the application role granted itself an additional tenant")
    out.append(Case(
        category="role-escalation",
        name="self-grant an extra tenant",
        check=check_write,
        impact="privilege escalation to any tenant",
    ))
    return out
