# §14 investigations — findings

Measured 2026-08-22 on the verified environment (§0.5). Postgres 16.15 +
pgvector 0.8.6, vLLM 0.27.1 image, live SEC endpoints.

---

## 1. pgvector under Row-Level Security — **the Phase 3 design needs one change**

### Verdict

**RLS is enforced correctly on HNSW index scans. Zero leakage in 840 probes.**
The policy is never bypassed, the planner never skips it, and a forged or unset
role returns zero rows (fails closed).

**But ANN search post-filters, and that silently destroys recall for restricted
roles.** This does not breach the security model. It corrupts the *evaluation*
model, which is arguably worse for this project, because the damage is invisible
and lands in published numbers.

### What the plan actually does

```
Limit
  ->  Index Scan using chunk_hnsw on chunk c
        Order By: (embedding <=> $0)
        Filter: (hashed SubPlan 3)        <-- the RLS policy, applied AFTER
          SubPlan 3
            ->  Seq Scan on tenant_acl a
                  Filter: (role_name = current_setting('zeroth.role', true))
```

HNSW returns its `ef_search` candidates ranked by distance, *then* the policy
filters them. Rows you may not see consume candidate slots and are discarded.
Nothing refills them.

The planner's row estimate for that index scan was `rows=18000` — it has no
model of `ef_search`, so cost-based decisions above this node are made on a
fiction. That is also why plan choice flips between seq scan (exact, correct,
slow) and HNSW (approximate, lossy) depending on statistics: **the same query
can silently change retrieval semantics between runs.**

### Measured: recall@10 vs exact search under the *same* policy

36,000 chunks, 40 tenants, `ef_search=40`, `iterative_scan=off`.
`all_tenants` is the unrestricted control — its 0.905 is plain HNSW
approximation error and the ceiling everything else is measured against.

| Role | Tenants visible | Recall, all queries | Empty results /40 |
|---|---|---|---|
| all_tenants (control) | 40 | **0.905** | 0 |
| analyst_broad | 30 | 0.678 | 10 |
| auditor | 16 | 0.363 | 23 |
| analyst_mid | 8 | 0.190 | 32 |
| counsel | 6 | 0.140 | 34 |
| analyst_narrow | 2 | 0.048 | 38 |
| single_tenant | 1 | **0.023** | **39** |

Recall tracks how much of the corpus the role can see, not how good retrieval
is. A single-tenant user got **nothing at all for 39 of 40 queries**, while
exact search under the identical policy returned a full 10 rows every time.

### The honest qualifier — this splits cleanly in two

Slicing the same runs by whether the query topic belongs to a tenant the role
can see:

| Slice | Recall | Empty | Reading |
|---|---|---|---|
| **On-topic** (asking about your own documents) | **0.90 – 0.95** | 0 | No degradation at any restriction level |
| **Off-topic** (topic belongs to a tenant you cannot see) | **0.00** | all | Total collapse; exact search still had 10 rows |

So the failure is not "RLS breaks vector search". It is: **when the nearest
neighbours all belong to tenants you cannot see, ANN returns nothing, and the
system cannot tell that apart from "no evidence exists".**

My uniform query set over-weights the off-topic case; a real workload is mostly
on-topic. I am reporting both slices rather than the aggregate, because the
aggregate flatters or damns depending on a mix I made up.

### Why this still matters enough to change the design

1. **It corrupts `Abstention (correct)`.** The brief's 30 unanswerable queries
   are "plausible, on-topic, genuinely absent". A restricted role abstains
   because retrieval handed the graph an empty candidate list — not because it
   judged evidence insufficient. That metric would score well for a reason that
   has nothing to do with the behaviour it claims to measure. It is the one
   metric §14 flags as "nobody publishes", and it is the one most exposed here.
2. **It makes the Phase 5 hybrid comparison uninterpretable.** If dense returns
   0 candidates and BM25 returns 10, RRF degenerates to lexical-only *silently*.
   Clause 4.2's "hybrid vs dense" delta would be measuring index behaviour, not
   fusion.
3. **Published retrieval numbers depend on which role the harness runs as.** If
   the harness runs unrestricted, every number describes conditions the real
   system never operates under. This directly threatens §3.2.
4. **The lexical path does not have this problem** — which makes it an unfair
   comparison, see below.

### The lexical path pre-filters. The vector path post-filters.

```
Limit -> Sort (Sort Key: ts_rank(...) DESC)
           -> Seq Scan on chunk
                Filter: ((hashed SubPlan 2) AND (tsv @@ ...))
```

Full-text ranking applies the policy **before** ranking, so `ts_rank` orders
only permitted rows. `single_tenant` got a full 10 rows. **Recall loss: none.**

This breaks the brief's §6 assumption that keeping lexical search in-database
makes RLS "apply to both retrieval paths identically". It applies *correctly* to
both. It applies *identically* to neither. Worth stating on `/methodology`.

### Mitigations, measured

| Approach | Recall (single_tenant, all queries) | Empty | Latency |
|---|---|---|---|
| Monolithic HNSW, post-filter | 0.023 | 39/40 | — |
| `iterative_scan=strict_order` | 0.070 | 0 | — |
| `iterative_scan=relaxed_order` | 0.545 | 0 | — |
| **Partitioned by tenant, RLS only** | **0.740** | **0** | 38.5 ms |
| **Partitioned + explicit tenant predicate** | **0.740** | **0** | **1.03 ms** |

> **Superseded — see "Follow-up" at the end of this document.** The 0.740 was an
> artifact of untuned HNSW parameters, and the 1.03 ms / 38.5 ms latencies came
> from an unreliable in-database clock. Corrected figures below.


- **`hnsw.iterative_scan` (pgvector ≥ 0.8) fixes the empty-result problem
  outright** and recovers much of the recall. `relaxed_order` is far better than
  `strict_order` (0.545 vs 0.070) — strict ordering caps how far it will scan.
  It does not reach the 0.905 control.
- **Partitioning by tenant is the real fix.** `LIST` partition on `tenant_id`,
  one HNSW index per partition. The index only ever contains rows from one
  tenant, so there is nothing to post-filter away.

### Recommendation for Phase 2/3

**Partition `chunk` by `tenant_id`, and pass the permitted tenant list as an
explicit predicate *in addition to* RLS.**

The two do different jobs, and this is the part worth being precise about:

- **RLS is the correctness boundary.** Recall was **identical** (0.740) with and
  without the explicit predicate — the predicate never widened access. If
  application code forgets it, or gets it wrong, or an attacker influences it,
  RLS still denies the rows.
- **The explicit predicate is purely a performance hint.** It enables
  plan-time partition pruning: `Merge Append` over only the 8 permitted
  partitions instead of all 40. That is the 38.5 ms → 1.03 ms difference.

This keeps the brief's §2 promise — authorisation enforced *inside* the
retrieval query — while removing the recall cliff. The red-team suite must
assert the RLS half independently: **drop the explicit predicate and the tests
must still pass.** That is what proves the predicate is an optimisation and not
the security boundary.

Also set `hnsw.iterative_scan=relaxed_order` as defence in depth for roles whose
access still spans many partitions.

### Index choice: HNSW, not IVFFlat

At 36,000 × 384:

| | Build | Size | Note |
|---|---|---|---|
| HNSW (m=16, ef_construction=64) | 17.7 s | 70 MB | Recommended |
| HNSW, partitioned (40 × 900) | **10.5 s** | 70 MB | Faster — smaller graphs |
| IVFFlat (lists=190) | 1.6 s | 57 MB | Not recommended |

HNSW's build cost is irrelevant here — 17.7 s once per ingest, against a corpus
that changes incrementally. IVFFlat's problem is that its recall depends on
centroids fitted to the data at build time, so it must be rebuilt as the corpus
grows, and it degrades badly under exactly the selective-filter conditions this
project has. Partitioning makes HNSW build *cheaper*, which removes the only
argument for IVFFlat.

Both indexes are ~2× the size of the table's vector data. 36k chunks is small;
this is not a memory concern at this scale.

### Two silent-bypass traps beyond the one in §0.5

The brief documents the `postgres`-superuser trap. Two more, both silent:

1. **The table owner bypasses RLS.** `relforcerowsecurity = f` on every table I
   created. If migrations run as the owner and any test or ops query connects as
   the owner, policies do not apply — no error. **Set `ALTER TABLE ... FORCE ROW
   LEVEL SECURITY`** on every RLS table.
2. **The ACL table needs its own protection.** The policy reads
   `rlslab.tenant_acl`, so `zeroth_app` needs `SELECT` on it — meaning any query
   can enumerate the entire authorisation matrix for every role. Put it behind a
   `SECURITY DEFINER` function or its own policy.

### Unrelated environment defect found while testing

`docker-compose.yml` sets no `shm_size`, so the container gets Docker's 64 MB
default. Parallel HNSW builds fail:

```
ERROR: could not resize shared memory segment ... to 533761504 bytes:
No space left on device
```

This will not appear until Phase 2 builds an index on the real corpus. Fix:

```yaml
services:
  db:
    shm_size: '1gb'
```

Reproduce: `docs/investigations/pgvector-rls.sql`.

---

## 2. SEC EDGAR bulk access

All endpoints tested live with the contact string in `.env`. All returned 200.

| Endpoint | Purpose | Verified |
|---|---|---|
| `https://www.sec.gov/files/company_tickers.json` | ticker → CIK map | 200, 796 KB |
| `https://data.sec.gov/submissions/CIK##########.json` | per-company filing history | 200, 164 KB (AAPL) |
| `https://www.sec.gov/Archives/edgar/full-index/YYYY/QTRn/form.idx` | quarterly bulk index | 200, **53 MB** |
| `https://efts.sec.gov/LATEST/search-index?q=...&forms=10-K` | full-text search | 200, JSON |
| `https://www.sec.gov/Archives/edgar/data/<cik>/<accession>/<file>` | document fetch | 200 |

**User-Agent.** The declared format is `Sample Company Name AdminContact@domain.com`.
`.env` holds `Anant Sharma asindia23@gmail.com`, which conforms.

**Tested, and worth knowing:** a request with **no** UA gets `403`. A request
with a bare `Mozilla/5.0` and no contact gets **`200`**. SEC does not
technically validate the contact — it only rejects an absent header. The contact
requirement is a **policy obligation, not a technical gate**, and blocks are
applied after the fact. Send the real contact on every request.

**Rate limit: 10 requests/second**, applied per IP across `sec.gov` and
`data.sec.gov` together. **I did not load-test this deliberately** — provoking a
block on the owner's IP would stall Phase 1 for the sake of confirming a
published number. Build the fetcher to a 10 req/s ceiling with a shared token
bucket across all three sources, and honour `Retry-After`.

**Recommended approach for ~300 filings across ~40 companies:** pull
`company_tickers.json` once → resolve 40 CIKs → one `submissions/CIK...json` per
company → filter `form == "10-K"` → fetch documents. That is ~340 requests,
about a minute at the rate ceiling. The 53 MB `form.idx` files are only worth it
for corpus-wide sweeps, which this is not.

---

## 3. CUAD

- **Canonical download:** Zenodo record **4595826** — `https://zenodo.org/record/4595826`
  (the Atticus Project's own linked location). Zenodo **4599830** is the
  fine-tuned *models*, not the data — easy to grab by mistake.
- **Licence: CC BY 4.0.** Redistribution alongside the benchmark is permitted,
  including modified/derived forms, provided attribution is given and changes
  are indicated.
- **Contents:** 510 commercial contracts; PDF + plain text sources, annotations
  as CSV/JSON, plus XLSX of clauses matched to 41 expert labels.
- **Attribution required in `data/corpus/` and on `/corpus`:** cite CUAD
  (Hendrycks et al., NeurIPS 2021) and The Atticus Project, state CC BY 4.0, and
  note that chunking/re-indexing constitutes modification.

**One conflict with the brief worth flagging.** §4 describes CUAD as giving the
corpus "genuine legal-document character" distinct from EDGAR. In fact **CUAD's
contracts are themselves sourced from EDGAR.** They are still a good addition —
exhibit-attached contracts are a different document *shape* from 10-K narrative,
and the clause spans are free ground truth — but `/methodology` should not claim
CUAD as an independent corpus. It is a different slice of the same publisher.
This also means **deduplication against the 10-K set is mandatory**, not
optional: a contract may appear both standalone and as a 10-K exhibit, and
double-counting it would inflate the corpus manifest.

---

## 4. vLLM guided decoding (0.27.1)

Introspected the actual `vllm/vllm-openai:latest` image — version confirmed
**0.27.1**.

**Backends supported:** `auto` (default), `xgrammar`, `guidance`, `outlines`,
`lm-format-enforcer`. All four are wired up in the V1 engine; `outlines` and
`lm-format-enforcer` are lazy-imported, so they do not show up under
introspection and look absent when they are not.

**Enforcement is at the sampler**, as §6 requires — token masks from a compiled
grammar, not a validate-and-retry loop. Config lives in
`SamplingParams.structured_outputs` (`json`, `regex`, `choice`, `grammar`,
`json_object`, `structural_tag`). Note the older `guided_json` name is gone.

**Three findings that affect the §2 grounding contract:**

1. **The backend is process-wide, not per-request.** From the source: *"We only
   support a single backend. We do NOT support different backends on a
   per-request basis in V1."* Set it at server start; a request that asks for a
   different one is rejected. Pin it explicitly in the run config so it is
   recorded per run rather than left to `auto`.

2. **`auto` silently cascades: xgrammar → guidance → outlines.** If the schema
   trips `has_xgrammar_unsupported_json_features`, vLLM falls back without
   failing. Two runs could use different decoders with no signal in the output.
   **Pin `--structured-outputs-config.backend xgrammar`** so a schema that
   xgrammar cannot handle raises instead of quietly switching — with an explicit
   backend there is *no* fallback path.

3. **Constrained decoding guarantees grammar conformance, not full JSON Schema
   validity.** xgrammar's fallback trigger list covers `multipleOf`,
   `uniqueItems`, `contains`/`minContains`/`maxContains`, unsupported string
   `format`, `patternProperties`, `propertyNames`. Keywords *not* on that list
   are compiled by xgrammar directly, and constraints it cannot express in a
   grammar — numeric `minimum`/`maximum`, `minLength`/`maxLength`,
   `minItems`/`maxItems` — are not enforced at the sampler.

   So the output is guaranteed to **parse** and to match the structural grammar.
   It is not guaranteed to satisfy every assertion in the schema.

   **Design consequence:** keep the JSON contract structural (types, required
   fields, enums, nesting) and put every semantic assertion in a Pydantic
   validation pass after generation. This is not the retry loop §6 rules out —
   structure is still enforced at the sampler — it is the assertion that catches
   what a grammar cannot express. Citation resolution and quote verification
   already live there, and bounds checks belong beside them.

Supported string formats: `email`, `date`, `time`, `date-time`, `duration`,
`ipv4`, `ipv6`, `hostname`, `uuid`, `uri`, `uri-reference`, `uri-template`.


---

# Follow-up (2026-08-23) — corrections and new measurements

Three numbers in the sections above are wrong. Corrected here rather than
edited in place, so the record of what changed is visible.

## Correction 1 — the 0.740 partitioned recall was untuned, not a ceiling

I presented 0.740 as what partitioning delivers. It is what pgvector's
*defaults* deliver. Sweeping the build and search parameters on 900-vector
partitions (recall vs exact search under the same policy, all roles):

| m | ef_construction | ef_search | Build | On-topic | Off-topic | All |
|---|---|---|---|---|---|---|
| 16 | 64 | 40 | 5.8 s | 0.966 | 0.761 | 0.836 |
| 16 | 64 | 200 | 5.8 s | 1.000 | 0.974 | 0.984 |
| 16 | 200 | 200 | 7.5 s | 1.000 | 0.991 | 0.994 |
| **32** | **200** | **200** | **15.3 s** | **1.000** | **0.997** | **0.998** |
| 32 | 400 | 200 | 18.5 s | 1.000 | 1.000 | 1.000 |
| 48 | 200 | 200 | 28.0 s | 1.000 | 0.998 | 0.999 |
| 64 | 400 | 200 | 61.9 s | 1.000 | 0.998 | 0.999 |

**`ef_search` is the dominant lever.** Raising it from 40 to 200 — no rebuild
— takes off-topic recall from 0.761 to 0.974. `ef_search = 40` against `LIMIT
10` is barely above pgvector's minimum and is far too tight for 900-row
partitions.

**Recommended: `m = 32, ef_construction = 200, ef_search = 200`** — 0.998
overall, 15.3 s build, ~26 ms/query warm. `m = 32, efc = 400` reaches 1.000 but
the build cost buys 0.002.

## Correction 2 — the 0.740 vs 0.905 comparison was not like-for-like

Even before tuning, that gap was mostly an artifact of query mix, not index
quality. `all_tenants` has **zero** off-topic queries *by construction* — it can
see every tenant, so every query topic is on-topic. `single_tenant` has 39 of 40
off-topic. Splitting the same run:

| Role | On-topic recall | Off-topic recall |
|---|---|---|
| all_tenants | 0.963 | (none exist) |
| analyst_mid | 0.950 | 0.794 |
| single_tenant | 0.800 | 0.721 |

On-topic recall is essentially flat across roles. Comparing a role's blended
number against `all_tenants` compares different query mixes.

## Correction 3 — partition pruning is worth 5.3×, not 37×

The 1.03 ms and 38.5 ms figures came from `clock_timestamp()` inside plpgsql,
which drifts badly on this WSL2 host — the same method later produced a
"14,777,570 ms" query. Re-measured with an external wall clock, warm, 40
queries, `analyst_mid` (8 of 40 tenants), `ef_search = 200`:

| | Per query | Partitions scanned |
|---|---|---|
| Explicit tenant predicate | **26.2 ms** | 8 |
| RLS only | 140.5 ms | 40 |

**5.3×.** The mechanism is as described — `Merge Append` over 8 partitions
instead of 40, and the ACL subplan running 8 loops instead of 40 — but the
magnitude was overstated. Recall is identical either way; the predicate remains
a pure optimisation.

**Do not time queries with `clock_timestamp()` on this host.** Use an external
clock or `EXPLAIN ANALYZE`.

## New — tuning does *not* rescue the monolithic index

Worth stating plainly, because it is the argument for partitioning. On the
monolithic index with the same tuned build parameters:

| ef_search | iterative_scan | single_tenant recall | Empty results |
|---|---|---|---|
| 40 | off | 0.025 | 177 |
| 200 | off | 0.025 | 177 |
| **800** | **off** | **0.025** | **177** |
| 200 | relaxed_order | 0.438 | 0 |

**Raising `ef_search` twentyfold changes nothing.** With well-separated tenant
clusters, the 800 nearest neighbours of a query are still all drawn from the
one tenant that owns that region of the space — a tenant has only 900 chunks,
so the candidate list never escapes it. Only `iterative_scan` (which keeps
scanning past the filter) or partitioning reaches permitted rows.

This is the structural argument: post-filtering fails for reasons no search
parameter can address.

## New — the planner flip is real, and partitioning does not fix it

Both triggers reproduced against the partitioned schema:

| Trigger | Plan | Consequence |
|---|---|---|
| Partition ingested, `ANALYZE` not run | `Seq Scan on chunk_p_42` | exact, not approximate |
| `random_page_cost = 20` | `Seq Scan` on all 8 partitions | exact, not approximate |

`ANALYZE` restores the index scan. `random_page_cost` is a machine-level
setting, so **a stranger cloning and re-running can get different retrieval
semantics** — the direct threat to §3.2.

Partitioning makes this *finer-grained*, not safer: each partition is costed
independently, so one query can mix exact and approximate scans across tenants.

The flip moves recall **upward**, so it never looks like a failure. Root cause:
the planner estimated `rows=18000` for a scan bounded by `ef_search`, because
the cost model has no concept of `ef_search`.

**Mitigation implemented and tested:** `docs/investigations/plan-guard.sql`.
It returns `04b50506e8f2c2fc44b732b864ad524f` under a healthy configuration and
raises on both triggers:

```
ERROR: plan guard: 8 of 8 partition scans are not HNSW index scans
       — retrieval semantics changed
```

Specified into the brief as a Phase 4 requirement with a `plan` block in the
results JSON.
