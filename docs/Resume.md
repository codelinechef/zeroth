# Zeroth — resume material

Everything below is ATS-safe plain text: no tables, no columns, no text boxes,
no graphics, no skill bars, no icons, no headers/footers, no multi-column
layout. Copy the plain-text blocks verbatim into a single-column document.

**Honesty rule for this file.** Every number is traceable to a committed file or
a recorded build log in this repository. Where a metric does not exist yet —
because the evaluation harness is Phase 4 and has not run — the bullet says what
was built rather than inventing a result. Bullets that would need a number that
does not exist are listed separately at the bottom under "Do not use yet."

---

## 1. Project summary (paste as-is)

```
Zeroth — Reproducible RAG Evaluation Benchmark
Independent project, NthLabs | 2026 | Python, PostgreSQL, pgvector, vLLM, Next.js

An open reconstruction of a production confidential-document retrieval platform,
rebuilt over a 663-document public corpus so the architecture and its measured
behaviour can be independently inspected and reproduced.
```

---

## 2. Resume bullets — XYZ format

Google's XYZ form: "Accomplished [X] as measured by [Y], by doing [Z]."
Each bullet leads with an action verb recruiters screen for, states the
measurable outcome, then the method.

### Tier 1 — use these first (strongest, all measured)

```
- Tuned HNSW vector index parameters to lift retrieval recall from 0.836 to 0.998
  on a 51,310-chunk corpus, by running a parameter sweep across m and
  ef_construction and accepting a 3x one-time index build cost in exchange for
  query-time accuracy.

- Cut retrieval-demo page weight 74%, from 1,024 KB to 268 KB, by restructuring
  precomputed pipeline traces into a deduplicated chunk table served as
  fetch-on-demand static assets instead of inlining every dataset into the
  render payload.

- Built an embedding pipeline that indexed 51,310 document chunks in 1.5 minutes
  at 558 chunks/second on a single 8 GB consumer GPU, by running
  bge-small-en-v1.5 in fp16 at batch size 64, leaving 6.87 GB free so the
  embedder and generator stay co-resident.

- Quantified LLM-judge reliability before publishing any score, finding the human
  annotator agreed with the model on only 4 of 32 verified relevance judgments,
  by building a stratified 25% verification sampler and re-grading against the
  same rubric the model was given.

- Enforced multi-tenant isolation inside the retrieval query across 47 tenants,
  by implementing PostgreSQL row-level security with per-tenant partitioned HNSW
  and GIN indexes under a NOSUPERUSER NOBYPASSRLS role that asserts it cannot
  bypass RLS before serving a request.

- Eliminated a prompt-injection vector in which a retrieved document could forge
  passage delimiters and impersonate untrusted content as system structure, by
  fencing every retrieved passage and stripping the fence literal from the body
  before interpolation.
```

### Tier 2 — use if the role emphasises data, security, or platform work

```
- Constructed a 663-document, 24,155-page evaluation corpus spanning SEC EDGAR
  filings, CUAD contracts and IETF RFCs, by building a resumable rate-limited
  acquisition pipeline with per-document SHA-256 checksums and containment-based
  deduplication that removed 1 duplicate across three overlapping sources.

- Reduced prompt-injection surface across the corpus by sanitising instruction
  patterns at ingestion time, using six deliberately narrow pattern classes
  tuned so that ordinary contract and standards prose survives untouched, with
  every removal counted and marked rather than silently deleted.

- Designed a citation-verification stage that rejects any answer citing a chunk
  the model was never shown and checks each quoted span character-by-character
  against source text, by constraining generation to a JSON schema through
  XGrammar under vLLM rather than parsing free-form output.

- Automated six build-time correctness gates covering cross-reference integrity,
  HTML nesting, per-route Content-Security-Policy hashing, horizontal-overflow
  detection and hardcoded-URL detection, catching 3 dangling content references
  and a fabricated URL before they reached production.
```

### Tier 3 — engineering-craft bullets for a platform or infra-leaning role

```
- Diagnosed and fixed a production 500 across an entire deployed site by tracing
  the failure to a serverless adapter re-rendering statically generated pages at
  request time, where the content layer's build-time filesystem does not exist,
  and restoring the static export the application was designed for.

- Reduced page payloads across the site by up to 74% while adding features, by
  moving 26 modal-rendered documents to individually addressable static routes
  and lazy-loading precomputed datasets.
```

---

## 3. Action verbs recruiters screen for

Lead every bullet with one of these. Ranked by how often they appear in AI/ML
postings at labs and startups.

```
Architected   Built        Designed      Implemented   Engineered
Optimized     Tuned        Reduced       Cut           Improved
Delivered     Shipped      Automated     Instrumented  Benchmarked
Quantified    Measured     Validated     Diagnosed     Debugged
Scaled        Migrated     Hardened      Enforced      Eliminated
Led           Spearheaded  Owned         Drove         Collaborated
```

Avoid: "Worked on", "Helped with", "Responsible for", "Involved in",
"Utilized", "Leveraged". These describe participation rather than outcome and
are the single most common reason a technical bullet reads as weak.

---

## 4. Terminology to mirror

ATS keyword matching is frequently exact-phrase. Use the posting's own wording.
These are the terms that recur across current AI/ML engineer postings and are
genuinely supported by this project.

```
Retrieval-Augmented Generation (RAG)    Hybrid retrieval
Vector database                          Embeddings
Semantic search                          Reranking / cross-encoder
Chunking strategy                        Context engineering
LLM evaluation                           Evals
Faithfulness / hallucination rate        Groundedness
Guardrails                               Prompt injection
Model serving                            Inference optimization
Constrained decoding / structured output Observability
Cost per query                           Latency (p95)
Reproducibility                          Experiment tracking
Multi-tenancy                            Row-level security
Production ML                            MLOps
```

Do not claim on this project: fine-tuning, LoRA/QLoRA, RLHF, distributed
training, Kubernetes, TensorFlow, JAX, Pinecone/Weaviate. None of these are used
here, and a keyword you cannot defend in an interview is worse than a missing
one.

---

## 5. Soft-skill and culture language

These phrasings recur across research labs and startups. Use them where you can
attach evidence from this project, not as adjectives.

```
Ownership beyond the written role     Bias for action
Comfort with ambiguity                Dive deep / attention to detail
Earn trust                            Deliver results despite setbacks
Explains trade-offs in plain language Raises the bar
Works backward from the user          High standards
Intellectual honesty                  Disagree and commit
```

Evidence you can attach from this project:

- **Intellectual honesty / high standards** — published a measurement showing
  the project's own LLM judge disagreed with a human on 28 of 32 checks, and
  blocked publishing any retrieval score until it is understood.
- **Comfort with ambiguity** — chose index parameters from a measured sweep
  rather than library defaults, and labelled every design decision as either
  measured or argued-but-unmeasured.
- **Dive deep** — traced a site-wide production outage to a serverless adapter's
  request-time re-rendering rather than treating the symptom.
- **Ownership** — designed, built and operated the corpus pipeline, retrieval
  platform, security model, evaluation harness and the published site.

---

## 6. ATS parsing — what to strip

Remove all of these. Each one either fails to parse or parses into garbage.

```
STRIP:
  Tables                      cells are read out of order or dropped
  Multi-column layouts        columns interleave into nonsense
  Text boxes                  frequently invisible to the parser
  Headers and footers         commonly ignored; never put contact info there
  Graphics, logos, photos     contribute nothing, add file size
  Skill bars / ratings/ dots  a bar means nothing to a parser or a recruiter
  Icons for phone/email       glyph replaces the label the parser looks for
  Non-standard section names  use Experience, Education, Skills, Projects
  Uncommon fonts              embedding failures produce garbled extraction
  PDF-as-image / scanned      zero extractable text
  Special bullet glyphs       use a plain hyphen or a standard bullet
  Text in SVG or canvas       not extractable

KEEP:
  Single column, reverse-chronological
  Standard section headings
  Plain hyphen bullets
  Dates as "Mon YYYY - Mon YYYY" or "YYYY - YYYY"
  A .docx or text-based .pdf, under 1 MB
  Contact details in the document body, not the header
```

---

## 7. Prioritised punch-list

Ordered by effect on where you land in a recruiter's ranked search.

```
1. Put "Retrieval-Augmented Generation (RAG)", "LLM evaluation" and "vector
   database" in the top third of page one. Ranked search weights early
   occurrences, and most screens never reach page two.

2. Mirror the target posting's exact phrasing in your skills line. Matching is
   often literal: "RAG" and "Retrieval-Augmented Generation" may not be treated
   as the same token, so include both.

3. Lead every bullet with an outcome, not a technology. "Built with pgvector"
   ranks below "Lifted recall from 0.836 to 0.998".

4. Put a number in the first five bullets. Recruiters scan for digits; a bullet
   with no digit is skimmed past.

5. Name evaluation explicitly. Postings increasingly treat a resume with no
   evaluation vocabulary as evidence of shipping unevaluated features. This is
   the single strongest differentiator this project gives you.

6. Add a one-line project link with the corpus id. A live artefact outranks a
   description of one.

7. Cut every bullet that describes a tool without an outcome. Tool lists belong
   in the Skills section, once.

8. Keep the file name clean: Anant_Sharma_AI_ML_Engineer.pdf. Some parsers
   surface the file name to the recruiter.

9. Match the job title language. If the posting says "AI Engineer", the headline
   should not say "ML Ops Specialist".

10. Export text-based PDF and verify by opening it and selecting the text. If it
    does not select, the parser sees nothing.
```

---

## 8. Do not use yet — bullets that need Phase 4/5

These are the bullets that will be strongest once the evaluation harness runs,
and which currently have no number behind them. Do not put a placeholder figure
in any of them.

```
- Recall@10, NDCG@10, MRR@10 on the golden set     needs Phase 4 baseline
- Faithfulness / citation accuracy / abstention     needs Phase 4 baseline
- p95 latency and cost per query                    needs Phase 4 baseline
- "Nine configurations, one factor each"            needs Phase 5 variants
- Red-team pass rate across N attack cases          needs Phase 3 suite
- Bootstrapped 95% CIs over 1,000 resamples         apparatus built, not yet run
```

Until then, describe the apparatus rather than the result: "built a
bootstrapped confidence-interval harness over 1,000 resamples" is true today;
"achieved 0.94 faithfulness" is not.

---

## 9. Current project status

```
Phase 0  Site shell and design system                   COMPLETE
Phase 1  Corpus acquisition and golden set              COMPLETE
Phase 2  Retrieval platform                             COMPLETE
Phase 3  Security red-team suite                        NOT STARTED
Phase 4  Evaluation harness and baseline run            NOT STARTED
Phase 5  Nine variants, published board                 NOT STARTED
Phase 6  Writing section                                BLOCKED on Phase 5
Phase 7  Automated digest feed                          BLOCKED on Phase 6
```

Three of eight phases complete. The published site is real and reproducible; the
headline benchmark numbers do not exist yet, which is why no bullet above claims
one.
