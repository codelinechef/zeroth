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
