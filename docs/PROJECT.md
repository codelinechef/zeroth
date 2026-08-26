# Zeroth — Project Documentation

Master technical reference. Audited against the repository on 2026-08-25 at commit
`5c9adb5` (12 commits, 2 files uncommitted at time of writing).

Every claim below traces to code, config, or committed data. Where something
could not be verified, it says so.

---

## Status legend

| Status | Meaning |
|---|---|
| **IMPLEMENTED** | Working code exists and was exercised |
| **PARTIAL** | Some code exists, feature incomplete |
| **PLANNED** | On the roadmap, no code |
| **INVESTIGATED** | Prototyped or measured in a scratch schema; findings changed the design, code is not in the production path |
| **NOT VERIFIED** | Code exists, could not be exercised |
| **NOT FOUND** | No evidence in the repository |

### Component status at a glance

| Component | Status | Evidence |
|---|---|---|
| Corpus acquisition | IMPLEMENTED | `harness/corpus/fetch.py` (1,057 lines), 662 docs in manifest |
| Parsing, chunking, tenants, dedup | IMPLEMENTED | `harness/corpus/parse.py` (679), manifest `corpus_stats` |
| Database schema, RLS, partitioning | IMPLEMENTED | `platform/db/migrations/001–005`, 5 applied, 47 partitions live |
| Ingestion (idempotent, incremental) | IMPLEMENTED | `platform/ingestion/ingest.py`, re-run = 0.02 s |
| Ingestion-time sanitisation | IMPLEMENTED | `platform/ingestion/sanitise.py` + 24 tests passing |
| Hybrid retrieval (BM25 + dense, RRF) | IMPLEMENTED | `platform/retrieval/retrieve.py` (228) |
| Plan pinning / determinism guard | IMPLEMENTED | `platform/retrieval/plan.py` (77) |
| Cross-encoder reranking | IMPLEMENTED | `platform/retrieval/rerank.py` (64) |
| Query graph (LangGraph) | IMPLEMENTED | `platform/generation/graph.py` (260) |
| Constrained decoding | IMPLEMENTED (Ollama) | `platform/providers/ollama.py`, JSON schema at sampler |
| vLLM provider | NOT VERIFIED | `platform/providers/vllm.py` written; server not running |
| Citation resolution, quote verify, abstain | IMPLEMENTED | graph nodes `resolve`/`verify`/`abstain` |
| Audit logging | PARTIAL | `zeroth.audit_query` table exists, 0 rows, not wired to retrieval |
| Golden set generation | PARTIAL | 12 of 200 queries drafted |
| Human verification | PARTIAL | 32 judgments, sample not usable (§11) |
| Evaluation harness / metrics | PLANNED | Definitions in `content/metrics/*.json`; no scorer code |
| Red-team suite | PLANNED | `tests/redteam/` NOT FOUND |
| FastAPI query surface | PLANNED | `platform/api/` exists, empty |
| Django ops layer | NOT FOUND | No Django import anywhere |
| Web application | IMPLEMENTED | 9 routes, static export, a11y 100 |
| Board runs | NOT FOUND | `content/board/` empty except `.gitkeep` — by design |
| §14 investigations | INVESTIGATED | `docs/investigations/`, scratch schemas |

**Could not verify:** the vLLM provider (server not running, Gemini credit
depleted, so `qwen2.5:3b-instruct-q4_K_M` on Ollama is the only exercised
generator); the ₹0/month hosting claim (nothing is deployed yet — see §18).

---

## 3. Project overview

Zeroth is a public benchmark of **end-to-end RAG pipeline quality**, plus the
platform under test. Public leaderboards rank models. Almost none measure a
whole pipeline — retrieval, grounding, abstention, latency and cost together —
on one corpus with published confidence intervals and published failure modes.

### The honest framing

Committed verbatim in `README.md`:

> Zeroth is an open reconstruction of a production confidential-document RAG
> platform. The original was built for an employer over a private corpus and is
> not public. This is a from-scratch rebuild of the same architecture over
> public documents. Every number published here was measured on the public
> corpus described in the methodology, and applies only to it.

`apps/web/app/about/page.tsx` carries the same statement under "Statement of
origin". Verified present in both.

This is technical, not only ethical: retrieval metrics are properties of a
corpus-and-query-set pair, not of an architecture.

### Architecture, one page

```
  data/corpus/raw (719 MB, gitignored)
        │  harness/corpus/fetch.py — token bucket, resume, integrity
        ▼
  data/corpus/parsed → chunks → embeddings  (186 / 264 / 79 MB, gitignored)
        │  harness/corpus/parse.py, harness/interactive/embed.py
        ▼
  PostgreSQL 16 + pgvector 0.8.6   ← platform/ingestion/ingest.py
    zeroth.chunk PARTITION BY LIST (tenant), 47 partitions
    per-partition HNSW (m=32, ef_construction=200) + GIN(tsv)
    RLS policy + FORCE, ACL behind SECURITY DEFINER
        │
        ▼  platform/retrieval — BM25(tsv) ∥ dense(pgvector) → RRF → rerank
        ▼  platform/generation — LangGraph: generate → resolve → verify → abstain
        │
        ▼  [PLANNED] harness/eval → content/board/*.json
        ▼  apps/web (Next.js static export) renders committed JSON
```

The site never queries the platform. It renders committed JSON. That is what
keeps hosting free and the public attack surface at zero.

### Running cost

**₹0/month is a design target, not yet a measured fact — nothing is deployed.**
The platform runs locally in Docker (one container, `pgvector/pgvector:pg16`).
The site is a static export intended for Cloudflare Pages' free tier. Once
deployed the claim holds; today it is unverified.

---

## 4. The three sections

| Section | Route(s) | Phase | Renders today |
|---|---|---|---|
| **3 — Eval board** | `/`, `/runs`, `/methodology`, `/corpus`, `/security`, `/failure-modes`, `/walkthroughs` | 1–5 | Honest empty states for runs; **real data** for corpus, failure modes, walkthroughs |
| **2 — Writing** | — | 6 | Route removed (see below) |
| **1 — Feed** | — | 7 | Route removed |

Sequenced 3 → 2 → 1. The board is built first because it supplies the material
nobody else can write about. The feed is last and explicitly optional: an
auto-generated digest is commodity content, and as an early section it would
make the whole site read as filler.

**Deviation from the brief:** `/writing` and `/feed` were deleted rather than
kept as empty routes. An empty section that has never had content is clutter.
Their plans live on the roadmap instead — except the roadmap route was itself
later replaced by `/learn`, so the phase table is **currently not rendered
anywhere on the site**. That is a documentation gap, listed in §23.

Routes rendering **real committed data**: `/corpus` (manifest), `/walkthroughs`
(interactive datasets), `/failure-modes` (9 entries), `/learn` (26 topics),
`/methodology` (13 metric definitions). Routes rendering **honest empty
states**: `/` results table, `/runs`, `/security` red-team results.

---

## 5. The phase model

| Phase | Deliverable | Gate | Status | Visible after |
|---|---|---|---|---|
| 0 | Site shell, tokens, layout | a11y ≥ 95, 360 px, dot leaders align | **IMPLEMENTED** | Every route, empty states |
| 1 | Corpus + golden set | `data/golden/` committed, agreement published | **PARTIAL** | Corpus figures (done); agreement (blocked) |
| 2 | The platform | Schema-valid answer, citations resolve, quotes verified; re-ingest is a no-op | **IMPLEMENTED — gate met** | Nothing publicly |
| 3 | Security | Red-team suite in CI; an introduced RLS bug fails it | **PLANNED** | Nothing publicly |
| 4 | Eval harness | Baseline results JSON, ten hand-checked queries | **PLANNED** | Nothing publicly |
| 5 | Variants + publish | Nine runs, one factor each | **PLANNED** | The board fills |
| 6 | Writing | Three posts, RSS validates | **PLANNED** | Writing section |
| 7 | Feed | PR-gated digest | **PLANNED** | Feed section |

### The visibility gap — a stated project risk

**Phases 2, 3 and 4 add nothing publicly visible.** That is three to four
weekends of work during which the board still says no runs have happened. Phase
2 is now complete and the site looks exactly as it did before it started.

The mitigation already taken: `/walkthroughs` and `/failure-modes` publish the
*investigation* work, which is real, measured, and interesting on its own. That
converts some of the invisible stretch into visible output without publishing a
single fabricated number.

---

## 6. The corpus

### Sources and what each contributes

| Source | Documents | Contributes |
|---|---|---|
| SEC EDGAR 10-K | 123 | Long, structurally messy filings with cross-references and tables; partition naturally by filing company |
| CUAD contracts | 509 | Real commercial contracts with clause structure; free clause-span ground truth |
| IETF RFCs | 30 | Dense cross-referencing, genuine section structure, a clean hard-mode subset |

### They are not three independent corpora

**CUAD's contracts are themselves sourced from EDGAR.** So this is *two document
shapes from one publisher* — 10-K narrative and exhibit-attached contracts —
plus RFCs as the only genuinely independent third source. This is stated on
`/corpus` and `/methodology` rather than left implied.

It also makes deduplication mandatory rather than optional: a contract can
appear standalone and as a 10-K exhibit.

### The fetcher — `harness/corpus/fetch.py`, IMPLEMENTED

- **Shared token bucket at 9 req/s** across all three sources, because SEC's
  limit is per-IP and spans `sec.gov` and `data.sec.gov` together. Capacity is
  pinned to 1.0 rather than the rate: a bucket that starts full fires `rps`
  requests instantly and settles afterwards, putting roughly twice the ceiling
  into the opening second — exactly the window a per-second limit measures.
- **Resume with integrity verification.** `Content-Length` checked before the
  write; files written through `.part` and renamed atomically; resume compares
  the file on disk against the byte count in the manifest. A file that merely
  *exists* is not treated as complete.
- **Per-document error isolation.** One failed document is recorded in the
  manifest under `failures` and stepped over. `KeyboardInterrupt` still aborts.
- **`--per-company` is idempotent** — lowering it prunes rather than leaving
  extras behind, so a clean clone running the same command reproduces the
  corpus.

### The manifest is the reproducibility mechanism

`data/corpus/corpus_manifest.json` (688 KB) is **committed**; the 719 MB of raw
documents are **gitignored**. Per document: source, identifier, URL, checksum,
normalised checksum, pages, `pages_source`, licence, tenant, `tenant_base`.
Replay the URL, verify the checksum.

### Final counts against the brief's targets

| | Actual | Brief target | |
|---|---|---|---|
| Documents | 662 | ~800 | under |
| Pages | 24,155 | 25,000+ | **under by ~3%** |
| Chunks (fixed-512) | 51,310 | 35,000+ | over |
| Chunks (section-aware) | 59,579 | — | — |
| Tenants | 47 | ~40 | over |

The page count misses the brief's target. It is reported rather than rounded up.
The cause is the deliberate reduction from 8 to 3 filings per company, taken
because the first corpus was 3× the design target and would have invalidated
every Phase 2 estimate.

### Three bugs, and the general lesson

**1. `slug()` truncation collision — 26 real contracts silently dropped.**
CUAD filenames routinely exceed 60 characters and differ only in a trailing
digit or `_AMENDMENT`. `slug(name, maxlen=60)` collapsed them to one id, and a
plain dict assignment overwrote. Because the resume check then found the first
file's entry intact, **the later files were never extracted to disk either** —
registration and extraction failed together, so the loss left no trace. The only
symptom was two counts on different log lines disagreeing.

> *A derived identifier that is lossy — truncated, slugged, normalised — is not
> an identifier. Make it total, or check for collisions when you assign it.*

Fixed: ids carry a hash of the full source path; `State.register()` refuses to
overwrite a different document and records a collision.

**2. `http.client.IncompleteRead` is an `HTTPException`, not an `OSError`.**
The retry loop caught `(URLError, TimeoutError, OSError)`, so a connection
dropped mid-read escaped it and killed the run — and that is precisely the
mechanism that produces truncated files.

> *Exception hierarchies do not follow intuition. `IncompleteRead` sounds like
> an I/O error and is not one.*

**3. `lxml` `id()` reuse — page counts over-counted 3–5×.**
Element proxies are created on demand and freed; ids get recycled, so a set of
ids collected in one traversal matched unrelated elements in the next. One
filing recorded 535 pages against 162 actual page breaks.

> *`id()` is only valid while a reference is held. This is not lxml-specific —
> any library with on-demand proxies behaves the same way.*

**None of the three threw an error in normal operation.** Each would have
corrupted a published figure. All are written up in `docs/known-issues.md` and
surfaced on `/failure-modes`.

---

## 7. Chunking

Both strategies are implemented behind one interface in
`harness/corpus/parse.py` (`class Chunker`), and both run over the same parsed
text. Tokenizer: **`BAAI/bge-small-en-v1.5`** — the same tokenizer as the
embedder, so a 512-token chunk is 512 tokens to the model that will embed it.

### Fixed-token — `Chunker.fixed`

512 tokens, **15% overlap** (77 tokens). Windows slide through the token
stream. Chunk spans are located back into the document text so page and section
can be attached.

### Section-aware — `Chunker.section_aware`

Groups consecutive blocks by detected section, then packs each section into
chunks of at most 512 tokens. A section longer than the window is split
internally **with the same overlap**.

Section detection by source, in `parse_plaintext` / `parse_edgar`:

| Source | Signal |
|---|---|
| EDGAR | `ITEM N` headings matched at block start, under 120 chars |
| RFC / CUAD | `1.2. Title`, `ARTICLE IV`, `Section 3.1`, on lines under 120 chars |

### Counts, and why they differ

51,310 fixed-512 against 59,579 section-aware. Section-aware produces **more**
chunks because a short section becomes its own chunk rather than being packed
with its neighbours. The effect is strongest on densely sectioned documents —
measured over one document per source (`data/interactive/chunking/`):

| Document | fixed-512 | crossing a section | section-aware | crossing |
|---|---|---|---|---|
| 10-K filing | 277 | 17 | 285 | **0** |
| Contract | 16 | 4 | 17 | **0** |
| RFC | 48 | 32 | 94 | **0** |

**What section-aware actually guarantees is zero chunks spanning two sections —
not that chunks never start mid-sentence.** It splits long sections internally
with the same overlap, so it starts mid-sentence about as often as fixed
windows do. The commonly stated benefit is wrong for this implementation, and
the site says so.

### The bug that made them briefly identical

Section detection was enabled only for RFCs. Every CUAD contract therefore
collapsed into a single `preamble` section, and section-aware chunking silently
degenerated into fixed chunking over one giant section.

**It was caught because both strategies produced identical chunk counts** — a
smell noticed while reading output, not a test that fired. Detection was
extended to contracts (numbered clauses, `ARTICLE`, `SECTION`), after which the
strategies diverged as expected.

> *There was no test for "the two strategies should differ". There is still no
> such test. That is listed in §22.*

### Provenance through chunking

Every chunk carries `doc_id`, `tenant`, `page`, `section`, `ordinal`,
`n_tokens`, `checksum`. Page and section come from the block map built during
parsing and are attached by locating the chunk's character span.

This matters because **a citation that cannot be resolved to a page and section
is not a citation** — a reader cannot check it. The quote-verification node in
the query graph depends on the chunk text being exactly what was indexed.

### `pages_source` — measured versus estimated

| Value | Meaning | Pages |
|---|---|---|
| `page-break` | Real page-break elements in filing HTML | counted |
| `form-feed` | Real `\f` in plain text | counted |
| `estimated` | Synthesised at ~3,000 chars/page where the source has no page structure | **8,196** |

**15,959 real / 8,196 estimated of 24,155.** The distinction is recorded per
document so nothing synthesised is presented as measured.

### Engineering consequences

- **Precision vs recall.** Smaller chunks raise precision and lower the chance
  a fact spans a boundary; larger chunks give the generator more context per
  citation. 512 is the embedder's window, so it is the natural ceiling.
- **Token cost per query.** The graph sends 5 passages × 700 chars
  (`PASSAGE_COUNT`, `PASSAGE_CHARS` in `graph.py`) — reduced from 10 × 1,200
  after a 3B model produced zero claims at the larger budget.
- **Contracts specifically.** A boundary cutting through a clause is the failure
  case: half a clause retrieved is worse than none, because it reads complete.
  This is exactly what section-aware chunking prevents, and the 32-of-48 RFC
  figure shows how often fixed chunking does it.

---

## 8. Tenants

47 tenants over 662 documents, assigned in `parse.py::assign_tenant` and merged
by `merge_small_tenants`. Both the final tenant and the unmerged `tenant_base`
are recorded per document.

| Source | Axis | Result |
|---|---|---|
| EDGAR | filing company | 29 kept individually, 6 short filers folded by SIC division |
| CUAD | **contract type** | 7 families after merging |
| RFC | working group | 2 after merging |

Distribution (fixed-512): min 507, median 855, max 2,868 chunks — a **5.7×
spread**, down from 150× before merging.

### Deviation 1 — CUAD tenants are contract type, not counterparty

The brief assigns tenants by "contract counterparty". Measured: **510 contracts
come from 463 distinct filers — about 1.1 documents per tenant.** Tenant
isolation cannot be tested meaningfully at that size; a partition holding a
single document proves nothing about access control.

Contract type gives bounded, deterministic, semantically coherent groups.
**Semantic coherence is the load-bearing property**: contracts of a type
genuinely cluster in embedding space, so retrieval under access control behaves
like a real system rather than like random filtering. Hash-bucketing would have
produced the same tenant count and destroyed exactly that.

### Deviation 2 — small-tenant merging

Anything under **500 chunks** folds into a semantic sibling. The reason is
concrete: `ef_search=200` against a 43-chunk partition means the search width
exceeds the entire partition, so a per-partition HNSW index is pointless — the
scan is exhaustive whatever the parameter says.

Merging is semantic, never arbitrary: `rfc-httpstate → rfc-httpbis`,
`rfc-quic → rfc-tls`, CUAD types into families (`license-ip`, `distribution`,
`marketing`, `services`, `supply`, `alliance`, `other`), short EDGAR filers into
SIC divisions.

---

## 9. Storage — where chunks go

### Where chunks live today

| Artefact | Path | Size | Committed | Regenerated by |
|---|---|---|---|---|
| Raw documents | `data/corpus/raw/` | 719 MB | gitignored | `harness/corpus/fetch.py` |
| Parsed text | `data/corpus/parsed/` | 186 MB | gitignored | `harness/corpus/parse.py` |
| Chunks (JSONL) | `data/corpus/chunks/` | 264 MB | gitignored | `harness/corpus/parse.py` |
| Embeddings | `data/corpus/embeddings/fixed-512.npy` | 79 MB | gitignored | `harness/interactive/embed.py` |
| **Manifest** | `data/corpus/corpus_manifest.json` | 688 KB | **committed** | `parse.py` |
| **In Postgres** | `zeroth.chunk` | 51,310 rows | live | `platform/ingestion/ingest.py` |

**Verified live:** 662 documents, 51,310 chunks, 47 tenants, 47 partitions, all
chunks carrying a 384-dim vector.

### Why PostgreSQL and not Pinecone, Chroma or FAISS — IMPLEMENTED

**The reason is not performance. It is that Row-Level Security is a Postgres
feature.** It enforces access control *inside the query*, as a security-barrier
predicate the planner may not optimise around, rather than filtering results
afterwards. No dedicated vector database has an equivalent.

The entire security phase of this project is only possible because the vectors
live in Postgres. A vector database plus application-side filtering is a
different system with a different threat model: one forgotten `WHERE` clause in
one code path is a leak, and nothing structural prevents it.

### The partitioned schema

`platform/db/migrations/001_schema.sql`:

```sql
CREATE TABLE zeroth.chunk (
    chunk_id text NOT NULL, doc_id text NOT NULL, tenant text NOT NULL,
    ..., body text NOT NULL,
    tsv       tsvector GENERATED ALWAYS AS (to_tsvector('english', body)) STORED,
    embedding vector(384),
    PRIMARY KEY (tenant, chunk_id)
) PARTITION BY LIST (tenant);
```

**Partitioning is necessary, not merely faster** — see §12. An index containing
only permitted rows has nothing to post-filter away.

`zeroth.ensure_partition(tenant)` creates a partition plus its HNSW, GIN and
`doc_id` indexes. `zeroth.force_rls_on_partitions()` sets `FORCE ROW LEVEL
SECURITY` on any partition lacking it — necessary because `relforcerowsecurity`
is per-table and partitions do not inherit it.

### HNSW over IVFFlat

Measured during §14 (synthetic, 36k × 384):

| Index | Build | Size |
|---|---|---|
| HNSW (m=16, ef_construction=64) | 17.7 s | 70 MB |
| HNSW partitioned (40 × 900) | 10.5 s | 70 MB |
| IVFFlat (lists=190) | 1.6 s | 57 MB |

HNSW chosen despite the slower build. IVFFlat's recall depends on centroids
fitted at build time, so it must be rebuilt as the corpus grows and degrades
under exactly the selective-filter conditions this project has. Partitioning
makes HNSW builds *cheaper*, removing IVFFlat's only advantage.

### Index parameters

| Parameter | Value | Controls |
|---|---|---|
| `m` | 32 | Links per node, fixed at build. Higher = better recall, larger index |
| `ef_construction` | 200 | Candidate list while building. Higher = better graph, slower build |
| `ef_search` | 200 (default) | Candidate list while querying. The runtime recall/latency dial |

Chosen from the measured sweep: `m=16/ef_construction=64` at `ef_search=40`
gave 0.836 overall recall; `m=32/ef_construction=200` at `ef_search=200` gave
0.998. Build cost roughly triples and is paid once per ingest.

### The restricted role

`zeroth_app` is `NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE`, created by
`migrate.py::ensure_role`. **A superuser bypasses RLS silently — no error, no
warning, policies simply do not apply.** Connecting as `postgres` would make
every security test pass for the wrong reason.

`db/connection.py::app_connection` asserts `rolsuper` and `rolbypassrls` are
both false *before returning the connection*, and raises `PrivilegeError`
otherwise. That assertion is the only thing standing between a typo in a
connection string and a meaningless security result.

### Container setup

`docker-compose.yml`, verified:

| Setting | Value | Why |
|---|---|---|
| image | `pgvector/pgvector:pg16` | Postgres 16 with pgvector 0.8.6 preinstalled |
| ports | `5433:5432` | **5433 deliberately** — leaves a system Postgres on 5432 undisturbed |
| volume | `pgdata` | Named volume so the corpus survives container replacement |
| `shm_size` | `'1gb'` | Docker's 64 MB default **fails parallel HNSW builds** with `could not resize shared memory segment ... No space left on device` |
| healthcheck | `pg_isready` | 10 s interval |

The `shm_size` line exists because the failure was hit: an HNSW build over
36,000 × 384 vectors with two parallel maintenance workers died on the default.

---

## 10. The golden set

### What it is and why it exists

To measure whether retrieval works, you must already know the right answer.
The golden set is that answer key: a list of questions, and for each question
which passages in the corpus are relevant and how relevant.

Every metric downstream is a function of these labels. Recall@10 asks whether a
passage graded ≥2 appeared in the top ten — if the grades are wrong, Recall@10
is wrong, and no amount of engineering below it can detect that. This is why the
golden set gets more care than the retriever.

### The five categories

Target 200 queries. **Drafted so far: 12.** Counts below are targets, with
actuals in brackets.

| Category | Target | Drafted | Tests |
|---|---|---|---|
| Single-chunk factual | 60 | 8 | Basic retrieval — answer lives in one chunk |
| Multi-chunk synthesis | 60 | 1 | Whether top-k is deep enough to combine chunks in one document |
| Cross-document | 30 | 1 | Whether the retriever spans sources |
| Tenant-scoped | 20 | 1 | Access-control behaviour — correct answer differs by role |
| Unanswerable | 30 | 1 | Abstention — the category almost no public benchmark includes |

**Worked example — `multi-chunk-000`** (real, from `data/golden/queries.jsonl`):

> **Question:** At what specific address is the Contractor, Redwater LLC,
> required to maintain original Subscription Agreements and Note Confirmations,
> absent a different location designated by the Company?
>
> **Reference answer:** Redwater LLC is required to maintain original
> Subscription Agreements and Note Confirmations at its principal office located
> at 5400 Opportunity Court, Suite 160, Minneapolis, Minnesota 55343 (unless
> another location is designated by the Company).
>
> **Tenant:** `cuad-services` · **Source chunks:** 4, all from
> `cuad-aspirityholdingsllc-05-07-2012-ex-10-6-o-5909385e`

### The grading scale

| Grade | Meaning | Real example from this set |
|---|---|---|
| **3** | Fully answers the question on its own | — (no model grade of 3 in the current judgments except 4 cases) |
| **2** | Contains a substantial part of the answer | `…::00012` — *"States the location is the Contractor's principal place of business."* |
| **1** | Related context, does not contain the answer | 15 judgments |
| **0** | Not relevant | `…::00003` — *"Contains contract definitions and parties, but not document storage requirements."* |

Current model grade distribution across 256 judgments:
**0 → 234, 1 → 15, 2 → 3, 3 → 4.**

### Relevance is absolute, not role-relative

Quoted verbatim from `harness/golden/generate.py::ABSOLUTE_RELEVANCE`, which is
interpolated into **both** the drafting and judging prompts:

> Relevance is a property of the passage and the question alone. It never
> depends on who is asking, what role they hold, or what they are permitted to
> see. Do not withhold or downgrade anything on access grounds.

The tenant-scoped drafting prompt makes the distinction explicit:

> The tenant matters for what the correct ANSWER is, not for which passages
> count as relevant when grading.

**Why role-relative judgments would break the benchmark:** a grade that depends
on the asker means every metric becomes a function of which role the harness ran
as. Recall@10 for `single_tenant` and `all_tenants` would not be comparable, and
neither would be comparable to anyone else's re-run. The benchmark's nine
clauses run as `all_tenants`; access-control effects are reported in their own
section rather than folded into headline numbers.

### How queries were generated

`harness/golden/generate.py`, verified:

| Parameter | Value |
|---|---|
| Drafting model | `gemini-3.6-flash` |
| Judging model | `gemini-3.1-flash-lite` |
| Seed | `20260824` |
| Candidates per query | 50, pooled by BM25 |
| Chunks per judge call | 5 (amortises the rubric) |
| Corpus | `data/corpus/chunks/fixed-512.jsonl` |
| Temperature | 0.7 drafting, 0.0 judging |

Source chunks are sampled per category — one chunk for single-chunk, four from
one document for multi-chunk, three from different documents in one tenant for
cross-document, and so on — under the fixed seed, so a re-run selects the same
source material.

**Gap:** the 12 drafted queries record `drafted_by: "gemini-3.6-flash"` — a bare
name, **not** the pinned `name@snapshot` form. The snapshot-recording code was
added after this run. `data/golden/run_config.json` **does not exist** for the
same reason. Both are fixed for future runs; the existing 12 are not
reproducible to a specific model snapshot.

### Cost

Measured from a real 53-call run: 2,320 calls, 4.99 M input tokens, 0.85 M
output, ≈ **$2.80** for the full 200-query set. Blocked: Gemini prepay credits
are depleted.

---

## 11. The verification chain

*This section is written for someone who has never built an evaluation set.
Nothing is abbreviated.*

The golden set is the answer key for the whole benchmark. But somebody has to
check the answer key. That checking is the verification chain, and it has three
links. The credibility of every published number rests on the third.

### Link 1 — Drafting

A model reads some chunks from the corpus and writes three things: a question, a
reference answer, and an indication of which chunks it used.

For our worked example the drafter read four chunks from an Aspirity Holdings
contract and produced:

> **Question:** At what specific address is the Contractor, Redwater LLC,
> required to maintain original Subscription Agreements and Note Confirmations,
> absent a different location designated by the Company?

**The obvious problem: the model wrote its own answer key.** Nothing has been
checked by anything. If the model misread the contract, the question, the
answer, and the labels are all wrong together, and they are wrong in a mutually
consistent way that looks fine.

### Link 2 — Blind judging

A **second** model independently grades candidate chunks against a published
rubric (0–3, defined in §10).

**The critical design decision: the judge is never shown the drafter's labels.**

Why this matters, plainly: if the judge could see that the drafter marked chunk
`…::00012` as a source, it would tend to agree. The two models would then agree
with each other most of the time — but that agreement would be telling you the
judge can read the drafter's notes, not that either of them is right. The number
would measure **conformity**, not correctness.

Verified in the code. `harness/golden/generate.py::JUDGE_PROMPT` interpolates
exactly three fields — the relevance statement, the question, and the passage
text:

```python
import re; re.findall(r'\{(\w+)\}', JUDGE_PROMPT)
# ['absolute', 'passages', 'question']
```

Whether a chunk was a source passage *is* recorded in the output (`is_source`),
but it is never sent to the judge.

**How candidates are pooled.** For each query, BM25 returns the top 50 chunks,
and the passages the query was drafted from are appended if BM25 missed them —
so a known-relevant chunk is always in the pool. Without that, a query could be
graded against 50 chunks none of which is the right one, and every grade would
be 0 for a reason that has nothing to do with the retriever.

**Why unanswerable queries receive no judgment calls.** An unanswerable query is
*defined* by the absence of a relevant chunk. There is nothing to grade. Asking
a judge to grade candidates for it would produce a page of zeros and call it
verification — theatre, not evidence.

**Draft-vs-judge agreement: NOT MEASURED.** The pipeline records both, but no
comparison has been computed, because the human link (below) is not usable yet
and the drafter's labels are not grades on the same scale.

**Why a very high agreement number would be suspicious — this is the part worth
internalising.** Two models agreeing 99% of the time on nuanced relevance
grading does not mean they found the truth. It means they share a bias: similar
training data, similar instruction-following, similar failure modes. Genuine
independent agreement on hard judgment calls is high but not near-perfect, and
its disagreements cluster **one grade apart** (a 2 where the other said 3)
rather than scattering across the scale (a 0 where the other said 3). Scattered
disagreement means the two are not measuring the same thing at all.

### Link 3 — Human verification

A stratified 25% sample, graded by the project owner using
`harness/golden/verify.py`.

**Why stratified rather than random — the arithmetic.** Suppose you draw 50
queries at random from 200. The tenant-scoped category has only 20 queries. Its
expected share of the draw is 50 × (20/200) = 5. But it is a random draw, and
simulation over 200 seeds shows it can come out as low as **1**. Your smallest
and most security-critical category would then be verified by a single query.

Stratified sampling takes 25% of *each category independently*, so no category
can be squeezed out:

| Category | Population | Sample | Coverage |
|---|---|---|---|
| Single-chunk | 60 | 15 | 25% |
| Multi-chunk | 60 | 15 | 25% |
| Cross-document | 30 | 8 | 27% |
| Tenant-scoped | 20 | 5 | 25% |
| Unanswerable | 30 | 8 | 27% |
| **Total** | **200** | **51** | **26%** |

**Why a fixed seed** (`SEED = 20260824`): the same 51 queries every run. Without
it, re-running the verification tool would pick a different sample, and you
could not tell whether a change in agreement came from the judge or from the
draw. Reproducibility applies to the verification too, not only the benchmark.

### Walking one query end to end

Run `python3 harness/golden/verify.py`. For `multi-chunk-000` the tool shows:

**1. The question, its category, its tenant**

```
QUERY 2/12   [multi-chunk]   multi-chunk-000
At what specific address is the Contractor, Redwater LLC, required to
maintain original Subscription Agreements and Note Confirmations, absent
a different location designated by the Company?
```

**2. The reference answer and the source passages**

```
Drafted answer: Redwater LLC is required to maintain original Subscription
Agreements and Note Confirmations at its principal office located at 5400
Opportunity Court, Suite 160, Minneapolis, Minnesota 55343 …

source passages: …::00012, …::00003, …::00014, …::00024
```

**3. Each candidate chunk in turn** — up to 8, highest model grade first:

```
--------------------------------------------------------------------
[1/8] cuad-aspirityholdingsllc-05-07-2012-ex-10-6-o-5909385e::fixed-512::00012
cuad-aspirityholdingsllc-…  ·  tenant cuad-services  ·  page 8  ·  section "preamble"
model grade: 2  (States the location is the Contractor's principal place of
business.)  <- passage the query was written from
--------------------------------------------------------------------
  …the Notes and the Note Portfolio, with full and correct entries of all
  transactions or modifications in a reasonably secure, up-to-date manner and
  in accordance with the following: (a) Location. All Note and Note Portfolio
  files and records shall be stored and maintained at the Contractor's
  principal place of business, or other location as designated by the
  Company. …
--------------------------------------------------------------------
      your grade [0-3, s=skip, q=quit]:
```

**4. The three things you are actually deciding**

- *Is the question answerable from this corpus at all?* If the drafter
  hallucinated a question the corpus cannot answer, the whole query is bad and
  no grade fixes it.
- *Do these chunks genuinely support the reference answer?* The drafter claimed
  they did. Here you check.
- *Is this grade right?* Does the chunk really "contain a substantial part of
  the answer" (2), or merely mention the topic (1)?

For the chunk above: it states records are kept at "the Contractor's principal
place of business" but **does not give the address**. The question asks for the
specific address. So it is related and useful but does not contain the answer —
**grade 1** is defensible, the model's **2** is generous, and **3** is not
supportable.

**5. What accept, edit and reject mean**

- **Accept** — type the same grade the model gave. Use when the model is right.
- **Edit** — type a different grade. Use when the model is wrong. This is the
  data point that makes the whole exercise worth doing.
- **Skip** (`s`) — record nothing. Use when *you* cannot decide, not when it is
  tedious. A skipped item is honest; a guessed item is noise.

**6. Where the judgment is written, and resume**

Each grade is appended to `data/golden/verification.jsonl` **immediately** —
after every single judgment, via temp-file-and-rename, not batched per query.
Quit with `q` or Ctrl-C and re-running resumes at the exact candidate you
stopped on, across sessions. Position is tracked in
`data/golden/.verify_state.json` (gitignored); the judgments themselves are
committed.

### The three agreement numbers, and which one matters

| Number | Definition | What it really measures |
|---|---|---|
| **Exact** | Human and model chose the identical grade | Strictest. Partly measures grading pedantry — a 2-vs-3 disagreement counts the same as 0-vs-3 |
| **±1** | Within one grade | Forgiving of boundary judgment. Good health indicator |
| **Binary** | Agreement on the **≥2 relevance boundary** | Agreement on the distinction the metrics actually use |

**Binary is the number published on `/methodology`.** Recall@k asks whether a
chunk graded ≥2 appeared in the top k. It does not care whether that chunk was a
2 or a 3. NDCG does weight them differently, but the dominant term is whether
the chunk cleared the line at all. So agreement on the ≥2 boundary is agreement
on the thing that changes the published figures; exact agreement includes
disagreements that change nothing.

### Why an honest low number beats a flattering high one

**This is the most important idea in this section.**

A verification pass rubber-stamped to 98% is a claim that collapses the first
time somebody asks how it was verified. 84% arrived at by genuinely disagreeing
with the model 16% of the time is a real number, and it makes every figure
downstream defensible — because the reader can see the checking was real.

The temptation runs the other way. Grading 400 candidate chunks is tedious, the
model's grade is displayed right there, and pressing the same key is faster than
reading the chunk. That produces a high agreement rate and a worthless one.

### Current status — the sample is not usable, and the tooling says so

**32 of an eventual ~400 judgments verified, across 4 queries. The agreement
rate is withheld rather than published.**

```
model grades : {0: 234, 1: 15, 2: 3, 3: 4}
human grades : {2: 2, 3: 30}
exact matches: 4/32     boundary matches: 6/32
```

**94% of the human grades are the single value 3.** A sample that does not
discriminate between relevant and irrelevant passages cannot measure a judge in
either direction — an 18% binary agreement here says nothing about the judge,
because the human labels carry no signal.

Adjudicating one case directly: for the cross-document query, a chunk graded **3**
by the human is hedge-accounting policy prose containing neither the operating-income
figure nor the XBRL taxonomy members the question asks for. Grade 3 means "fully
answers the question on its own", which is not defensible; the model's 0 is
closer to right than the human's 3.

`harness/interactive/verification.py` therefore refuses to publish, recording
the reasons in `data/interactive/verification/index.json`:

```json
"agreement_publishable": false,
"agreement_withheld_because": [
  "only 32 judgments verified, below the 60 minimum",
  "94% of human grades are the single value 3, so the sample does not
   discriminate between relevant and irrelevant passages and cannot measure
   a judge either way"
]
```

**Recommendation:** re-grade from scratch, reading each chunk against the
question before looking at the model's grade. Until then, every retrieval metric
in this project rests on unverified labels.

---

## 12. The §14 investigations — INVESTIGATED

The most technically valuable work in the repository. Conducted in scratch
schemas (`rlslab`, dropped; `demo`, still present) against first a synthetic
corpus and later the real one. Findings changed the Phase 2 design; the
investigation code is `harness/interactive/rls_demo.py` and
`docs/investigations/pgvector-rls.sql`, not the production path.

### Finding 1 — pgvector under RLS

**RLS is enforced correctly on HNSW index scans.** Zero leakage across 840
probes. A forged or unset role resolves to an empty tenant array and matches
nothing — it fails closed.

**But ANN post-filters.** The index returns its `ef_search` nearest neighbours
by distance; the policy then discards the forbidden ones; **nothing refills
them.** The plan shows it directly:

```
Limit
  ->  Index Scan using chunk_hnsw on chunk
        Order By: (embedding <=> $0)
        Filter: (hashed SubPlan 3)        <- the policy, applied AFTER
```

Recall therefore tracks how much of the corpus a role can see, not how good
retrieval is. On the synthetic corpus, recall fell from **0.905** unrestricted
to **0.023** for a single-tenant role, with 39 of 40 queries returning nothing
while exact search under the identical policy returned a full ten.

**The on-topic / off-topic split, and why the aggregate is misleading.** Slicing
by whether the query's topic belongs to a tenant the role can see:

| Slice | Recall | Empty |
|---|---|---|
| On-topic (asking about your own documents) | 0.90 – 0.95 | 0 |
| Off-topic (topic belongs to a tenant you cannot see) | 0.00 | all |

The aggregate depends entirely on the mix of on- and off-topic queries — a mix
that was *chosen* when the query set was constructed, not observed from real
usage. Reporting one number would be reporting an arbitrary choice as a finding.

### The critical negative result — and its correction on real data

**On the synthetic corpus, raising `ef_search` from 40 to 800 changed recall not
at all** (0.025 at every value; 177 empty results throughout). With
well-separated clusters, the 800 nearest neighbours all belong to the tenant
owning that region of the space. No search parameter fixes post-filtering.

**This does not replicate on the real corpus.** Re-measured on 51,310 real
chunks, 47 real tenants, real embeddings (`data/interactive/rls/postfilter.json`):

| Role | ef=40 | ef=100 | ef=200 | ef=400 | ef=800 |
|---|---|---|---|---|---|
| all_tenants | 0.850 | 0.942 | 0.967 | 0.967 | 0.975 |
| analyst_mid | 0.667 | 0.842 | 0.892 | 0.958 | 0.958 |
| single_tenant | **0.300** | 0.608 | 0.650 | 0.658 | **0.667** |

Recall more than doubles. The synthetic corpus used generated tenant clusters
with inter-tenant cosine of 0.014 — near-perfect separation — so a restricted
role's neighbours were entirely other tenants at any width. Real documents share
vocabulary, boilerplate and structure, so tenant regions overlap and a wider
search does reach permitted rows. **The separated case was the worst case, not
the typical one.**

What survives, and is the argument for partitioning: recall still falls 0.850 →
0.300 as access narrows; 6 of 12 queries still return nothing while exact search
returns a full set; and widening the search **plateaus at 0.667 against a 0.975
ceiling**, with 4 queries still empty at `ef_search=800`. You can buy some of it
back, then you cannot.

### Division of responsibility — precise

- **Row-level security is the CORRECTNESS boundary.** Recall was *identical*
  with and without the explicit tenant predicate (0.740 both ways on the
  synthetic measurement). The predicate never widened access.
- **The explicit tenant predicate is purely a PRUNING hint.** It lets the
  planner prune partitions at plan time. Measured: 38.5 ms → 1.03 ms.

**The red-team suite must pass with the predicate removed.** That is what proves
it is an optimisation and not the boundary. Verified today in the production
path: 720 results across 12 queries × 3 roles × 2 modes, **0 from a forbidden
tenant**, with the predicate present *and* with the retrieval SQL carrying no
tenant filter at all.

### Finding 2 — the planner flip

The same query can silently switch between exact and approximate execution
depending on statistics and machine-level settings. **The flip moves recall
upward**, so it never looks like a bug — a run simply scores higher on one
machine than another.

Root cause: the planner's row estimate for an HNSW index scan has no model of
`ef_search`. It estimated `rows=18000` for a scan that returns at most
`ef_search` candidates. Cost decisions above that node are made on a fiction.

**Partitioning makes this finer-grained rather than safer.** Confirmed in
production during Phase 2: at 1,092 rows per partition the planner chose
sequential scans over every HNSW index, because for a partition that size a seq
scan genuinely *is* cheaper. Results became silently exact.

**The plan guard** — `platform/retrieval/plan.py`, IMPLEMENTED:

- `capture()` runs `EXPLAIN (FORMAT JSON, COSTS OFF)` without executing, walks
  the plan tree, and records node types in traversal order plus every index name.
- The fingerprint is a de-duplicated node-type signature — a 47-partition
  `Append` produces 47 identical node names and is only useful collapsed.
- `assert_shape()` matches against **exact node types**, not substrings. An
  earlier version used substring matching, which let `Bitmap Index Scan` satisfy
  a requirement for `Index Scan` — a different access method with different
  recall behaviour.
- `retrieve(mode=...)` **pins** the plan rather than asserting a hope:
  `approximate` forces the HNSW walk, `exact` forces a sequential scan. Both
  disable bitmap scans, which would otherwise satisfy neither.
- A mismatch raises `PlanMismatch` and fails the run.

Verified four ways, including a live induced flip and the bitmap-substring trap.

### Finding 3 — lexical pre-filters, vector post-filters

Full-text ranking applies the policy **before** ranking:

```
Limit -> Sort (Sort Key: ts_rank(...) DESC)
           -> Seq Scan on chunk
                Filter: ((hashed SubPlan 2) AND (tsv @@ ...))
```

`ts_rank` therefore orders only permitted rows and **no recall is lost**.
`single_tenant` returned a full ten.

**This breaks the brief's assumption** that keeping lexical search in-database
makes RLS apply "identically" to both retrieval paths. It applies *correctly* to
both and *identically* to neither. That asymmetry matters when comparing the two
paths, and is stated on `/methodology`.

### Finding 4 — two more silent RLS bypasses

1. **The table owner bypasses RLS** unless `FORCE ROW LEVEL SECURITY` is set;
   `relforcerowsecurity` defaults to false. Confirmed: a probe run as the owner
   returned recall 0.95 with no restriction applied at all.
2. **The ACL table is readable** by any role the policy depends on, exposing the
   entire authorisation matrix.

Both closed in Phase 2: `FORCE` on all 49 tenant tables, ACL behind
`zeroth.current_tenants()` (`SECURITY DEFINER`, pinned `search_path`), and
`zeroth_app` holds **no** grant on `zeroth.acl`.

### Finding 5 — vLLM guided decoding

Introspected from the `vllm/vllm-openai:latest` image, version **0.27.1**:

- Backends: `auto` (default), `xgrammar`, `guidance`, `outlines`,
  `lm-format-enforcer`. All four are wired in V1; `outlines` and
  `lm-format-enforcer` are lazy-imported and so appear absent under
  introspection.
- **The backend is process-wide, not per-request.** From the source: *"We only
  support a single backend. We do NOT support different backends on a
  per-request basis in V1."*
- **`auto` silently cascades** xgrammar → guidance → outlines when a schema
  trips `has_xgrammar_unsupported_json_features`. Two runs could use different
  decoders with no signal in the output. Pin the backend explicitly.
- **Constrained decoding guarantees grammar conformance, not full schema
  validity.** Keywords a grammar cannot express — `minimum`, `maximum`,
  `minLength`, `minItems` — are not enforced at the sampler. The output parses
  and matches the structure; it does not satisfy every assertion.

Design consequence, implemented: the JSON contract is kept **structural**
(`platform/generation/contract.py::ANSWER_SCHEMA` — types, required fields,
nesting), and semantic assertions live in a Pydantic validation pass after
generation. This is not the retry loop the brief rules out; structure is still
enforced at the sampler.

---

## 13. The platform — Phase 2

**Gate met.** `platform/db/migrate.py --verify` passes all five security
invariants; a real query produces a schema-valid answer with resolving citations
and verified quotes; re-ingesting the unchanged corpus is a measured no-op.

| Component | Status | File |
|---|---|---|
| Schema, RLS, partitioning | IMPLEMENTED | `platform/db/migrations/001–005` |
| Migration runner + invariant verifier | IMPLEMENTED | `platform/db/migrate.py` |
| Privilege-asserting connections | IMPLEMENTED | `platform/db/connection.py` |
| Idempotent checksum-keyed ingestion | IMPLEMENTED | `platform/ingestion/ingest.py` |
| Incremental re-index | IMPLEMENTED | same, `--touch` |
| Ingestion-time sanitisation | IMPLEMENTED | `platform/ingestion/sanitise.py` |
| Hybrid BM25 + dense, RRF | IMPLEMENTED | `platform/retrieval/retrieve.py` |
| Plan pinning | IMPLEMENTED | `platform/retrieval/plan.py` |
| Cross-encoder reranking | IMPLEMENTED | `platform/retrieval/rerank.py` |
| Query graph | IMPLEMENTED | `platform/generation/graph.py` |
| Constrained decoding | IMPLEMENTED (Ollama) | `platform/providers/ollama.py` |
| Provider interface | IMPLEMENTED | `platform/providers/base.py` |
| vLLM provider | NOT VERIFIED | `platform/providers/vllm.py` |
| Citation resolution | IMPLEMENTED | `graph.py::node_resolve` |
| Quote verification | IMPLEMENTED | `graph.py::node_verify` |
| Abstention | IMPLEMENTED | `graph.py::node_abstain` |
| Audit logging | PARTIAL | table exists, 0 rows, not wired |
| Ops layer (Django) | NOT FOUND | — |
| FastAPI query surface | PLANNED | `platform/api/` empty |

### Ingestion

Idempotency is keyed on the **raw-bytes checksum** in the manifest. Unchanged
bytes mean unchanged text, chunks and vectors, so the document is skipped
entirely.

```
first run    662 documents · 51,310 chunks · 47 tenants · 108 s
re-run       662 unchanged · 0 written · 0.02 s      <- the gate
incremental  3 documents re-indexed in 0.49 s
```

### Sanitisation

Six rule families in `sanitise.py`: `override`, `role-reassign`,
`chat-role-marker`, `tag-injection`, `exfiltration`, `answer-override`. Removals
are replaced with `[instruction removed during ingestion]` and counted on the
document row — never silent.

**The rules were 3-for-3 wrong on first contact with the real corpus.** 24
synthetic tests passed while it removed genuine passages: `System:` as a
component label in a contract, and `MAY instead respond with a status code of
404` from RFC 7231 and RFC 9110. Two causes:

1. `(?i)` applies to the whole pattern, so `[A-Z]{2,}` matched *any* two
   letters rather than a shouted literal. Fixed with `(?-i:[A-Z]{2,})`.
2. The rules were too loose. An override *names what to say* — a quoted string,
   a shouted literal, or `with the following`. A noun phrase does not.

Now 24 tests pass including the three real strings as regressions, and the
corpus scans **0 false positives**.

### Retrieval

Both paths in-database so one policy covers both. Lexical uses
`websearch_to_tsquery` over the generated `tsv` column with **OR semantics** —
the default AND matched *nothing* for a twelve-word natural question against
51,310 chunks, so the lexical half of the hybrid retriever returned zero hits
for every query until this was fixed.

RRF fuses by **rank**, `k=60`, never by score: `ts_rank_cd` and cosine are not
on comparable scales.

Measured on the real corpus, lexical and dense top-20 agree on **5 of 20** —
15 lexical-only and 15 dense-only per query. That number is the argument for
fusion.

### Latency — optimised during Phase 2

| Role | Before | After |
|---|---|---|
| all_tenants | 1,950 ms | **1,024 ms** |
| analyst_mid | 577 ms | **287 ms** |
| single_tenant | 100 ms | **50 ms** |

Three causes found by measurement:

1. **The OR query had 31 terms and matched 90% of the corpus** (45,971 of
   51,310), so `ts_rank_cd` scored 46,000 rows. `zeroth.lexeme_df` (migration
   005) now supplies document frequency and only the 8 most selective terms are
   kept — the same signal BM25's idf uses. Matches fell to 25%.
2. **The RLS policy cost 513 ms on its own** (276 ms as owner → 789 ms with the
   policy). Not `current_tenants()`, which is 0.21 ms and called 47 times; it is
   the per-row `tenant = ANY(text[])` barrier qual, which cannot prune
   partitions. Passing the permitted tenants as an *explicit predicate* enables
   plan-time pruning.
3. Ruled out by measurement: `work_mem` (no lossy bitmap scans at 4/64/256 MB)
   and the lateral `tsquery` (both forms use the GIN index).

**Not taken:** `shared_buffers` is 128 MB against a roughly 1 GB working set.
That needs a compose change and a database restart.

### The query graph

`retrieve → rerank → generate → resolve → verify → abstain`, LangGraph 1.2.11.

Two of the nodes need no model at all. `resolve` asks whether the cited chunk id
exists in what was actually shown to the generator — a model that invents an id
fails deterministically. `verify` asks whether the quoted span appears in that
chunk, by normalised containment.

**Abstention distinguishes its cause.** An empty retrieval is recorded as
`empty_retrieval` and *not* as an evidence judgement, because approximate search
under an access policy returning nothing would otherwise inflate the abstention
metric for a reason unrelated to the behaviour being measured. A response
carrying answer text *and* `abstained: true` — which the model produced — is
treated as intent to answer, so the citation checks apply rather than being
skipped.

### Gate result, honestly

```
GATE: 2/12 produced a schema-valid answer with resolving citations and verified quotes
```

Two is the honest figure for `qwen2.5:3b-instruct-q4_K_M`. The failures are
informative:

```
claims=1 res=1/1 ver=0/1  overlap=79%   quote altered, not fabricated
claims=1 res=1/1 ver=0/1  overlap=61%   same
claims=1 res=0/1 ver=0/1  overlap=0%    invented a chunk id — caught
claims=0                                model declined to cite
```

The `overlap` figure separates an *altered* quote from an *invented* one. The
clearest case: a source contract contains the typo `consitute`, and the model
silently corrected it to `constitute` — 14 of 23 words verbatim, diverging
exactly at the typo. The verifier is right to reject it. A quote that differs
from the source is not a quote.

**A larger generator would very likely clear more of the gate**, since the
failures are quote-copying fidelity rather than retrieval.

---

## 14. Security

| Control | Status |
|---|---|
| RLS policies on `chunk` and `document` | IMPLEMENTED |
| `FORCE ROW LEVEL SECURITY` on all 49 tenant tables | IMPLEMENTED |
| ACL behind `SECURITY DEFINER` with pinned `search_path` | IMPLEMENTED |
| `zeroth_app` NOSUPERUSER NOBYPASSRLS + runtime assertion | IMPLEMENTED |
| Partitioned schema | IMPLEMENTED |
| Fail-closed on unset/forged role | IMPLEMENTED |
| Red-team suite | **PLANNED — `tests/redteam/` NOT FOUND** |

`migrate.py --verify` output, live:

```
ok  zeroth_app is NOSUPERUSER NOBYPASSRLS
ok  RLS enabled and FORCED on all 49 tenant tables
ok  current_tenants() is SECURITY DEFINER with a pinned search_path
ok  zeroth_app cannot read the ACL table
ok  app connection passes the privilege assertion
```

The suite must cover cross-tenant retrieval, role escalation, prompt injection
through document content and through the query, citation forgery and abstention
bypass; target ≥ 140 cases; and must be verified by deliberately introducing an
RLS bug and confirming it fails.

**The suite must publish its failures.** A security page reporting a perfect
pass rate with nothing shown is the least believable page a benchmark can carry.

---

## 15. Evaluation — PLANNED

Definitions exist as committed content (`content/metrics/*.json`, 13 metrics)
and render on `/methodology`. **No scorer code exists.** `harness/eval/` NOT
FOUND.

| Family | Metrics | Status |
|---|---|---|
| Retrieval | Recall@5, Recall@10, MRR@10, NDCG@10, context precision | PLANNED |
| Grounding | Faithfulness, answer correctness, answer relevance, citation accuracy, citation coverage | PLANNED |
| Abstention | Correct abstention rate | PLANNED |
| Performance | p50/p95/p99 latency | PLANNED |
| Cost | Cost per query | PLANNED |

- **Bootstrap CIs**: 1,000 resamples of the query set, 95% interval. A point
  estimate over a few hundred queries without an interval is the first thing a
  reviewer attacks. **The sampling unit is the query, not the judgment.**
- **One factor at a time**: eight variants each differing from the baseline by
  exactly one factor, so every difference is attributable to a single change
  rather than producing a ranking nobody can explain.

**Parameters that must be recorded per run** because they change measured
recall: `role`, `mode` (approximate/exact), `ef_search`, `hnsw.iterative_scan`,
`m`, `ef_construction`, chunking strategy, embedding model snapshot, reranker
snapshot, generator snapshot, `structured_outputs.backend`, `top_k`,
`rerank_depth`, RRF `k`, corpus id, and the **executed plan fingerprint**.

---

## 16. The web application — IMPLEMENTED

Next.js 16.3.2, React 19.2.8, Tailwind CSS v4, TypeScript. Static export
(`output: "export"`, `trailingSlash: true`, `images.unoptimized`). No server
runtime, no database, no API routes. **Content is data**: git is the CMS.

Routes: `/`, `/methodology`, `/corpus`, `/failure-modes`, `/walkthroughs`,
`/security`, `/learn`, `/about`, `/runs`, plus a 404.

Content directories: `content/metrics/` (13), `content/failure-modes/` (9 — 5
observed, 4 prevented-by-design), `content/learn/` (26 topics across 7
categories), `content/board/` (**empty except `.gitkeep`**).

### The design system as an engineering decision

**Direction: a published specification that happens to be interactive**, later
evolved toward a research paper. Chosen against three obvious defaults — dark
background with an acid accent, cream paper with terracotta serif, dashboard
card grids with sparklines — because none of them is this subject. The claim is
rigour, and the design has to transmit rigour before a number is read.

**Six colours, each carrying meaning.** `--paper #EDEFF2`, `--ink #14161A`,
`--ink-muted #5C636E`, `--rule #C8CDD4`, `--signal #1E4FD8`, `--regress
#A33A2A`. `--signal` and `--regress` are reserved exclusively for deltas.

Later extended with five metric-family hues. **Hue is reinforcement, not the
identification channel** — measured under deuteranopia simulation, `retrieval`
and `cost` collapse to ΔE 1.9 (effectively identical), and spreading lightness
enough to separate them pushes two families below WCAG AA. The mono family tag
(`RET`/`GRD`/`ABS`/`PRF`/`CST`) is what a reader identifies a family by.

**Three typefaces.** Archivo (display and headings), Source Serif 4 (body
prose), IBM Plex Mono (every number, table cell, caption, label).

**Prose measure.** Originally 72 characters — the width RFCs are published at,
applied literally. Now **66ch** for the paper direction.

**The clause block** is the signature element: an expanded run renders as a
normative clause with dot leaders aligning exactly.

### The `@theme inline` bug

Tailwind v4's `@theme inline` **does not emit custom properties** — it resolves
them into utility classes only. So `font-family: var(--font-mono)` in
hand-written CSS resolved to nothing, and every monospace rule fell back to the
preflight sans stack.

**The dots looked aligned.** The first check measured block boxes, which are
full-width and therefore identical regardless of font — and it passed. Only
measuring the *text ink* caught it: glyph runs differed by over 100 pixels
(200px vs 312px for the same 52 characters).

> *That is a lesson about verification method, not CSS. A check that passes on
> broken code is worse than no check, because it manufactures confidence.*

A second instance of the same family: unlayered CSS beats layered CSS regardless
of specificity, so a bare `a { text-decoration: underline }` silently overrode
every Tailwind text utility site-wide. Base styles now live in `@layer base`.

### Build-time guards

- `apps/web/scripts/csp.mjs` — pins a SHA-256 hash per inline script into `out/_headers`.
  Next's static export embeds the RSC payload in inline `<script>` tags;
  `script-src 'self'` would block them **in production only**, since `_headers`
  is applied by Cloudflare Pages and ignored by `next dev` and local `serve`.
- `apps/web/scripts/check-nesting.mjs` — scans emitted HTML with an explicit element
  stack and fails the build on flow content inside a `<p>`. This existed because
  an inline metric reference rendered its full panel inside a paragraph,
  producing React error #418 (hydration mismatch) and re-rendering every page on
  every load. Verified to have teeth by reintroducing the bug.

Both run as part of `npm run build`, which CI executes.

---

## 17. How to see it running

### Run it locally

```bash
cd ~/projects/zeroth/apps/web && npm run dev
```

Opens on **http://localhost:8000**. WSL forwards the port, so that URL opens in
a Windows browser.

> **Note:** `package.json` uses port **8000**. `CLAUDE.md` and
> `apps/web/README.md` still say 3010 — stale, listed in §23.

To check what actually ships (route resolution, CSP, the nesting guard all
behave differently from dev):

```bash
cd ~/projects/zeroth/apps/web && npm run build && npm run start
```

### Guided tour

| Route | Today | After |
|---|---|---|
| `/` | Masthead, abstract, Figure 1 (pipeline), Figure 7 (corpus, real), results **in-progress block** | Phase 5 — nine run rows |
| `/methodology` | 13 metric definitions by family, Figures 5/6/8. Every metric name opens | Phase 4 — real values with intervals |
| `/corpus` | **Real** composition from the manifest | — |
| `/failure-modes` | 9 entries, 5 observed / 4 prevented, Figures 2–5. Figure 2 has a step control | Phase 3 — red-team results |
| `/walkthroughs` | Three demos over **real measured data** | Phase 2 replaces offline captures |
| `/security` | Design and the two silent bypasses; results **in-progress** | Phase 3 |
| `/learn` | 26 topics, each opening a scrollable modal | — |
| `/about` | Overview, architecture, stack table, links | — |
| `/runs` | **In-progress block** | Phase 5 |
| `/does-not-exist` | The 404 page | — |

### What to check on the design

- Numbered clause index down the left, sticky at ≥900px, collapsing to a
  `<details>` drawer below.
- Prose capped at 66 characters — count them on `/methodology`.
- Monospace on every number, table cell and caption.
- **Dot leaders aligning exactly** — the thing that was broken and fixed. On
  `/corpus`, every leader line is 52 columns with the value starting at column
  34, at every breakpoint.
- Honest empty states: *"No runs yet. The first will publish once the baseline
  completes"* — never "coming soon".

### Responsive check

Resize to ~360px. The rail becomes a top drawer, margin notes fall inline, and
**nothing scrolls horizontally** — wide figures and tables scroll inside their
own container.

### Inspect the data behind it

```bash
python3 -c "import json;m=json.load(open('data/corpus/corpus_manifest.json'));print(m['corpus_stats'])"
```
```bash
head -1 data/golden/queries.jsonl | python3 -m json.tool | head -20
```
```bash
ls -A content/board/          # .gitkeep only — genuinely empty, not seeded
```

### What does not exist yet

**No board rows. No benchmark runs. No live retrieval from the website.** The
site renders committed JSON, and the only committed JSON is corpus composition,
failure modes, learn content, and precomputed interaction data. Someone
expecting a working search demo should be told plainly: the platform works
locally and is not exposed publicly, by design.

---

## 18. Deployment

*Written for someone who has not used Cloudflare Pages before. Every step.*

### Audit — what deployment requires

Checked against the actual files, not recited from defaults.

| Check | Finding | Action |
|---|---|---|
| `output: 'export'` | Present, `next.config.ts` line 5 | none |
| `trailingSlash` | `true`, line 6 | none — this is what makes deep-route refresh work |
| `images.unoptimized` | `true`, line 7 | none — the optimizer needs a server |
| `basePath` | absent | none — correct for a domain root |
| Build script | `next build && node scripts/csp.mjs && node scripts/check-nesting.mjs` | none |
| Node version | **no `engines` field**; CI pins 20 | set `NODE_VERSION=20` in Pages |
| Client env vars | **none** — no `NEXT_PUBLIC_*`, no `process.env` outside `process.cwd()` | none. **No secret can reach the bundle** |
| Server runtime / API routes | none — all 9 routes prerender | none |
| Monorepo | yes, app at `apps/web` | set **Root directory** to `apps/web` |
| `public/_headers` | CSP would have blocked hydration | **fixed** — `scripts/csp.mjs` pins hashes |
| Analytics | **none configured** | none |

### 1. Prerequisites

- Repository pushed to GitHub (`https://github.com/codelinechef/zeroth`).
- `npm ci && npm run build` succeeding locally from `apps/web`.
- Deploy branch identified — `main` below.

### 2. Create the Pages project

1. <https://dash.cloudflare.com> → **Workers & Pages**
2. **Create** → **Pages** → **Connect to Git**
3. Authorise Cloudflare for GitHub. Grant access to **this repository only**.
   Cloudflare needs read access to clone and webhook access to rebuild on push.
   It does not need write access.
4. Select the repository → **Begin setup**

### 3. Build configuration

| Field | Value | Source |
|---|---|---|
| Production branch | `main` | your deploy branch |
| Framework preset | **None** | presets assume the app is at the repo root |
| Build command | `npm run build` | `package.json` |
| Build output directory | `out` | `output: 'export'` writes here |
| Root directory | `apps/web` | monorepo |
| Environment variable | `NODE_VERSION` = `20` | no `engines`; CI pins 20 |

Add nothing else. The build reads no secrets.

### 4. First deploy

**Save and Deploy.** Expect 2–4 minutes: clone, `npm ci`, `next build`, upload.

Read the log at **Workers & Pages → your project → Deployments → the run**. A
failure is almost always `npm ci` (lockfile out of sync — commit
`package-lock.json`) or `next build` (a type error `npm run build` would also
have caught locally).

### 5. Test on `.pages.dev` before touching DNS

You get a URL like `zeroth-abc.pages.dev`. Check everything there first:

- Every route in the §17 table
- `/does-not-exist` → the 404 page
- **Refresh directly on `/methodology/`** — do not navigate to it. This is the
  classic static-export failure; `trailingSlash: true` is what prevents it
- Hover and keyboard-focus a metric name; open and `Escape` the panel
- Step through Figure 2 on `/failure-modes`
- **Open DevTools → Console. It must be empty.** A CSP violation appears here
  and nowhere else
- Resize to 360px: no horizontal scroll

Do not proceed until the console is clean.

### 6. Add the custom domain

**Your project → Custom domains → Set up a domain** → enter
`zeroth.anantsharma.co.in` → **Continue**.

Cloudflare shows a CNAME target, typically `zeroth-abc.pages.dev`. Copy it
exactly. If `anantsharma.co.in` is already on Cloudflare DNS, the record is
created for you — skip to step 8.

### 7. The DNS record

At whichever provider hosts DNS for `anantsharma.co.in`:

| Field | Value |
|---|---|
| Type | `CNAME` |
| Host / Name | `zeroth` |
| Value / Target | `zeroth-abc.pages.dev` (the exact target from step 6) |
| TTL | Automatic, or 300 |
| Proxy | On, if the provider is Cloudflare |

**The mistake almost everyone makes.** Most registrars **append the root domain**
to whatever you type in the host field. Entering `zeroth.anantsharma.co.in`
there produces `zeroth.anantsharma.co.in.anantsharma.co.in`, which resolves to
nothing and looks exactly like a propagation delay.

To find out which convention your provider uses, look at an existing record. If
`www` is stored as `www`, enter `zeroth`. If it is stored as
`www.anantsharma.co.in`, enter the full name. When in doubt enter `zeroth` — it
is right far more often.

### 8. Propagation

Usually under five minutes, occasionally up to an hour. Verify with a resolver,
not a browser — browsers and the OS cache aggressively:

```bash
dig zeroth.anantsharma.co.in CNAME +short
```
```bash
nslookup zeroth.anantsharma.co.in
```

Expect `zeroth-abc.pages.dev.`. If `dig` returns nothing, the record is wrong or
not yet published. Refreshing a browser tab tells you nothing either way.

### 9. HTTPS

Cloudflare issues the certificate automatically once DNS resolves. Typically
under fifteen minutes, occasionally up to an hour.

**A certificate warning during that window is expected**, not a
misconfiguration. Pages shows status under **Custom domains**. Investigate only
if it is still pending after an hour — the usual cause is DNS not actually
resolving, so re-run the `dig` above.

### 10. Verification checklist

- [ ] `https://zeroth.anantsharma.co.in` serves the site
- [ ] Certificate valid, no browser warning
- [ ] Every route resolves
- [ ] **Refresh directly on a deep route** — no 404
- [ ] `/does-not-exist` shows the 404 page
- [ ] Fonts render (serif body, mono numbers) — system fallbacks mean a CSP or
      asset failure
- [ ] **Console clean** — no CSP violations
- [ ] Metric popovers open on keyboard focus; panel opens, `Escape` closes
- [ ] 360px: no horizontal scroll
- [ ] Lighthouse in production: accessibility 100, performance ≥ 95

### 11. Ongoing

- **Auto-deploy:** every push to `main` rebuilds and deploys.
- **Previews:** every other branch and pull request gets its own preview URL.
- **Rollback:** Deployments → an earlier successful deployment → **Rollback to
  this deployment**. Instant, no rebuild.

### 12. Linking from the portfolio

Add the link on `anantsharma.co.in` where projects are listed. The site's footer
already links back (`lib/links.ts`), so the pair is bidirectional.

### 13. Troubleshooting

**Builds locally, fails on Pages.** Almost always Node version or lockfile
drift. Confirm `NODE_VERSION=20` and that `package-lock.json` is committed.
Reproduce with `rm -rf node_modules .next out && npm ci && npm run build`.

**DNS not resolving after an hour.** Re-read step 7 — it is nearly always the
appended-root-domain mistake.

**Certificate stuck pending.** Requires DNS to resolve first. Fix DNS; the
certificate follows.

**Deep routes 404 on refresh.** `trailingSlash: true` must be in
`next.config.ts`. It is — so if this appears, the build output directory is
wrong. It must be `out`, not `.next`.

**Console shows `Refused to execute inline script`.** `scripts/csp.mjs` did not
run, or `out/_headers` was overwritten. Re-run `npm run build` and confirm the
log line `csp: pinned N inline script hash(es)`.

**Fonts fail.** Check the console for CSP violations. `font-src 'self'` is
correct because `next/font` self-hosts.

### Local Lighthouse — two WSL2 quirks

Full Chrome **segfaults** on this WSL2 kernel, and Lighthouse's launcher
misdetects WSL as Windows and fails creating a temp directory. Use
`chrome-headless-shell` and connect over the debug port:

```bash
npx puppeteer browsers install chrome-headless-shell
```
```bash
~/.cache/puppeteer/chrome-headless-shell/linux-*/chrome-headless-shell-linux64/chrome-headless-shell --no-sandbox --disable-gpu --remote-debugging-port=9223 --user-data-dir=/tmp/zeroth-chrome about:blank &
```
```bash
npx lighthouse http://localhost:8000/ --port=9223 --only-categories=accessibility,performance
```

---

## 19. Code-to-architecture mapping

| Component | File | Symbol | Status |
|---|---|---|---|
| Corpus fetch | `harness/corpus/fetch.py` | `main`, `TokenBucket`, `Fetcher` | IMPLEMENTED |
| Parse / chunk / tenant / dedup | `harness/corpus/parse.py` | `Chunker`, `assign_tenant`, `run_dedup` | IMPLEMENTED |
| Embedding | `harness/interactive/embed.py` | `main` | IMPLEMENTED |
| Golden drafting + judging | `harness/golden/generate.py` | `stage_draft`, `stage_judge` | PARTIAL |
| Gemini client | `harness/golden/gemini.py` | `Gemini`, `RateLimit` | IMPLEMENTED |
| Human verification CLI | `harness/golden/verify.py` | `main`, `stratified_sample` | IMPLEMENTED |
| BM25 (pooling only) | `harness/golden/bm25.py` | `BM25` | IMPLEMENTED |
| Schema / RLS / partitions | `platform/db/migrations/001–005` | — | IMPLEMENTED |
| Migration + invariants | `platform/db/migrate.py` | `run`, `verify`, `ensure_role` | IMPLEMENTED |
| Connections | `platform/db/connection.py` | `app_connection`, `as_role` | IMPLEMENTED |
| Ingestion | `platform/ingestion/ingest.py` | `main` | IMPLEMENTED |
| Sanitisation | `platform/ingestion/sanitise.py` | `sanitise`, `PATTERNS` | IMPLEMENTED |
| Hybrid retrieval | `platform/retrieval/retrieve.py` | `retrieve`, `_selective_query` | IMPLEMENTED |
| Plan guard | `platform/retrieval/plan.py` | `capture`, `assert_shape` | IMPLEMENTED |
| Reranking | `platform/retrieval/rerank.py` | `rerank` | IMPLEMENTED |
| Query graph | `platform/generation/graph.py` | `build_graph` | IMPLEMENTED |
| Answer contract | `platform/generation/contract.py` | `Answer`, `ANSWER_SCHEMA` | IMPLEMENTED |
| Provider interface | `platform/providers/base.py` | `Provider` | IMPLEMENTED |
| Ollama provider | `platform/providers/ollama.py` | `OllamaProvider` | IMPLEMENTED |
| vLLM provider | `platform/providers/vllm.py` | `VLLMProvider` | NOT VERIFIED |
| Interactive datasets | `harness/interactive/*.py` | — | IMPLEMENTED |
| Site content loaders | `apps/web/lib/*.ts` | — | IMPLEMENTED |
| CSP + nesting guards | `apps/web/scripts/*.mjs` | — | IMPLEMENTED |
| Eval scorers | — | — | NOT FOUND |
| Red-team suite | — | — | NOT FOUND |
| FastAPI surface | `platform/api/` (empty) | — | PLANNED |
| Django ops | — | — | NOT FOUND |

---

## 20. How to read this codebase

Efficient order, adapted to what exists today:

1. `CLAUDE.md` — constraints. Note the port drift (§23).
2. `docs/ZEROTH_BUILD_BRIEF_V2.md` — the source of truth for scope.
3. `docs/investigations/FINDINGS.md` — the four §14 investigations. **Read this
   before the platform code**; it explains why the schema looks as it does.
4. `platform/db/migrations/001–003` — schema, RLS, partitioning. The whole
   security design is 245 lines of SQL.
5. `platform/db/connection.py` — 66 lines, and the privilege assertion is the
   most important part of it.
6. `platform/retrieval/retrieve.py` then `plan.py` — retrieval and the
   determinism guard.
7. `platform/generation/graph.py` — the six nodes.
8. `harness/corpus/parse.py::Chunker` — both chunking strategies.
9. `harness/golden/generate.py::JUDGE_PROMPT` — see for yourself that the judge
   is blind.
10. `apps/web/app/methodology/page.tsx` + `lib/metrics.ts` — the content-as-data
    model.

---

## 21. Data map

| Data | Location | Committed | Reproducible |
|---|---|---|---|
| Raw documents | `data/corpus/raw/` (719 MB) | no | **yes** — from the manifest |
| Parsed text | `data/corpus/parsed/` (186 MB) | no | yes — `parse.py` |
| Chunks | `data/corpus/chunks/` (264 MB) | no | yes — `parse.py` |
| Embeddings | `data/corpus/embeddings/` (79 MB) | no | yes — `embed.py`, ~1.5 min |
| **Manifest** | `data/corpus/corpus_manifest.json` | **yes** | generated |
| **Golden queries** | `data/golden/queries.jsonl` | **yes** | costs money to regenerate |
| **Model judgments** | `data/golden/judgments.jsonl` | **yes** | costs money to regenerate |
| **Human verification** | `data/golden/verification.jsonl` | **yes** | **NOT reproducible** |
| Interactive datasets | `data/interactive/` (1.2 MB) | **yes** | yes — 23/23 carry provenance |
| Board runs | `content/board/` | empty | Phase 5 |

### The asymmetry that should drive backup behaviour

**The corpus is re-fetchable. The human verification judgments are not.**

Everything under `data/corpus/` can be rebuilt from a committed 688 KB manifest.
`data/golden/verification.jsonl` is a record of human judgment that exists
nowhere else — it cannot be regenerated at any price, and losing it means
re-grading from scratch. It is committed to git, which is the right call, and it
is the one file in this repository whose loss would be genuinely unrecoverable.

### Licences and attribution

| Source | Licence | Obligation |
|---|---|---|
| SEC EDGAR | US public filings | Send a real contact User-Agent |
| **CUAD** | **CC BY 4.0** | **Attribute Hendrycks et al., NeurIPS 2021, and The Atticus Project; state the licence; indicate that chunking constitutes modification** |
| RFCs | IETF Trust, BCP 78 | Freely redistributable |

Recorded per document in the manifest (`licence`) and in the `attribution` block,
and rendered on `/corpus`.

---

## 22. Testing

| Suite | File | Tests | Covers |
|---|---|---|---|
| Corpus fetch | `tests/test_corpus_fetch.py` | **26** | Rate limiter burst/ceiling, `Retry-After`, truncation, `IncompleteRead`, HTTP-200 error pages, sub-floor bodies, 403 not written, atomic writes, all three resume paths, `doc_id` collisions |
| Manifest durability | `tests/test_manifest_durability.py` | **5** | Real `SIGKILL` mid-run; manifest valid and matching disk; no `.tmp` orphan; CUAD per-document persistence |
| Sanitiser | `platform/ingestion/test_sanitise.py` | **24 cases** | 9 injections neutralised, 15 legitimate passages untouched, including 3 real corpus strings an earlier version corrupted |
| Web build guards | `apps/web/scripts/*.mjs` | — | CSP hash coverage, HTML nesting |

**All passing:** 26/26, 5/5, sanitiser PASS.

Two suites were verified to have **teeth** by reintroducing the bug they guard —
the nesting guard (4 violations caught) and the CUAD durability test (failed
with `manifest missing after the kill`).

### Not tested

- **Retrieval** — no test that RLS blocks cross-tenant results. This was
  *measured* (720 results, 0 leaked) but there is no committed test.
- **The plan guard** — verified interactively, not committed as a test.
- **Chunking** — no test that the two strategies differ, which is exactly the
  bug that occurred and was caught only by eye.
- **The query graph** — no test of resolve/verify/abstain.
- **Ingestion idempotency** — measured, not tested.
- **Migrations** — `--verify` is a runtime check, not a test.

**What to test next, in order:** cross-tenant leakage (it is the project's
central security claim); chunking strategy divergence; quote verification
against a known-altered quote; ingestion no-op.

---

## 23. Open issues and technical debt

### Blocking

1. **Human verification sample is unusable** — 32 judgments, 94% one value. Every
   retrieval metric rests on unverified labels. Re-grade required.
2. **Golden set is 12 of 200** — blocked on Gemini prepay credit (≈$2.80).
3. **No red-team suite** — Phase 3 gate cannot be met.
4. **No eval harness** — Phase 4 gate cannot be met.

### Bugs and drift

5. **Port drift** — `package.json` uses 8000; `CLAUDE.md` and
   `apps/web/README.md` say 3010.
6. **The phase table is not rendered anywhere** — `/roadmap` was replaced by
   `/learn` and `lib/phases.ts` was deleted.
7. **12 golden queries record a bare model name**, not `name@snapshot`, and
   `data/golden/run_config.json` does not exist for that run.
8. **Audit logging is a table with no writer** — `zeroth.audit_query` has 0 rows.
9. **The `demo` schema is still present** in the database — scratch from the
   interactive RLS measurement.
10. **2 files uncommitted** at time of writing.

### Performance

11. **`all_tenants` retrieval is ~1,024 ms.** *Recommendation:* raise
    `shared_buffers` from 128 MB (currently ~1 GB working set). Requires a
    compose change and restart.
12. **Lexical search seq-scans 47 partitions** for an unrestricted role.
    Partition pruning helps restricted roles only.

### Risks

13. **The planner flip is mitigated, not eliminated.** `mode=` pins it, but any
    query path that does not go through `retrieve()` is unguarded.
14. **HNSW indexes are currently unused in practice** — at 1,092 rows per
    partition the planner prefers sequential scans, so `approximate` mode forces
    an index the cost model does not want. *Recommendation:* re-examine whether
    per-tenant partitioning is the right granularity at this corpus size.
15. **The corpus misses the page target by ~3%** (24,155 vs 25,000+).
16. **`platform/` must never contain `__init__.py`** — it shadows the Python
    stdlib `platform` module and breaks torch and transformers immediately.
    Currently correct; nothing enforces it. *Recommendation:* add a test.

### Documentation

17. `apps/web/README.md` references removed routes and the wrong port.
18. No `docs/` entry explains the `demo` schema or how to drop it.

---

## 24. What should not change yet

- **Do not swap the embedding or generation model.** There is no baseline, so
  any change is unmeasurable. `bge-small` and `qwen2.5:3b` are stand-ins to be
  *measured*, not defaults to be improved.
- **Do not tune retrieval.** The golden set is 12 queries with unverified
  labels. Tuning against it would be fitting to noise, and worse, would look
  like progress.
- **Do not add infrastructure the scale does not need.** 51,310 chunks fit
  comfortably in one Postgres container. A vector database, a queue, or a
  distributed index would add operational surface for no measurable gain — and
  would forfeit RLS, which is the reason for Postgres.
- **Do not optimise latency further before correctness.** 1,024 ms is
  acceptable for a benchmark that runs offline. The quote-verification failure
  rate matters more.
- **Do not expand the corpus.** It already exceeds the chunk target. More
  documents would slow every future measurement without making any current one
  more trustworthy.
- **Do not publish any number until the golden set is verified.** This is the
  one that would be hardest to walk back.

---

## 25. Preparing for Phase 3

Phase 2 is complete. What follows.

### What Phase 3 builds

The red-team suite, in `tests/redteam/`, gated in CI:

1. **Cross-tenant retrieval** — every role against every tenant's documents.
2. **Role escalation** — forged, unset, empty and injected `zeroth.role` values.
3. **Prompt injection through document content** — the sanitiser's rules as
   adversarial tests, plus new injections it has not seen.
4. **Injection through the query** — instructions in the question itself.
5. **Citation forgery** — a generator citing chunk ids it was never shown.
6. **Abstention bypass** — pressuring the model to answer without evidence.

Target ≥ 140 cases.

### What it depends on

- The schema, RLS and partitioning — **done**.
- The retrieval path — **done**.
- The query graph — **done**.
- The golden set — **only for the abstention tests**; the access-control tests
  need none of it. **Phase 3 can start now.**

### Environment questions already settled

| Question | Answer |
|---|---|
| Embedding 51,310 chunks on 8 GB | **Done** — 1.5 min at 558 chunks/s, batch 64, fp16, 79 MB output |
| Embedder + generator co-resident | Yes — 6.87 GB free after loading bge-small |
| Postgres sizing | 51,310 chunks + HNSW + GIN live in the `pgdata` volume; no sizing problem observed |
| `shm_size` | Already `'1gb'` in `docker-compose.yml` |
| vLLM compile cache | **NOT mounted** — no vLLM service in `docker-compose.yml` at all. A 166-second cold start would be paid every run. Must be added before Phase 4 |

### What to script rather than run in-session

Anything that is pure compute with no judgment in it, following the corpus-fetch
pattern:

- Embedding (`harness/interactive/embed.py`) — already a script.
- Index builds — already inside `ensure_partition`.
- Ingestion (`platform/ingestion/ingest.py`) — already a script.
- The eventual eval sweep — **should be a script**, since nine runs × 200
  queries is hours of compute.

The red-team suite itself is **not** in this category: it is test code, and
writing it requires judgment about what constitutes an attack.

### The Phase 3 gate, concretely

The suite runs in CI and passes; a **deliberately introduced RLS bug makes it
fail**; the pass rate is published including any attacks that succeed; and the
suite passes with the explicit tenant predicate removed, proving that predicate
is an optimisation and not the security boundary.

### Known risks constraining the design

- **Finding 1** — recall under access control is a property of the role, so
  security tests must assert *leakage*, never recall.
- **Finding 2** — the plan can flip; the suite must pin `mode=`.
- **Finding 4** — a superuser or table owner bypasses RLS silently, so the suite
  must assert its own connection privileges before trusting a pass.

---

## 26. Final summary

**What has been built.** A reproducible corpus pipeline (662 documents, 51,310
chunks, 47 tenants) with a committed manifest; a partitioned PostgreSQL schema
with row-level security, forced on every table, ACL behind a `SECURITY DEFINER`
function, and a privilege-asserting connection layer; idempotent checksum-keyed
ingestion with sanitisation; hybrid in-database retrieval with RRF fusion and a
plan-determinism guard; cross-encoder reranking; a LangGraph query pipeline with
citation resolution, quote verification and abstention; a swappable provider
interface; and a nine-route static site with 26 learn topics, 9 documented
failure modes and 3 interactive demos over real measured data.

**The problem it solves, and for whom.** Public leaderboards rank models. Almost
none measure whole-pipeline quality and cost together on one corpus with
published intervals and published failure modes. The audience is engineers with
their own retrieval problem — particularly the access-control interaction, which
is genuinely under-documented.

**The architecture.** Local Docker platform; static site rendering committed
JSON; the site never queries the platform.

**What is implemented.** See the table at the top. Phases 0, 1 (partially) and 2
are real code. Phases 3–7 are not.

**The data and its licences.** SEC EDGAR (public), CUAD (**CC BY 4.0**,
attribution required), IETF RFCs (BCP 78). Corpus gitignored, manifest
committed.

**The queries and their verification.** 12 of 200 drafted by
`gemini-3.6-flash`, judged blind by `gemini-3.1-flash-lite`. **32 judgments
human-verified, and that sample is not usable** — 94% one grade. The agreement
rate is withheld with reasons recorded rather than published.

**Where chunks live.** JSONL on disk (gitignored, reproducible) *and* in
PostgreSQL — 51,310 rows across 47 partitions, each with its own HNSW and GIN
index.

**What §14 changed.** Partitioning became necessary rather than optional;
`FORCE ROW LEVEL SECURITY` and the `SECURITY DEFINER` ACL were added; HNSW
parameters were tuned from measurement; the plan guard exists at all; and the
brief's claim that RLS applies "identically" to both retrieval paths was
corrected.

**The current limitation.** The golden set is 6% drafted and its human
verification is unusable. Every metric downstream is blocked on that, and no
amount of platform work substitutes for it.

**The next phase.** Phase 3, security. It can start immediately — it depends
only on work that is done.

**How it is deployed and viewed.** Locally with `npm run dev` on port 8000.
Not yet deployed; §18 is the complete guide. Cloudflare Pages, root directory
`apps/web`, output `out`, `NODE_VERSION=20`, no secrets in the bundle.

---

*Audited and written 2026-08-25 against commit `5c9adb5`. Where the repository
could not confirm a claim, this document says so rather than guessing.*
