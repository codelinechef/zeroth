# Zeroth

Zeroth is an open reconstruction of a production confidential-document RAG
platform. The original was built for an employer over a private corpus and is
not public. This is a from-scratch rebuild of the same architecture over public
documents. Every number published here was measured on the public corpus
described in the methodology, and applies only to it.

This matters technically, not only ethically. Retrieval metrics are properties
of a corpus-and-query-set pair, not of an architecture. Numbers measured here
cannot validate, reproduce, or stand in for numbers measured on a different
corpus.

## Status

**Phase 0 — shell.** The site builds and serves honest empty states. No corpus
has been ingested, no evaluation has run, and there are no results to report.
There is no number anywhere in this repository presented as a measurement that
is not one.

## Layout

```
apps/web/          Next.js static site (the public board)
content/board/     results JSON, one file per run — currently empty
platform/          ingestion, retrieval, generation, providers, db  (Phase 2)
harness/           golden set, eval runners, scorers, bootstrap     (Phase 4)
tests/redteam/     security suite                                   (Phase 3)
data/              corpus and golden set, committed                 (Phase 1)
docs/              build brief, investigations, known issues
```

## Site

```bash
cd apps/web && npm install && npm run dev   # http://localhost:3010
```

Static export lands in `apps/web/out/`.

## Documentation

- `docs/ZEROTH_BUILD_BRIEF_V2.md` — the build specification, source of truth
- `docs/investigations/FINDINGS.md` — pgvector under RLS, EDGAR, CUAD, vLLM
- `docs/known-issues.md` — environment failures that do not explain themselves

## Cost

The platform runs locally in Docker. Only the site is hosted, and it is fully
static. Running cost is ₹0/month.
