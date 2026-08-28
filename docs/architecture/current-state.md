# Current state — repository audit

Audited at commit `5f6cb34` against a live local environment: PostgreSQL 16.15,
pgvector 0.8.6, the full `edgar-cuad-rfc-v1` corpus loaded, vLLM 0.27.1 serving
`Qwen/Qwen2.5-3B-Instruct-AWQ`.

Everything in this document was read out of the repository or measured against
the running database. Nothing is carried over from prose.

---

## 1. Directory tree

```text
apps/web/            Next.js static site (the public board)
configs/             pricing.yaml
content/             site content, one JSON per concept/metric/failure-mode
content/board/       evaluation run results, one file per run
data/corpus/         raw, parsed, chunked, embedded corpus + manifest
data/golden/         12 queries, 256 judgments, 32 human verifications
data/interactive/    precomputed datasets for the site's interactive figures
docs/                build brief, investigations, known issues
harness/corpus/      fetch.py, parse.py
harness/eval/        run.py, scorers.py, bootstrap.py, planguard.py, cache.py
harness/golden/      generate.py, verify.py, bm25.py, gemini.py
harness/interactive/ chunking.py, embed.py, retrieval.py, rls_demo.py, verification.py
platform/db/         connection.py, migrate.py, migrations/001..005
platform/ingestion/  ingest.py, sanitise.py
platform/retrieval/  retrieve.py, rerank.py, plan.py
platform/generation/ graph.py, contract.py
platform/providers/  base.py, vllm.py, ollama.py
tests/redteam/       6 modules + run.py + mutation_check.py + seed.py
```

`platform/` deliberately has no `__init__.py`: a package named `platform` at the
repository root shadows the standard-library module and breaks torch and
transformers. Entry points put `platform/` on `sys.path` and import `db.x`,
never `platform.db.x`.

---

## 2. Measured state of the live database

| Fact | Value | How obtained |
|---|---|---|
| Documents | 662 | `count(*) from zeroth.document` |
| Chunks | 51,310 | `count(*) from zeroth.chunk` |
| Pages | 24,155 | `sum(pages) from zeroth.document` |
| Tenants | 47 | `count(*) from zeroth.tenant` |
| Chunk partitions | 47 | `pg_inherits` on `zeroth.chunk` |
| Per-partition HNSW indexes | 47, 103.7 MB total | `pg_relation_size` over `%hnsw%` |
| Chunks with an embedding | 51,310 (100%) | `embedding is not null` |
| Embedding dimension | 384 | `vector(384)` column type |
| Roles in `zeroth.role` | 3 | `all_tenants` 47, `analyst_mid` 12, `single_tenant` 1 |
| Lexeme document-frequency rows | 75,981 | `count(*) from zeroth.lexeme_df` |
| Largest / smallest tenant | 2,868 / 507 chunks | `cuad-alliance` / `edgar-nvda` |
| Database size | 757 MB | `pg_database_size` |

A second schema, `demo`, is also live: a **monolithic** copy of all 51,310
chunks with a single global HNSW index (`m=16, ef_construction=64`, 100 MB), RLS
enabled and forced, and its own five-role ACL (47/35/12/3/1 tenants). It is
written by `harness/interactive/rls_demo.py` and it is the physical artifact
behind the published baseline. All 51,310 embeddings are byte-identical between
`demo.chunk` and `zeroth.chunk`.

---

## 3. Ingestion path

```text
harness/corpus/fetch.py     SEC EDGAR + CUAD + RFC, checksummed, manifest-recorded
        ↓
harness/corpus/parse.py     normalise, page detection, dedup
        ↓
platform/ingestion/sanitise.py   strip instruction-shaped spans
        ↓
platform/ingestion/ingest.py     chunk, embed, upsert, ensure_partition
```

Idempotency is keyed on `document.checksum` (raw bytes) with
`normalised_checksum` as a secondary key that catches the same document
reformatted. Chunks carry `checksum` over the body text.

**Provenance already present per chunk:** `chunk_id`, `doc_id`, `tenant`,
`source`, `strategy`, `ordinal`, `page`, `section`, `n_tokens`, `checksum`,
`body`, `tsv`, `embedding`. The corpus manifest carries `corpus_id`
(`edgar-cuad-rfc-v1`) and per-document licence and attribution.

**Missing against §4.1 of the implementation spec:** there is no `corpus_version`
or embedding-model column *on the chunk row*. Corpus version lives only in the
manifest file, and the embedding model only in the harness constant.

---

## 4. Retrieval implementation

`platform/retrieval/retrieve.py` runs two branches inside one transaction:

* **Lexical** — `websearch_to_tsquery` over a generated `tsvector` column,
  ranked by `ts_rank_cd`. Query terms are cut down to the 8 most selective by
  document frequency (`zeroth.lexeme_df`); ORing all terms of a 31-term question
  matched 45,971 of 51,310 chunks and cost 3,300 ms.
* **Dense** — `embedding <=> %s::vector`, per-partition HNSW.

Fused by Reciprocal Rank Fusion at `k = 60`, rank-based rather than score-based.
Reranked by a `BAAI/bge-reranker-base` cross-encoder over the top 50.

Two mechanisms are load-bearing and both must be preserved:

1. **Plan pinning.** `mode="approximate"` disables seqscan for the dense query;
   `mode="exact"` disables indexscan. The bitmap-scan knob is toggled around the
   dense query only, because disabling bitmap scans destroys the GIN-backed
   lexical path.
2. **Plan assertion.** `platform/retrieval/plan.py` and
   `harness/eval/planguard.py` both EXPLAIN the query actually executed and
   refuse the run if the planner chose a shape the run's numbers do not assume.
   Node-type match is exact, not substring — `Bitmap Index Scan` must not
   satisfy a requirement for `Index Scan`.

**The explicit tenant predicate `tenant = ANY(%s::text[])` is a performance
hint, not the security boundary.** It enables plan-time partition pruning.
Measured in the investigations: 26.2 ms with the predicate against 140.5 ms
without, for a 8-of-40-tenant role.

---

## 5. Authorization and the security boundary

```text
application sets  zeroth.role  (transaction-local GUC)
        ↓
zeroth.current_tenants()   SECURITY DEFINER, search_path pinned
        ↓
RLS policy  USING (tenant = ANY (zeroth.current_tenants()))
        ↓
zeroth.chunk, zeroth.document — ENABLE + FORCE ROW LEVEL SECURITY
```

* The query role `zeroth_app` is `NOSUPERUSER NOBYPASSRLS`, asserted by
  `platform/db/connection.py:app_connection()` before the connection is handed
  to a caller, and again by `tests/redteam/_harness.py`.
* `zeroth_app` has **no** `SELECT` on `zeroth.acl` or `zeroth.role`, so it
  cannot enumerate the authorization matrix. The lookup runs through a
  `SECURITY DEFINER` function instead.
* An unset or unknown role resolves to `'{}'::text[]`, so the policy matches
  nothing. Fails closed.
* `as_role()` uses `set_config(..., is_local => true)`, so a pooled connection
  cannot leak one request's role into the next.

**Gap against §5 of the implementation spec.** There is no principal layer. The
application chooses the `zeroth.role` value directly; there is no server-side
mapping from an authenticated principal to a role, no `authorization_version`,
and no notion of a revoked principal. Scope is therefore *named* by the
application rather than *derived* from authoritative policy data. This is the
main authorization hardening the spec asks for.

---

## 6. Evaluation and benchmark code

* `harness/eval/run.py` — the graded run against the golden set. Uses
  `judgments.jsonl` (LLM-drafted) with `verification.jsonl` (human) taking
  precedence. **5 of 12 queries are judged; 7 are unjudged and excluded from
  every metric.** Metrics: `recall@5/10`, `MRR@10`, `nDCG@10`,
  `context_precision`, latency percentiles, all with bootstrap CIs.
* `harness/interactive/rls_demo.py` — the **baseline experiment that the
  published numbers come from**. Builds the monolithic `demo` schema, measures
  ANN top-10 against exact top-10 under the identical policy, for five scopes,
  across `ef_search ∈ {40, 100, 200, 400, 800}`.

**Two distinct notions of "recall" coexist in this repository and must not be
confused:**

| Name | Defined in | Ground truth | Used for |
|---|---|---|---|
| `recall@k` (graded) | `harness/eval/scorers.py` | human/LLM relevance grades | `content/board/*.json` |
| `recall@K vs exact authorized search` | `harness/interactive/rls_demo.py` | exact search under the identical RLS policy | the ANN-post-filtering finding |

The second is the one this project publishes for the authorization work, and it
is **not** a relevance metric. The published baseline, from
`data/interactive/rls/postfilter.json`:

| Scope | Tenants | recall@10 vs exact | Empty results |
|---|---:|---:|---:|
| `all_tenants` | 47/47 | 0.8500 | 0/12 |
| `analyst_broad` | 35/47 | 0.8417 | 0/12 |
| `analyst_mid` | 12/47 | 0.6667 | 2/12 |
| `analyst_narrow` | 3/47 | 0.5000 | 5/12 |
| `single_tenant` | 1/47 | 0.3000 | 6/12 |

Computed micro-averaged: `sum(|ANN ∩ exact|) / sum(|exact|)` over the 12
queries. Preserved verbatim; this repository does not restate it.

---

## 7. Security test suite

`tests/redteam/` — **246 cases, 246 passing**, re-run during this audit in 6.1 s.

| Category | Cases | What it asserts |
|---|---:|---|
| `cross-tenant` | 141 | every role × every tenant, both leak and over-deny |
| `prompt-injection` | 37 | sanitiser + passage fencing, and that benign prose survives |
| `role-escalation` | 23 | 20 forged `zeroth.role` values, ACL unreadable, no self-grant |
| `citation-forgery` | 17 | a citation must resolve to a chunk actually shown |
| `defence-in-depth` | 15 | **application tenant predicate removed**, RLS alone must hold |
| `policy-config` | 9 | RLS enabled + forced, policy shape, role privileges, SECURITY DEFINER, pinned `search_path` |
| `abstention-bypass` | 4 | an uncited answer is not publishable |

`mutation_check.py` applies three deliberate policy breaks and asserts the suite
goes red. The third (`NO FORCE ROW LEVEL SECURITY`) was **not** detected on the
first run, which is why the nine `policy-config` configuration invariants exist.

---

## 8. Configuration, deployment, observability

* `docker-compose.yml` — pgvector/pg16 on 5433 with `shm_size: 1gb` (Docker's
  64 MB default fails parallel HNSW builds), vLLM on 8001 with `ipc: host` and
  `VLLM_WSL2_ENABLE_PIN_MEMORY=1` (both mandatory on WSL2, neither discoverable
  from the error).
* `.env.example` carries local-dev credentials only; no real secret is
  committed.
* CI: `.github/workflows/redteam.yml` seeds a 6-tenant synthetic corpus and
  gates on the red-team suite; `web.yml` builds the static site.
* **Observability is a single table**, `zeroth.audit_query` (role, question,
  strategy, ef_search, plan shape, hit counts, elapsed). Nothing writes to it on
  the current query path. There are no structured traces and no metrics export.

---

## 9. Classification of what exists

### Production-like and reusable
`platform/db/connection.py` (privilege assertion), migrations 001–005, the RLS
policy and `current_tenants()`, `platform/retrieval/retrieve.py`,
`harness/eval/planguard.py`, the whole of `tests/redteam/`,
`harness/eval/scorers.py`, `harness/interactive/_provenance.py`.

### Experimental
`harness/interactive/rls_demo.py` builds and drops a `demo` schema on every run.
The `demo` schema is a measurement rig, not a component.

### Must not be changed
* The RLS policy shape and `current_tenants()` semantics (fail-closed on unknown
  role).
* `zeroth_app` privileges.
* The published baseline in `data/interactive/rls/postfilter.json` and the
  246-case red-team inventory.
* `harness/eval/scorers.py` metric definitions.

### Must be refactored before permission-aware retrieval
1. **No principal layer.** §5 requires scope derived server-side from an
   authenticated identity. Added in migration 006.
2. **No retrieval strategy abstraction.** `retrieve()` hard-codes one physical
   topology. A/B/C/D cannot be compared without an interface.
3. **No global (non-partitioned) table inside `zeroth`.** Strategy A can only be
   measured in the `demo` schema, which has a *different* policy function,
   *different* index parameters (`m=16/efc=64` vs `m=32/efc=200`) and no lexical
   column. Comparing A against B across those two schemas would confound
   strategy with index configuration.
4. **No benchmark record format.** `harness/eval/run.py` writes a graded-run
   shape, not a strategy-comparison shape.

### Missing tests
Cache isolation (no cache exists on the query path yet), connection-pool
isolation under concurrency, concurrent users with different scopes, forced
unauthorized index selection (no router exists yet), stale/revoked authorization,
citation authorization (a citation is checked against *retrieved* chunks, which
are already authorized — but nothing asserts that invariant directly).

### Technical debt affecting benchmark validity
* **HNSW construction is non-deterministic.** The baseline file says so
  explicitly. Third decimals are not stable across rebuilds.
* **12 queries.** Every rate moves in steps of 1/12 ≈ 0.083.
* **The planner flip.** Guarded, but the guard must be applied to every new
  strategy or a strategy can silently measure exact search.
* **Index-parameter mismatch** between `demo` (m=16/efc=64) and `zeroth`
  (m=32/efc=200), described above.
* `zeroth.audit_query` has no writer, so there is no operational record to
  cross-check a benchmark against.
