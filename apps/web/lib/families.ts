/**
 * Metric families — the identification channel, and its presentation.
 *
 * Client-safe on purpose. lib/metrics.ts reads content/ off disk with node:fs,
 * so importing FAMILY_LABEL from there into a "use client" component would drag
 * the filesystem layer into the browser bundle. The family names and hues are
 * plain data and belong somewhere both sides can reach.
 */

export type Family =
  | "retrieval" | "grounding" | "abstention" | "performance" | "cost";

/** Reading order, retrieval first: it feeds grounding and abstention. */
export const FAMILY_ORDER: Family[] =
  ["retrieval", "grounding", "abstention", "performance", "cost"];

export const FAMILY_LABEL: Record<Family, string> = {
  retrieval: "Retrieval",
  grounding: "Grounding",
  abstention: "Abstention",
  performance: "Performance",
  cost: "Cost",
};

/**
 * The three-letter tag written in the prose, mapped back to its family word.
 * Keyed by tag so a component holding only `metric.tag` can expand it.
 */
export const TAG_LABEL: Record<string, string> = {
  RET: "Retrieval",
  GRD: "Grounding",
  ABS: "Abstention",
  PRF: "Performance",
  CST: "Cost",
};

/**
 * Hue per family. Reinforcement only — never the identification channel; see
 * the palette note in globals.css.
 */
export const FAMILY_HUE: Record<Family, string> = {
  retrieval: "var(--fam-retrieval)",
  grounding: "var(--fam-grounding)",
  abstention: "var(--fam-abstention)",
  performance: "var(--fam-performance)",
  cost: "var(--fam-cost)",
};
