import { getRuns } from "@/lib/content";
import { ResultsTable } from "@/components/ResultsTable";
import { Prose } from "@/components/Paper";
import { InProgress } from "@/components/InProgress";
import { CostFrontier } from "@/components/figures/CostFrontier";
import { RunCompare } from "@/components/RunCompare";
import { Figure } from "@/components/Paper";

export const metadata = { title: "Runs · Zeroth" };

/**
 * The per-run detail route (/runs/[id]) arrives with the first committed run.
 * Static export requires a dynamic route to generate at least one path, and
 * the only way to satisfy that with an empty board would be to invent a run id.
 */
export default function RunsPage() {
  const runs = getRuns();
  return (
    <>
      <p className="eyebrow">Runs</p>
      <h1 className="mt-2">Runs</h1>
      <Prose className="mt-6">
        <p className="lede">
          One row per configuration, each differing from the baseline by exactly
          one factor.
        </p>
      </Prose>
      <div className="mt-8">
        {runs.length === 0 ? (
          <InProgress phase={5} blockedBy="the evaluation harness (Phase 4)">
            Nine runs with per-query drill-down, raw JSON download, and the
            exact command to reproduce each one.
          </InProgress>
        ) : (
          <div className="bleed bleed-scroll"><ResultsTable runs={runs} /></div>
        )}
      </div>
      {runs.length >= 2 ? (
        <>
          <h2 className="mt-16">Compare two runs</h2>
          <Prose>
            <p>
              Each variant differs from the baseline by exactly one factor. This
              shows which factor, and whether the metric it moved actually
              separated from the baseline or sits inside the noise.
            </p>
          </Prose>
          <div className="bleed mt-6"><RunCompare runs={runs} /></div>
        </>
      ) : null}

      <Figure n={9} caption="Cost per query against answer quality, once runs exist to plot.">
        <div className="p-4"><CostFrontier /></div>
      </Figure>
    </>
  );
}
