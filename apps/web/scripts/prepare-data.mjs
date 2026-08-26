#!/usr/bin/env node
/**
 * Stage the precomputed interactive datasets as fetchable static assets, and
 * slim them on the way through.
 *
 * The problem this solves, measured on the build before it existed:
 *
 *     /walkthroughs   1,024 KB of HTML
 *     /learn            556 KB
 *
 * Both pages inlined every dataset they could possibly need into the render
 * payload, because a static export has no server to ask later. A megabyte of
 * HTML is several seconds of blank screen on a mid-range phone, and it is paid
 * by every reader whether or not they touch a demo.
 *
 * Two reductions, in order of how much they buy:
 *
 *   1. Fetch on demand. Everything is written to public/data/, which the export
 *      copies to out/data/ and the CDN serves as a plain static file. The page
 *      inlines only an index plus the first dataset — enough to render
 *      immediately — and the client fetches the rest when the reader actually
 *      selects one. Still no server; still no backend. `connect-src 'self'` in
 *      the CSP already permits it.
 *
 *   2. Deduplicate chunk records. A retrieval trace carries four stages of
 *      twenty candidates, but only ~35 of those 80 records are distinct — the
 *      same chunk appears in lexical, dense, fused and reranked, each time
 *      carrying its own 300-byte excerpt. Hoisting the chunk bodies into one
 *      map keyed by chunk_id, leaving the stages holding only ranks and scores,
 *      removes about a third of every trace on its own.
 *
 * Runs as part of `npm run build`, before `next build`.
 */
import {
  readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, rmSync,
} from "node:fs";
import { join } from "node:path";

const SRC = join("..", "..", "data", "interactive");
const OUT = join("public", "data");

/**
 * Fields that describe the candidate's position in a stage, not the chunk
 * itself. Everything NOT in this set is treated as chunk body and hoisted.
 *
 * Enumerated from the committed traces rather than guessed — the fused stage
 * carries the RRF arithmetic and the reranked stage carries its movement, and
 * hoisting either into the shared chunk table would let one stage's values
 * overwrite another's. The `assertPositional` check below fails the build if a
 * new field ever appears that this list has not been taught about.
 */
const RANK_FIELDS = new Set([
  "rank", "score",
  "rrf_score", "lexical_rank", "dense_rank",
  "lexical_contribution", "dense_contribution",
  "movement", "moved_from_fused",
]);

/** Fields that legitimately belong to the chunk and are identical everywhere. */
const BODY_FIELDS = new Set([
  "doc_id", "tenant", "page", "section", "n_tokens", "excerpt",
]);

function readJson(p) {
  return JSON.parse(readFileSync(p, "utf8"));
}

function writeJson(rel, obj) {
  const p = join(OUT, rel);
  mkdirSync(join(p, ".."), { recursive: true });
  // No pretty-printing: this is transport, not something a human reads. The
  // committed source in data/interactive/ stays formatted.
  writeFileSync(p, JSON.stringify(obj));
  return Buffer.byteLength(JSON.stringify(obj));
}

/**
 * Split a trace into a chunk table plus rank-only stages.
 * Shape in:  { stages: { lexical: [{chunk_id, excerpt, ..., rank, score}] } }
 * Shape out: { chunks: { [chunk_id]: {excerpt, ...} }, stages: { lexical: [{chunk_id, rank, score}] } }
 */
function slimTrace(d, file) {
  if (!d.stages) return d;
  const chunks = {};
  const stages = {};
  for (const [stage, items] of Object.entries(d.stages)) {
    if (!Array.isArray(items)) { stages[stage] = items; continue; }
    stages[stage] = items.map((c) => {
      const position = { chunk_id: c.chunk_id };
      const body = {};
      for (const [k, v] of Object.entries(c)) {
        if (k === "chunk_id") continue;
        if (RANK_FIELDS.has(k)) { position[k] = v; continue; }
        if (!BODY_FIELDS.has(k)) {
          throw new Error(
            `prepare-data: ${file} stage "${stage}" has unknown field "${k}". ` +
            `Add it to RANK_FIELDS (positional) or BODY_FIELDS (chunk) in ` +
            `scripts/prepare-data.mjs. Guessing would silently corrupt the trace.`
          );
        }
        body[k] = v;
      }
      const seen = chunks[c.chunk_id];
      if (seen) {
        // The bodies must agree across stages, or hoisting them loses data.
        for (const k of BODY_FIELDS) {
          if (k in body && k in seen && JSON.stringify(seen[k]) !== JSON.stringify(body[k])) {
            throw new Error(
              `prepare-data: ${file} chunk ${c.chunk_id} disagrees on "${k}" ` +
              `between stages. The chunk table assumes these are identical.`
            );
          }
        }
      }
      chunks[c.chunk_id] = { ...seen, ...body };
      return position;
    });
  }
  return { ...d, chunks, stages };
}

if (!existsSync(SRC)) {
  console.error(`prepare-data: ${SRC} not found — nothing to stage`);
  process.exit(1);
}

// Rebuild from scratch so a dataset deleted upstream cannot linger in the export.
rmSync(OUT, { recursive: true, force: true });

let files = 0, bytes = 0;
const manifest = {};

for (const sub of readdirSync(SRC, { withFileTypes: true })) {
  if (!sub.isDirectory()) continue;
  const names = readdirSync(join(SRC, sub.name)).filter((f) => f.endsWith(".json"));
  manifest[sub.name] = [];
  for (const name of names) {
    const raw = readJson(join(SRC, sub.name, name));
    const out = sub.name === "retrieval" && name !== "index.json"
      ? slimTrace(raw, name)
      : raw;
    bytes += writeJson(join(sub.name, name), out);
    files += 1;
    manifest[sub.name].push(name.replace(/\.json$/, ""));
  }
}

/* ---------------------------------------------------------------------------
   Corpus document index.

   The manifest carries 663 documents with full acquisition provenance. Inlining
   that into /corpus would repeat the /walkthroughs mistake, so it is staged as
   one fetchable file carrying only the fields the explorer shows. Raw paths and
   archive members are dropped: they describe a local filesystem nobody reading
   the site has.
--------------------------------------------------------------------------- */
const MANIFEST = join("..", "..", "data", "corpus", "corpus_manifest.json");
if (existsSync(MANIFEST)) {
  const m = readJson(MANIFEST);
  const docs = (m.documents ?? []).map((d) => ({
    doc_id: d.doc_id,
    source: d.source,
    tenant: d.tenant,
    pages: d.pages,
    bytes: d.bytes,
    licence: d.licence,
    identifier: d.identifier,
    url: d.url ?? null,
    // Enough to check a file against the manifest without shipping 663 full
    // SHA-256 digests; the complete checksum is in the committed manifest.
    checksum: typeof d.checksum === "string" ? d.checksum.slice(0, 12) : null,
    dedup: d.dedup ?? null,
  }));
  bytes += writeJson(join("corpus", "documents.json"), {
    describes: "Per-document acquisition provenance, from data/corpus/corpus_manifest.json.",
    generated_by: {
      script: "harness/corpus/fetch.py",
      regenerate: "python3 harness/corpus/fetch.py",
      commit: "see corpus_manifest.json",
      at: m.generated_at ?? "",
    },
    source: { corpus: m.corpus_id },
    corpus_id: m.corpus_id,
    documents: docs,
  });
  files += 1;
  manifest.corpus = ["documents"];
}

writeJson("manifest.json", {
  describes: "What is available under /data, written by scripts/prepare-data.mjs.",
  generated_at: new Date().toISOString(),
  sets: manifest,
});

console.log(
  `prepare-data: staged ${files} dataset(s) into ${OUT} ` +
  `(${(bytes / 1024).toFixed(0)} KB, fetched on demand)`
);
