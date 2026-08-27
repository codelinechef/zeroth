#!/usr/bin/env python3
"""
Apply the migrations and seed a small synthetic corpus, for CI.

The access-control properties the suite tests are properties of the policy, not
of the corpus: three roles over a handful of tenants exercise exactly the same
USING clause as 47 tenants over 51,310 chunks. Seeding small keeps the gate
fast enough that it actually runs on every push.

Nothing here is published. This data never reaches the site.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

import psycopg

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "platform"))

OWNER = os.environ.get(
    "ZEROTH_OWNER_DSN", "postgresql://postgres:local_dev_only@localhost:5433/zeroth")

TENANTS = [f"synthetic-{i:02d}" for i in range(6)]
ROLES = {
    "all_tenants": TENANTS,
    "analyst_mid": TENANTS[:3],
    "single_tenant": TENANTS[:1],
}


def main() -> int:
    from db import migrate  # noqa: F401  (applies migrations on import path)

    os.environ.setdefault("ZEROTH_OWNER_DSN", OWNER)
    migrate.main() if hasattr(migrate, "main") else None

    with psycopg.connect(OWNER, autocommit=True) as conn, conn.cursor() as cur:
        for t in TENANTS:
            cur.execute(
                "INSERT INTO zeroth.tenant(tenant) VALUES (%s) "
                "ON CONFLICT DO NOTHING", (t,))
            cur.execute("SELECT zeroth.ensure_partition(%s)", (t,))
        for role, tenants in ROLES.items():
            cur.execute(
                "INSERT INTO zeroth.role(role_name) VALUES (%s) "
                "ON CONFLICT DO NOTHING", (role,))
            for t in tenants:
                cur.execute(
                    "INSERT INTO zeroth.acl(role_name, tenant) VALUES (%s,%s) "
                    "ON CONFLICT DO NOTHING", (role, t))
        for t in TENANTS:
            cur.execute(
                "INSERT INTO zeroth.document(doc_id, tenant, source, title) "
                "VALUES (%s,%s,'synthetic','seed') ON CONFLICT DO NOTHING",
                (f"{t}-doc", t))
            for i in range(3):
                cur.execute(
                    "INSERT INTO zeroth.chunk"
                    "(chunk_id, doc_id, tenant, page, section, body, embedding, tsv) "
                    "VALUES (%s,%s,%s,1,'s',%s,"
                    "  (SELECT array_fill(0.01::real, ARRAY[384])::vector),"
                    "  to_tsvector('english', %s)) ON CONFLICT DO NOTHING",
                    (f"{t}::fixed-512::{i:05d}", f"{t}-doc", t,
                     f"synthetic body {i}", f"synthetic body {i}"))
    print(f"seeded {len(TENANTS)} tenants, {len(ROLES)} roles")
    return 0


if __name__ == "__main__":
    sys.exit(main())
