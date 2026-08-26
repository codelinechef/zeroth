import fs from "node:fs";
import path from "node:path";

/**
 * Reads the STAGED datasets under public/data, not the committed source under
 * data/interactive. scripts/prepare-data.mjs writes them there before
 * `next build` runs.
 *
 * Reading the staged copy rather than the original is deliberate: the staging
 * step reshapes retrieval traces (hoisting chunk bodies out of the stages into
 * one table), and the client fetches those same staged files at runtime. If
 * the server read the original shape and the client fetched the slimmed one,
 * the same component would be handed two different shapes depending on whether
 * the reader had touched the control yet.
 */
const DIR = path.join(process.cwd(), "public", "data");

export type Provenance = {
  describes: string;
  generated_by: { script: string; regenerate: string; commit: string; at: string };
  source: Record<string, unknown>;
};

/** Read a staged dataset, or null when it has not been generated yet. */
export function dataset<T>(rel: string): (T & Provenance) | null {
  const p = path.join(DIR, rel);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf8")) as T & Provenance;
  } catch {
    return null;
  }
}

export function datasetList(sub: string): string[] {
  const p = path.join(DIR, sub);
  if (!fs.existsSync(p)) return [];
  return fs.readdirSync(p).filter((f) => f.endsWith(".json") && f !== "index.json");
}

// Re-exported for server callers; the implementation lives in a client-safe
// module because the demos import it from the browser.
export { datasetUrl } from "./dataUrl";
