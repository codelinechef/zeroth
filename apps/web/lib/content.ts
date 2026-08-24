import fs from "node:fs";
import path from "node:path";

/**
 * The run data contract — brief §10.
 * Validated by both the harness and the site. If a committed file does not
 * satisfy this shape, the build fails rather than rendering a partial run:
 * a half-read run is indistinguishable from an invented one.
 */
export type Metric = { value: number; ci95?: [number, number] };

export type Run = {
  run_id: string;
  clause: string;
  label: string;
  baseline: boolean;
  baseline_ref?: string;
  run_date: string;
  commit: string;
  corpus: {
    id: string;
    documents: number;
    pages: number;
    chunks: number;
    tenants: number;
  };
  queries: { total: number; answerable: number; unanswerable: number };
  config: Record<string, string | number | boolean>;
  metrics: Record<string, Metric>;
  security?: { tests: number; passed: number; failures: unknown[] };
  per_query?: string;
  notes?: string;
};

const BOARD_DIR = path.join(process.cwd(), "..", "..", "content", "board");

function assert(cond: unknown, file: string, why: string): asserts cond {
  if (!cond) throw new Error(`Invalid run file ${file}: ${why}`);
}

function validate(raw: unknown, file: string): Run {
  assert(raw && typeof raw === "object", file, "not an object");
  const r = raw as Record<string, unknown>;
  for (const k of ["run_id", "clause", "label", "run_date", "commit"]) {
    assert(typeof r[k] === "string" && r[k], file, `missing string "${k}"`);
  }
  assert(typeof r.baseline === "boolean", file, 'missing boolean "baseline"');
  assert(r.corpus && typeof r.corpus === "object", file, 'missing "corpus"');
  const corpus = r.corpus as Record<string, unknown>;
  assert(
    typeof corpus.id === "string" && corpus.id,
    file,
    "corpus.id is required — every figure carries the corpus it was measured on"
  );
  assert(r.metrics && typeof r.metrics === "object", file, 'missing "metrics"');
  for (const [name, m] of Object.entries(r.metrics as Record<string, unknown>)) {
    assert(
      m && typeof m === "object" && typeof (m as Metric).value === "number",
      file,
      `metric "${name}" has no numeric value`
    );
  }
  return raw as Run;
}

/**
 * Returns every committed run, or an empty array when none exist yet.
 * An empty board is a truthful state, not an error.
 */
export function getRuns(): Run[] {
  if (!fs.existsSync(BOARD_DIR)) return [];
  const files = fs.readdirSync(BOARD_DIR).filter((f) => f.endsWith(".json"));
  return files
    .map((f) => validate(JSON.parse(fs.readFileSync(path.join(BOARD_DIR, f), "utf8")), f))
    .sort((a, b) => a.clause.localeCompare(b.clause, undefined, { numeric: true }));
}

export function getRun(id: string): Run | undefined {
  return getRuns().find((r) => r.run_id === id);
}

/** Corpus ids present across committed runs. Empty until a run exists. */
export function getCorpusIds(): string[] {
  return [...new Set(getRuns().map((r) => r.corpus.id))];
}

/**
 * Corpus id and document count from the committed manifest. Read at build
 * time, never hardcoded — the footer carries provenance, so it has to be the
 * real corpus or nothing.
 */
export function getCorpusVersion(): string | null {
  const manifest = path.join(process.cwd(), "..", "..", "data", "corpus",
                             "corpus_manifest.json");
  if (!fs.existsSync(manifest)) return null;
  try {
    const m = JSON.parse(fs.readFileSync(manifest, "utf8"));
    const n = m?.corpus_stats?.documents_after_dedup;
    return n ? `${m.corpus_id} · ${n} documents` : (m.corpus_id ?? null);
  } catch {
    return null;
  }
}

export type CorpusStats = {
  corpusId: string; documents: number; pages: number; chunks: number;
  tenants: number; pagesReal: number; pagesEstimated: number;
  bySource: { source: string; documents: number }[];
};

/** Corpus figures from the committed manifest. Null when nothing is ingested. */
export function getCorpusStats(): CorpusStats | null {
  const f = path.join(process.cwd(), "..", "..", "data", "corpus",
                      "corpus_manifest.json");
  if (!fs.existsSync(f)) return null;
  try {
    const m = JSON.parse(fs.readFileSync(f, "utf8"));
    const s = m?.corpus_stats;
    if (!s) return null;
    const counts = new Map<string, number>();
    for (const d of m.documents ?? []) {
      if (d.dedup) continue;
      counts.set(d.source, (counts.get(d.source) ?? 0) + 1);
    }
    return {
      corpusId: m.corpus_id,
      documents: s.documents_after_dedup,
      pages: s.pages_total,
      chunks: s.chunks?.["fixed-512"] ?? 0,
      tenants: s.tenants,
      pagesReal: s.pages_real,
      pagesEstimated: s.pages_estimated,
      bySource: [...counts.entries()]
        .map(([source, documents]) => ({ source, documents }))
        .sort((a, b) => b.documents - a.documents),
    };
  } catch {
    return null;
  }
}
