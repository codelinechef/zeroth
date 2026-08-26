import fs from "node:fs";
import path from "node:path";

/**
 * The engineering substrate — content, not code.
 *
 * Lives in content/engineering.json beside the rest of the paper's material so
 * a measurement can be updated without touching a component, and so the same
 * "no fabricated data" rule that governs runs governs this too: every figure
 * is read from a committed file or recorded in the build log, and an
 * unmeasured claim is flagged as unmeasured rather than estimated.
 */
const FILE = path.join(process.cwd(), "..", "..", "content", "engineering.json");

export type Decision = {
  id: string;
  area: string;
  decision: string;
  alternative: string;
  evidence: string;
  cost: string;
  why: string;
  /** True when `evidence` cites a measurement rather than a design argument. */
  measured: boolean;
};

export type Practice = { id: string; practice: string; detail: string };
export type Guardrail = { id: string; control: string; detail: string };
export type StackRow = { layer: string; choice: string; pinned: boolean };

export type Engineering = {
  note: string;
  hardware: { gpu: string; why: string };
  decisions: Decision[];
  evaluation: Practice[];
  guardrails: Guardrail[];
  stack: StackRow[];
};

export function getEngineering(): Engineering | null {
  if (!fs.existsSync(FILE)) return null;
  try {
    return JSON.parse(fs.readFileSync(FILE, "utf8")) as Engineering;
  } catch {
    return null;
  }
}
