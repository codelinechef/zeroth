import { DotLeader } from "@/components/DotLeader";

export const metadata = { title: "Methodology · Zeroth" };

/**
 * Metric definitions are authored content from the build specification, not
 * measurements. No figure appears on this page.
 */
const METRICS: [string, string][] = [
  ["Recall@5, Recall@10", "Proportion of queries where at least one chunk graded ≥2 appears in the top k."],
  ["MRR@10", "Mean reciprocal rank of the first relevant chunk."],
  ["NDCG@10", "Discounted cumulative gain over graded relevance, normalised against the ideal ranking."],
  ["Context precision", "Proportion of retrieved chunks that are actually relevant."],
  ["Faithfulness", "Proportion of generated claims entailed by the retrieved chunks. LLM judge against a published rubric."],
  ["Answer correctness", "Agreement with the reference answer. LLM judge, published rubric."],
  ["Answer relevance", "Whether the answer addresses the question asked."],
  ["Citation accuracy", "Proportion of citations resolving to a chunk that supports the cited claim. String containment first; LLM judge only on containment failure."],
  ["Citation coverage", "Proportion of factual claims carrying a citation."],
  ["Abstention (correct)", "Proportion of unanswerable queries correctly declined."],
  ["p50 / p95 / p99 latency", "End to end, retrieval through verification, over three repeats."],
  ["Cost per query", "Token counts times the rates in configs/pricing.yaml. Local models cost $0.00, stated openly."],
  ["Ingestion time", "Full and incremental, wall clock."],
];

export default function MethodologyPage() {
  return (
    <>
      <p className="eyebrow">Clause 2 · Methodology</p>
      <h1 className="mt-2 text-[length:var(--t-200)]">Methodology</h1>
      <hr className="rule my-8" />

      <h2 className="text-[length:var(--t-125)]">2.1 Metric definitions</h2>
      <p className="prose-spec mt-3">
        Each metric is implemented explicitly, without an evaluation framework.
        The scoring logic is the credibility of this project, so it is written
        to be read.
      </p>
      <dl className="mt-6 space-y-5">
        {METRICS.map(([name, def]) => (
          <div key={name}>
            <dt className="font-semibold">{name}</dt>
            <dd className="prose-spec mt-1 text-ink-muted">{def}</dd>
          </div>
        ))}
      </dl>

      <h2 className="mt-12 text-[length:var(--t-125)]">2.2 Confidence intervals</h2>
      <p className="prose-spec mt-3">
        Every quality metric carries a bootstrapped 95% confidence interval over
        1,000 resamples of the query set. A point estimate from a few hundred
        queries without an interval is not a result.
      </p>

      <h2 className="mt-12 text-[length:var(--t-125)]">2.3 One factor at a time</h2>
      <p className="prose-spec mt-3">
        Each published variant changes exactly one factor from the baseline
        configuration. This is deliberate: it makes every difference
        attributable to a single change rather than to a bundle of them.
      </p>

      <h2 className="mt-12 text-[length:var(--t-125)]">2.4 Known limitations</h2>
      <p className="prose-spec mt-3">
        Stated here by the author rather than discovered by readers. This
        section is filled in as each limitation is established by measurement.
        Two are already known from design work and are recorded now:
      </p>
      <ul className="prose-spec mt-4 list-disc space-y-3 pl-5">
        <li>
          <strong>The golden set is model-drafted and only partially
          human-verified.</strong> The agreement rate from the stratified
          verification sample will be published beside it. It is not
          hand-labelled and will not be described as such.
        </li>
        <li>
          <strong>The corpus has two document shapes from one publisher, not
          three independent sources.</strong> The 10-K filings and the CUAD
          contracts both originate from EDGAR; only the RFCs are independently
          published. CUAD contributes a distinct document shape, not source
          diversity, and duplicates between the two are removed and counted.
        </li>
        <li>
          <strong>Row-Level Security applies differently to the two retrieval
          paths.</strong> Lexical search filters before ranking and loses no
          recall. Vector search filters after approximate nearest-neighbour
          selection, so a restrictive role can lose candidates the exact search
          would have returned. The measured effect and the mitigation are
          documented in the repository.
        </li>
      </ul>

      <h2 className="mt-12 text-[length:var(--t-125)]">2.5 Verification status</h2>
      <div className="mt-4">
        <DotLeader label="Golden set agreement rate" value="—" />
        <DotLeader label="Queries in set" value="—" />
        <DotLeader label="Corpus version" value="—" />
      </div>
      <p className="mt-4 text-[length:var(--t-75)] text-ink-muted">
        Not yet measured. These publish when the golden set is built and
        verified.
      </p>
    </>
  );
}
