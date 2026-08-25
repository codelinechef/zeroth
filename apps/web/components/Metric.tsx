import { getMetric } from "@/lib/metrics";
import { MetricRef } from "./MetricRef";

/**
 * Inline metric reference. Returns phrasing content only — see MetricRef.
 * The panel is rendered once per page by <MetricPanels>.
 */
export function Metric({ id, children }: { id: string; children?: React.ReactNode }) {
  const m = getMetric(id);
  if (!m) throw new Error(`Unknown metric "${id}" — no content/metrics/${id}.json`);
  return <MetricRef metric={m}>{children}</MetricRef>;
}
