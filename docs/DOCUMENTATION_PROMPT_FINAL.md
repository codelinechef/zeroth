# TASK: Complete Technical Documentation of the Zeroth Project

You are acting as a **Senior AI Engineer, RAG Architect, and Technical Documentation Engineer**.

Inspect the entire repository and produce **one master document** covering what has been built, how, why those decisions were made, what exists today, what remains, and how the whole system fits together.

This documents **this specific project**. It is not a RAG tutorial.

The reader — the project owner — already knows Python, APIs, LLMs, embeddings, vector databases, RAG fundamentals, and prompt engineering. Do not spend space teaching those. Spend it on:

> **THIS PROJECT → THIS IMPLEMENTATION → THIS DATA → THESE DECISIONS → THIS EVALUATION → THE REMAINING PHASES**

The document must be good enough to explain the project to another engineer, a hiring manager, or an interviewer — and to serve as a reference when the owner returns to it in three months having forgotten the details.

---

## 0. AUDIT BEFORE WRITING

Do not start writing. First read the repository and build an internal map:

```
CLAUDE.md → docs/ (brief, findings, known-issues, deploy)
  → apps/web/ → platform/ → harness/ → data/ → tests/
  → .github/workflows/ → docker-compose.yml → git log
```

Verify every component against actual source. **If something cannot be verified from the repository, say so explicitly rather than guessing.**

---

## 1. NEVER INVENT

Never claim a technology is used because it is common in RAG systems. Every claim traces to code, config, or a committed document.

Classify every major feature as exactly one of:

| Status | Meaning |
|---|---|
| **IMPLEMENTED** | Working code exists |
| **PARTIALLY IMPLEMENTED** | Some code, feature incomplete |
| **PLANNED** | On the roadmap, no code yet |
| **INVESTIGATED** | Prototyped or measured during the §14 investigations against a synthetic corpus in a scratch schema — findings changed the design, but the code is not in the production path |
| **NOT VERIFIED** | Mentioned somewhere, cannot be confirmed |
| **NOT FOUND** | No evidence at all |

Do not blur these. Much of this project is currently **PLANNED**, and the document is only useful if that is stated plainly.

---

## 2. CURRENT STATE VS FUTURE STATE

Never write future work as though it were done.

> "We will build the retrieval platform and establish a baseline."

is a completely different statement from

> "We built the retrieval platform and established a baseline."

Use the second only where the repository proves it. Check the actual state of the platform, the security layer, and the evaluation harness rather than assuming.

---

## 3. PROJECT OVERVIEW

- **What Zeroth is** — a public benchmark of end-to-end RAG pipeline quality, plus the platform under test
- **The honest framing** — an independent open reconstruction of a production confidential-document RAG platform the owner built at an employer. That code and corpus are not public. Numbers measured here apply to this corpus only. Verify this appears in the README and `/about` and quote it as committed
- **The question it answers** — what a working retrieval pipeline costs to run at a given quality bar. Public leaderboards rank models; almost none measure whole-pipeline quality and cost together
- **Three sections**, sequenced 3 → 2 → 1 (§4)
- **Current phase and what is next**
- **Running cost** — verify the ₹0/month claim against what is actually deployed

Then a one-page architecture overview.

---

## 4. THE THREE SECTIONS

**Section 3 — The Eval Board.** The benchmark. Phases 1–5. The only section using capability most people don't have.

**Section 2 — Writing.** Posts, RSS, static search. Phase 6. Sequenced second because the board supplies material nobody else can write.

**Section 1 — Feed.** Automated AI-news digest. Phase 7, explicitly optional. Last because an auto-generated digest is commodity content; as an early section it would make the whole site read as filler.

State which routes currently render honest empty states versus real content.

---

## 5. THE PHASE MODEL

All eight phases: deliverable, gate criteria, status, and **what becomes visible on the site after each**.

Make explicit that Phases 2, 3 and 4 add nothing visible publicly — three to four weekends during which the board still says no runs have happened. Name that as a project risk rather than hiding it behind a progress bar.

---

## 6. THE CORPUS

Document the three sources, what each contributes, and why they are **not** three independent corpora — CUAD's contracts are themselves EDGAR-sourced, so it is two document shapes from one publisher plus RFCs.

Cover the fetcher as built: the shared token bucket and rate ceiling, resume with integrity verification, per-document error isolation, and the manifest as the reproducibility mechanism — corpus gitignored, manifest committed, a stranger re-fetches from it.

Report final counts against the brief's targets honestly, including where they miss.

**Document these three bugs with the general lesson, not just the fix:**

- **`slug()` truncation collision** — silently dropped 26 real contracts (amendments, multi-part agreements). Registration and extraction failed together, so the loss was invisible
- **`http.client.IncompleteRead` is an `HTTPException`, not an `OSError`** — escaped the retry loop and killed the run
- **`lxml` `id()` reuse** — element proxies are created on demand and freed, ids get recycled, unrelated elements matched. Pages over-counted 3–5×

None threw an error in normal operation. Each would have corrupted a published figure.

---

## 7. CHUNKING — DOCUMENT THIS IN FULL

This is one of the sections the owner specifically wants covered in depth.

**Both strategies, precisely as implemented:**
- Fixed-token — exact token count, overlap, tokenizer used
- Section-aware — how section boundaries are detected per source type, when it splits, what it packs

**Report the actual chunk counts for each**, and explain why they differ.

**The bug that made them briefly identical.** Section detection was enabled only for RFCs, so every CUAD contract collapsed into a single "preamble" section and section-aware chunking silently degenerated into fixed chunking. It was caught because both strategies produced identical counts — a smell noticed, not a test that fired. Document how the detection was extended.

**Provenance.** How page and section metadata survive chunking, and why that matters — a citation that can't be resolved to a page and section is not a citation.

**`pages_source`.** How real page breaks (EDGAR page-break elements, RFC form feeds) are distinguished from estimated ones, so nothing synthesised is presented as measured. Report the real-versus-estimated split.

**Engineering consequences of the choices:** retrieval precision versus recall, context quality, token cost per query, latency, and — for contracts specifically — what happens when a chunk boundary cuts through a clause.

---

## 8. TENANTS

Document the tenant model, the final distribution, and the two deviations from the brief **with reasoning**:

- **CUAD tenants are contract type, not counterparty.** 510 contracts across 463 filers is ~1.1 documents per tenant, which makes isolation testing meaningless. Contract type gives bounded, deterministic, semantically coherent groups — and semantic coherence matters because contracts of a type genuinely cluster in embedding space, which is what makes retrieval under access control behave like a real system rather than random filtering
- **Small-tenant merging.** Why `ef_search` exceeding a partition's total size makes per-partition HNSW pointless, and what the merge produced

---

## 9. STORAGE — WHERE CHUNKS GO

Another section the owner specifically asked about. **Be scrupulous about status here** — most of this is PLANNED, not built.

**Right now:** where chunks actually live today. Which files, what format, how large, what is committed versus gitignored, and what regenerates them.

**Phase 2 target:** PostgreSQL with pgvector. Document:

- **Why Postgres and not Pinecone, Chroma, or FAISS.** The reason is not performance — it is that **Row-Level Security is a Postgres feature**. It enforces access control inside the query rather than filtering results afterwards. No dedicated vector database has an equivalent. The entire security phase of this project is only possible because the vectors live in Postgres
- **The partitioned schema** — `chunk` partitioned by `tenant_id`, one HNSW index per partition, and why partitioning is *necessary* rather than merely faster (see §11)
- **HNSW over IVFFlat**, with the measured build times and sizes
- **The index parameters** — `m`, `ef_construction`, `ef_search` — and what each controls
- **The restricted `zeroth_app` role.** Superusers bypass RLS **silently** — no error, no warning, policies simply do not apply. Connecting as `postgres` would make every security test pass for the wrong reason
- **The container setup** — image, port mapping and why 5433 rather than 5432, the volume, `shm_size` and the parallel-index-build failure it prevents

---

## 10. THE GOLDEN SET — QUERIES, IN DEPTH

The owner specifically wants this covered thoroughly.

**What a golden set is and why it exists**, in two paragraphs. To measure whether retrieval works you must already know the right answer. The golden set is that answer key. Without it, every metric downstream is meaningless.

**The five categories.** For each: exact count, what it tests, why it exists, and **a real worked example from `data/golden/` — the actual question text, the graded chunks, the reference answer.** Redact nothing; these are public documents.

- **Single-chunk factual** — answer lives in one chunk. Tests basic retrieval
- **Multi-chunk synthesis** — requires combining chunks within one document. Tests whether top-k is deep enough
- **Cross-document** — requires two documents. Tests whether the retriever can span sources
- **Tenant-scoped** — the correct answer differs by role. Tests access-control behaviour
- **Unanswerable** — plausible, on-topic, genuinely absent. Tests abstention, and this is the category almost no public benchmark includes

**The grading scale.** What 0, 1, 2 and 3 mean, with an example of each drawn from the real set.

**Absolute, not role-relative.** Relevance is a property of the passage and the question alone — never of who is asking. Quote the instruction verbatim from the prompt. Explain the distinction the tenant-scoped prompt makes: the tenant determines what the *correct answer* is, not which passages count as relevant when grading. Explain why role-relative judgments would have made the benchmark unreproducible.

**How queries were generated.** The drafting model and pinned snapshot, how source chunks were sampled per category, how the prompt constrains output, and the cost.

**Every parameter that could change the result** — model snapshots, seed, candidates per query, batch size, category targets — and where they are recorded so a stranger can reproduce the set.

---

## 11. THE VERIFICATION CHAIN — EXPLAIN THIS TO A CLASSROOM

**The owner has asked for this section to be beginner-friendly. Write it as though teaching a room of students who have never built an evaluation set.** Use a worked example with real data. Do not abbreviate.

The chain has three links, and the whole benchmark's credibility rests on the third.

**Link 1 — Drafting.** A model reads chunks from the corpus and writes a question, a reference answer, and its own relevance labels for the chunks it used.

*The obvious problem:* the model wrote its own answer key. Nothing has been checked.

**Link 2 — Blind judging.** A second model independently grades candidate chunks against the published rubric.

*The critical design decision:* **the judge is never shown the drafter's labels.** Explain plainly why this matters — if the judge saw the draft grades, it would tend to agree with them, and the resulting agreement number would measure conformity rather than correctness. Blind judging means agreement carries information.

Explain how candidates were pooled for judging, and why the unanswerable queries receive no judgment calls at all (they are defined by the *absence* of a relevant chunk — there is nothing to grade, and judging them would be theatre).

Report the draft-versus-judge agreement, and — this is the part to teach — **explain why a very high number would be suspicious.** Two models agreeing 99% of the time on nuanced relevance grading suggests shared bias, not independent convergence on truth. Healthy agreement is high but not near-perfect, with disagreements concentrated one grade apart rather than scattered.

**Link 3 — Human verification.** A stratified 25% sample checked by the owner.

*Why stratified rather than random:* show the arithmetic. 50 random draws from 200 could yield as few as 1 tenant-scoped query, leaving the smallest and most important category effectively unchecked. Stratified sampling guarantees 25–27% coverage of every category. Give the exact per-category counts.

*Why a fixed seed:* the same sample every run, so the verification is reproducible rather than a lucky draw.

**Then walk one query end to end.** Take a real query from the sample and show, step by step, what the human sees and what they decide:

1. The question, its category, its tenant
2. The reference answer and the source passages it was written from
3. Each candidate chunk in turn — doc id, tenant, page, section, the model's grade, its rationale, whether it was a source passage, and the full chunk text
4. The three things the human is actually deciding — *is the question answerable from this corpus? do these chunks genuinely support the answer? is this grade right?*
5. What accept, edit and reject each mean, and when to use them
6. Where the judgment is written and how resume works

**The three agreement numbers, and which one matters.** Explain each in plain terms:

- **Exact** — human and model chose the identical grade. Strictest, and partly measures grading pedantry
- **±1** — within one grade. Forgiving of boundary judgment
- **Binary** — agreement on the **≥2 relevance boundary**. Explain that Recall@k and NDCG@10 depend only on whether a chunk clears that line, not on whether it scored 2 or 3. **This is therefore the number published on `/methodology`**, because it measures agreement on the distinction that actually affects the metrics

**Why an honest low number beats a flattering high one.** A verification pass rubber-stamped to 98% is a claim that collapses the moment someone asks how it was verified. 84% checked properly is a real number that makes every figure downstream defensible. Say this plainly — it is the single most important idea in the section.

**Current status:** state whether the human pass is complete, in progress, or not started, and report the numbers only if they exist.

---

## 12. THE §14 INVESTIGATIONS

The most technically valuable work in the repository. Give it a full section.

**Finding 1 — pgvector under RLS.** RLS is enforced correctly on HNSW index scans; zero leakage across the probe set; a forged or unset role fails closed. **But ANN post-filters:** the index returns its `ef_search` candidates by distance, the policy then discards the forbidden ones, and nothing refills them. Recall tracks how much of the corpus a role can see rather than how good retrieval is.

Report the on-topic/off-topic split rather than the aggregate, and explain why — the aggregate depends on a query mix that was chosen, not observed.

**Document the critical negative result:** on the monolithic index, raising `ef_search` 40→800 changed recall not at all. With well-separated clusters the 800 nearest neighbours all belong to the tenant owning that region. **No search parameter fixes post-filtering.** Partitioning is not an optimisation — it is the only thing that works.

Document the division of responsibility precisely: **RLS is the correctness boundary; the explicit tenant predicate is purely a pruning hint.** Recall was identical with and without it. The red-team suite must pass with the predicate removed — that is what proves it is an optimisation and not the security boundary.

**Finding 2 — the planner flip.** The same query can silently switch between exact and approximate execution depending on statistics and machine-level settings. The flip moves recall *upward*, so it never looks like a bug. Root cause: the planner's row estimate has no model of `ef_search`. Partitioning makes this finer-grained rather than safer. Document the plan guard: what it pins, how it walks the EXPLAIN JSON, what the fingerprint covers, how it fails a run.

**Finding 3 — lexical pre-filters, vector post-filters.** Full-text ranking applies the policy before ranking and loses no recall. This breaks the brief's assumption that keeping lexical search in-database makes RLS apply "identically" to both paths. It applies *correctly* to both and *identically* to neither.

**Finding 4 — two more silent RLS bypasses.** The table owner bypasses unless `FORCE ROW LEVEL SECURITY` is set, and the ACL table is readable by anyone, exposing the whole authorisation matrix.

**Finding 5 — vLLM guided decoding.** The backend is process-wide, not per-request. `auto` silently cascades with no signal in the output. Constrained decoding guarantees grammar conformance, not full schema validity — numeric bounds, string lengths and item counts are not enforced at the sampler.

---

## 13. THE PLATFORM

Status honestly — likely mostly PLANNED. Cover the intended design and what exists: idempotent checksum-keyed ingestion, incremental re-indexing, ingestion-time sanitisation, hybrid BM25 + dense retrieval fused with RRF, cross-encoder reranking, the query graph, constrained decoding, citation resolution, quote verification, abstention, and the operations layer.

Assign one of the six statuses to each.

---

## 14. SECURITY

The design and its status: RLS policies, partitioned schema, `FORCE ROW LEVEL SECURITY`, ACL behind `SECURITY DEFINER`, the restricted role, the red-team suite.

Note the requirement that the suite must **publish its failures** — a security page reporting a perfect pass rate with nothing shown is the least believable page a benchmark can carry.

---

## 15. EVALUATION

Every metric with its exact definition — retrieval family, grounding family, abstention, latency percentiles, cost per query, ingestion timing.

Cover bootstrap confidence intervals and why a point estimate from a few hundred queries is indefensible without them. Cover the one-factor-at-a-time variant design and why it makes each number attributable to a single change rather than producing a mere ranking. List every parameter that must be recorded per run because it changes measured recall.

Status of each, honestly.

---

## 16. THE WEB APPLICATION

Framework, static export, hosting, routes and their current state, the content-as-data model (git as CMS, no database), components.

Document the **design system as an engineering decision**: the specification-document direction, why it was chosen over the obvious defaults, the six-value colour set where colour always carries meaning, the three typefaces and their roles, the 72-character prose measure and its reference, the clause-block signature element.

Document the `@theme inline` bug — it does not emit custom properties, so hand-written CSS referencing those variables resolved to nothing and every monospace rule fell back to the default sans stack. The dots *looked* aligned; the glyph runs differed by 100+ pixels. The first check measured block boxes and passed it. Only measuring text ink caught it. That is a lesson about verification method, not CSS.

---

## 17. HOW TO SEE IT RUNNING — WRITE THIS FOR THE OWNER

The owner wants to look at the result. Write a section they can follow directly.

**Run it locally.** The exact command, the URL, and what to expect. Note that WSL forwards the port so it opens in a Windows browser.

**A guided tour of every route.** For each: what it shows today, what it will show after which phase, and what to look at. Include the 404.

**What to check on the design**, with specifics — the numbered clause index down the left, prose capped at 72 characters, monospace on every number, dot leaders aligning exactly (the thing that was broken and fixed), and honest empty states rather than "coming soon".

**Responsive check** — resize to ~360px, confirm the rail collapses to a drawer and nothing scrolls horizontally.

**How to inspect the data behind it** — commands to browse the corpus manifest, read a golden-set query, and confirm `content/board/` is genuinely empty rather than seeded with placeholder numbers.

**Be explicit about what does *not* exist yet.** No board rows, no runs, no live retrieval. Someone expecting a working demo should be told plainly what stage this is.

---

## 18. DEPLOYMENT — FULL STEP-BY-STEP GUIDE

The owner controls DNS for `anantsharma.co.in` and wants to deploy. Write a complete guide, not a summary. Assume they have not used Cloudflare Pages before.

**Cover, in order:**

1. **Prerequisites** — repo pushed to GitHub, build succeeding locally, which branch deploys
2. **Creating the Pages project** — connecting the GitHub repo, permissions to grant
3. **Build configuration** — exact build command, output directory, root directory, Node version, environment variables if any. **Verify these against `next.config.ts` and `package.json` rather than reciting defaults**
4. **First deploy** — what to expect, how long, where to read the build log, how to read a failure
5. **The `.pages.dev` URL** — test everything here before touching DNS
6. **Custom domain** — adding `zeroth.anantsharma.co.in` in Pages, and the CNAME target it gives back
7. **The DNS record** — registrar-agnostic instructions. Record type, host/name field (note that registrars differ on whether to enter `zeroth` or the full subdomain), value, TTL. **Include the common mistake of entering the full domain in a field that already appends it**
8. **Propagation** — realistic timing, and how to check with `dig` or `nslookup` rather than refreshing a browser
9. **HTTPS** — certificate issuance, how long, what a certificate error during that window means
10. **Verification** — a checklist confirming the domain serves, HTTPS is valid, every route resolves, and no 404s on assets
11. **Ongoing** — every push to the deploy branch rebuilds automatically. How to roll back
12. **Linking from the portfolio** — where the link goes on `anantsharma.co.in`
13. **Troubleshooting** — build succeeds locally but fails on Pages, DNS not resolving, certificate stuck pending, routes 404ing on refresh (static export path handling)

Also: whether analytics is configured, and confirm no environment secrets are exposed to the client bundle.

---

## 19. CODE-TO-ARCHITECTURE MAPPING

A table mapping every architectural component to its real file, function or class, responsibility, and status. Use `—` where nothing exists rather than inventing a plausible path. Verify every path.

---

## 20. HOW TO READ THIS CODEBASE

The most efficient order to inspect the code, with real paths, adapted to what exists today rather than the eventual architecture.

---

## 21. DATA MAP

Where source documents live, what is committed versus gitignored and why, what is generated, what is reproducible from the manifest, and what is irreplaceable.

Be explicit that the corpus is re-fetchable but the human verification judgments are not, and that this asymmetry should drive backup behaviour.

Licence and attribution obligations per source.

---

## 22. TESTING

What is tested, what those tests actually cover, what is not. Gaps and what to test next. Do not manufacture coverage.

---

## 23. OPEN ISSUES AND TECHNICAL DEBT

Bugs, technical debt, missing evaluation, missing tests, architecture risks, performance risks, security risks, scalability risks, documentation gaps.

**Only issues supported by the repository.** Anything that is your recommendation must be labelled as such.

---

## 24. WHAT SHOULD NOT CHANGE YET

Given current maturity, what would be premature to change and why. Consider: swapping models before a baseline exists; tuning retrieval before the golden set is verified; adding infrastructure the scale does not need; optimising latency before correctness; expanding the corpus before measuring the current one.

---

## 25. PREPARING FOR PHASE 2

The owner wants to know what happens next and what to have ready.

**What Phase 2 builds** — the platform, component by component, in the order it should be built.

**What it depends on** — which Phase 1 outputs feed it, and what must be true before starting.

**The environment questions to settle first:**
- Embedding 51,310 chunks on an 8GB card — batch sizes, expected duration, whether the embedder and generator can be co-resident during ingestion
- Postgres sizing for that chunk count plus HNSW indexes — expected disk, and whether the current volume config suffices
- The `shm_size` requirement for parallel index builds
- Whether the vLLM compile cache is mounted, given a 166-second cold start would otherwise be paid on every run

**What to script rather than run in-session.** Embedding 51,310 chunks and building indexes is pure compute with no judgment in it — it should be a script the owner runs, the same pattern as the corpus fetch. State which Phase 2 steps follow that rule.

**The Phase 2 gate**, restated concretely: what must be demonstrable before Phase 3 begins.

**Known risks**, and which §14 findings constrain the design.

---

## 26. FINAL SUMMARY

Answer directly:

- What exactly has been built so far?
- What problem does it solve, and for whom?
- What is the architecture?
- What is implemented, and what code implements it?
- What data is being used, under what licences?
- What queries is the benchmark using, and how were they verified?
- Where do chunks live now, and where will they live?
- What did the §14 investigations change?
- What is the current limitation?
- What is the next phase, and what does it require?
- How is the site deployed and viewed?

---

## QUALITY CONTROL

Before output, verify:

- Every technology named exists in the repository
- Every file path exists
- Every implementation claim traces to code
- Planned features are not presented as implemented
- The `INVESTIGATED` versus `IMPLEMENTED` line is drawn correctly
- Golden set status is accurate, including whether human verification is complete
- Corpus and chunk counts match the manifest
- Model names include their pinned snapshots
- Deployment settings match `next.config.ts` and `package.json`, not defaults
- No secrets appear anywhere
- The reconstruction framing is present and quoted accurately

---

## WRITING STYLE

Senior engineer documenting a real system for another senior engineer. Technical, precise, direct.

**Two exceptions** where the owner has asked for teaching-level clarity — §11 (the verification chain) and §18 (deployment). Write those for someone encountering the material for the first time: worked examples, real data, every step spelled out, no assumed knowledge.

Everywhere else, do not spend pages on fundamentals the reader already has.

---

## OUTPUT

**One master document** at `docs/PROJECT.md`, committed.

The governing principle, in this order and not reversed:

> **Document what was actually built first. Explain the engineering reasoning second. Explain what should be built next third.**

If anything cannot be verified from the repository, say so explicitly. A document with honest gaps is useful. A document with confident fabrications is worse than none.
