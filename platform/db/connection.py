"""
Database connections.

Two roles, deliberately separated:

  owner  — migrations and ingestion. Owns the schema.
  app    — every read on the query path. NOSUPERUSER, NOBYPASSRLS.

The app connection ASSERTS it cannot bypass row-level security before it is
handed to a caller. A superuser is exempt from RLS silently — no error, no
warning, policies simply do not apply — so a misconfigured connection string
would make every security test pass for the wrong reason. That assertion is
the only thing standing between a typo and a meaningless security result.
"""
from __future__ import annotations

import os
from contextlib import contextmanager
from pathlib import Path

import psycopg

ROOT = Path(__file__).resolve().parents[2]

OWNER_DSN = os.environ.get(
    "ZEROTH_OWNER_DSN", "postgresql://postgres:local_dev_only@localhost:5433/zeroth")
APP_DSN = os.environ.get(
    "ZEROTH_APP_DSN", "postgresql://zeroth_app:local_dev_only@localhost:5433/zeroth")


class PrivilegeError(RuntimeError):
    """The connection has more privilege than the query path may have."""


def owner_connection(**kw) -> psycopg.Connection:
    return psycopg.connect(OWNER_DSN, **kw)


def app_connection(**kw) -> psycopg.Connection:
    conn = psycopg.connect(APP_DSN, **kw)
    with conn.cursor() as cur:
        cur.execute(
            "SELECT current_user, rolsuper, rolbypassrls "
            "FROM pg_roles WHERE rolname = current_user")
        user, is_super, bypasses = cur.fetchone()
    if is_super or bypasses:
        conn.close()
        raise PrivilegeError(
            f"the query path connected as {user!r} with rolsuper={is_super}, "
            f"rolbypassrls={bypasses}. Row-level security would be bypassed "
            f"silently and every access-control result would be meaningless."
        )
    return conn


@contextmanager
def as_role(conn: psycopg.Connection, role_name: str):
    """Run inside a transaction with the retrieval role set.

    set_config with is_local=true scopes the setting to the transaction, so a
    pooled connection cannot leak one request's role into the next.
    """
    with conn.transaction():
        with conn.cursor() as cur:
            cur.execute("SELECT set_config('zeroth.role', %s, true)", (role_name,))
        yield conn
