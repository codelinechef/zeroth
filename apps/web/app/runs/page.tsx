import { getRuns } from "@/lib/content";
import { ResultsTable } from "@/components/ResultsTable";

export const metadata = { title: "Runs · Zeroth" };

/**
 * The per-run detail route (/runs/[id]) is added in Phase 5, with the first
 * committed run. Next's static export requires a dynamic route to generate at
 * least one path, and the only way to satisfy that with an empty board would
 * be to invent a run id.
 */
export default function RunsPage() {
  return (
    <>
      <p className="eyebrow">Clause 1 · Runs</p>
      <h1 className="mt-2 text-[length:var(--t-200)]">Runs</h1>
      <hr className="rule my-8" />
      <ResultsTable runs={getRuns()} />
    </>
  );
}
