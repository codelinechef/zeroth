# ZEROTH — NTH LABS WEBSITE SHOWCASE / CASE-STUDY SPECIFICATION

## Purpose

This document is the content contract for turning the enhanced Zeroth implementation into a technically credible project page on the Nth Labs website.

The page should communicate:

> Zeroth investigates and solves a subtle failure mode in multi-tenant RAG: authorization can silently reduce approximate retrieval completeness even when the security boundary is working correctly.

The website must be compelling to engineers, technical founders, AI/ML leaders, and security-minded buyers without overstating the evidence.

---

# 1. POSITIONING

## Project name

Zeroth

## Category

Secure Retrieval / RAG Infrastructure / Permission-Aware Vector Search

## One-line positioning

Use the strongest verified wording from the completed benchmark. Default:

> A permission-aware retrieval architecture for secure, multi-tenant RAG.

Do not call Zeroth “patented”, “novel”, “first”, “state-of-the-art”, or similar unless independently verified and approved.

---

# 2. WEBSITE INFORMATION ARCHITECTURE

Recommended page:

```text
01. Hero
02. The Problem
03. Why Conventional RAG Breaks
04. Zeroth Architecture
05. Before vs After
06. How Permission-Aware Retrieval Works
07. Benchmark Results
08. Security Boundary
09. Red-Team Validation
10. Engineering Trade-offs
11. Limitations
12. Technical Stack
13. Research / Engineering Notes
14. CTA / Repository
```

---

# 3. HERO SECTION

The hero should not lead with “another RAG system”.

Lead with the measured problem.

Suggested structure:

```text
SECURE RETRIEVAL FOR MULTI-TENANT RAG

Authorization can protect your data
and still silently destroy your retrieval quality.

Zeroth is an experimental retrieval architecture that moves
authorization into retrieval-space selection instead of relying
on global ANN search followed by post-filtering.

[Explore Architecture]
[View Benchmarks]
```

Replace all claims with actual verified results after the final benchmark.

---

# 4. HERO METRIC CARDS

Generate 3–5 cards from actual results.

Potential fields:

```text
47
TENANTS

51,310
CHUNKS

662
DOCUMENTS

246
RED-TEAM CASES

X%
RECALL IMPROVEMENT
```

Only display a metric if verified by the current implementation/report.

Do not repeat metrics merely for visual density.

---

# 5. THE PROBLEM SECTION

Explain the failure in plain language first.

Core story:

```text
A user asks a question.

The ANN index finds the nearest candidates globally.

Authorization removes candidates the user cannot access.

The discarded candidates are not automatically replaced.

The user therefore receives fewer useful candidates,
even though:

- the documents exist
- the user is authorized to read them
- the database security policy is working
- no data is leaked
```

Emphasize:

> The failure mode is not unauthorized access. It is silent under-retrieval.

---

# 6. BEFORE / AFTER DIAGRAM

## Before

```text
Query
  ↓
Global HNSW
  ↓
Top-N candidates
  ↓
RLS / authorization filtering
  ↓
Candidate loss
  ↓
Under-retrieval
```

## After

```text
Query
  ↓
Resolve authorization scope
  ↓
Permission-aware retrieval plan
  ↓
Authorized index / partition selection
  ↓
BM25 + Dense retrieval
  ↓
RRF
  ↓
Cross-encoder
  ↓
Generation + citation verification
```

The exact enhanced architecture must come from the final implementation.

---

# 7. ANIMATION / INTERACTION IDEA

Use a simple interactive visualization:

### “Watch the candidate slots disappear”

Start with:

```text
10 ANN candidate slots
```

Color/identify several candidates as inaccessible.

Then show:

```text
10 retrieved
7 unauthorized
3 remain
```

Then show permission-aware routing:

```text
10 retrieved
10 authorized
```

This is illustrative, not a benchmark.

Label it clearly:

> Conceptual visualization

Do not present the animation as measured data.

---

# 8. ARCHITECTURE SECTION

Create an interactive architecture diagram with:

```text
CLIENT
  ↓
API / AUTHENTICATION
  ↓
AUTHORIZATION CONTEXT
  ↓
RETRIEVAL PLANNER
  ├── index routing
  ├── tenant scope
  └── candidate budget
  ↓
┌───────────────┬───────────────┐
│ BM25          │ Dense ANN     │
└───────┬───────┴───────┬───────┘
        ↓               ↓
             RRF
              ↓
       Cross-Encoder
              ↓
       Context Builder
              ↓
             LLM
              ↓
   Citation / Quote Verification
              ↓
           Response
```

Below the diagram, show:

```text
PostgreSQL
├── Documents
├── Chunks
├── Embeddings
├── Tenant metadata
├── Authorization metadata
└── Row-Level Security
```

---

# 9. SECURITY SECTION

Headline:

> Security is enforced at the database boundary.

Explain:

- PostgreSQL RLS is authoritative.
- The application may provide a tenant predicate for performance.
- Removing that application predicate must not expose unauthorized rows.
- The querying role is intentionally configured so it cannot bypass RLS.
- Retrieval output, citations, caching, and generation all inherit the same security model.

Use only verified current implementation details.

---

# 10. RED-TEAM SECTION

Show the actual test count and test categories.

Current verified baseline includes:

- 246 red-team cases
- cross-tenant reads
- forged roles
- prompt injection
- citation forgery
- abstention bypass
- 15 tests that remove the application-level tenant predicate
- mutation testing of policy failures

After enhancement, update this list based on actual test inventory.

Suggested visual:

```text
246
SECURITY TESTS

15
DATABASE-BOUNDARY TESTS

9
CONFIGURATION CHECKS ADDED AFTER MUTATION TESTING
```

Never imply these numbers are newly generated if they are inherited baseline results.

---

# 11. BENCHMARK SECTION

## Baseline benchmark

Display a table:

| Authorized tenants | Recall@10 vs exact | Empty queries |
|---|---:|---:|
| 47 / 47 | 0.850 | 0 / 12 |
| 35 / 47 | 0.842 | 0 / 12 |
| 12 / 47 | 0.667 | 2 / 12 |
| 3 / 47 | 0.500 | 5 / 12 |
| 1 / 47 | 0.300 | 6 / 12 |

This is baseline data and must be retained unless the benchmark is explicitly superseded.

Add a note:

> Recall here means recall@K against exact search under the identical authorization policy. It is not human relevance evaluation.

---

# 12. HNSW SWEEP

Display:

```text
ef_search    recall@10
40           0.300
100          0.608
200          0.650
400          0.658
800          0.667
```

Then the interpretation:

> Increasing search width recovers part of the lost retrieval completeness, but the improvement plateaus while search work increases.

Do not claim a universal HNSW law. This is an observed result for the tested corpus/configuration.

---

# 13. ENHANCED BENCHMARK

After Claude Code completes implementation, replace placeholder sections with actual strategy comparison.

Required table:

| Strategy | Recall@10 | Empty-result rate | p50 | p95 | Search work | Index/storage cost |
|---|---:|---:|---:|---:|---:|---:|
| A. Global + post-filter | … | … | … | … | … | … |
| B. Partitioned | … | … | … | … | … | … |
| C. Permission-aware routing | … | … | … | … | … | … |
| D. Hybrid | … | … | … | … | … | … |

Do not select a winner until data exists.

The website should explain the trade-off, not merely display the largest recall.

---

# 14. KEY GRAPH SET

Generate these from machine-readable benchmark files:

### Graph 1
Recall vs authorized tenant scope

### Graph 2
Empty-result rate vs authorized tenant scope

### Graph 3
Recall vs ef_search

### Graph 4
Latency vs ef_search

### Graph 5
Strategy comparison

### Graph 6
Recall / latency Pareto frontier

### Graph 7
Authorization discard ratio

Every graph should include:

- dataset/corpus version
- query set version
- strategy
- key configuration
- a short caveat where needed

---

# 15. “WHAT WE GOT WRONG” SECTION

This is strategically important for credibility.

Tell the story of the synthetic corpus experiment:

- synthetic tenant clusters were nearly perfectly separated
- inter-tenant cosine similarity was 0.014
- widening the search did not improve recall
- the behavior did not reproduce on the real-document corpus
- the explanation was embedding-space overlap in real documents
- the synthetic result represented a pathological/worst-case structure rather than a typical real-document topology

Do not hide this.

It demonstrates actual experimentation rather than marketing.

---

# 16. LIMITATIONS SECTION

Mandatory.

Display:

```text
12 evaluation queries

HNSW graph construction is non-deterministic

Results depend on corpus, tenant assignment,
embedding configuration and index configuration

Human relevance metrics are not published if the
relevance-judgment dataset remains incomplete

The benchmark measures approximate-search loss
against exact authorized search, not answer quality
```

The wording should update automatically when implementation status changes.

---

# 17. TECHNICAL STACK SECTION

Only list technologies actually used.

Current known stack includes:

```text
PostgreSQL
PostgreSQL Row-Level Security
HNSW / approximate vector search
BM25
Dense retrieval
Reciprocal Rank Fusion
Cross-encoder reranking
Schema-constrained generation
Citation resolution
Quote verification
```

Add exact libraries/models/versions only after inspecting the repository.

---

# 18. TECHNICAL DEEP-DIVE SECTION

For advanced visitors, provide expandable sections:

### Why post-filtering loses candidates
### How HNSW candidate selection interacts with authorization
### Why widening `ef_search` has a ceiling
### Why partitioning changes the economics
### Why application filtering is not a security boundary
### How permission-aware index routing works
### How the benchmark avoids confounding variables
### How the red-team suite verifies RLS

---

# 19. ENGINEERING TRADE-OFF MATRIX

Show:

| Approach | Security | Recall under narrow scope | Latency | Operational cost | Complexity |
|---|---|---|---|---|---|
| Global + post-filter | High if RLS correct | Weak | Low baseline | Low | Low |
| Partitioned | High | Strong | Potentially strong | Higher | Medium |
| Permission-aware routing | High if designed correctly | Measure | Measure | Measure | Higher |
| Hybrid | High if designed correctly | Measure | Measure | Higher | High |

Do not fill measured cells with assumptions.

---

# 20. RESEARCH-STYLE “WHY IT MATTERS”

The project page should make one strategic argument:

> In enterprise RAG, security correctness and retrieval correctness are not independent.

Traditional security testing asks:

> “Can the user see something they should not?”

Zeroth additionally asks:

> “Can the user retrieve everything they are authorized to see?”

That is the conceptual center of the case study.

---

# 21. CTA

Potential CTA:

```text
Explore the architecture
View benchmark methodology
Read the technical write-up
Inspect the repository
Discuss secure enterprise retrieval
```

Only include links that actually exist.

---

# 22. SEO / METADATA

Generate:

### Page title
Zeroth — Permission-Aware Retrieval for Secure Multi-Tenant RAG

### Meta description
Zeroth investigates how authorization affects approximate retrieval in multi-tenant RAG and evaluates permission-aware index routing against global ANN post-filtering.

### Suggested keywords
- secure RAG
- multi-tenant RAG
- permission-aware retrieval
- vector search security
- PostgreSQL RLS
- HNSW
- enterprise RAG
- retrieval security
- authorization-aware search

Do not keyword-stuff the page.

---

# 23. STRUCTURED CONTENT DATA

Generate a machine-readable file:

`showcase/zeroth-showcase.json`

Suggested structure:

```json
{
  "project": {
    "name": "Zeroth",
    "slug": "zeroth",
    "category": "Secure Retrieval",
    "status": "..."
  },
  "hero": {
    "headline": "...",
    "subheadline": "...",
    "primary_metric": {}
  },
  "corpus": {},
  "architecture": {
    "components": [],
    "data_flow": [],
    "security_boundary": "PostgreSQL RLS"
  },
  "benchmarks": {
    "baseline": [],
    "strategy_comparison": [],
    "hnsw_sweep": []
  },
  "security": {},
  "limitations": [],
  "links": {}
}
```

Use `null` rather than invented values.

---

# 24. WHAT CLAUDE CODE SHOULD ALSO HAND BACK

At the end of implementation, generate a concise website-ready content pack:

```text
1. 50-word project summary
2. 100-word project summary
3. 250-word case study summary
4. hero headline
5. hero subheadline
6. 3–5 verified headline metrics
7. architecture labels
8. baseline result
9. enhanced result
10. strongest benchmark insight
11. security statement
12. red-team statement
13. 3 engineering lessons
14. 3 limitations
15. technical stack
16. CTA
17. SEO title
18. meta description
19. social preview copy
20. image/diagram requirements
```

---

# 25. VISUAL ASSET REQUIREMENTS

Create a list of assets needed for the website:

### Required
- hero architecture graphic
- before/after retrieval flow
- authorization boundary diagram
- benchmark charts
- HNSW experiment chart
- security/red-team diagram

### Optional
- index topology visual
- interactive candidate-slot animation
- benchmark explorer
- architecture hover states

All assets must correspond to actual implementation and benchmark data.

---

# 26. PUBLICATION SAFETY CHECK

Before delivering website content:

Search all public outputs for:

```text
password
secret
token
api_key
private_key
credential
internal IP
customer
confidential
localhost details that shouldn't be public
database connection strings
```

Also check for unsupported statements such as:

```text
best
first
novel
patented
production-proven
state-of-the-art
zero leakage
100% secure
```

Unless those statements have explicit evidence and approval, remove them.

---

# 27. PATENT / IP REVIEW MARKERS

Create:

`showcase/zeroth-ip-review.md`

Include:

- candidate differentiating mechanisms
- what is common prior architecture
- what appears to be an engineering optimization
- what should potentially remain confidential pending review
- what public disclosures currently exist
- exact implementation details that should be reviewed before website publication

Do not provide legal conclusions.

---

# 28. FINAL WEBSITE COPY PRINCIPLES

The page should sound like an engineering/research case study, not a startup landing page full of hype.

Prefer:

> We measured...

over:

> We revolutionized...

Prefer:

> In this corpus...

over:

> This proves...

Prefer:

> The benchmark shows...

over:

> This is guaranteed...

The strongest credibility asset is transparent methodology.

---

# 29. FINAL ACCEPTANCE CRITERIA

The showcase is ready only when:

- every displayed metric traces to a benchmark artifact
- every technical claim traces to implementation
- baseline and enhanced systems are clearly separated
- limitations are visible
- RLS/security architecture is accurately represented
- public/private/IP-review classification is complete
- machine-readable showcase JSON exists
- charts can be regenerated
- no secrets or confidential data are present
- no unverified “patent” or “novel” claims are made
