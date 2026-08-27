"""
A tiny result-collecting harness shared by the red-team modules.

The repository's existing tests run standalone or under pytest, and pytest is
not installed in this environment. Rather than make the security suite the
thing that forces a new dependency, each module exposes `cases()` returning
Case objects, and both runners consume that:

    python3 tests/redteam/run.py          # standalone, prints a report
    pytest tests/redteam                  # if pytest is present

A red-team suite that cannot be run because of tooling is a suite that does not
run.
"""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from typing import Callable

APP_DSN = os.environ.get(
    "ZEROTH_APP_DSN", "postgresql://zeroth_app:local_dev_only@localhost:5433/zeroth")
OWNER_DSN = os.environ.get(
    "ZEROTH_OWNER_DSN", "postgresql://postgres:local_dev_only@localhost:5433/zeroth")


@dataclass
class Case:
    """One attack, and whether the system withstood it."""
    category: str
    name: str
    check: Callable[[], None]
    #: What an attacker gains if this check fails. Written for the report, so a
    #: failure is legible without reading the test.
    impact: str = ""


@dataclass
class Result:
    case: Case
    passed: bool
    detail: str = ""


@dataclass
class Report:
    results: list[Result] = field(default_factory=list)

    def add(self, case: Case, passed: bool, detail: str = "") -> None:
        self.results.append(Result(case, passed, detail))

    @property
    def total(self) -> int:
        return len(self.results)

    @property
    def passed(self) -> int:
        return sum(1 for r in self.results if r.passed)

    @property
    def failed(self) -> list[Result]:
        return [r for r in self.results if not r.passed]


class AttackSucceeded(AssertionError):
    """The system did not withstand the attack. Raised by a check."""


def app_connection():
    """The query-path connection, with the privilege assertion applied.

    Imported lazily so the module can be read without a database present.
    """
    import psycopg

    conn = psycopg.connect(APP_DSN)
    with conn.cursor() as cur:
        cur.execute(
            "SELECT current_user, rolsuper, rolbypassrls "
            "FROM pg_roles WHERE rolname = current_user")
        user, is_super, bypasses = cur.fetchone()
    if is_super or bypasses:
        conn.close()
        raise AttackSucceeded(
            f"the suite connected as {user!r} with rolsuper={is_super}, "
            f"rolbypassrls={bypasses}. Every access-control test below would "
            f"pass for the wrong reason.")
    return conn


def as_role(conn, role_name: str | None):
    """Transaction scoped to a role. `None` leaves zeroth.role unset."""
    from contextlib import contextmanager

    @contextmanager
    def _ctx():
        with conn.transaction():
            if role_name is not None:
                with conn.cursor() as cur:
                    cur.execute(
                        "SELECT set_config('zeroth.role', %s, true)", (role_name,))
            yield conn

    return _ctx()
