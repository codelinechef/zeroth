import fs from "node:fs";
import path from "node:path";

/**
 * What this project is, assessed honestly — content/positioning.json.
 *
 * Kept as content rather than prose in a component so the assessment can be
 * revised when the project earns a stronger claim, without editing markup.
 * The `what_would_change_the_claim` field exists to make that revision a
 * documented event rather than a quiet edit.
 */
const FILE = path.join(process.cwd(), "..", "..", "content", "positioning.json");

export type Positioning = {
  positioning: {
    claim: string;
    rejected: { label: string; why: string }[];
    why_this_one: string;
  };
  novelty: { claim: string; strength: string; detail: string; honest_caveat?: string }[];
  established: string[];
  why_digital: { affordance: string; detail: string }[];
  what_would_change_the_claim: string[];
};

export function getPositioning(): Positioning | null {
  if (!fs.existsSync(FILE)) return null;
  try {
    return JSON.parse(fs.readFileSync(FILE, "utf8")) as Positioning;
  } catch {
    return null;
  }
}
