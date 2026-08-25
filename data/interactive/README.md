# Precomputed interaction data

The site is a static export with no backend, so every interactive element
replays state captured by running the real pipeline offline and committing the
result. Nothing here is synthesised.

Each file carries its own provenance: `describes`, `generated_by.script`,
`generated_by.regenerate`, `generated_by.commit`, and `source`.

| Directory | What it is | Regenerate with |
|---|---|---|
| `retrieval/` | Every retrieval stage for one golden-set query: BM25 top-20 with scores, dense top-20 with scores, the RRF fusion with each rank's contribution, and the cross-encoder reordering | `python3 harness/interactive/retrieval.py` |
| `rls/` | ANN recall under row-level security across roles, with an ef_search sweep, measured on the real corpus in PostgreSQL as `zeroth_app` | `python3 harness/interactive/rls_demo.py` |
| `chunking/` | Both chunking strategies over one real document per source, with character spans so boundaries can be drawn | `python3 harness/interactive/chunking.py` |
| `verification/` | Golden-set queries through draft, blind judging and human verification | `python3 harness/interactive/verification.py` |

## Prerequisites

`retrieval/` and `rls/` need embeddings, which are not committed (79 MB):

```bash
python3 harness/interactive/embed.py
```

Roughly 1.5 minutes on an RTX 5060. Writes `data/corpus/embeddings/`,
gitignored and reproducible from the committed corpus manifest.

`rls/` additionally needs the database running:

```bash
docker compose up -d db
```

It connects as `zeroth_app`, never `postgres` — a superuser silently bypasses
row-level security and every measurement would be wrong in the flattering
direction. The script asserts `rolbypassrls = false` before measuring.

## Reproducing every figure from a clean clone

```bash
python3 harness/corpus/fetch.py          # ~340 requests, rate limited
python3 harness/corpus/parse.py          # parse, chunk, assign tenants, dedup
python3 harness/interactive/embed.py     # embeddings
docker compose up -d db
python3 harness/interactive/chunking.py
python3 harness/interactive/verification.py
python3 harness/interactive/retrieval.py
python3 harness/interactive/rls_demo.py
cd apps/web && npm ci && npm run build
```

## What is not deterministic

HNSW graph construction is not seeded, so `rls/postfilter.json` moves by a few
points between runs. The shape of the result is stable; the third decimal is
not. The figures quoted in that file's `finding` block are derived from the
measurements at generation time rather than written by hand, so prose and data
cannot drift apart.

Everything else is deterministic: chunking uses a fixed tokenizer, the golden
set is fixed, and BM25 and the embedder are deterministic given the same input.
