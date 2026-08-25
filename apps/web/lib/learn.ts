import fs from "node:fs";
import path from "node:path";

const DIR = path.join(process.cwd(), "..", "..", "content", "learn");

export type Formula = {
  notation: string;
  terms: { symbol: string; meaning: string }[];
};
export type Topic = {
  id: string; title: string; category: string; summary: string;
  what: string; why: string; how: string; in_this_project: string;
  sections: { heading: string; body: string }[];
  formula: Formula | null;
  table: { headers: string[]; rows: string[][] } | null;
  diagram: Record<string, unknown> | null;
  example: string | null;
  tradeoffs: { advantages: string[]; limitations: string[] };
  pitfalls: string[];
  when: { use: string[]; avoid: string[] };
  interacts_with: string[];
  code: { file: string; symbol: string } | null;
  related: string[];
};

/** Order reflects the pipeline, so the page reads as a path rather than a list. */
export const CATEGORY_ORDER = [
  "Retrieval", "Vector search", "Data", "Security", "Evaluation",
  "Generation", "Engineering",
];

export const CATEGORY_BLURB: Record<string, string> = {
  "Retrieval": "How a question becomes a ranked list of passages.",
  "Vector search": "How nearest-neighbour search works, and what it costs in exactness.",
  "Data": "How the corpus is built, split and kept reproducible.",
  "Security": "How access control is enforced, and what it does to retrieval.",
  "Evaluation": "How the numbers are produced and what they depend on.",
  "Generation": "How an answer is produced and checked against its sources.",
  "Engineering": "How the site itself is built and why it works without a backend.",
};

export function getTopics(): Topic[] {
  if (!fs.existsSync(DIR)) return [];
  return fs
    .readdirSync(DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8")) as Topic);
}

export function topicsByCategory(): [string, Topic[]][] {
  const all = getTopics();
  const seen = new Set(all.map((t) => t.category));
  const order = [
    ...CATEGORY_ORDER.filter((c) => seen.has(c)),
    ...[...seen].filter((c) => !CATEGORY_ORDER.includes(c)).sort(),
  ];
  return order.map((c) => [
    c,
    all.filter((t) => t.category === c).sort((a, b) => a.title.localeCompare(b.title)),
  ]);
}
