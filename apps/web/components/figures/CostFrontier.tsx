import { getRuns } from "@/lib/content";
import { InProgress } from "../InProgress";

/**
 * Figure 9 — cost/quality frontier. The component exists; with no runs it
 * renders the in-progress state rather than empty axes, which would imply a
 * measurement had been attempted.
 */
export function CostFrontier() {
  const runs = getRuns();
  if (runs.length === 0) {
    return (
      <InProgress phase={5} blockedBy="the evaluation harness (Phase 4)">
        Each configuration plotted by cost per query against answer quality, so
        the trade-off between a local model and a hosted one is visible rather
        than argued.
      </InProgress>
    );
  }
  return null; // real plotting lands with the first runs
}
