# TASK: Complete Technical Documentation of the Zeroth Project

You are acting as a **Senior AI Engineer, RAG Architect, and Technical Documentation Engineer**.

Inspect the entire repository and produce **one comprehensive project document** covering what has been built, how, why those decisions were made, what is implemented today, what remains, and how the whole system fits together.

This documents **this specific project**. It is not a RAG tutorial.

The reader — the project owner — already knows Python, APIs, LLMs, embeddings, vector databases, RAG fundamentals, prompt engineering, and ML/NLP basics. **Do not spend space teaching those.** Spend it on:

> **THIS PROJECT → THIS IMPLEMENTATION → THIS ARCHITECTURE → THIS CODE → THIS DATA → THESE DECISIONS → THIS EVALUATION → THE REMAINING PHASES**

The document must be good enough to explain the project to another engineer, a hiring manager, an architect, or an interviewer — and to serve as a long-term reference when the owner returns to it in three months.

---

## 0. BEFORE YOU WRITE — AUDIT FIRST

Do not start writing. First build an internal map by reading the repository:

```
Repository → CLAUDE.md → the build brief in docs/
  → apps/web (site) → platform/ (RAG system) → harness/ (corpus + eval)
  → data/ → tests/ → docs/investigations/ → .github/workflows/
  → docker-compose.yml → git log
```

Verify every component against actual source. **If something cannot be verified from the repository, say so explicitly rather than guessing.**

---

## 1. THE CARDINAL RULE — NEVER INVENT

Never claim a technology is used because it is common in RAG systems. Every claim must trace to code, config, or a committed document.

**Classify every major feature as exactly one of:**

| Status | Meaning |
|---|---|
| **IMPLEMENTED** | Working code exists in the repository |
| **PARTIALLY IMPLEMENTED** | Some code exists, feature incomplete |
| **PLANNED** | On the roadmap, no code yet |
| **INVESTIGATED** | Prototyped or measured during the §14 investigations, not yet in the production path |
| **NOT VERIFIED** | Mentioned somewhere, cannot be confirmed from the repository |
| **NOT FOUND** | No evidence at all |

Do not blur these. In particular, a great deal of this project is currently **PLANNED**, and the document is only useful if that is stated plainly.

**Note on the `INVESTIGATED` category:** work in `docs/investigations/` was measured against a synthetic corpus in a scratch schema, not the production one. Its findings changed the design, but the code is not in the pipeline. Classify accordingly.

---

## 2. CURRENT STATE VS FUTURE STATE

This is the most important distinction in the document. Never write future work as though it were done.

> "We will build a golden set and establish a retrieval baseline."

is a completely different statement from

> "We built a golden set and established a baseline."

Use the second only where the repository proves it. This applies especially to the golden set, the evaluation harness, the RAG platform, and the security layer — check each one's actual state rather than assuming.

---

## 3. PROJECT OVERVIEW

Open with a concise overview covering:

- **What Zeroth is** — a public benchmark of end-to-end RAG pipeline quality, plus the platform under test
- **The honest framing** — this is an independent open reconstruction of a production confidential-document RAG platform the owner built at an employer. That code and corpus are not public. This is a from-scratch rebuild of the same architecture over public documents. Numbers measured here apply to this corpus only and cannot stand in for numbers measured elsewhere. Verify this framing appears in the README and `/about`, and quote it as committed
- **The question it answers** — what a working retrieval pipeline costs to run at a given quality bar. Public leaderboards rank models; almost none measure whole-pipeline quality and cost together
- **Three sections of the site**, and why they are sequenced 3 → 2 → 1 (§4 below)
- **Current phase and what is next**
- **Running cost** — verify the ₹0/month claim holds against what is actually deployed and configured

Then a one-page architecture overview.

---

## 4. THE THREE SECTIONS — DOCUMENT ALL THREE

The site has three sections, built in a deliberate order. Document each with its current status, what it will contain, and why it sits where it does in the sequence.

**Section 3 — The Eval Board.** The benchmark. The reason the site exists, and the only section using capability the owner has that most people do not. Spans Phases 1–5. Currently mid-Phase 1.

**Section 2 — Writing.** Technical posts, RSS, static search. Phase 6. Sequenced second because the board supplies material nobody else can write — the post-filtering finding, the planner-flip discovery, why a `slug()` collision silently dropped 26 contracts.

**Section 1 — Feed.** An automated AI-news digest. Phase 7, and explicitly optional. Sequenced last because an auto-generated digest is commodity content; on a site with two strong sections it is a fine addition, but as an early section it makes the whole thing read as filler. The ingestion pipeline is already specified in a separate newsletter brief; Phase 7 changes one node — write markdown and open a PR instead of sending email.

State clearly which routes currently render honest empty states versus real content.

---

## 5. THE PHASE MODEL

Map all eight phases: what each delivers, its gate criteria, its status, and — importantly — **what becomes visible on the site after it**.

Make explicit that Phases 2, 3 and 4 add nothing visible to the public site. Three to four weekends of work during which the board still says no runs have happened. That is a real risk to the project and the document should name it rather than hide it behind a progress bar.

---

## 6. BUSINESS AND USE-CASE CONTEXT

Explain the actual problem, separating **known project requirements** (from the brief and code) from **recommended practice** (your own engineering opinion). Do not blur them, and do not invent client requirements.

Cover: why keyword search alone is insufficient over filings and contracts; why grounding and citation resolution matter when answers carry legal or financial weight; why hallucination is unusually costly here; why document-level metadata and tenant provenance matter; and why evaluation has to be systematic rather than anecdotal.

---

## 7. ARCHITECTURE

Produce the actual architecture, not an idealised one. Distinguish clearly between:

- **Local** — the platform, Postgres, model serving, the harness. Runs on the owner's machine
- **Public** — the static site. Renders committed JSON and never queries the platform

Then diagrams (Mermaid where it helps) for: corpus acquisition, parsing and chunking, indexing, query flow, evaluation, and the golden-set flow.

**Mark clearly which parts of each diagram are implemented and which are planned.** A diagram that shows the full design without status markers is misleading.

---

## 8. CORPUS ACQUISITION

Document the fetcher as built. Reference real paths and functions.

Cover: the three sources and what each contributes; why the corpus is **not** three independent corpora (CUAD's contracts are themselves EDGAR-sourced, so it is two document shapes from one publisher plus RFCs); the shared token bucket and its rate ceiling; resume and integrity verification; per-document error isolation; and the manifest as the reproducibility mechanism — the corpus itself is gitignored, the manifest is committed, and a stranger re-fetches from it.

**Document these three bugs found during this work, with the general lesson rather than just the fix:**

- **`slug()` truncation collision** — silently dropped 26 real contracts (amendments, multi-part agreements — exactly the documents worth having). Registration and extraction failed together, so the loss was invisible
- **`http.client.IncompleteRead` is an `HTTPException`, not an `OSError`** — it escaped the retry loop and killed the whole run. The per-document handler also caught too narrow a set, so any OS-level write error was fatal
- **`lxml` `id()` reuse** — element proxies are created on demand and freed, so ids get recycled and unrelated elements matched. Pages were over-counted 3–5× (535 recorded against 162 actual)

None of these threw an error in normal operation. Each would have corrupted a published figure. That is the point worth making.

---

## 9. PARSING, CHUNKING, TENANTS

Document what the pipeline actually does — page and section provenance extraction, both chunking strategies, and how `pages_source` distinguishes real page breaks from estimated ones so nothing synthesised is presented as measured.

Document the tenant model and the two deviations from the brief, **with reasoning, not just the fact**:

- **CUAD tenants are contract type, not counterparty.** 510 contracts across 463 distinct filers is ~1.1 documents per tenant, which makes isolation testing meaningless. Contract type gives bounded, deterministic, semantically coherent groups — and semantic coherence matters because contracts of a type genuinely cluster in embedding space, which is what makes retrieval under access control behave like a real system rather than random filtering
- **Tenant count and merging.** Record the final distribution and why small tenants were merged — `ef_search` exceeding a partition's total size makes per-partition HNSW pointless

Report final counts against the brief's targets honestly, including where they miss.

---

## 10. THE §14 INVESTIGATIONS — DOCUMENT THESE PROPERLY

This is the most technically valuable work in the repository and it changed the design. Give it a full section.

**Finding 1 — pgvector under Row-Level Security.** RLS is enforced correctly on HNSW index scans; zero leakage across the probe set; a forged or unset role fails closed. **But ANN post-filters:** the index returns its `ef_search` candidates by distance, the policy then discards the forbidden ones, and nothing refills them. Recall therefore tracks how much of the corpus a role can see rather than how good retrieval is.

Document the on-topic/off-topic split rather than the aggregate, and say why — the aggregate depends on a query mix that was chosen, not observed.

Document the critical negative result: **on the monolithic index, raising `ef_search` 40→800 changed recall not at all.** With well-separated clusters the 800 nearest neighbours all belong to the tenant owning that region. No search parameter fixes post-filtering. Partitioning is not an optimisation here — it is the only thing that works.

Document the mitigation and the precise division of responsibility: **RLS is the correctness boundary; the explicit tenant predicate is purely a pruning hint.** Recall was identical with and without it. The red-team suite must pass with the predicate removed — that is what proves it is an optimisation and not the security boundary.

**Finding 2 — the planner flip.** The same query can silently switch between exact (Seq Scan) and approximate (HNSW) execution depending on table statistics and machine-level settings such as `random_page_cost`. The flip moves recall *upward*, so it never looks like a bug — a run just scores higher on one machine than another. Root cause: the planner's row estimate has no model of `ef_search`. Partitioning makes this finer-grained rather than safer, since each partition is costed independently and one query can mix exact and approximate scans across tenants.

Document the plan guard built in response: what it pins, how it walks the EXPLAIN JSON, what the fingerprint covers, and how it fails a run on mismatch.

**Finding 3 — the lexical path pre-filters while the vector path post-filters.** Full-text ranking applies the policy before ranking, so it loses no recall. This breaks the brief's assumption that keeping lexical search in-database makes RLS apply to both paths "identically". It applies *correctly* to both and *identically* to neither.

**Finding 4 — two silent RLS bypasses beyond the superuser one.** The table owner also bypasses unless `FORCE ROW LEVEL SECURITY` is set, and the ACL table the policy depends on is readable by anyone, exposing the whole authorisation matrix.

**Finding 5 — vLLM guided decoding.** The backend is process-wide, not per-request. `auto` silently cascades between backends with no signal in the output. And constrained decoding guarantees grammar conformance, not full schema validity — numeric bounds, string lengths and item counts are not enforced at the sampler, so semantic assertions belong in a validation pass alongside citation resolution.

---

## 11. THE GOLDEN SET — BE PRECISE ABOUT STATUS

Check the repository and state the actual status. Do not describe this as done unless `data/golden/` contains a committed, verified set.

Document: the five query categories and their intended counts; that relevance judgments are **absolute, not role-relative**, and why that decision was made; the grading scale; how the drafting works and which model; and the human verification design — a stratified 25% sample across all five categories, not random draws.

**The agreement rate is a published number.** Explain why the honest version of it is worth more than a high one, and why the whole benchmark's credibility rests on it.

---

## 12. THE PLATFORM

Document current status honestly — most or all of this is likely **PLANNED**. Cover the intended design and what already exists: idempotent checksum-keyed ingestion, incremental re-indexing, ingestion-time sanitisation, hybrid BM25 + dense retrieval fused with RRF, cross-encoder reranking, the LangGraph query graph, constrained decoding with the JSON output contract, citation resolution against the index, quote verification against source chunks, abstention when evidence is insufficient, and the Django operations layer.

For each, state which of the six statuses applies.

---

## 13. SECURITY

Document the design and its status. Cover the RLS policies, the partitioned schema, `FORCE ROW LEVEL SECURITY`, the ACL table behind `SECURITY DEFINER`, the restricted `zeroth_app` role, and the red-team suite.

Be explicit that **connecting as `postgres` silently disables every policy** — no error, no warning — and that this is why the restricted role exists. Note the requirement that the red-team suite must publish its failures, because a security section reporting a perfect pass rate with nothing shown is the least believable page a benchmark can carry.

---

## 14. EVALUATION

Document every metric and its exact definition — the retrieval family, the grounding family, abstention, latency percentiles, cost per query, and ingestion timing.

Cover the bootstrap confidence intervals and why a point estimate from a few hundred queries is indefensible without them. Cover the one-factor-at-a-time variant design and why it makes each number attributable to a single change rather than producing a mere ranking. Cover which parameters must be recorded per run because they change measured recall.

State the status of each honestly.

---

## 15. THE WEB APPLICATION

Document the site: framework, static export, hosting, routes and their current state, the content-as-data model (git as CMS, no database), and the components.

Document the **design system** as a deliberate engineering decision, not decoration: the specification-document direction, why it was chosen over the two obvious defaults, the six-value colour set where colour always carries meaning, the three typefaces and their roles, the 72-character prose measure and its reference, and the clause-block signature element.

Document the `@theme inline` bug — it does not emit custom properties, so hand-written CSS referencing those variables resolved to nothing and every monospace rule fell back to the default sans stack. The dots *looked* aligned; the glyph runs differed by 100+ pixels. The first check measured block boxes and passed it. Only measuring the actual text ink caught it. That is a lesson about verification method, not about CSS.

---

## 16. CODE-TO-ARCHITECTURE MAPPING

A table mapping every architectural component to its real file, function or class, responsibility, and status. Use `—` where nothing exists yet rather than inventing a plausible path.

| Component | File | Function/Class | Responsibility | Status |
|---|---|---|---|---|

This is one of the highest-value sections. Verify every path exists.

---

## 17. HOW TO READ THIS CODEBASE

Written for the owner. The most efficient order to inspect the code, with real paths at every step, adapted to what actually exists today rather than the eventual architecture.

---

## 18. DATA AND DOCUMENT MAP

Where source documents live, what is committed versus gitignored and why, what is generated, what is reproducible from the manifest, and what is irreplaceable.

Be explicit that the corpus is re-fetchable but the golden set's human judgments are not, and that this asymmetry should drive backup behaviour.

Note licence and attribution obligations per source.

---

## 19. TESTING

What is tested now, what those tests actually cover, and what is not tested. Identify gaps and what should be tested next. Do not manufacture coverage.

---

## 20. OPEN ISSUES AND TECHNICAL DEBT

Categorise into bugs, technical debt, missing evaluation, missing tests, architecture risks, performance risks, security risks, scalability risks, and documentation gaps.

**Only list issues supported by the repository.** Anything that is your recommendation rather than an observed defect must be labelled as such.

---

## 21. WHAT SHOULD NOT CHANGE YET

Given the current maturity, identify what would be premature to change and explain why. Consider: swapping models before a baseline exists; tuning retrieval parameters before the golden set is verified; adding infrastructure the scale does not need; optimising latency before correctness; and expanding the corpus before the current one is fully measured.

---

## 22. ENGINEERING PRIORITIES

P0 must-do, P1 should-do, P2 nice-to-have, P3 future production work — prioritised against the project's actual state, not a generic maturity model.

---

## 23. ROADMAP

A concrete roadmap from here to the board going live and beyond. For each step: objective, output, success criteria, key files, dependencies, and what becomes visible publicly.

---

## 24. FINAL SUMMARY

Answer these directly:

- What exactly has been built so far?
- What problem does it solve, and for whom?
- What is the architecture?
- What is implemented, and what code implements it?
- What data is being used, and under what licences?
- What did the §14 investigations change about the design?
- What is the current limitation?
- What is the next phase?
- What is the golden set and what is its status?
- How will the system be evaluated?
- What would production hardening require?

---

## QUALITY CONTROL — BEFORE YOU OUTPUT

Verify every one of these:

- Every technology named exists in the repository
- Every file path exists
- Every implementation claim traces to code
- Planned features are not presented as implemented
- The `INVESTIGATED` versus `IMPLEMENTED` line is drawn correctly for the §14 work
- Golden set status is accurate
- Evaluation status is accurate
- Corpus counts match the manifest
- Model names and versions are accurate
- Retrieval parameters are accurate
- No secrets appear anywhere
- No unsupported assumption is stated as fact
- The reconstruction framing is present and quoted accurately

---

## WRITING STYLE

Write as a senior engineer documenting a real system for another senior engineer. Technical, precise, practical, direct.

Not an AI textbook. Not a beginner tutorial. Not marketing. Not a superficial README.

Explain project-specific concepts clearly where they need it. Do not spend pages on fundamentals the reader already has.

---

## OUTPUT

**One master document**, written to `docs/PROJECT.md` and committed.

The governing principle, in this order and not reversed:

> **Document what was actually built first. Explain the engineering reasoning second. Explain what should be built next third.**

If anything cannot be verified from the repository, say so explicitly rather than guessing. A document with honest gaps is useful. A document with confident fabrications is worse than none.
