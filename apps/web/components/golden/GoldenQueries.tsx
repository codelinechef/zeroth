"use client";

import { useMemo, useState } from "react";
import type { QueryDetail } from "@/lib/golden";

/**
 * The query set, filterable and expandable.
 *
 * Twelve queries fit on a page, but the candidate judgments behind them do not
 * — 256 rows would bury the set itself. Each query therefore opens to show its
 * own judgments, and the filter exists so a reader can ask the question the
 * page is really for: "show me the ones a human has actually checked."
 */
export function GoldenQueries({ queries }: { queries: QueryDetail[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "verified" | "unanswerable">("all");

  const shown = useMemo(() => {
    if (filter === "verified") return queries.filter((q) => q.verifications.length > 0);
    if (filter === "unanswerable") return queries.filter((q) => !q.answerable);
    return queries;
  }, [queries, filter]);

  const FILTERS = [
    { key: "all", label: `All (${queries.length})` },
    { key: "verified", label: `Human-checked (${queries.filter((q) => q.verifications.length > 0).length})` },
    { key: "unanswerable", label: `Unanswerable (${queries.filter((q) => !q.answerable).length})` },
  ] as const;

  return (
    <div>
      <div className="table-controls">
        <span className="eyebrow" id="golden-filter">Show</span>
        <span role="group" aria-labelledby="golden-filter" className="facet">
          {FILTERS.map((f) => (
            <button key={f.key} type="button"
              aria-pressed={filter === f.key}
              onClick={() => { setFilter(f.key); setOpen(null); }}
              className="facet-option">
              {f.label}
            </button>
          ))}
        </span>
      </div>

      <ol className="golden-list">
        {shown.map((q) => {
          const isOpen = open === q.query_id;
          const disagreements = q.verifications.filter((v) => v.grade !== v.model_grade).length;
          return (
            <li key={q.query_id} className="golden-item">
              <button type="button" aria-expanded={isOpen}
                onClick={() => setOpen(isOpen ? null : q.query_id)}
                className="golden-head">
                <span className="golden-meta">
                  <span className="golden-cat">{q.category}</span>
                  {!q.answerable ? <span className="golden-flag">unanswerable</span> : null}
                  {q.verifications.length ? (
                    <span className={`golden-flag ${disagreements ? "is-warn" : "is-ok"}`}>
                      {q.verifications.length} checked
                      {disagreements ? ` · ${disagreements} disagreed` : " · all agreed"}
                    </span>
                  ) : (
                    <span className="golden-flag is-muted">not yet checked</span>
                  )}
                </span>
                <span className="golden-q">{q.question}</span>
              </button>

              {isOpen ? (
                <div className="golden-body">
                  <dl className="golden-facts">
                    <div><dt>Query id</dt><dd className="break-all">{q.query_id}</dd></div>
                    {q.tenant ? <div><dt>Tenant</dt><dd>{q.tenant}</dd></div> : null}
                    <div><dt>Drafted by</dt><dd>{q.drafted_by}</dd></div>
                    <div><dt>Candidates graded</dt><dd>{q.judgments.length}</dd></div>
                  </dl>

                  {q.answerable && q.answer ? (
                    <>
                      <p className="eyebrow mt-4 mb-1">Reference answer</p>
                      <p className="text-[length:var(--t-875)] prose-measure">{q.answer}</p>
                    </>
                  ) : null}
                  {!q.answerable && q.why_unanswerable ? (
                    <>
                      <p className="eyebrow mt-4 mb-1">Why it cannot be answered</p>
                      <p className="text-[length:var(--t-875)] prose-measure">{q.why_unanswerable}</p>
                      {q.nearest_miss ? (
                        <p className="mono text-[length:var(--t-75)] text-ink-muted mt-2 prose-measure">
                          Nearest miss: {q.nearest_miss}
                        </p>
                      ) : null}
                    </>
                  ) : null}

                  {q.verifications.length ? (
                    <>
                      <p className="eyebrow mt-5 mb-1.5">Human verification</p>
                      <div className="bleed-scroll">
                        <table className="w-full mono text-[length:var(--t-75)] border-collapse">
                          <caption className="sr-only">
                            Verified candidates for {q.query_id}: human grade against model grade
                          </caption>
                          <thead>
                            <tr className="border-b border-rule">
                              <th scope="col" className="text-left py-1 pr-4">chunk</th>
                              <th scope="col" className="text-right py-1 pr-3">model</th>
                              <th scope="col" className="text-right py-1 pr-3">human</th>
                              <th scope="col" className="text-left py-1">result</th>
                            </tr>
                          </thead>
                          <tbody>
                            {q.verifications.map((v) => {
                              const d = v.grade - v.model_grade;
                              return (
                                <tr key={v.chunk_id} className="border-b border-rule">
                                  <th scope="row" className="text-left font-normal py-1 pr-4 break-all text-ink">
                                    {v.chunk_id}
                                  </th>
                                  <td className="text-right py-1 pr-3 tabular-nums">{v.model_grade}</td>
                                  <td className="text-right py-1 pr-3 tabular-nums text-ink">{v.grade}</td>
                                  <td className={`py-1 ${d === 0 ? "text-ink-muted" : "text-regress"}`}>
                                    {d === 0 ? "agreed" : `${d > 0 ? "+" : ""}${d}`}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </>
                  ) : null}

                  <p className="eyebrow mt-5 mb-1.5">Graded candidates</p>
                  <ul className="golden-judgments">
                    {q.judgments.slice(0, 12).map((j) => (
                      <li key={j.chunk_id}>
                        <span className={`golden-grade g${j.grade}`}>{j.grade}</span>
                        <span>
                          <span className="mono break-all">{j.chunk_id}</span>
                          {j.is_source ? <span className="golden-flag is-ok">source</span> : null}
                          <span className="block text-ink-muted mt-0.5">{j.why}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                  {q.judgments.length > 12 ? (
                    <p className="mono text-[length:var(--t-75)] text-ink-muted mt-2">
                      Showing the 12 highest-graded of {q.judgments.length}.
                    </p>
                  ) : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
