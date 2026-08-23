# ZEROTH — Build Specification v2

**Hand this whole document to Claude Cowork as the opening brief.**

Owner: Anant Sharma — AI engineer, Python/FastAPI/LangGraph background, comfortable in TypeScript, stronger in Python. Assume competence; do not explain fundamentals.

**What changed from v1:** the scope is no longer a standalone benchmark. It is a full open reconstruction of a production confidential-document RAG platform the owner built at work and cannot take with him, rebuilt on public documents — plus a public evaluation board that measures it.

---

## 0. How to use this brief

Read the whole document before writing code. Build strictly in phase order and stop at each gate to report status. Do not jump ahead to produce something demoable sooner; Phase 2 is the asset that gives every later phase meaning.

Where this brief is wrong or stale (a library renamed, an API changed, a model that will not fit in VRAM), say so and propose a fix rather than silently substituting.

---

## 0.5 Verified environment — read before writing any code

The owner's machine is already set up and every layer below was tested and confirmed working. Do not re-derive these; do not "verify the environment" as a first task. Build on them.

**Machine:** HP Omen an0015TX — RTX 5060 Laptop (8GB, Blackwell, sm_120), 24GB RAM, Windows with WSL2.
**Distro:** dedicated WSL instance named `zeroth`, Ubuntu 24.04.4, on the D: drive. Isolated from all other work.
**Project root:** `~/projects/zeroth` — inside the Linux filesystem, never `/mnt/c` (10× slower for small-file IO).

| Component | Verified state |
|---|---|
| CUDA toolkit | 12.8.93, `CUDA_HOME=/usr/local/cuda-12.8` |
| Driver | 610.88, CUDA UMD ceiling 13.3 |
| PyTorch | 2.11.0+cu128 — `capability (12, 0)`, real GPU matmul confirmed |
| Python | 3.11.16 in a `uv` venv at `.venv` |
| Docker | Engine 29.7.2 + Compose v5.5.0, own daemon (Docker Desktop integration disabled) |
| GPU in containers | `nvidia-container-toolkit` 1.19.0 registered, verified |
| Postgres | 16 + pgvector 0.8.6, container `zeroth-db`, **host port 5433** |
| Ollama | running under systemd, **port 11435**, `OLLAMA_KEEP_ALIVE=5m`, CUDA compute 12.0 |
| vLLM | 0.27.1 via `vllm/vllm-openai:latest`, **port 8001**, working |
| Node | 20.20.2 (nvm) |
| Usable VRAM | **8.55 GB total, 7.29 GB free at idle** |

### Five findings that change how you build

**1. vLLM needs two WSL2-specific flags.** Without them it fails at `RuntimeError: UVA is not available` during `GPUModelRunnerV2` init — WSL2 disables pinned memory by default, and UVA buffers require it. Every vLLM invocation must include:
```
--ipc=host
-e VLLM_WSL2_ENABLE_PIN_MEMORY=1
```
Put this in `docker-compose.yml` and in `docs/known-issues.md`. It is not optional and it is not obvious from the error.

**2. Model co-residency is confirmed — do not design model swapping.** Generator, `bge-small-en-v1.5` and `bge-reranker-base` were all loaded simultaneously with **6.03 GB free of 8.55 GB**. The embedder and reranker together cost roughly 500MB. Build the pipeline with all three resident, as specified.

**3. vLLM at `--gpu-memory-utilization 0.70` is over-provisioned.** Measured: 2.23 GiB weights, 0.56 GiB peak activation, 0.39 GiB CUDA graphs, 2.23 GiB KV cache (65,056 tokens, 15.88× max concurrency) — 2.77 GiB actual against a 5.57 GiB budget. vLLM itself suggested `--kv-cache-memory=1819675341`. Tune down to ~0.50 in Phase 4 and document the chosen value with its measured KV capacity.

**4. Mount the vLLM compile cache.** Cold start is **166 seconds**, almost entirely `torch.compile` and CUDA graph capture. It writes to `/root/.cache/vllm` inside the container, which `--rm` discards — nine benchmark runs would pay 25 minutes of pure recompilation. Mount it as a named volume.

**5. Database connections use `zeroth_app`, never `postgres`.** The role exists with `NOSUPERUSER NOBYPASSRLS`, verified `rolsuper=f, rolbypassrls=f`. Postgres superusers **bypass Row-Level Security silently** — no error, no warning, policies simply do not apply. If any connection string in this project uses `postgres`, every Phase 3 security test passes for the wrong reason and the published security results are meaningless. Connection string:
```
postgresql://zeroth_app:local_dev_only@localhost:5433/zeroth
```

Ollama is installed and working as a fallback generator behind the provider interface. vLLM is the primary; Ollama exists so a vLLM regression never blocks the pipeline.

---

## 1. What this project is, stated honestly

The owner built and owned a production RAG platform over a confidential corpus at his employer. That code and corpus belong to the employer and cannot leave. This project is an **independent reconstruction** of the same architecture, built from scratch on public documents, so the design can be inspected, discussed, and improved in the open.

This framing must appear in the repository README and on the site's `/about` page, in words close to these:

> Zeroth is an open reconstruction of a production confidential-document RAG platform. The original was built for an employer over a private corpus and is not public. This is a from-scratch rebuild of the same architecture over public documents. Every number published here was measured on the public corpus described in the methodology, and applies only to it.

**This matters technically, not just ethically.** Retrieval metrics are properties of a corpus-and-query-set pair, not of an architecture. Numbers measured here cannot validate, reproduce, or stand in for numbers measured on a different corpus, and the site must never imply otherwise. Publish what this system scores on this corpus. Nothing else.

---

## 2. What is being reconstructed

The original system's architecture, feature by feature. All of it is in scope.

**Ingestion**
- Idempotent, checksum-keyed pipeline — re-ingesting an unchanged document is a no-op
- Incremental re-indexing — only changed documents are reprocessed
- Document sanitisation against injected instructions at ingestion time
- Page-level and section-level provenance preserved through chunking

**Retrieval**
- Hybrid: BM25 lexical search fused with dense vector search over pgvector
- Reciprocal Rank Fusion for merging the two ranked lists
- Cross-encoder reranking over the fused candidate set

**Generation and grounding**
- Schema-constrained JSON output contract with constrained decoding
- Every citation resolved against the index — a citation that does not resolve fails the response
- Quoted passages verified against the source chunk text
- Abstention when retrieved evidence is insufficient

**Security**
- Role-based authorisation enforced *inside the retrieval query itself* using PostgreSQL Row-Level Security, not filtered after the fact
- Tenant partitioning so cross-tenant leakage is structurally impossible, not merely unlikely
- Automated access-control and red-team suite gated in CI

**Serving**
- Self-hosted embedding, reranking, and generation via vLLM
- Swappable provider interfaces so hosted APIs and local models are interchangeable

**Operations**
- Django + SQL service layer: workflow automation, scheduled data-quality checks, alerting, audit logging

**Evaluation**
- Golden datasets and a full metric suite (§8)

---

## 3. Non-negotiable constraints

1. **₹0 running cost.** The platform runs locally in Docker on the owner's machine. Only the *site* is publicly hosted, and it is fully static. Postgres, vLLM, and the harness never touch a paid cloud.
2. **Every published number is reproducible.** Corpus manifest, query set, judgments, configs, and code all public. A stranger clones and re-runs.
3. **No fabricated data anywhere** — not in dev, not in a placeholder, not in a screenshot. Empty states say the run has not happened. One invented number ends the project's credibility permanently.
4. **Metrics are labelled with their corpus.** Every figure on the site carries the corpus version it was measured on.
5. **Limitations are stated by the author, not discovered by critics.** `/methodology` names every known weakness.
6. **No accounts, auth, comments, or tracking cookies on the public site.**
7. **Quality floor, unannounced:** responsive to 360px, visible keyboard focus, `prefers-reduced-motion` respected, Lighthouse accessibility ≥ 95.

---

## 4. Corpus

Public documents, chosen to match the original's shape: long, messy, cross-referencing, and naturally partitioned into tenants.

**Primary — SEC EDGAR 10-K filings.** Free and unrestricted. Long (100–200 pages), structurally messy, heavy with cross-references and tables. Critically, they **partition naturally by filing company**, which maps directly onto the tenant/matter isolation the original enforced. Pull ~300 filings across ~40 companies.

**Secondary — CUAD (Contract Understanding Atticus Dataset).** 500+ real commercial contracts, CC BY 4.0, already annotated with clause spans, which provides free ground truth for a subset of queries.

**CUAD is not an independent source, and the site must not claim it is.** CUAD's contracts are themselves drawn from EDGAR. What it adds is a second *document shape* — exhibit-attached contract prose, dense with defined terms and cross-references — against the 10-K narrative shape. That is a real and useful contrast, but it comes from the same publisher. `/methodology` states this plainly: two document shapes from one publisher, plus RFCs as the genuinely independent third source.

**Deduplication against the 10-K set is mandatory, not best-effort.** A contract can appear both standalone in CUAD and as an exhibit to a filing, with different formatting, so checksums will not catch it. Method in §4.1.

**Tertiary — RFCs.** ~30 documents from the HTTP and TLS families. Freely redistributable, densely cross-referencing, and a clean hard-mode subset. These are the only genuinely independent source in the corpus — different publisher, different register, different document conventions.

Target scale: **~800 documents, 25,000+ pages, 35,000+ chunks.** Comparable in order of magnitude to the original, which matters because retrieval behaviour changes with corpus size.

**Tenants.** Assign every document to one of ~40 synthetic tenants derived from its source (filing company, contract counterparty, RFC working group). Define 6 roles with overlapping but non-identical access. This is what makes the RLS and leakage tests meaningful rather than theatrical.

---

## 4.1 Corpus acquisition

Endpoints, limits and licence terms below were verified live on 2026-08-22 (`docs/investigations/FINDINGS.md`, Findings 2 and 3). Re-verify before Phase 1 if significant time has passed.

### Shared fetch policy

All three sources go through one fetcher with:

- **A single shared token bucket at 10 requests/second**, applied across *all* sources, not per source. SEC's limit is per IP and covers `sec.gov` and `data.sec.gov` together.
- **The real contact User-Agent from `.env` (`EDGAR_USER_AGENT`) on every request.** Note that SEC only rejects an *absent* header — a bare `Mozilla/5.0` is served normally. Sending the contact is a policy obligation, not a technical gate, and blocks are applied after the fact.
- **`Retry-After` honoured**, with exponential backoff on 429 and 5xx.
- **Everything cached to `data/corpus/raw/`** (gitignored). Re-running ingestion must not re-fetch.

### EDGAR — ~300 10-K filings across ~40 companies

1. Fetch `https://www.sec.gov/files/company_tickers.json` once (~796 KB).
2. Resolve ~40 CIKs **across varied sectors** — the tenant partition is only interesting if the documents differ.
3. One `https://data.sec.gov/submissions/CIK##########.json` per company (CIK zero-padded to 10 digits).
4. Filter `form == "10-K"`.
5. Fetch **only `primaryDocument`** from `https://www.sec.gov/Archives/edgar/data/<cik>/<accession-no-dashes>/<primaryDocument>`.

About 340 requests, roughly a minute at the rate ceiling.

**Do not use the 53 MB quarterly `form.idx` files.** They are worth it only for corpus-wide sweeps, which this is not.

**Fetch only the primary document.** A filing directory holds ~90 files — XBRL, schemas, and separate `*exhibit*.htm` files. Exhibit-attached contracts are separate documents, not part of the primary 10-K, so restricting to `primaryDocument` structurally removes the main CUAD overlap path before dedup runs at all.

### CUAD

- **Zenodo record 4595826** — `https://zenodo.org/record/4595826`. **Not 4599830**, which is the fine-tuned *models*.
- **Licence: CC BY 4.0.** Redistribution alongside the benchmark is permitted, including derived forms, with attribution and an indication of changes.
- Attribution on `/corpus` and in `data/corpus/`: **Hendrycks et al., CUAD, NeurIPS 2021**, and **The Atticus Project**; licence stated as CC BY 4.0; and a note that **chunking and re-indexing constitute modification**.

### RFCs

~30 documents from the HTTP and TLS families from `rfc-editor.org`. Freely redistributable.

### Deduplication — containment, not similarity

The obvious approach fails. Checksums miss reformatting, and **Jaccard similarity is the wrong metric**: an exhibit contract embedded in a 10-K is a *subset* of it, so two documents that overlap completely still score low Jaccard because the 10-K is far larger.

Use **containment**:

```
containment(A, B) = |shingles(A) ∩ shingles(B)| / |shingles(A)|      A = smaller doc
```

Pipeline, cheapest stage first:

1. **Provenance match.** CUAD metadata references its EDGAR origin. Where a CUAD document resolves to an accession number already in the 10-K set, that is an exact match and costs nothing.
2. **Normalised checksum.** Case-fold, strip punctuation, collapse whitespace, then SHA-256. Catches pure reformatting.
3. **Containment over shingles.** 5-word shingles hashed to 64-bit integers. Build one inverted index `hash → {doc_id}` over the 10-K set, then stream each CUAD document's shingles through it and count matches per 10-K. That is linear in total CUAD shingles rather than the 500 × 300 pairwise comparison, and at this scale runs in memory.
4. **Threshold: containment ≥ 0.8 ⇒ duplicate.** Drop the CUAD copy, keep the filing, and record the decision.

Every dropped document is recorded in the manifest with the reason and the matched counterpart. Publish the duplicate count on `/corpus` — it is a property of the corpus, not an embarrassment.

### `data/corpus/corpus_manifest.json` — committed

Raw documents are gitignored; the manifest is what makes the corpus reproducible without redistributing gigabytes. One record per document:

| Field | Meaning |
|---|---|
| `doc_id` | Stable internal id |
| `source` | `edgar` \| `cuad` \| `rfc` |
| `identifier` | Accession number, CUAD document id, or RFC number |
| `url` | Exact retrieval URL |
| `checksum` | SHA-256 of the raw bytes as fetched |
| `normalised_checksum` | SHA-256 after the stage-2 normalisation |
| `pages` | Page count after parsing |
| `tenant` | Assigned tenant |
| `fetched_at` | ISO 8601 |
| `licence` | Licence identifier for the source |
| `dedup` | `null`, or `{ "dropped_for": "<doc_id>", "containment": 0.94, "stage": 3 }` |

A stranger reconstructs the corpus by replaying `url` and verifying `checksum`.

---

## 5. Architecture

```
                    ┌─────────────────────────────────┐
                    │  PUBLIC (static, free hosting)  │
                    │  zeroth.anantsharma.co.in       │
                    │  board · methodology · corpus   │
                    └────────────▲────────────────────┘
                                 │ results JSON, committed via PR
┌────────────────────────────────┴────────────────────────────────┐
│  LOCAL (Docker, owner's machine)                                │
│                                                                 │
│  ┌───────────┐   ┌──────────────┐   ┌────────────┐              │
│  │ Ingestion │──▶│  PostgreSQL  │◀──│  Django    │              │
│  │ pipeline  │   │  + pgvector  │   │  ops layer │              │
│  │ checksum  │   │  + RLS       │   │  audit log │              │
│  │ sanitise  │   └──────┬───────┘   └────────────┘              │
│  └───────────┘          │                                       │
│                         ▼                                       │
│  ┌──────────────────────────────────────────┐                   │
│  │ Retrieval:  BM25 ─┐                      │                   │
│  │             dense ─┴─▶ RRF ─▶ rerank     │                   │
│  └──────────────────────┬───────────────────┘                   │
│                         ▼                                       │
│  ┌──────────────────────────────────────────┐                   │
│  │ Generation: constrained JSON decoding    │                   │
│  │ → citation resolution → quote verify     │                   │
│  │ → abstain if evidence insufficient       │                   │
│  └──────────────────────┬───────────────────┘                   │
│                         ▼                                       │
│  ┌──────────────────────────────────────────┐                   │
│  │ Eval harness → metrics → results JSON    │                   │
│  └──────────────────────────────────────────┘                   │
│                                                                 │
│  Model serving: vLLM behind swappable provider interfaces       │
└─────────────────────────────────────────────────────────────────┘
```

The public site never queries the platform. It renders committed JSON. This is what keeps hosting free and the attack surface zero.

---

## 6. Tech stack

| Layer | Choice | Notes |
|---|---|---|
| Platform language | Python 3.11 | |
| API | FastAPI + Pydantic | Retrieval and query surface |
| Ops layer | Django + Django ORM | Workflow automation, audit log, scheduled checks |
| Database | PostgreSQL 16 + pgvector, Docker | RLS is the reason Postgres is non-negotiable |
| Lexical search | Postgres full-text search, or `rank_bm25` | Prefer in-database so RLS applies to both retrieval paths identically |
| Embeddings | `bge-small-en-v1.5` local; one hosted model as comparison | |
| Reranking | `bge-reranker-base` cross-encoder | |
| Generation | vLLM serving a quantised 3B–8B model | See §14 — 8GB VRAM is tight |
| Constrained decoding | vLLM guided decoding (Outlines/XGrammar backend) | Enforces the JSON contract at the sampler, not with a retry loop |
| Orchestration | LangGraph | Query graph: retrieve → rerank → generate → verify → abstain |
| Tracing | LangSmith, or OpenTelemetry to a local collector | |
| Eval harness | Custom Python, no eval framework | The scoring logic is the credibility. It must be readable and auditable |
| Red team | `pytest` suite | |
| Site | Next.js App Router, `output: 'export'`, TypeScript, Tailwind | Fully static |
| Table | TanStack Table (headless) | |
| Charts | Hand-rolled SVG | No chart library — its defaults would break the typographic direction |
| Hosting | Cloudflare Pages | Free, unlimited bandwidth |
| CI | GitHub Actions | Site build + red-team suite. Eval runs are local, results committed via PR |

---

## 7. Design system

**Direction: the site is a published specification that happens to be interactive.** Not a terminal, not a dashboard, not a SaaS landing page. The claim is rigour, and the design must transmit rigour before a number is read.

Explicitly avoid: dark background with a bright acid accent, cream paper with high-contrast serif and terracotta, and dashboard card grids with sparklines. None of these are this subject.

The owner's portfolio uses a terminal/HUD aesthetic with boot sequences. Zeroth is a **calmer sibling** — shared severity and monospace DNA, none of the theatrics.

**Colour** — six values; colour always carries meaning, never decoration:

| Token | Hex | Use |
|---|---|---|
| `--paper` | `#EDEFF2` | Background — cool grey-blue, printed stock |
| `--ink` | `#14161A` | Text, table values |
| `--ink-muted` | `#5C636E` | Labels, captions |
| `--rule` | `#C8CDD4` | Hairlines, borders, dot leaders |
| `--signal` | `#1E4FD8` | Links, positive delta, focus ring |
| `--regress` | `#A33A2A` | Negative delta |

`--signal` and `--regress` appear only on deltas, links, and focus. Never as a fill.

**Type** — three families, three roles:
- **Archivo** — headings and eyebrows. Tracking `-0.02em`, weights 600/700. Uppercase eyebrows at `0.08em`. No oversized hero type.
- **IBM Plex Mono** — all numbers, table cells, clause blocks, navigation. Carries the personality.
- **Source Serif 4** — methodology and prose. Standards and papers are read in serif.

Scale (rem): `0.75 · 0.875 · 1 · 1.25 · 1.5 · 2 · 2.75`. Nothing outside it. **Prose measure capped at 72 characters** — the width RFCs are published at, applied literally.

**Layout.** Left rail is a persistent numbered clause index, mirroring a specification's table of contents; collapses to a top drawer below 900px. **The hero is the table** — one thesis sentence, a rule, then results. No splash, no big stat with a gradient.

**Signature element.** Expanding a run renders it as a normative clause:

```
4.3.  Hybrid Retrieval with Cross-Encoder Reranking

   The retriever fuses BM25 and dense results using RRF (k=60).
   The reranker is bge-reranker-base over the top 50 candidates.
   All other parameters are inherited from the baseline (4.1).

   Recall@10 ............ 0.912    +0.084
   NDCG@10 .............. 0.874    +0.061
   Faithfulness ......... 0.961    +0.012
   Citation accuracy .... 0.943    +0.007
   Abstention (correct) . 0.880    -0.020
   p95 latency .......... 1.84 s   +0.31 s
   Cost per query ....... $0.0031  +$0.0009

   Corpus edgar-v1 · 120 queries · commit 8f3a1c2 · 2026-09-14
```

Dot leaders are real characters in a monospace grid, not a CSS border trick. Alignment must be exact at every breakpoint.

**Motion.** One moment only: on first paint, table rows reveal top-to-bottom in a 40ms stagger, as if being typeset. Under 500ms total. Disabled under `prefers-reduced-motion`. No scroll-jacking, no parallax, no counting-up numbers.

**Copy voice.** Plain, declarative, specific. Describe what was measured; never sell. Empty state: "No runs yet. The first will publish once the baseline completes." Errors state what happened and what to do; they do not apologise. Never use: leverage, unlock, seamless, revolutionise, cutting-edge.

---

## 8. Metric definitions

Implement each explicitly. No eval framework.

| Metric | Definition |
|---|---|
| `Recall@5`, `Recall@10` | Proportion of queries where ≥1 chunk graded ≥2 appears in top k |
| `MRR@10` | Mean reciprocal rank of the first relevant chunk |
| `NDCG@10` | Discounted cumulative gain over graded relevance, normalised against ideal ranking |
| `Context precision` | Proportion of retrieved chunks that are actually relevant |
| `Faithfulness` | Proportion of generated claims entailed by retrieved chunks; LLM judge against a published rubric |
| `Answer correctness` | Agreement with the reference answer; LLM judge, published rubric |
| `Answer relevance` | Whether the answer addresses the question asked |
| `Citation accuracy` | Proportion of citations resolving to a chunk that supports the cited claim. String containment first; LLM judge only on containment failure |
| `Citation coverage` | Proportion of factual claims carrying a citation |
| `Abstention (correct)` | Proportion of unanswerable queries correctly declined |
| `p50 / p95 / p99 latency` | End to end, retrieval through verification, 3 repeats |
| `Cost per query` | Token counts × rates from `configs/pricing.yaml`. Local models cost $0.00, stated openly, never hidden |
| `Ingestion time` | Full and incremental, wall clock |

**Headline metrics are measured as `all_tenants`.** Relevance judgments in the golden set are **absolute, not role-relative**: a chunk's grade is a property of the chunk and the query, not of who is asking. The nine benchmark clauses therefore run unrestricted, so that a variant's number reflects the retrieval change under test and nothing else.

**Row-Level Security impact is reported as its own section, never mixed into headline numbers.** Access control changes what retrieval can see, which changes recall — but folding that into a headline figure would conflate a security property with a retrieval property and make the one-factor-at-a-time claim false. The security section reports recall per role against the same query set, alongside the `all_tenants` baseline. See §9 Phase 3.

**Every quality metric carries a bootstrapped 95% confidence interval** — 1,000 resamples over the query set. A point estimate from a few hundred queries without an interval is the first thing a reviewer will attack.

---

## 9. Phase plan

### Phase 0 — Shell (1 weekend)
Next.js app, design tokens, `ClauseIndex` / `ResultsTable` / `ClauseBlock` / `DotLeader` components, all routes with honest empty states, `/writing` and `/feed` as stubs with no fake content, Cloudflare Pages deploy, CNAME for `zeroth.anantsharma.co.in`.

**Gate:** URL resolves over HTTPS, Lighthouse a11y ≥ 95, holds at 360px, dot leaders align exactly.

### Phase 1 — Corpus and golden set (2–3 weekends)
Fetch and parse the three sources. Assign tenants and roles. Implement two chunking strategies (fixed-token with 15% overlap; section-aware) behind one interface, preserving page and section provenance.

Query set — **200 queries**, larger than v1 because the metric suite is larger:
- 60 single-chunk factual
- 60 multi-chunk synthesis within one document
- 30 cross-document
- 20 tenant-scoped — correct answer differs by role
- 30 unanswerable — plausible, on-topic, genuinely absent

Judgments: graded relevance 0–3 plus reference answers with supporting chunk IDs. **Grades are absolute** — assigned against the corpus as a whole, never relative to a role's visibility. The 20 tenant-scoped queries still have one absolute answer key; what varies by role is how much of that key is reachable, and that is measured in the security section, not baked into the judgments. Draft with a strong model; `golden/verify.py` presents a stratified 25% sample for human verification and records the agreement rate.

**Publish the agreement rate on `/methodology`.** State plainly that the set is model-drafted and partially human-verified. Do not imply hand-labelling.

**Gate:** `data/golden/` committed and browsable at `/corpus`; agreement rate published; construction and limitations documented.

### Phase 2 — The platform (3–4 weekends)
The core reconstruction.

- **Postgres + pgvector schema, `chunk` LIST-partitioned by `tenant_id`.** Not a flat table with a tenant column. A monolithic HNSW index post-filters RLS results and silently loses candidates — measured at recall 0.025 for a single-tenant role, with 177 of 280 probes returning nothing at all. Raising `ef_search` from 40 to 800 changes that number not at all, because with well-separated tenant clusters the entire candidate neighbourhood belongs to one tenant. Partitioning is the fix, not tuning.
- **`ALTER TABLE ... FORCE ROW LEVEL SECURITY` on every RLS table.** `relforcerowsecurity` defaults to false and the *table owner* bypasses RLS silently — a second bypass path beyond the superuser rule in §0.5. Migrations and ops queries run as the owner.
- **The ACL table behind a `SECURITY DEFINER` function.** If a policy reads `tenant_acl` directly, every role that can query `chunk` can also enumerate the entire authorisation matrix. Expose only "what may *I* see", never the whole table.
- **Per-partition HNSW at `m = 32, ef_construction = 200`**, with `hnsw.ef_search = 200` at query time. Measured on 36,000 × 384 across 40 partitions: recall 0.998 against exact search under the same policy, versus 0.836 at the pgvector defaults (`m=16, ef_construction=64, ef_search=40`). Build 15.3 s, ~26 ms/query warm. The defaults are not adequate at 900 vectors per partition.
- **`ANALYZE` every partition immediately after ingest, in the same transaction as the index build.** A partition without statistics is planned as a sequential scan — exact rather than approximate — which silently changes retrieval semantics for that tenant. See the plan guard in Phase 4.
- **Pass the permitted tenant list as an explicit predicate in addition to RLS.** RLS is the correctness boundary; the predicate is a performance hint that enables partition pruning, worth 5.3× (26 ms vs 140 ms per query, scanning 8 partitions instead of 40). Recall is identical with and without it — the predicate must never be load-bearing for correctness.
- Idempotent checksum-keyed ingestion; incremental re-index verified by timing a single-document change
- Ingestion-time sanitisation stripping instruction-like content from documents
- Hybrid retrieval: in-database lexical + dense, fused by RRF
- Cross-encoder reranking
- LangGraph query graph: retrieve → rerank → generate → resolve citations → verify quotes → abstain
- vLLM serving behind a provider interface, with a hosted-API implementation of the same interface
- Constrained decoding enforcing the JSON output contract at the sampler
- Django ops layer: audit log, scheduled data-quality checks, alerting

**Gate:** a query returns a schema-valid answer with citations that resolve to real chunks and quotes verified against source text; re-ingesting an unchanged corpus is a measured no-op; and the plan guard (Phase 4) passes on every partition.

### Phase 3 — Security (1–2 weekends)
- PostgreSQL Row-Level Security policies enforcing role access **inside the retrieval query**, applying identically to lexical and vector paths
- Red-team suite in `pytest`, gated in CI, covering: cross-tenant retrieval attempts, role escalation, prompt injection via document content, injection via query, citation forgery, and abstention bypass
- Target ≥ 140 test cases, matching the original's coverage in kind
- **The explicit-tenant-predicate removal test.** Delete the predicate, leaving only RLS, and the entire suite must still pass. This is what proves the predicate is a pruning optimisation and not the security boundary. If any test depends on it, the boundary is in the wrong place.
- **The RLS impact section.** Not a pass/fail test — a measurement, published separately from headline numbers per §8. For each of the 6 roles, recall against the same absolute judgments, reported beside the `all_tenants` baseline. This is where access-control cost is stated honestly.

**On what to expect there.** Recall under RLS is dominated by whether the query's topic falls inside the role's visible tenants, not by how restrictive the role is. Measured on synthetic data of the same shape: on-topic queries hold 0.95–1.00 regardless of role; off-topic queries — where the best-matching documents belong to tenants the role cannot see — are where recall falls. That distinction must survive into the published section, because a single blended number is uninterpretable.

**Gate:** the suite runs in CI and passes; a deliberately introduced RLS bug makes it fail; the suite still passes with the explicit tenant predicate removed. Report the pass rate honestly — if some attacks succeed, publish that, because a security section with a 100% pass rate and no failures shown is the least believable thing you could publish.

### Phase 4 — Eval harness and baseline (1–2 weekends)
Every metric in §8. Bootstrap CIs. Embedding cache keyed by `(chunk_checksum, model_id)`.

#### The plan guard — a determinism requirement, not a nicety

**The same query can silently switch between approximate and exact retrieval depending on table statistics and machine-level planner settings.** Both triggers were reproduced:

| Trigger | Result |
|---|---|
| Partition ingested, `ANALYZE` not yet run | `Seq Scan` — exact, not HNSW |
| `random_page_cost = 20` (a machine-level setting) | `Seq Scan` — exact, not HNSW |

Partitioning does **not** eliminate this. It makes it finer-grained: because each partition is costed independently, a single query can mix exact and approximate scans across tenants.

The flip is silent and it flips *toward* better recall, so it never looks like a bug — a run simply scores higher on one machine than another for reasons unrelated to the configuration under test. The planner's row estimate for an HNSW scan is fiction (`rows=18000` observed against a scan bounded by `ef_search`), because the cost model has no concept of `ef_search`. That directly attacks §3.2: a stranger clones, re-runs, and gets different numbers.

Required, all four:

1. **Pin the planner state.** A fixed GUC bundle applied on every retrieval connection: `hnsw.ef_search`, `hnsw.iterative_scan`, `random_page_cost`, and `enable_seqscan = off` for the retrieval query. Pinned per session, never left to inherit from the server or the machine.
2. **Assert the executed plan shape.** Before running a query set, `EXPLAIN (FORMAT JSON)` the retrieval query and walk the plan tree: **every leaf scan over a `chunk` partition must be an `Index Scan` on an HNSW index.** Anything else means the run is not measuring what it claims.
3. **Fail the run on mismatch.** Not a warning. A run whose plan shape does not match is discarded, because its numbers are not comparable to any other run.
4. **Record the plan in the results JSON.** An md5 fingerprint over the ordered `(node type, index name)` pairs, plus the GUC bundle, so two runs can be compared for planner equivalence without re-running either.

A working prototype of the guard is in `docs/investigations/`; it returns a fingerprint under a healthy configuration and raises on both induced flips above.

Baseline config (clause 4.1): fixed-512 chunking · `bge-small-en-v1.5` · dense only · no reranker · top-k 10 · local vLLM generator.

**Gate:** baseline produces a valid results JSON with a recorded plan fingerprint; the plan guard fails a deliberately de-`ANALYZE`d partition; and the owner has hand-checked ten per-query results and agrees the scoring is correct.

### Phase 5 — Variants and publish (1–2 weekends)
Eight variants, each changing **exactly one factor** from baseline: hybrid RRF · cross-encoder reranker · section-aware chunking · 1024-token chunks · alternative local embedding model · hosted embedding model · hosted generator · top-k 20.

One-factor-at-a-time is deliberate: it makes every number attributable to a single change. State this on `/methodology`.

Ship the UI: sortable table, expandable clause blocks, `/runs/[id]` detail pages with per-query drill-down and raw JSON download, a security page reporting red-team results, and a "reproduce this run" block with the exact command.

**Gate:** board live with nine real runs, every number traceable to committed data, and a stranger can reproduce clause 4.1 from the README alone.

### Phase 6 — Writing section (1 weekend) — DO NOT START BEFORE PHASE 5 SHIPS

The site's second section. Deliberately sequenced after the board, because the board supplies the material to write about — methodology decisions, what the reranker actually bought, why abstention is the metric nobody publishes.

- MDX rendering pipeline reading `content/writing/*.mdx`
- `/writing` index and `/writing/[slug]` post routes, same design system
- RSS feed generated at build
- Pagefind static search index
- Reading time, publish dates, and a link from each post to any run it discusses

**Gate:** three posts published, RSS validates, search returns results.

### Phase 7 — Feed section (1 weekend) — DO NOT START BEFORE PHASE 6 HAS FIVE POSTS

The site's third section: an automated AI-news digest. Gated behind Phase 6 having real content because a site whose visible activity is auto-generated summaries reads as filler, and because each of these sections is a recurring obligation — prove the writing habit before adding a second one.

The ingestion pipeline is already specified in the owner's separate newsletter brief and is reused wholesale. **One change: instead of creating an email draft, the final node writes markdown to `content/feed/` and opens a pull request.**

- Ingest: RSS + arXiv API + HN Algolia, parallel fetch, per-feed timeout and retry
- Dedupe: canonical URL hash, then title-embedding cosine > 0.85
- Score: LLM rubric on decision-relevance (does this contain a number an engineer would act on), × feed weight, rank, take top N
- Draft: template plus few-shot voice samples
- **Human gate: opens a PR. Merging publishes. There is no auto-publish path.**
- GitHub Actions cron, twice weekly

**Gate:** a scheduled run produces a PR containing a publishable digest with every claim traceable to a fetched source.

**Total: 9–14 weekends for Phases 0–5, plus 2 more for Phases 6–7.** Roughly three times v1. That is the honest cost of reconstructing the whole platform rather than a benchmark alone.

---

## 10. Data contract

`content/board/<run-id>.json`, validated by both the harness and the site.

**Rule: anything that changes measured recall belongs in this file.** A run whose numbers cannot be tied to the exact retrieval conditions that produced them is not reproducible, whatever else is committed. That includes the role the run executed as, the ANN search parameters, and the decoding backend — none of which are visible in the code alone, because all three are runtime settings.

```json
{
  "run_id": "2026-09-14-hybrid-rerank",
  "clause": "4.3",
  "label": "Hybrid Retrieval with Cross-Encoder Reranking",
  "baseline": false,
  "baseline_ref": "4.1",
  "run_date": "2026-09-14",
  "commit": "8f3a1c2",
  "corpus": {
    "id": "edgar-cuad-rfc-v1",
    "documents": 812,
    "pages": 25430,
    "chunks": 36104,
    "tenants": 40
  },
  "queries": { "total": 200, "answerable": 170, "unanswerable": 30 },
  "config": {
    "chunking": "fixed-512",
    "embedding_model": "BAAI/bge-small-en-v1.5",
    "retrieval": "hybrid-rrf",
    "rrf_k": 60,
    "reranker": "BAAI/bge-reranker-base",
    "rerank_depth": 50,
    "top_k": 10,
    "generator": "Qwen2.5-3B-Instruct-AWQ",
    "generator_host": "local-vllm",
    "role": "all_tenants",
    "hnsw_m": 32,
    "hnsw_ef_construction": 200,
    "ef_search": 200,
    "iterative_scan": "off",
    "structured_outputs_backend": "xgrammar"
  },
  "plan": {
    "fingerprint": "04b50506e8f2c2fc44b732b864ad524f",
    "leaf_scan": "Index Scan/hnsw",
    "partitions_scanned": 40,
    "gucs": {
      "enable_seqscan": "off",
      "random_page_cost": 1.1,
      "hnsw.ef_search": 200,
      "hnsw.iterative_scan": "off"
    }
  },
  "metrics": {
    "recall_at_10":       { "value": 0.912, "ci95": [0.884, 0.937] },
    "ndcg_at_10":         { "value": 0.874, "ci95": [0.841, 0.902] },
    "faithfulness":       { "value": 0.961, "ci95": [0.938, 0.978] },
    "citation_accuracy":  { "value": 0.943, "ci95": [0.917, 0.964] },
    "abstention_correct": { "value": 0.880, "ci95": [0.735, 0.955] },
    "latency_p95_s":      { "value": 1.84 },
    "cost_per_query_usd": { "value": 0.0031 }
  },
  "security": { "tests": 142, "passed": 142, "failures": [] },
  "per_query": "runs/2026-09-14-hybrid-rerank/per_query.json",
  "notes": "Single-factor change from 4.1: reranker added."
}
```

**Field notes.**

- **`role`** — the database role the run executed as. Headline clauses are `all_tenants` (§8). A run at any other role is an RLS-impact measurement and belongs in the security section, not the board.
- **`ef_search`, `hnsw_m`, `hnsw_ef_construction`** — measured recall moves from 0.836 to 0.998 across the plausible range of these, which is larger than the effect of most variants under test. Omitting them would make the board's single-factor claim untrue.
- **`iterative_scan`** — changes both which rows are reachable and latency. `off` for partitioned runs; `relaxed_order` is the mitigation for any configuration still scanning a shared index.
- **`structured_outputs_backend`** — pinned explicitly, never `auto`. `auto` silently cascades xgrammar → guidance → outlines on schema features xgrammar cannot compile, so two runs could use different decoders with no signal in the output.
- **`plan`** — the Phase 4 plan guard's output. `fingerprint` is an md5 over the ordered `(node type, index name)` pairs from `EXPLAIN (FORMAT JSON)`. Two runs with different fingerprints are not comparable, whatever their configs say.

---

## 11. Repository structure

```
zeroth/
├── apps/web/                       # Next.js static site
│   ├── app/                        # /, /methodology, /corpus, /runs/[id],
│   │                               # /security, /about, /writing, /feed
│   ├── components/                 # ClauseIndex, ResultsTable, ClauseBlock, DotLeader
│   └── lib/content.ts
├── content/board/                  # results JSON, one per run
├── platform/
│   ├── api/                        # FastAPI query surface
│   ├── ops/                        # Django: audit log, scheduled checks, alerting
│   ├── ingestion/                  # fetch, parse, sanitise, chunk, checksum, index
│   ├── retrieval/                  # lexical, dense, rrf, rerank
│   ├── generation/                 # graph, constrained decoding, citation resolve, verify, abstain
│   ├── providers/                  # swappable model interfaces: vllm, openai, anthropic
│   └── db/                         # schema, RLS policies, migrations
├── harness/
│   ├── golden/                     # generate, verify, schema
│   ├── eval/                       # runners, scorers, bootstrap
│   └── configs/                    # one YAML per run config
├── tests/redteam/                  # the security suite
├── data/{corpus,golden}/           # committed
├── docker-compose.yml              # postgres+pgvector, vllm
└── .github/workflows/              # web.yml, redteam.yml
```

---

## 12. Out of scope

No accounts, auth, comments, public API, dark mode, newsletter signup, third-party config submission, hosted live demo, or the Writing and Feed sections beyond route stubs.

---

## 13. Definition of done

- [ ] `zeroth.anantsharma.co.in` serves the board with nine real runs
- [ ] Corpus manifest, query set, judgments, configs, platform, and harness all public
- [ ] A clean clone reproduces clause 4.1 from the README alone
- [ ] README and `/about` carry the reconstruction statement from §1 verbatim in substance
- [ ] Every metric displays a confidence interval and its corpus id
- [ ] Red-team suite runs in CI; results published including any failures
- [ ] RLS verified by a deliberately introduced bug failing the suite
- [ ] No fabricated or placeholder number anywhere in the repo or the build
- [ ] Lighthouse a11y ≥ 95; holds at 360px; reduced motion respected
- [ ] Running cost ₹0/month

---

## 14. First thing to do

The environment is already verified (§0.5) — do not re-test CUDA, PyTorch, Docker, Postgres, Ollama or vLLM. Those are settled, and re-deriving them wastes a session.

Four things remain genuinely unknown. Check and report before writing code:

1. **pgvector index strategy at scale.** HNSW vs IVFFlat for ~36,000 chunks at 384 dimensions — recommend one, with build time and recall trade-offs. Critically: **confirm Row-Level Security applies cleanly to vector index scans**, not only to sequential scans. If a policy is bypassed or the planner skips the index under RLS, the whole security design needs rethinking and it must surface now, not in Phase 3.
2. **SEC EDGAR bulk access** — current endpoints for 10-K retrieval, rate limits, and the exact User-Agent format required. The owner's contact string is already in `.env` as `EDGAR_USER_AGENT`.
3. **CUAD** — current download location and licence terms for redistribution alongside the benchmark.
4. **vLLM guided decoding** — which backends v0.27.1 supports and how strictly JSON schema is enforced at the sampler. The grounding contract in §2 depends on enforcement during generation, not a retry loop afterwards.

Do not check per-token pricing for hosted models yet — that belongs in Phase 5, when clauses 4.7 and 4.8 are actually run.

If any assumption in this brief proves materially wrong, stop and report before proceeding.
