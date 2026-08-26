"use client";

import { useMemo, useState } from "react";
import type { Run } from "@/lib/content";
import { FAMILY_HUE, TAG_LABEL } from "@/lib/families";

/**
 * Two runs, one factor apart.
 *
 * The paper's central claim is that each variant differs from the baseline by
 * exactly one factor, so every difference is attributable. This is that claim
 * as an interface: pick two runs, see which config keys differ, and see each
 * metric's delta against whether the confidence intervals overlap.
 *
 * The CI overlap test is the part that matters. A delta without it invites the
 * reader to treat noise as a result, which is the failure the whole
 * bootstrapping apparatus exists to prevent. Overlapping intervals are labelled
 * "not separated" rather than given a number and left to look decisive.
 */

function fmt(name: string, v: number): string {
  if (name.startsWith("cost")) return `$${v.toFixed(4)}`;
  if (name.startsWith("latency")) return `${v.toFixed(2)} s`;
  return v.toFixed(3);
}

/** Higher is better for everything except latency and cost. */
function higherIsBetter(name: string): boolean {
  return !name.startsWith("latency") && !name.startsWith("cost");
}

function familyOf(metricId: string): keyof typeof FAMILY_HUE | null {
  if (metricId.startsWith("recall") || metricId.startsWith("ndcg") ||
      metricId.startsWith("mrr") || metricId.startsWith("context")) return "retrieval";
  if (metricId.startsWith("abstention")) return "abstention";
  if (metricId.startsWith("latency")) return "performance";
  if (metricId.startsWith("cost")) return "cost";
  return "grounding";
}

const TAG_OF: Record<string, string> = {
  retrieval: "RET", grounding: "GRD", abstention: "ABS",
  performance: "PRF", cost: "CST",
};

export function RunCompare({ runs }: { runs: Run[] }) {
  const [aId, setAId] = useState(runs[0]?.run_id ?? "");
  const [bId, setBId] = useState(runs[1]?.run_id ?? runs[0]?.run_id ?? "");

  const a = runs.find((r) => r.run_id === aId);
  const b = runs.find((r) => r.run_id === bId);

  const configDiff = useMemo(() => {
    if (!a || !b) return [];
    const keys = [...new Set([...Object.keys(a.config), ...Object.keys(b.config)])].sort();
    return keys
      .map((k) => ({ key: k, a: a.config[k], b: b.config[k] }))
      .filter((x) => String(x.a) !== String(x.b));
  }, [a, b]);

  const metricRows = useMemo(() => {
    if (!a || !b) return [];
    const keys = [...new Set([...Object.keys(a.metrics), ...Object.keys(b.metrics)])].sort();
    return keys.map((k) => {
      const ma = a.metrics[k];
      const mb = b.metrics[k];
      if (!ma || !mb) return { key: k, ma, mb, delta: null, separated: null };
      const delta = mb.value - ma.value;
      // Non-overlapping 95% intervals is a conservative separation test; it is
      // not a significance test and is not claimed to be one.
      let separated: boolean | null = null;
      if (ma.ci95 && mb.ci95) {
        separated = ma.ci95[1] < mb.ci95[0] || mb.ci95[1] < ma.ci95[0];
      }
      return { key: k, ma, mb, delta, separated };
    });
  }, [a, b]);

  if (runs.length < 2 || !a || !b) return null;

  return (
    <div>
      <div className="table-controls">
        <span className="min-w-0 flex-1 basis-56">
          <label htmlFor="cmp-a" className="eyebrow block mb-1">Baseline</label>
          <select id="cmp-a" value={aId} onChange={(e) => setAId(e.target.value)}
            className="mono text-[length:var(--t-75)] border border-rule bg-paper px-2 py-1 w-full">
            {runs.map((r) => <option key={r.run_id} value={r.run_id}>{r.clause} · {r.label}</option>)}
          </select>
        </span>
        <span className="min-w-0 flex-1 basis-56">
          <label htmlFor="cmp-b" className="eyebrow block mb-1">Compared with</label>
          <select id="cmp-b" value={bId} onChange={(e) => setBId(e.target.value)}
            className="mono text-[length:var(--t-75)] border border-rule bg-paper px-2 py-1 w-full">
            {runs.map((r) => <option key={r.run_id} value={r.run_id}>{r.clause} · {r.label}</option>)}
          </select>
        </span>
      </div>

      <p className="eyebrow mt-6 mb-2">What differs in the configuration</p>
      {configDiff.length === 0 ? (
        <p className="mono text-[length:var(--t-75)] text-ink-muted">
          {aId === bId
            ? "Same run on both sides."
            : "No configuration key differs. Any metric difference is run-to-run variance, not a factor."}
        </p>
      ) : (
        <div className="bleed-scroll">
          <table className="w-full mono text-[length:var(--t-75)] border-collapse">
            <caption className="sr-only">Configuration keys that differ between the two runs</caption>
            <thead>
              <tr className="border-b border-rule">
                <th scope="col" className="text-left py-1 pr-4">key</th>
                <th scope="col" className="text-left py-1 pr-4">{a.clause}</th>
                <th scope="col" className="text-left py-1">{b.clause}</th>
              </tr>
            </thead>
            <tbody>
              {configDiff.map((d) => (
                <tr key={d.key} className="border-b border-rule">
                  <th scope="row" className="text-left font-normal py-1 pr-4 text-ink">{d.key}</th>
                  <td className="py-1 pr-4 text-ink-muted">{String(d.a ?? "—")}</td>
                  <td className="py-1 text-ink">{String(d.b ?? "—")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {configDiff.length > 1 ? (
        <p className="mono text-[length:var(--t-75)] text-regress mt-2">
          {configDiff.length} factors differ. A difference between these two runs
          cannot be attributed to any single one of them.
        </p>
      ) : null}

      <p className="eyebrow mt-6 mb-2">Metric deltas</p>
      <div className="bleed-scroll">
        <table className="w-full mono text-[length:var(--t-75)] border-collapse">
          <caption className="sr-only">
            Each metric for both runs, the delta, and whether the confidence intervals separate
          </caption>
          <thead>
            <tr className="border-b border-rule">
              <th scope="col" className="text-left py-1 pr-4">metric</th>
              <th scope="col" className="text-right py-1 pr-4">{a.clause}</th>
              <th scope="col" className="text-right py-1 pr-4">{b.clause}</th>
              <th scope="col" className="text-right py-1 pr-4">delta</th>
              <th scope="col" className="text-left py-1">95% CIs</th>
            </tr>
          </thead>
          <tbody>
            {metricRows.map((r) => {
              const fam = familyOf(r.key);
              const better = r.delta === null ? null
                : higherIsBetter(r.key) ? r.delta > 0 : r.delta < 0;
              return (
                <tr key={r.key} className="border-b border-rule align-baseline">
                  <th scope="row" className="text-left font-normal py-1 pr-4 text-ink">
                    {fam ? (
                      <span className="tag" style={{ color: FAMILY_HUE[fam] }}
                        title={TAG_LABEL[TAG_OF[fam]]}>{TAG_OF[fam]}</span>
                    ) : null}
                    {r.key}
                  </th>
                  <td className="text-right py-1 pr-4 tabular-nums text-ink-muted">
                    {r.ma ? fmt(r.key, r.ma.value) : "—"}
                  </td>
                  <td className="text-right py-1 pr-4 tabular-nums text-ink">
                    {r.mb ? fmt(r.key, r.mb.value) : "—"}
                  </td>
                  <td className={`text-right py-1 pr-4 tabular-nums ${
                    r.delta === null ? "" : better ? "text-signal" : "text-regress"}`}>
                    {r.delta === null ? "—"
                      : `${r.delta > 0 ? "+" : ""}${fmt(r.key, r.delta).replace("$", "$")}`}
                  </td>
                  <td className="py-1 text-ink-muted">
                    {r.separated === null ? "no interval published"
                      : r.separated ? "separated"
                      : "overlap — not separated"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mono text-[length:var(--t-75)] text-ink-muted mt-2 prose-measure">
        &ldquo;Separated&rdquo; means the two 95% intervals do not overlap. It is a
        conservative check, not a significance test, and a delta whose intervals
        overlap should be read as no measured difference.
      </p>
    </div>
  );
}
