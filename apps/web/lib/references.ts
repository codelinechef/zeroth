import fs from "node:fs";
import path from "node:path";

/**
 * Works cited by the paper.
 *
 * Content, not code: the bibliography lives in content/references.json beside
 * the rest of the paper's material, so adding a citation is an edit to content
 * rather than to a component.
 *
 * Every entry was checked against the publisher or arXiv record. A paper that
 * argues about measurement rigour cannot afford a wrong year in its own
 * bibliography.
 */
const FILE = path.join(process.cwd(), "..", "..", "content", "references.json");

export type Reference = {
  id: string;
  kind: "paper" | "dataset" | "software" | "source";
  authors: string;
  title: string;
  venue: string;
  year: number | null;
  url: string;
  group: string;
  /** The part of the paper that leans on this work. */
  where: string;
  note: string;
};

export function getReferences(): Reference[] {
  if (!fs.existsSync(FILE)) return [];
  try {
    return (JSON.parse(fs.readFileSync(FILE, "utf8")) as { references: Reference[] })
      .references;
  } catch {
    return [];
  }
}

/** Reading order: the pipeline first, then how it is judged, then what it runs on. */
const GROUP_ORDER = [
  "Retrieval and generation",
  "Vector search",
  "Evaluation",
  "Corpus",
  "Serving and infrastructure",
];

export function referencesByGroup(): [string, Reference[]][] {
  const all = getReferences();
  const seen = new Set(all.map((r) => r.group));
  const order = [
    ...GROUP_ORDER.filter((g) => seen.has(g)),
    ...[...seen].filter((g) => !GROUP_ORDER.includes(g)).sort(),
  ];
  return order.map((g) => [
    g,
    all
      .filter((r) => r.group === g)
      .sort((a, b) => (a.year ?? 9999) - (b.year ?? 9999) || a.title.localeCompare(b.title)),
  ]);
}
