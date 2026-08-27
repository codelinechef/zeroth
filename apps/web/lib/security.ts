import fs from "node:fs";
import path from "node:path";

/**
 * Phase 3 red-team results, written by tests/redteam/run.py.
 *
 * Read from the file the suite itself emits, never transcribed. A pass rate
 * typed into a component by hand is a number with no run behind it, which is
 * the one thing this project does not publish.
 */
const FILE = path.join(process.cwd(), "..", "..", "content", "security", "redteam.json");

export type RedTeam = {
  generated_by: { script: string; regenerate: string; commit: string; at: string };
  source: { corpus: string; tenants: number; roles: number };
  total: number;
  passed: number;
  rate: number;
  elapsed_s: number;
  by_category: Record<string, { total: number; passed: number }>;
  failures: { category: string; name: string; impact: string; detail: string }[];
  mutation_check: {
    mutations: { name: string; detected: boolean }[];
    note: string;
  };
  caveats: string[];
};

export function getRedTeam(): RedTeam | null {
  if (!fs.existsSync(FILE)) return null;
  try {
    return JSON.parse(fs.readFileSync(FILE, "utf8")) as RedTeam;
  } catch {
    return null;
  }
}
