# Known issues and environment gotchas

Things that fail with errors that do not explain themselves.

## vLLM on WSL2 requires two flags

Without both, vLLM fails during `GPUModelRunnerV2` init with:

```
RuntimeError: UVA is not available
```

WSL2 disables pinned memory by default and UVA buffers require it. Every vLLM
invocation must include:

```
--ipc=host
-e VLLM_WSL2_ENABLE_PIN_MEMORY=1
```

Not optional, and not deducible from the error.

## vLLM cold start is ~166 seconds — mount the compile cache

Almost entirely `torch.compile` and CUDA graph capture. It writes to
`/root/.cache/vllm` inside the container, which `--rm` discards. Nine benchmark
runs would pay roughly 25 minutes of pure recompilation. Mount it as a named
volume when the vLLM service is added in Phase 4.

## Postgres container needs `shm_size`

Docker's default `/dev/shm` is 64 MB. Parallel index builds exceed it and fail:

```
ERROR: could not resize shared memory segment "/PostgreSQL.4157994824"
to 533761504 bytes: No space left on device
```

Observed building an HNSW index over 36,000 × 384 vectors with
`max_parallel_maintenance_workers = 2`. Fixed in `docker-compose.yml` with
`shm_size: '1gb'`. Without it the workaround is
`SET max_parallel_maintenance_workers = 0`, which makes the build serial and
roughly 40% slower.

## Database connections use `zeroth_app`, never `postgres`

Superusers bypass Row-Level Security silently — no error, no warning, policies
simply do not apply. Verified `rolsuper=f, rolbypassrls=f` on `zeroth_app`.

```
postgresql://zeroth_app:local_dev_only@localhost:5433/zeroth
```

Two further silent-bypass paths, neither covered by that rule:

1. **The table owner also bypasses RLS.** `relforcerowsecurity` defaults to
   false. Every RLS table needs `ALTER TABLE ... FORCE ROW LEVEL SECURITY`, or
   migrations and ops queries running as the owner will silently see everything.
2. **The ACL table is readable by anyone the policy depends on.** If a policy
   reads `tenant_acl`, the querying role needs `SELECT` on it and can therefore
   enumerate the whole authorisation matrix. Put it behind a `SECURITY DEFINER`
   function or give it its own policy.

## pgvector ANN search post-filters under RLS

RLS is enforced correctly on HNSW index scans — no leakage. But the policy is
applied *after* approximate nearest-neighbour selection, so a restrictive role
can silently lose candidates that exact search would have returned, up to and
including empty results. The lexical path does not behave this way; it filters
before ranking. Full measurements and the mitigation:
`docs/investigations/FINDINGS.md`.

## Generating test vectors in SQL: correlate the subquery

```sql
-- WRONG: one InitPlan, every row gets the SAME vector, silently
SELECT t, (SELECT array_agg(random()) FROM generate_series(1,384)) FROM generate_series(1,40) t;
```

An uncorrelated subquery is hoisted and evaluated once regardless of volatility.
Use a `VOLATILE` function taking the row key as an argument instead. This cost
an hour and produced a plausible-looking corpus with no tenant structure at all.

## Two silent data bugs found in Phase 1 ingestion

Both produced plausible output. Neither raised anything. Both would have
corrupted published figures, and both are the kind of mistake that recurs in a
different form — so the pattern matters more than the specific fix.

### `slug()` truncation dropped 26 real contracts

CUAD filenames routinely exceed 60 characters and differ only in a trailing
digit or suffix:

```
...EX-10.12_11817081_EX-10.12_Manufacturing Agreement1.txt
...EX-10.12_11817081_EX-10.12_Manufacturing Agreement2.txt
...SERVICES AGREEMENT.txt
...SERVICES AGREEMENT_AMENDMENT.txt
...SERVICES AGREEMENT_SECONDAMENDMENT.txt
```

`slug(name, maxlen=60)` collapsed these to one `doc_id`. `st.documents[doc_id] =
entry(...)` then overwrote silently, and because the resume check found the
first file's entry intact, the later files were **never extracted to disk
either**. 15 ids absorbed 41 files; 26 distinct contracts vanished.

The only visible symptom was two numbers on different lines of the log
disagreeing — "selected 510 contract texts" and "registered 484 CUAD
documents". Nothing else.

**Fixes:** `doc_id` now carries an 8-character hash of the full archive member
name, so it is total rather than best-effort. `State.register()` refuses to
overwrite an existing id belonging to a different document and records a
collision failure instead. The CUAD stage prints an explicit reconciliation
block rather than leaving two counts to be compared by eye.

**The general lesson:** a derived identifier that is *lossy* (truncated, slugged,
normalised) is not an identifier. Either make it total, or check for collisions
when you assign it. And any pipeline that reports "selected N" then "wrote M"
should reconcile N against M itself.

### lxml `id()` reuse over-counted pages 3-5x

To count page breaks in 10-K HTML:

```python
breaks = {id(el) for el in doc.xpath('//*[contains(@style,"page-break")] | //hr')}
for el in doc.iter():
    if id(el) in breaks:        # WRONG
        page += 1
```

lxml creates element proxy objects on demand and frees them when the last
reference goes. Once the xpath result list is discarded, those `id()` values are
**reused by new proxies** created during `doc.iter()`, so unrelated elements
matched the set. One filing recorded 535 pages against 162 actual page breaks.

`pages` is a published corpus figure, so this was a fabricated number reaching
the site by accident — exactly what §3.3 forbids, arrived at through a bug
rather than a decision.

**Fix:** test each element directly during the single pass, never pre-collect
identities:

```python
for el in doc.iter():
    if el.tag == "hr" or "page-break" in (el.get("style") or "").lower():
        page += 1
```

Verified afterwards by re-deriving page counts independently and asserting
`pages == breaks + 1` on every filing.

**The general lesson:** `id()` is only valid while a reference is held. This is
not lxml-specific — any library with on-demand proxy objects (ORM rows,
lazy AST nodes, some `ctypes` wrappers) behaves the same way. Identity-based
sets across two traversals are the smell.

**And the reason both were caught:** a derived figure was checked against an
independent recomputation. The page count was compared against a fresh count
from the source HTML; the contract count against the archive's own member list.
Neither bug was found by reading the code.
