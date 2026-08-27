import type { Findings } from "@/lib/findings";
import { rolesByBreadth } from "@/lib/findings";

/**
 * Recall by role, widest to narrowest, with the ef_search sweep beside it.
 *
 * A bar would be the obvious chart and it is the wrong one: the reader needs
 * to compare a role against the unrestricted baseline AND follow what happens
 * as the search widens, and a bar chart shows one of those. The table shows
 * both, and the inline rule under each recall figure gives the comparison a
 * bar would have provided without spending a second element on it.
 *
 * Server-rendered. Nothing here is interactive, so it costs no JavaScript and
 * survives with scripting off.
 */
export function RecallByRole({ data }: { data: Findings }) {
  const rows = rolesByBreadth(data);
  const baseline = rows[0][1].recall_at_10;

  return (
    <div className="bleed-scroll">
      <table className="w-full mono text-[length:var(--t-75)] border-collapse">
        <caption className="sr-only">
          Recall at 10 against exact search, by role and search width, with the
          count of queries returning nothing
        </caption>
        <thead>
          <tr className="border-b border-rule">
            <th scope="col" className="text-left py-2 pr-4">role</th>
            <th scope="col" className="text-right py-2 pr-3">tenants</th>
            <th scope="col" className="text-left py-2 pr-4">recall@10 vs exact</th>
            <th scope="col" className="text-right py-2 pr-3">empty</th>
            {data.ef_sweep.map((e) => (
              <th key={e} scope="col" className="text-right py-2 pr-3">ef {e}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(([role, r]) => {
            const sweep = data.sweep[role] ?? {};
            // Share of the unrestricted baseline, as a width. Not a percentage
            // of anything absolute — the comparison IS the point.
            const share = baseline > 0 ? r.recall_at_10 / baseline : 0;
            return (
              <tr key={role} className="border-b border-rule align-baseline">
                <th scope="row" className="text-left font-normal py-2 pr-4 text-ink">
                  {role}
                </th>
                <td className="text-right py-2 pr-3 tabular-nums text-ink-muted">
                  {r.tenants_visible}/{r.tenants_total}
                </td>
                <td className="py-2 pr-4">
                  <span className="tabular-nums text-ink">
                    {r.recall_at_10.toFixed(3)}
                  </span>
                  <span className="recall-bar" aria-hidden="true">
                    <span style={{ width: `${Math.max(2, share * 100)}%` }} />
                  </span>
                </td>
                <td className={`text-right py-2 pr-3 tabular-nums ${
                  r.empty_results ? "text-regress" : "text-ink-muted"}`}>
                  {r.empty_results}
                </td>
                {data.ef_sweep.map((e) => (
                  <td key={e} className="text-right py-2 pr-3 tabular-nums text-ink-muted">
                    {sweep[String(e)]?.recall_at_10.toFixed(3) ?? "—"}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mono text-[length:var(--t-75)] text-ink-muted mt-2">
        recall@10 against exact search under the identical policy ·
        &ldquo;empty&rdquo; = queries returning nothing at all, of{" "}
        {rows[0][1].queries} · ef columns are the same measure at each search width
      </p>
    </div>
  );
}
