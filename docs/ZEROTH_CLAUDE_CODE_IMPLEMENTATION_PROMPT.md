# ZEROTH — CLAUDE CODE MASTER IMPLEMENTATION PROMPT
## Permission-Aware Retrieval Architecture, Evaluation, Security Hardening, and Showcase Preparation

You are working on **Zeroth**, an open reconstruction of a production-style confidential-document retrieval platform.

The current project has already established a measurable baseline:

- 662 documents
- 51,310 chunks
- 24,155 pages
- 47 tenants
- BM25 + dense retrieval in parallel
- Reciprocal Rank Fusion (RRF)
- Cross-encoder reranking
- Schema-constrained generation
- Citation resolution
- Quote verification
- PostgreSQL Row-Level Security (RLS)
- Retrieval authorization enforced at the database layer
- The querying role is `NOSUPERUSER NOBYPASSRLS`
- 12 evaluation queries
- Baseline recall@10 vs exact-search ground truth:
  - 47/47 tenants visible → 0.850
  - 35/47 → 0.842
  - 12/47 → 0.667
  - 3/47 → 0.500
  - 1/47 → 0.300
- With the single-tenant role, 6/12 queries currently return no ANN results even though exact search under the same policy returns results.
- Increasing `ef_search` from 40 to 800 improves the single-tenant role from 0.300 to 0.667, then plateaus.
- The security suite contains 246 red-team cases.
- 15 of those specifically remove the application's tenant predicate to verify the database policy remains the security boundary.
- Mutation testing previously revealed a gap and resulted in nine additional configuration checks.
- The current project explicitly avoids claiming human relevance metrics because the relevance-judgment set is incomplete.

These baseline facts come from the existing project documentation and must NOT be overwritten or silently changed.

---

# 1. PRIMARY OBJECTIVE

Transform Zeroth from a demonstration of **access-control-induced ANN under-retrieval** into a rigorous, production-oriented system that supports **permission-aware retrieval**.

The central architectural hypothesis is:

> Authorization should influence retrieval-space selection before candidate ranking whenever practical, rather than relying on global ANN retrieval followed by authorization post-filtering.

The implementation must investigate and compare four strategies:

### Strategy A — Global ANN + post-filter
Current baseline/control.

```text
query
  ↓
global HNSW
  ↓
candidate set
  ↓
authorization filter
  ↓
remaining results
```

### Strategy B — Tenant-partitioned ANN
Authorized partitions are selected before ANN search.

```text
query
  ↓
authorization scope
  ↓
authorized partitions
  ↓
ANN search
  ↓
results
```

### Strategy C — Permission-aware index routing
Authorization scope is resolved into a retrieval plan which selects the minimal necessary index set.

```text
user
  ↓
identity / role
  ↓
authorization scope
  ↓
retrieval planner
  ↓
index selection
  ↓
ANN / lexical retrieval
  ↓
authorized candidate set
```

### Strategy D — Hybrid permission-aware retrieval
Combine shared indexes, permission-aware routing, partitioning, and adaptive candidate expansion where justified.

Do NOT assume in advance that B, C, or D will win. Build an empirical comparison.

---

# 2. NON-NEGOTIABLE ENGINEERING RULES

1. Inspect the repository before modifying anything.
2. Do not rewrite working components unnecessarily.
3. Preserve existing APIs unless a migration is explicitly required.
4. Preserve the current security boundary.
5. PostgreSQL RLS must remain authoritative.
6. The application tenant predicate may remain as a performance hint, but it must never be the security boundary.
7. Any optimization that could bypass RLS must fail closed.
8. Do not fabricate benchmarks.
9. Do not fabricate quality metrics.
10. Do not change baseline numbers just to make the new architecture look better.
11. Every new measurement must record:
    - corpus version/hash
    - embedding model/version
    - index configuration
    - database version
    - retrieval configuration
    - authorization scope
    - query set version
    - timestamp
12. Make every benchmark reproducible.
13. Record both mean and distribution where the sample size permits.
14. Separate:
    - security correctness
    - retrieval completeness
    - retrieval relevance
    - latency
    - infrastructure cost
15. If a proposed optimization improves recall but introduces a security weakness, reject it.
16. If a method is only an engineering mitigation and not a novel mechanism, document it as such.
17. Do not publicly expose sensitive implementation details unless they are already intended for publication.
18. Clearly label experimental features as experimental until benchmarked.
19. Prefer boring, inspectable architecture over framework complexity.
20. Add tests before deleting or materially changing existing logic.

---

# 3. FIRST TASK — REPOSITORY AUDIT

Before coding, inspect the whole repository and produce:

- current directory tree
- services/modules
- ingestion path
- document model
- chunk model
- embedding generation
- vector storage
- HNSW configuration
- BM25 implementation
- RRF implementation
- reranker
- generation layer
- citation verification
- PostgreSQL schema
- RLS policies
- role definitions
- tenant model
- authentication/authorization path
- API endpoints
- background workers/jobs
- configuration management
- test suite
- benchmark/evaluation code
- observability
- deployment configuration
- Docker configuration
- environment variables
- scripts
- existing documentation

Then identify:

1. What is production-like and reusable.
2. What is experimental.
3. What must not be changed.
4. What must be refactored before implementing permission-aware retrieval.
5. Missing tests.
6. Existing technical debt that will affect benchmark validity.

Create:

`docs/architecture/current-state.md`

Do not implement the new architecture until this audit is complete.

---

# 4. TARGET ARCHITECTURE

Design Zeroth as the following logical planes.

## 4.1 Ingestion plane

```text
source document
      ↓
parser
      ↓
normalizer
      ↓
chunker
      ↓
metadata extraction
      ↓
tenant assignment
      ↓
embedding generation
      ↓
lexical indexing
      ↓
vector indexing
```

Every chunk must have immutable provenance.

At minimum:

- document_id
- chunk_id
- tenant_id
- source
- page
- offsets if available
- content hash
- embedding/model metadata
- ingestion timestamp
- corpus version

Use a content hash to support deterministic corpus versioning and idempotent ingestion.

---

# 5. AUTHORIZATION MODEL

Represent authorization as a first-class retrieval input.

Logical model:

```text
principal
  ↓
roles
  ↓
permissions
  ↓
tenant scope
  ↓
retrieval scope
```

A retrieval request must be able to resolve to:

```json
{
  "principal_id": "...",
  "roles": ["..."],
  "authorized_tenants": ["T01", "T07", "T19"],
  "authorization_version": "..."
}
```

Do not trust tenant IDs supplied directly by the client.

The server must derive effective scope from authenticated identity and authoritative policy data.

Support at least:

- unrestricted/admin-style evaluation scope
- multi-tenant scope
- single-tenant scope
- zero-tenant scope
- intentionally invalid/forged scope for negative tests

A zero-tenant scope must fail closed and must not search globally.

---

# 6. DATABASE SECURITY

Keep PostgreSQL RLS as the hard security boundary.

Verify:

- querying role cannot bypass RLS
- role is `NOSUPERUSER`
- role is `NOBYPASSRLS`
- unauthorized rows cannot be selected
- inserts/updates cannot assign unauthorized tenant IDs
- cross-tenant joins do not bypass policy
- views/materialized views cannot accidentally expose unauthorized data
- functions do not execute with unsafe privileges
- search functions preserve effective identity
- connection pooling does not leak tenant/session state between requests

Add tests for:

- direct SQL
- API
- background job
- concurrent requests
- connection reuse
- forged tenant values
- missing tenant scope
- stale authorization scope
- revoked authorization
- application filter removed

---

# 7. PERMISSION-AWARE RETRIEVAL PLANNER

Build a dedicated component.

Suggested conceptual interface:

```python
RetrievalPlan = plan_retrieval(
    query=query,
    principal=principal,
    authorization_context=auth_context,
    retrieval_config=config,
)
```

The planner should produce an immutable plan similar to:

```json
{
  "strategy": "permission_aware",
  "authorized_tenants": ["T01", "T07"],
  "index_targets": ["tenant:T01", "tenant:T07"],
  "bm25_scope": "...",
  "vector_scope": "...",
  "candidate_budget": 200,
  "security_context_hash": "...",
  "authorization_version": "..."
}
```

Do not allow callers to modify the final authorization scope after planning.

The retrieval engine must execute only the resulting plan.

---

# 8. STRATEGY A — BASELINE CONTROL

Preserve the current implementation.

Add a standardized benchmark adapter:

```text
BaselineGlobalPostFilterRetriever
```

It must expose consistent metrics:

- recall@5
- recall@10
- recall@20
- empty_result_rate
- p50 latency
- p95 latency
- p99 latency where meaningful
- candidate count
- authorized candidate count
- authorization discard ratio
- index search work
- ef_search
- result count

The baseline must remain the comparison control.

---

# 9. STRATEGY B — TENANT PARTITIONING

Implement physical/logical partitioning only if compatible with the current database architecture.

Investigate:

- partition key
- tenant cardinality
- small-tenant overhead
- empty partitions
- partition pruning
- index count
- index build time
- write amplification
- operational complexity
- tenant lifecycle
- tenant deletion
- tenant migration
- multi-tenant requests

Measure:

```text
number of tenants
number of partitions
rows/chunks per partition
index size
index build time
query latency
recall
empty results
```

Test:

- one tenant
- three tenants
- twelve tenants
- thirty-five tenants
- forty-seven tenants
- zero authorized tenants

---

# 10. STRATEGY C — PERMISSION-AWARE INDEX ROUTING

Implement a reusable routing layer that maps authorization scope to index targets.

The key principle:

```text
authorization scope
      ↓
retrieval-space selection
      ↓
ANN search
```

rather than:

```text
global ANN
      ↓
authorization filtering
```

The router should support different physical topologies behind one interface.

At minimum:

```python
IndexRouter.resolve(auth_scope, corpus_version)
IndexRouter.search(plan, vector, top_k, config)
```

Support:

- single tenant → single index
- few tenants → small index set
- many tenants → grouped/shared index if beneficial
- all tenants → global/shared index where appropriate

Do not hard-code tenant IDs into business logic.

The router should support future grouping strategies.

---

# 11. STRATEGY D — HYBRID ROUTING

Implement only if justified by benchmark results.

Candidate design:

```text
authorization scope
        ↓
scope size / topology decision
        ↓
┌─────────────────────┬─────────────────────┐
│ small scope         │ large scope         │
│ tenant indexes      │ shared/grouped index │
└─────────────────────┴─────────────────────┘
        ↓
candidate generation
        ↓
RRF
        ↓
reranker
```

The planner may use:

- tenant count
- estimated candidate density
- index cardinality
- latency budget
- corpus topology

But the planner must remain deterministic for a fixed configuration.

Record the reason for every routing decision.

---

# 12. ADAPTIVE CANDIDATE EXPANSION

Implement as a controlled experiment, not as a universal fix.

Example:

```text
initial candidate budget
        ↓
search
        ↓
authorized results >= target?
   yes → stop
   no  → expand
        ↓
repeat until:
  target reached
  max budget reached
  latency budget exhausted
```

Record:

- initial budget
- final budget
- number of expansions
- final authorized candidates
- latency
- recall

Never allow adaptive expansion to bypass authorization.

---

# 13. HYBRID SEARCH

Keep BM25 and dense retrieval in parallel:

```text
query
 ├── BM25
 └── dense ANN
      ↓
     RRF
      ↓
 cross-encoder
      ↓
 final candidates
```

Both branches must obey the same authorization boundary.

Do not build a secure vector branch and leave BM25 globally visible.

Benchmark:

- BM25 only
- dense only
- hybrid
- hybrid + permission-aware routing

---

# 14. RANKING

The ranking plane should receive only authorized candidates.

Requirements:

- candidate provenance preserved
- tenant metadata preserved
- scores preserved
- ranking trace available for evaluation
- deterministic behavior where supported

Do not leak unauthorized candidate metadata into logs or traces.

---

# 15. GENERATION

Preserve the existing generation design:

```text
authorized top-k
      ↓
context builder
      ↓
schema-constrained generation
      ↓
citation resolution
      ↓
quote verification
      ↓
final response
```

Generation must never receive unauthorized chunks.

Add an explicit assertion before generation:

```text
all(context_chunk.authorized == True)
```

Fail closed if violated.

---

# 16. EVALUATION FRAMEWORK

Upgrade the benchmark harness to compare A/B/C/D.

Every benchmark run should produce a machine-readable record.

Suggested JSON:

```json
{
  "experiment_id": "...",
  "strategy": "C",
  "corpus_version": "...",
  "query_set_version": "...",
  "embedding_model": "...",
  "index_config": {},
  "authorization_scope": {},
  "metrics": {
    "recall_at_10": 0.0,
    "empty_result_rate": 0.0,
    "latency_p50_ms": 0,
    "latency_p95_ms": 0,
    "candidate_count": 0,
    "authorized_candidate_count": 0
  }
}
```

Benchmark the same query set under the same conditions.

Mandatory scopes:

- 47/47
- 35/47
- 12/47
- 3/47
- 1/47

Mandatory ef_search baseline sweep:

- 40
- 100
- 200
- 400
- 800

Add additional values only if justified.

---

# 17. EXACT SEARCH GROUND TRUTH

Keep the existing definition:

> Recall is measured against exact search under the identical policy.

This is NOT human relevance evaluation.

Do not label it:

- answer quality
- semantic correctness
- user satisfaction
- NDCG
- MRR

unless a separate relevance-judgment dataset actually exists.

Use exact wording in documentation:

```text
recall@K vs exact authorized search
```

---

# 18. EMPTY RESULT ANALYSIS

Treat empty results as a first-class metric.

For every query:

```text
exact authorized result count
ANN result count
authorized ANN result count
```

Identify:

- exact > 0 and ANN = 0
- exact > 0 and authorized ANN < target
- exact = 0 and ANN > 0 before authorization
- exact = 0 and final = 0

Create a diagnostic report.

This must become one of the primary charts for the Nth Labs showcase.

---

# 19. HNSW ANALYSIS

Preserve the current experiment and extend it.

For each scope:

```text
ef_search
recall@10
empty_result_rate
p50
p95
candidate_count
authorization_discard_ratio
```

Produce CSV and JSON outputs.

Generate publication-ready charts:

1. Recall vs tenant scope
2. Empty-result rate vs tenant scope
3. Recall vs `ef_search`
4. Latency vs `ef_search`
5. Authorization discard ratio
6. Strategy comparison
7. Recall/latency Pareto chart

Do not choose colors manually; use default plotting styles when generating analysis assets.

---

# 20. SECURITY / RED-TEAM SUITE

Preserve all current tests.

Add tests for:

### Retrieval isolation
- cross-tenant search
- forged tenant IDs
- forged role values
- missing tenant scope
- empty tenant scope
- revoked tenant
- stale authorization context

### Application-vs-database boundary
Remove application filters and confirm RLS still prevents leakage.

### Index routing
Attempt to force an unauthorized index.

### Cache isolation
Verify cached retrieval results cannot cross authorization contexts.

### Concurrent requests
Run simultaneous users with different scopes.

### Pooling
Ensure session state cannot bleed across connections.

### Prompt injection
Maintain existing tests.

### Citation integrity
A citation must never reference an unauthorized document.

### Mutation testing
Deliberately break policies and routing rules and confirm tests fail.

---

# 21. CACHE / SESSION SAFETY

If caching exists or is introduced:

Cache keys MUST include sufficient authorization context.

Example conceptual key:

```text
embedding/query hash
+
corpus version
+
retrieval configuration
+
authorization scope/version
```

Never cache a global result and merely filter it later.

Test cache poisoning explicitly.

---

# 22. OBSERVABILITY

Add structured metrics/traces for:

- request ID
- principal ID or irreversible anonymized identifier
- authorization version
- selected strategy
- index targets
- candidate budget
- ef_search
- candidate count
- authorized count
- empty-result flag
- latency
- reranker latency
- generation latency

DO NOT log document contents or unauthorized metadata.

Create dashboards for:

- retrieval latency
- empty-result rate
- recall benchmarks
- strategy distribution
- authorization failures
- security test status
- index health

---

# 23. FAILURE MODES

Document and test at least:

1. authorization service unavailable
2. stale authorization state
3. missing tenant mapping
4. corrupted index
5. missing tenant partition/index
6. index routing mismatch
7. database connection loss
8. embedding mismatch
9. corpus version mismatch
10. cache mismatch
11. empty authorized scope
12. ANN service timeout
13. reranker timeout
14. LLM timeout
15. partial index availability

Security failures must fail closed.

Availability failures may degrade only where explicitly safe.

---

# 24. PERFORMANCE EXPERIMENTS

Measure separately:

### Retrieval
- vector search latency
- lexical search latency
- routing latency
- RRF latency
- reranker latency

### Database
- partition pruning
- index scan
- rows touched
- query planning time

### Infrastructure
- CPU
- memory
- storage
- index size

### Security
- authorization resolution overhead

Do not claim performance improvements unless measured.

---

# 25. DATA AND EXPERIMENT VERSIONING

Create an experiment manifest.

Example:

```yaml
corpus_version:
query_set_version:
embedding_model:
embedding_dimension:
database_version:
postgres_extension_version:
index_type:
index_parameters:
retrieval_strategy:
authorization_model:
environment:
commit_sha:
timestamp:
```

Every benchmark artifact must be traceable to a commit.

---

# 26. DATABASE / SCHEMA MIGRATIONS

Do not apply destructive migrations automatically.

For every migration:

- migration file
- rollback plan
- compatibility notes
- test fixture
- benchmark impact

Document migration sequence.

---

# 27. API DESIGN

Expose strategy selection through configuration, not arbitrary user input.

Example:

```text
ZEROTH_RETRIEVAL_STRATEGY=baseline
ZEROTH_RETRIEVAL_STRATEGY=partitioned
ZEROTH_RETRIEVAL_STRATEGY=permission_aware
ZEROTH_RETRIEVAL_STRATEGY=hybrid
```

Users must not be able to choose a strategy that weakens security.

Feature flags are preferred for experimental strategies.

---

# 28. DOCUMENTATION TO CREATE

Create/update:

```text
docs/
├── architecture/
│   ├── current-state.md
│   ├── target-state.md
│   ├── retrieval-routing.md
│   ├── authorization-boundary.md
│   └── index-topology.md
│
├── security/
│   ├── threat-model.md
│   ├── rls-boundary.md
│   ├── red-team-results.md
│   └── failure-modes.md
│
├── evaluation/
│   ├── methodology.md
│   ├── benchmark-matrix.md
│   ├── baseline-results.md
│   ├── strategy-comparison.md
│   └── limitations.md
│
├── operations/
│   ├── deployment.md
│   ├── observability.md
│   └── migrations.md
│
└── public/
    └── zeroth-showcase.md
```

---

# 29. NTH LABS SHOWCASE PACKAGE

This is mandatory.

Create:

```text
showcase/
├── zeroth-case-study.md
├── zeroth-metrics.json
├── zeroth-metrics.csv
├── zeroth-architecture.json
├── zeroth-feature-matrix.json
├── zeroth-benchmark.json
├── zeroth-security.json
├── zeroth-limitations.md
├── zeroth-timeline.md
└── assets/
```

The showcase package must be derived from actual implementation state and benchmark outputs.

Do not manually type benchmark values into the public document if they can be generated automatically.

---

# 30. PUBLIC / PRIVATE / PATENT-SENSITIVE CLASSIFICATION

For every major technical component, classify it as:

```text
PUBLIC
INTERNAL
PATENT-REVIEW
TRADE-SECRET-CANDIDATE
```

Do not make patentability claims.

Flag potentially differentiating mechanisms for legal review before public disclosure.

The public website must not accidentally reveal:

- secrets
- credentials
- infrastructure addresses
- internal logs
- customer/confidential data
- exploit details that materially increase risk
- unpublished benchmark internals
- patent-sensitive implementation details not approved for disclosure

---

# 31. PUBLIC SHOWCASE CONTENT

The generated public case study should contain:

## Hero
- one-sentence thesis
- one strongest measured result
- concise technical positioning

## Problem
Explain:

> authorization can silently degrade approximate retrieval even when no data leaks.

## Architecture
Show:

```text
Ingestion
   ↓
Tenant-aware indexing
   ↓
Authorization
   ↓
Permission-aware retrieval
   ↓
BM25 + Dense
   ↓
RRF
   ↓
Reranking
   ↓
Generation
   ↓
Citation verification
```

## Baseline
Show the original global ANN + post-filter architecture.

## Failure Mode
Show why candidate slots disappear.

## Enhanced Architecture
Show permission-aware routing.

## Benchmarks
Show actual measured comparison.

## Security
Explain RLS as the security boundary.

## Red Team
Show actual count and categories.

## Limitations
Explicitly state:
- query count
- corpus dependency
- HNSW non-determinism
- absence of published human relevance metrics if still true

## Engineering Lessons
Give 3–5 concrete takeaways.

## CTA
Link to repository / paper / benchmark / technical documentation where appropriate.

---

# 32. SHOWCASE METRIC CONTRACT

The showcase JSON must include only verified fields.

Suggested schema:

```json
{
  "project": "Zeroth",
  "version": "...",
  "headline_metrics": {},
  "corpus": {},
  "retrieval": {},
  "authorization": {},
  "benchmarks": [],
  "security": {},
  "architecture": {},
  "limitations": [],
  "public_links": {}
}
```

Do not populate absent values with guesses.

Use:

```json
null
```

for unavailable values.

---

# 33. REQUIRED FINAL REPORT

At the end, create:

`docs/IMPLEMENTATION_REPORT.md`

It must include:

1. Executive summary
2. Before architecture
3. After architecture
4. Files changed
5. New files
6. Database migrations
7. New APIs
8. New configuration
9. New tests
10. Security findings
11. Benchmark results
12. Strategy comparison
13. Performance results
14. Operational considerations
15. Known limitations
16. Remaining work
17. Public showcase-ready metrics
18. Patent/IP review candidates
19. Exact commit SHA
20. Reproduction commands

---

# 34. DEFINITION OF DONE

The task is NOT complete until:

- baseline still works
- all existing security tests pass
- all new security tests pass
- RLS remains authoritative
- permission-aware routing is implemented and tested
- at least A/B/C are benchmarked
- D is either implemented or explicitly rejected with measured reasoning
- benchmark outputs are reproducible
- empty-result analysis exists
- latency is measured
- documentation is generated
- public/private classification exists
- Nth Labs showcase package exists
- machine-readable metrics exist
- final implementation report exists
- no unsupported metrics are presented as facts

At the end of the task, print a concise summary:

```text
IMPLEMENTATION STATUS
---------------------
Baseline: PASS/FAIL
Partitioned retrieval: PASS/FAIL
Permission-aware routing: PASS/FAIL
Hybrid retrieval: PASS/FAIL/NOT JUSTIFIED

Security tests: X/Y
Benchmark experiments: X
Best strategy by recall: ...
Best strategy by latency: ...
Best overall trade-off: ...

Files changed: ...
Docs generated: ...
Showcase package: ...
IP-review candidates: ...
Remaining risks: ...
```

---

# 35. HOW TO WORK

Work incrementally.

Recommended sequence:

1. repository audit
2. tests/fixtures stabilization
3. authorization model hardening
4. retrieval abstraction
5. baseline adapter
6. partitioned retrieval
7. permission-aware routing
8. adaptive expansion
9. hybrid strategy
10. benchmarks
11. security tests
12. observability
13. showcase generation
14. documentation
15. final verification

Do not skip directly to step 9.

When something cannot be implemented safely, stop that change, document why, and continue with safe portions.

The goal is not to make Zeroth look impressive.

The goal is to make Zeroth technically defensible, reproducible, secure, benchmarkable, and ready to be presented as a serious Nth Labs engineering/research project.
