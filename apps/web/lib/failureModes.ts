import fs from "node:fs";
import path from "node:path";

const DIR = path.join(process.cwd(), "..", "..", "content", "failure-modes");

export type FailureStatus = "observed" | "prevented-by-design" | "guarded-in-ci";

export type FailureMode = {
  id: string;
  title: string;
  status: FailureStatus;
  what: string;
  why_invisible: string;
  corrupts: string[];
  detection: string;
  evidence: string | null;
  figure: number | null;
  metrics: string[];
};

export const STATUS_LABEL: Record<FailureStatus, string> = {
  observed: "Observed here",
  "prevented-by-design": "Prevented by design",
  "guarded-in-ci": "Guarded in CI",
};

/** Observed first: these actually happened, and that is the stronger material. */
const ORDER: FailureStatus[] = ["observed", "guarded-in-ci", "prevented-by-design"];

export function getFailureModes(): FailureMode[] {
  if (!fs.existsSync(DIR)) return [];
  const all = fs
    .readdirSync(DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8")) as FailureMode);
  return all.sort(
    (a, b) =>
      ORDER.indexOf(a.status) - ORDER.indexOf(b.status) ||
      a.title.localeCompare(b.title)
  );
}
