import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(process.cwd(), "..", "..");
const METRICS_DIR = path.join(ROOT, "content", "metrics");
const GOLDEN = path.join(ROOT, "data", "golden");

export type Family =
  | "retrieval" | "grounding" | "abstention" | "performance" | "cost";

export type Metric = {
  id: string;
  name: string;
  family: Family;
  tag: string;
  one_line: string;
  formula: { notation: string; terms: { symbol: string; meaning: string }[] };
  range: { min: number; max: number | null; unit: string | null; note: string };
  computed_by: { file: string; symbol: string; phase: number };
  ci: { method: string; resamples: number; level: number; why: string } | null;
  worked_example: { requires: string; state: string };
  failure_modes: string[];
  related: string[];
};

export const FAMILY_LABEL: Record<Family, string> = {
  retrieval: "Retrieval",
  grounding: "Grounding",
  abstention: "Abstention",
  performance: "Performance",
  cost: "Cost",
};

let cache: Map<string, Metric> | null = null;

export function getMetrics(): Map<string, Metric> {
  if (cache) return cache;
  cache = new Map();
  if (!fs.existsSync(METRICS_DIR)) return cache;
  for (const f of fs.readdirSync(METRICS_DIR).filter((f) => f.endsWith(".json"))) {
    const m = JSON.parse(
      fs.readFileSync(path.join(METRICS_DIR, f), "utf8")
    ) as Metric;
    if (!m.id || !m.name || !m.family) {
      throw new Error(`content/metrics/${f}: missing id, name or family`);
    }
    cache.set(m.id, m);
  }
  return cache;
}

export function getMetric(id: string): Metric | undefined {
  return getMetrics().get(id);
}

export function metricsByFamily(): [Family, Metric[]][] {
  const order: Family[] =
    ["retrieval", "grounding", "abstention", "performance", "cost"];
  const out = new Map<Family, Metric[]>(order.map((f) => [f, []]));
  for (const m of getMetrics().values()) out.get(m.family)!.push(m);
  return order.map((f) => [f, out.get(f)!.sort((a, b) => a.name.localeCompare(b.name))]);
}

/* ---------------------------------------------------------------------------
   Worked examples.

   §5 wants a worked example built from a real query in data/golden/. The set is
   model-drafted; only judgments a human has checked are trustworthy enough to
   publish as reference material. A worked example is therefore built ONLY from
   a query whose displayed candidates are all human-verified. Anything less
   renders the unavailable state, which names what is missing.
--------------------------------------------------------------------------- */

export type WorkedExample =
  | { state: "available"; query_id: string; question: string; category: string;
      verified: number; candidates: { chunk_id: string; grade: number }[] }
  | { state: "unavailable"; reason: string };

function readJsonl(file: string): Record<string, unknown>[] {
  const p = path.join(GOLDEN, file);
  if (!fs.existsSync(p)) return [];
  return fs.readFileSync(p, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
}

export function getWorkedExample(): WorkedExample {
  const queries = readJsonl("queries.jsonl");
  const verified = readJsonl("verification.jsonl");

  if (queries.length === 0) {
    return { state: "unavailable", reason: "The golden set has not been generated yet." };
  }
  if (verified.length === 0) {
    return {
      state: "unavailable",
      reason: `${queries.length} queries are drafted, but none of their judgments have been human-verified yet. Worked examples are built only from verified judgments.`,
    };
  }

  // group verified judgments by query, pick the query with the most
  const byQuery = new Map<string, { chunk_id: string; grade: number }[]>();
  for (const v of verified) {
    const qid = String(v.query_id);
    if (!byQuery.has(qid)) byQuery.set(qid, []);
    byQuery.get(qid)!.push({ chunk_id: String(v.chunk_id), grade: Number(v.grade) });
  }
  let best: [string, { chunk_id: string; grade: number }[]] | null = null;
  for (const entry of byQuery.entries()) {
    if (!best || entry[1].length > best[1].length) best = entry;
  }
  if (!best || best[1].length < 3) {
    return {
      state: "unavailable",
      reason: `Only ${verified.length} judgments have been human-verified so far, and no single query has enough verified candidates to work through. Verification is in progress.`,
    };
  }
  const q = queries.find((x) => x.query_id === best![0]);
  if (!q) {
    return { state: "unavailable", reason: "Verified judgments reference a query that is not in the current set." };
  }
  return {
    state: "available",
    query_id: best[0],
    question: String(q.question),
    category: String(q.category),
    verified: best[1].length,
    candidates: best[1].sort((a, b) => b.grade - a.grade),
  };
}
