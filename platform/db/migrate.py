#!/usr/bin/env python3
"""
Migration runner.

    python3 platform/db/migrate.py            # apply pending migrations
    python3 platform/db/migrate.py --status   # show what is applied
    python3 platform/db/migrate.py --verify   # assert the security invariants

Migrations are plain SQL, applied in filename order and recorded by checksum. A
migration whose contents changed after being applied is an error rather than a
silent re-run: the database and the file would otherwise disagree with nobody
noticing.

NOTE ON IMPORTS: platform/ is a plain directory and must never contain
__init__.py. `platform` is a Python standard-library module, and a package of
that name at the repository root shadows it — which breaks torch and
transformers immediately with "module 'platform' has no attribute 'system'".
Entry points put platform/ on sys.path and import `db.x`, never `platform.db.x`.
"""
from __future__ import annotations

import argparse
import hashlib
import sys
from pathlib import Path

PLATFORM = Path(__file__).resolve().parents[1]
if str(PLATFORM) not in sys.path:
    sys.path.insert(0, str(PLATFORM))

from db.connection import (  # noqa: E402
    owner_connection, app_connection, PrivilegeError, APP_DSN,
)

MIGRATIONS = Path(__file__).resolve().parent / "migrations"


def log(m: str) -> None:
    print(m, flush=True)


def ensure_role() -> None:
    """Create the application role if it is missing, and assert its privileges.

    Explicitly NOSUPERUSER NOBYPASSRLS. A superuser is exempt from row-level
    security silently, so a role created carelessly makes every security
    result meaningless while every test still passes.
    """
    import re
    m = re.match(r"postgresql://([^:]+):([^@]+)@", APP_DSN)
    user, password = (m.group(1), m.group(2)) if m else ("zeroth_app", "local_dev_only")
    with owner_connection(autocommit=True) as conn:
        cur = conn.cursor()
        cur.execute("SELECT 1 FROM pg_roles WHERE rolname = %s", (user,))
        if not cur.fetchone():
            cur.execute(
                f"CREATE ROLE {user} LOGIN NOSUPERUSER NOBYPASSRLS "
                f"NOCREATEDB NOCREATEROLE PASSWORD %s", (password,))
            log(f"  created role {user} (NOSUPERUSER NOBYPASSRLS)")
        else:
            cur.execute(
                f"ALTER ROLE {user} NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE")
        cur.execute("GRANT CONNECT ON DATABASE zeroth TO " + user)


def applied(cur) -> dict[str, str]:
    cur.execute("""
        CREATE TABLE IF NOT EXISTS zeroth_migration (
            name text PRIMARY KEY,
            checksum text NOT NULL,
            applied_at timestamptz NOT NULL DEFAULT now())""")
    cur.execute("SELECT name, checksum FROM zeroth_migration")
    return dict(cur.fetchall())


def run(status_only: bool = False) -> int:
    ensure_role()
    with owner_connection(autocommit=True) as conn:
        cur = conn.cursor()
        cur.execute("CREATE EXTENSION IF NOT EXISTS vector")
        done = applied(cur)
        pending = []
        for f in sorted(MIGRATIONS.glob("*.sql")):
            digest = hashlib.sha256(f.read_bytes()).hexdigest()[:16]
            if f.name in done:
                if done[f.name] != digest:
                    log(f"  !! {f.name} changed after being applied "
                        f"({done[f.name]} -> {digest})")
                    log("     Write a new migration rather than editing an applied one.")
                    return 1
                log(f"  = {f.name}")
            else:
                pending.append((f, digest))
                log(f"  + {f.name} (pending)")
        if status_only:
            return 0
        for f, digest in pending:
            log(f"  applying {f.name}")
            cur.execute(f.read_text())
            cur.execute(
                "INSERT INTO zeroth_migration (name, checksum) VALUES (%s,%s)",
                (f.name, digest))
        cur.execute("SELECT zeroth.force_rls_on_partitions()")
        forced = cur.fetchone()[0]
        if forced:
            log(f"  forced RLS on {forced} partition(s) that lacked it")
    return 0


def verify() -> int:
    """Assert the invariants that fail SILENTLY if they regress."""
    ok = True
    with owner_connection(autocommit=True) as conn:
        cur = conn.cursor()

        cur.execute("SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname='zeroth_app'")
        row = cur.fetchone()
        if not row:
            log("  FAIL  role zeroth_app does not exist"); ok = False
        elif row[0] or row[1]:
            log(f"  FAIL  zeroth_app rolsuper={row[0]} rolbypassrls={row[1]}"); ok = False
        else:
            log("  ok    zeroth_app is NOSUPERUSER NOBYPASSRLS")

        cur.execute("""
            SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
            FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname='zeroth' AND c.relkind IN ('r','p')
              AND (c.relname IN ('chunk','document') OR c.relname LIKE 'chunk\\_%')""")
        rows = cur.fetchall()
        bad = [r[0] for r in rows if not (r[1] and r[2])]
        if bad:
            log(f"  FAIL  RLS not enabled+forced on {len(bad)} table(s): {', '.join(bad[:5])}")
            ok = False
        else:
            log(f"  ok    RLS enabled and FORCED on all {len(rows)} tenant table(s)")

        cur.execute("""SELECT p.prosecdef, p.proconfig FROM pg_proc p
                       JOIN pg_namespace n ON n.oid=p.pronamespace
                       WHERE n.nspname='zeroth' AND p.proname='current_tenants'""")
        r = cur.fetchone()
        if not r or not r[0]:
            log("  FAIL  current_tenants() is not SECURITY DEFINER"); ok = False
        elif not any(str(c).startswith("search_path=") for c in (r[1] or [])):
            log("  FAIL  current_tenants() has no pinned search_path"); ok = False
        else:
            log("  ok    current_tenants() is SECURITY DEFINER with a pinned search_path")

        cur.execute("SELECT has_table_privilege('zeroth_app','zeroth.acl','SELECT')")
        if cur.fetchone()[0]:
            log("  FAIL  zeroth_app can read zeroth.acl and enumerate the matrix"); ok = False
        else:
            log("  ok    zeroth_app cannot read the ACL table")

    try:
        with app_connection() as conn:
            conn.close()
        log("  ok    app connection passes the privilege assertion")
    except PrivilegeError as e:
        log(f"  FAIL  {e}"); ok = False

    return 0 if ok else 1


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--status", action="store_true")
    ap.add_argument("--verify", action="store_true")
    a = ap.parse_args()
    if a.verify:
        log("verifying security invariants")
        return verify()
    log("migrations")
    rc = run(status_only=a.status)
    if rc or a.status:
        return rc
    log("\nverifying security invariants")
    return verify()


if __name__ == "__main__":
    sys.exit(main())
