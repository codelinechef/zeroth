import { getMetric, getWorkedExample, FAMILY_LABEL } from "@/lib/metrics";
import { MetricRef } from "./MetricRef";

/**
 * Server wrapper: reads the metric definition and the worked-example state at
 * build time, renders the Level 3 panel, and hands both to the client trigger.
 * Explanation content lives in content/metrics/*.json, never in this file.
 */
export function Metric({ id, children }: { id: string; children?: React.ReactNode }) {
  const m = getMetric(id);
  if (!m) throw new Error(`Unknown metric "${id}" — no content/metrics/${id}.json`);
  const example = getWorkedExample();

  const panel = (
    <div className="mt-5 space-y-6 text-[length:var(--t-875)]">
      <section>
        <h3 className="eyebrow">What it measures</h3>
        <p className="mt-1">{m.one_line}</p>
      </section>

      <section>
        <h3 className="eyebrow">Formula</h3>
        <pre className="mono mt-1 whitespace-pre-wrap text-[length:var(--t-75)] border border-rule p-3 overflow-x-auto">
{m.formula.notation}
        </pre>
        <dl className="mt-2 space-y-1">
          {m.formula.terms.map((t) => (
            <div key={t.symbol} className="flex gap-2">
              <dt className="mono text-[length:var(--t-75)] shrink-0">{t.symbol}</dt>
              <dd className="text-ink-muted text-[length:var(--t-75)]">{t.meaning}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-2 text-[length:var(--t-75)] text-ink-muted">{m.range.note}</p>
      </section>

      <section>
        <h3 className="eyebrow">Worked example</h3>
        {example.state === "available" ? (
          <div className="mt-1">
            <p className="text-[length:var(--t-75)] text-ink-muted">
              From the golden set, {example.category}, query{" "}
              <span className="mono">{example.query_id}</span> —{" "}
              {example.verified} human-verified judgments.
            </p>
            <p className="mt-2">{example.question}</p>
            <ul className="mono text-[length:var(--t-75)] mt-2 space-y-0.5">
              {example.candidates.slice(0, 6).map((c) => (
                <li key={c.chunk_id} className="flex gap-3">
                  <span className="tabular-nums">grade {c.grade}</span>
                  <span className="text-ink-muted truncate">{c.chunk_id}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="mt-1 text-ink-muted">{example.reason}</p>
        )}
      </section>

      <section>
        <h3 className="eyebrow">Confidence interval</h3>
        {m.ci ? (
          <p className="mt-1">
            {m.ci.level * 100}% interval by {m.ci.method} resampling over{" "}
            {m.ci.resamples.toLocaleString()} resamples of the query set. {m.ci.why}
          </p>
        ) : (
          <p className="mt-1 text-ink-muted">
            Reported as a point estimate. This is a measured quantity of the run
            rather than a sample statistic over queries.
          </p>
        )}
      </section>

      <section>
        <h3 className="eyebrow">How this project computes it</h3>
        <p className="mono mt-1 text-[length:var(--t-75)]">
          {m.computed_by.file} · {m.computed_by.symbol}()
        </p>
        <p className="mt-1 text-[length:var(--t-75)] text-ink-muted">
          Arrives in Phase {m.computed_by.phase}.
        </p>
      </section>

      {m.failure_modes.length ? (
        <section>
          <h3 className="eyebrow">What can go wrong</h3>
          <ul className="mt-1 space-y-1">
            {m.failure_modes.map((f) => (
              <li key={f}>
                <a href={`/failure-modes#${f}`} className="text-[length:var(--t-875)]">
                  {f.replace(/-/g, " ")}
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section>
        <h3 className="eyebrow">Related — {FAMILY_LABEL[m.family]} family</h3>
        <p className="mono mt-1 text-[length:var(--t-75)] text-ink-muted">
          {m.related.join(" · ")}
        </p>
      </section>
    </div>
  );

  return <MetricRef metric={m} panel={panel}>{children}</MetricRef>;
}
