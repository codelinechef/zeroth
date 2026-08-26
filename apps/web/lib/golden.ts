import fs from "node:fs";
import path from "node:path";

/**
 * The golden set, read from data/golden/ at build time.
 *
 * Every number this module returns is COUNTED from the committed JSONL. None
 * is written down anywhere, so the page cannot drift from the data and cannot
 * state a figure the files do not support. When a file is missing the shape
 * says so rather than substituting a plausible value.
 */
const GOLDEN = path.join(process.cwd(), "..", "..", "data", "golden");

export type Query = {
  query_id: string;
  category: string;
  question: string;
  answer: string | null;
  answerable: boolean;
  source_chunk_ids: string[];
  source_doc_ids: string[];
  tenant: string | null;
  why_unanswerable: string | null;
  nearest_miss: string | null;
  reasoning: string | null;
  drafted_by: string;
  drafted_at: string;
  human_verified: boolean;
};

export type Judgment = {
  query_id: string;
  chunk_id: string;
  grade: number;
  why: string;
  is_source: boolean;
  judged_by: string;
  human_verified: boolean;
};

export type Verification = {
  query_id: string;
  chunk_id: string;
  /** The human's grade. */
  grade: number;
  /** What the LLM judge gave the same chunk. */
  model_grade: number;
  category: string;
  verified_at: string;
};

function readJsonl<T>(file: string): T[] {
  const p = path.join(GOLDEN, file);
  if (!fs.existsSync(p)) return [];
  return fs.readFileSync(p, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as T);
}

export const getQueries = () => readJsonl<Query>("queries.jsonl");
export const getJudgments = () => readJsonl<Judgment>("judgments.jsonl");
export const getVerifications = () => readJsonl<Verification>("verification.jsonl");

/** The 0–3 rubric, copied from harness/golden/verify.py. */
export const RUBRIC: { grade: number; meaning: string }[] = [
  { grade: 3, meaning: "fully answers the question on its own" },
  { grade: 2, meaning: "contains a substantial part of the answer" },
  { grade: 1, meaning: "related context, but does not contain the answer" },
  { grade: 0, meaning: "not relevant" },
];

export type GoldenSummary = {
  queries: number;
  judgments: number;
  verified: number;
  answerable: number;
  unanswerable: number;
  categories: { name: string; queries: number }[];
  gradeDistribution: { grade: number; count: number }[];
  draftedBy: string[];
  judgedBy: string[];
  /** Verified judgments where the human and the judge gave the same grade. */
  agreements: number;
  /** Distribution of (human grade − model grade) over verified judgments. */
  deltas: { delta: number; count: number }[];
  /** How many distinct queries have any verification at all. */
  queriesWithVerification: number;
};

export function goldenSummary(): GoldenSummary | null {
  const queries = getQueries();
  const judgments = getJudgments();
  const verifications = getVerifications();
  if (queries.length === 0) return null;

  const byCategory = new Map<string, number>();
  for (const q of queries) {
    byCategory.set(q.category, (byCategory.get(q.category) ?? 0) + 1);
  }

  const grades = new Map<number, number>();
  for (const j of judgments) grades.set(j.grade, (grades.get(j.grade) ?? 0) + 1);

  const deltas = new Map<number, number>();
  let agreements = 0;
  for (const v of verifications) {
    const d = v.grade - v.model_grade;
    deltas.set(d, (deltas.get(d) ?? 0) + 1);
    if (d === 0) agreements += 1;
  }

  return {
    queries: queries.length,
    judgments: judgments.length,
    verified: verifications.length,
    answerable: queries.filter((q) => q.answerable).length,
    unanswerable: queries.filter((q) => !q.answerable).length,
    categories: [...byCategory.entries()]
      .map(([name, n]) => ({ name, queries: n }))
      .sort((a, b) => b.queries - a.queries || a.name.localeCompare(b.name)),
    gradeDistribution: [3, 2, 1, 0].map((g) => ({ grade: g, count: grades.get(g) ?? 0 })),
    draftedBy: [...new Set(queries.map((q) => q.drafted_by))].sort(),
    judgedBy: [...new Set(judgments.map((j) => j.judged_by))].sort(),
    agreements,
    deltas: [...deltas.entries()]
      .map(([delta, count]) => ({ delta, count }))
      .sort((a, b) => a.delta - b.delta),
    queriesWithVerification: new Set(verifications.map((v) => v.query_id)).size,
  };
}

export type QueryDetail = Query & {
  judgments: Judgment[];
  verifications: Verification[];
  /** Grades this query's candidates received, highest first. */
  topGrades: { grade: number; count: number }[];
};

/** Every query with its judgments and verifications attached. */
export function queryDetails(): QueryDetail[] {
  const judgments = getJudgments();
  const verifications = getVerifications();
  return getQueries().map((q) => {
    const js = judgments.filter((j) => j.query_id === q.query_id);
    const grades = new Map<number, number>();
    for (const j of js) grades.set(j.grade, (grades.get(j.grade) ?? 0) + 1);
    return {
      ...q,
      judgments: js.sort((a, b) => b.grade - a.grade),
      verifications: verifications.filter((v) => v.query_id === q.query_id),
      topGrades: [3, 2, 1, 0]
        .map((g) => ({ grade: g, count: grades.get(g) ?? 0 }))
        .filter((x) => x.count > 0),
    };
  });
}
