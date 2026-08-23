import { DotLeader } from "./DotLeader";
import type { Run } from "@/lib/content";

/**
 * The signature element — brief §7. An expanded run renders as a normative
 * clause, the way a standards document states a requirement.
 */

const METRIC_LABELS: Record<string, string> = {
  recall_at_5: "Recall@5",
  recall_at_10: "Recall@10",
  mrr_at_10: "MRR@10",
  ndcg_at_10: "NDCG@10",
  context_precision: "Context precision",
  faithfulness: "Faithfulness",
  answer_correctness: "Answer correctness",
  answer_relevance: "Answer relevance",
  citation_accuracy: "Citation accuracy",
  citation_coverage: "Citation coverage",
  abstention_correct: "Abstention (correct)",
  latency_p50_s: "p50 latency",
  latency_p95_s: "p95 latency",
  latency_p99_s: "p99 latency",
  cost_per_query_usd: "Cost per query",
};

function format(name: string, value: number): string {
  if (name.startsWith("cost")) return `$${value.toFixed(4)}`;
  if (name.startsWith("latency")) return `${value.toFixed(2)} s`;
  return value.toFixed(3);
}

export function ClauseBlock({ run, baseline }: { run: Run; baseline?: Run }) {
  return (
    <section className="py-6" aria-labelledby={`clause-${run.clause}`}>
      <h3 id={`clause-${run.clause}`} className="text-[length:var(--t-125)]">
        <span className="tabular-nums">{run.clause}.</span>{" "}
        {run.label}
      </h3>

      {run.notes ? (
        <p className="prose-spec mt-3 ml-6 text-ink-muted">{run.notes}</p>
      ) : null}

      <div className="mt-5 ml-6">
        {Object.entries(run.metrics).map(([name, m]) => {
          const base = baseline?.metrics[name];
          const delta =
            base && base.value !== m.value
              ? (m.value - base.value >= 0 ? "+" : "") +
                (m.value - base.value).toFixed(3)
              : undefined;
          return (
            <DotLeader
              key={name}
              label={METRIC_LABELS[name] ?? name}
              value={format(name, m.value)}
              delta={delta}
            />
          );
        })}
      </div>

      {/* Every figure carries the corpus it was measured on — §3.4 */}
      <p className="mt-5 ml-6 text-[length:var(--t-75)] text-ink-muted">
        Corpus {run.corpus.id} · {run.queries.total} queries · commit{" "}
        {run.commit} · {run.run_date}
      </p>
    </section>
  );
}
