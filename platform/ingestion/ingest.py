#!/usr/bin/env python3
"""
Idempotent, checksum-keyed ingestion — brief Phase 2.

    python3 platform/ingestion/ingest.py                  # ingest / re-ingest
    python3 platform/ingestion/ingest.py --strategy section-aware
    python3 platform/ingestion/ingest.py --limit 50       # smoke test
    python3 platform/ingestion/ingest.py --touch <doc_id> # force one document

Idempotency is keyed on the raw-bytes checksum recorded in the corpus manifest.
If the checksum on the document row matches, nothing downstream can have
changed, so the document is skipped entirely — no re-chunk, no re-embed, no
re-index. Re-ingesting an unchanged corpus is therefore a measured no-op, which
is what the phase gate asks for.

Embeddings are reused from data/corpus/embeddings/ when present. Recomputing
them is a separate, explicit step: this script's job is to get the corpus into
the database, and silently spending GPU minutes would hide that cost.
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from collections import defaultdict
from pathlib import Path

import numpy as np

PLATFORM = Path(__file__).resolve().parents[1]
ROOT = PLATFORM.parent
if str(PLATFORM) not in sys.path:
    sys.path.insert(0, str(PLATFORM))

from db.connection import owner_connection  # noqa: E402
from ingestion.sanitise import sanitise      # noqa: E402

CORPUS = ROOT / "data" / "corpus"
MANIFEST = CORPUS / "corpus_manifest.json"
EMB = CORPUS / "embeddings"


def log(m: str) -> None:
    print(m, flush=True)


def vec_literal(v) -> str:
    return "[" + ",".join(f"{x:.6f}" for x in v) + "]"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--strategy", default="fixed-512")
    ap.add_argument("--limit", type=int)
    ap.add_argument("--touch", action="append", default=[],
                    help="force re-ingest of a doc_id even if unchanged")
    args = ap.parse_args()

    manifest = json.loads(MANIFEST.read_text())
    docs = [d for d in manifest["documents"] if not d.get("dedup")]
    if args.limit:
        docs = docs[:args.limit]
    by_doc = {d["doc_id"]: d for d in docs}

    chunks_path = CORPUS / "chunks" / f"{args.strategy}.jsonl"
    chunks_by_doc: dict[str, list[dict]] = defaultdict(list)
    for line in open(chunks_path):
        c = json.loads(line)
        if c["doc_id"] in by_doc:
            chunks_by_doc[c["doc_id"]].append(c)

    vectors = {}
    npy, ids_path = EMB / f"{args.strategy}.npy", EMB / f"{args.strategy}.ids.json"
    if npy.exists() and ids_path.exists():
        mat = np.load(npy)
        ids = json.loads(ids_path.read_text())
        vectors = dict(zip(ids, mat))
        log(f"  embeddings: {len(vectors):,} vectors loaded")
    else:
        log("  embeddings: none found — chunks will be indexed without vectors")

    log(f"  manifest: {len(docs)} documents · strategy {args.strategy}")

    started = time.time()
    stats = defaultdict(int)
    t_skip = t_write = 0.0

    with owner_connection(autocommit=False) as conn:
        cur = conn.cursor()

        # Distinct TENANTS, not distinct (tenant, source, base) tuples. The
        # unmerged tenant_base belongs on the document row, since two documents
        # in one final tenant can have come from different original ones.
        tenants = {(d["tenant"], d["source"]) for d in docs}
        for tenant, source in sorted(tenants):
            cur.execute(
                "INSERT INTO zeroth.tenant (tenant, source) VALUES (%s,%s) "
                "ON CONFLICT (tenant) DO NOTHING", (tenant, source))
            cur.execute("SELECT zeroth.ensure_partition(%s)", (tenant,))
        conn.commit()
        cur.execute("SELECT zeroth.force_rls_on_partitions()")
        forced = cur.fetchone()[0]
        conn.commit()
        log(f"  tenants: {len(tenants)} · partitions forced RLS: {forced}")

        cur.execute("SELECT doc_id, checksum FROM zeroth.document")
        known = dict(cur.fetchall())

        for i, d in enumerate(docs, 1):
            doc_id, checksum = d["doc_id"], d["checksum"]
            forced_touch = doc_id in args.touch

            # The idempotency check. Unchanged bytes mean unchanged text,
            # chunks and vectors, so there is nothing to redo.
            t0 = time.time()
            if not forced_touch and known.get(doc_id) == checksum:
                stats["unchanged"] += 1
                t_skip += time.time() - t0
                continue
            t_skip += time.time() - t0

            t0 = time.time()
            rows = chunks_by_doc.get(doc_id, [])
            if not rows:
                stats["no_chunks"] += 1
                continue

            sanitised_spans = 0
            payload = []
            for c in rows:
                s = sanitise(c["text"])
                sanitised_spans += s.spans
                v = vectors.get(c["chunk_id"])
                payload.append((
                    c["chunk_id"], doc_id, c["tenant"], c["source"], c["strategy"],
                    c["ordinal"], c["page"], c["section"], c["n_tokens"],
                    c["checksum"], s.text,
                    vec_literal(v) if v is not None else None))

            # Incremental: only this document's chunks are replaced.
            cur.execute("DELETE FROM zeroth.chunk WHERE tenant=%s AND doc_id=%s",
                        (d["tenant"], doc_id))
            cur.executemany(
                """INSERT INTO zeroth.chunk
                   (chunk_id, doc_id, tenant, source, strategy, ordinal, page,
                    section, n_tokens, checksum, body, embedding)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s::vector)""",
                payload)
            cur.execute("""
                INSERT INTO zeroth.document
                  (doc_id, source, tenant, tenant_base, identifier, url, licence,
                   checksum, normalised_checksum, pages, pages_source, sanitised,
                   sanitised_spans, updated_at)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s, now())
                ON CONFLICT (doc_id) DO UPDATE SET
                  checksum=EXCLUDED.checksum,
                  normalised_checksum=EXCLUDED.normalised_checksum,
                  pages=EXCLUDED.pages, pages_source=EXCLUDED.pages_source,
                  sanitised=EXCLUDED.sanitised,
                  sanitised_spans=EXCLUDED.sanitised_spans,
                  updated_at=now()""",
                (doc_id, d["source"], d["tenant"], d.get("tenant_base"),
                 d["identifier"], d.get("url"),
                 d.get("licence"), checksum, d.get("normalised_checksum"),
                 d.get("pages"), d.get("pages_source"),
                 sanitised_spans > 0, sanitised_spans))
            conn.commit()

            stats["ingested"] += 1
            stats["chunks"] += len(payload)
            stats["sanitised_spans"] += sanitised_spans
            t_write += time.time() - t0
            if i % 100 == 0:
                log(f"    {i}/{len(docs)}  ingested {stats['ingested']} "
                    f"· unchanged {stats['unchanged']}")

    elapsed = time.time() - started
    log("\n" + "=" * 58)
    log(f"  documents seen        {len(docs)}")
    log(f"  ingested / re-indexed {stats['ingested']}")
    log(f"  unchanged (no-op)     {stats['unchanged']}")
    log(f"  chunks written        {stats['chunks']:,}")
    log(f"  injections removed    {stats['sanitised_spans']}")
    log(f"  time in skip checks   {t_skip:.2f}s")
    log(f"  time writing          {t_write:.2f}s")
    log(f"  elapsed               {elapsed:.2f}s")
    log("=" * 58)
    return 0


if __name__ == "__main__":
    sys.exit(main())
