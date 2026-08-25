import fs from "node:fs";
import path from "node:path";

const DIR = path.join(process.cwd(), "..", "..", "data", "interactive");

export type Provenance = {
  describes: string;
  generated_by: { script: string; regenerate: string; commit: string; at: string };
  source: Record<string, unknown>;
};

/** Read a precomputed dataset, or null when it has not been generated yet. */
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
