import type { RedTeam } from "@/lib/security";

const LABEL: Record<string, string> = {
  "policy-config": "Policy configuration",
  "cross-tenant": "Cross-tenant retrieval",
  "role-escalation": "Role escalation",
  "defence-in-depth": "Defence in depth",
  "prompt-injection": "Prompt injection",
  "citation-forgery": "Citation forgery",
  "abstention-bypass": "Abstention bypass",
};

/**
 * Red-team results, rendered from the file the suite emits.
 *
 * A 100% pass rate with no failures shown is the least believable thing this
 * project could publish, so the caveats are given the same weight as the
 * number and the mutation check is shown alongside — a suite that always
 * passes is indistinguishable from one that tests nothing.
 */
export function RedTeamResults({ data }: { data: RedTeam }) {
  const cats = Object.entries(data.by_category)
    .sort((a, b) => b[1].total - a[1].total);

  return (
    <div>
      <dl className="stat-row">
        <div>
          <dt className="eyebrow">Attacks attempted</dt>
          <dd>{data.total}</dd>
          <p className="stat-note">across {cats.length} categories</p>
        </div>
        <div>
          <dt className="eyebrow">Withstood</dt>
          <dd>{data.passed}</dd>
          <p className="stat-note">{data.rate.toFixed(1)}% · {data.elapsed_s}s</p>
        </div>
        <div>
          <dt className="eyebrow">Succeeded</dt>
          <dd className={data.failures.length ? "text-regress" : ""}>
            {data.failures.length}
          </dd>
          <p className="stat-note">
            {data.failures.length === 0
              ? "none in this suite"
              : "published below in full"}
          </p>
        </div>
      </dl>

      <div className="bleed-scroll mt-6">
        <table className="w-full mono text-[length:var(--t-75)] border-collapse">
          <caption className="sr-only">Attack categories and results</caption>
          <thead>
            <tr className="border-b border-rule">
              <th scope="col" className="text-left py-2 pr-4">category</th>
              <th scope="col" className="text-right py-2 pr-4">attempted</th>
              <th scope="col" className="text-right py-2 pr-4">withstood</th>
              <th scope="col" className="text-left py-2">result</th>
            </tr>
          </thead>
          <tbody>
            {cats.map(([cat, v]) => (
              <tr key={cat} className="border-b border-rule">
                <th scope="row" className="text-left font-normal py-2 pr-4 text-ink">
                  {LABEL[cat] ?? cat}
                </th>
                <td className="text-right py-2 pr-4 tabular-nums">{v.total}</td>
                <td className="text-right py-2 pr-4 tabular-nums">{v.passed}</td>
                <td className={`py-2 ${v.passed === v.total ? "text-ink-muted" : "text-regress"}`}>
                  {v.passed === v.total ? "all withstood" : `${v.total - v.passed} succeeded`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data.failures.length ? (
        <div className="mt-6">
          <p className="eyebrow mb-2">Attacks that succeeded</p>
          <ul className="practice-list">
            {data.failures.map((f) => (
              <li key={f.name} className="practice-row">
                <span>{f.name}</span>
                <span>{f.impact} — {f.detail}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <h3>Proof the suite can fail</h3>
      <p className="prose-measure">
        A suite that always passes is indistinguishable from one that tests
        nothing. Each silent-bypass path the policy was written to close is
        deliberately reintroduced, the suite re-run, and the policy restored.
      </p>
      <dl className="practice-list mt-3">
        {data.mutation_check.mutations.map((m) => (
          <div key={m.name} className="practice-row">
            <dt>{m.name}</dt>
            <dd className={m.detected ? "" : "text-regress"}>
              {m.detected ? "detected — the suite failed, as it must" : "NOT DETECTED"}
            </dd>
          </div>
        ))}
      </dl>
      <p className="mono text-[length:var(--t-75)] text-ink-muted mt-3 prose-measure">
        {data.mutation_check.note}
      </p>

      <h3>What this number does not mean</h3>
      <ul className="list-disc pl-5 space-y-2 prose-measure">
        {data.caveats.map((c) => <li key={c}>{c}</li>)}
      </ul>
    </div>
  );
}
