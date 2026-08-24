import { Prose, MarginNote, Figure } from "@/components/Paper";
import { Metric } from "@/components/Metric";
import { metricsByFamily, FAMILY_LABEL } from "@/lib/metrics";
import { Chunking } from "@/components/figures/Chunking";
import { VerificationChain } from "@/components/figures/VerificationChain";
import { MetricGraph } from "@/components/figures/MetricGraph";

export const metadata = { title: "Methodology · Zeroth" };

export default function MethodologyPage() {
  const families = metricsByFamily();

  return (
    <>
      <p className="eyebrow">Section 2</p>
      <h1 className="mt-2">Methodology</h1>

      <Prose className="mt-6">
        <p className="lede">
          How each number is produced, what it depends on, and where it can go
          wrong.
        </p>
        <MarginNote label="Reading a metric">
          Every metric name on this site opens. Hover or focus for a
          definition; activate it for the formula, the failure modes that
          threaten it, and the function that computes it.
        </MarginNote>
        <p>
          Metrics are implemented explicitly rather than through an evaluation
          framework. The scoring logic is the credibility of the project, so it
          is written to be read. Start with{" "}
          <Metric id="recall_at_10" /> or <Metric id="faithfulness" />.
        </p>
      </Prose>

      <h2 className="mt-14">2.1 Metrics</h2>
      <Prose>
        <p>
          Grouped by family. The three-letter tag before each name is the
          family; the colour reinforces it but never carries it alone.
        </p>
      </Prose>

      <div className="mt-6 space-y-8">
        {families.map(([family, metrics]) =>
          metrics.length ? (
            <section key={family}>
              <h3 className="eyebrow">{FAMILY_LABEL[family]}</h3>
              <ul className="mt-2 space-y-2 prose-measure">
                {metrics.map((m) => (
                  <li key={m.id}>
                    <Metric id={m.id} />
                    <span className="text-ink-muted"> — {m.one_line}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null
        )}
      </div>

      <Figure n={8} caption="Retrieval quality feeds grounding and abstention, so a retrieval failure moves numbers in components that are not themselves at fault.">
        <div className="p-4"><MetricGraph /></div>
      </Figure>

      <h2 className="mt-14">2.2 Confidence intervals</h2>
      <Prose>
        <p>
          Every quality metric carries a bootstrapped 95% confidence interval
          over 1,000 resamples of the query set. A point estimate over a few
          hundred queries without an interval is the first thing a reviewer
          attacks, and rightly.
        </p>
      </Prose>

      <h2 className="mt-14">2.3 One factor at a time</h2>
      <Prose>
        <p>
          Each published variant changes exactly one factor from the baseline,
          so every difference is attributable to a single change rather than to
          a bundle of them.
        </p>
      </Prose>

      <h2 className="mt-14">2.4 Chunking</h2>
      <Prose>
        <p>
          Two strategies behind one interface, so the comparison is a run
          variable rather than a rewrite. Both preserve page and section
          provenance, which is what lets a citation resolve to a location a
          reader can check.
        </p>
      </Prose>
      <Figure n={6} caption="The same document under both strategies. Fixed windows overlap and cut across boundaries; section-aware packing never crosses one.">
        <div className="p-4"><Chunking /></div>
      </Figure>

      <h2 className="mt-14">2.5 How the golden set is built</h2>
      <Prose>
        <p>
          The query set is model-drafted and partially human-verified. It is not
          hand-labelled and is not described as such. A stratified quarter of it
          — 25% of each category independently, not a random draw — is graded by
          hand, and the agreement rate between the model judgments and those
          human grades is published.
        </p>
        <MarginNote label="Why stratified">
          A random sample of the same size can leave a small category with a
          single query in it, and the agreement rate is reported per category.
        </MarginNote>
      </Prose>
      <Figure n={5} caption="The judge never sees which passages a query was drafted from. Only the question and the passage text cross that line.">
        <div className="p-4"><VerificationChain /></div>
      </Figure>

      <h2 className="mt-14">2.6 Known limitations</h2>
      <Prose>
        <p>
          Stated here rather than discovered by readers. Each is added as it is
          established by measurement.
        </p>
        <ul className="list-disc pl-5 space-y-3">
          <li>
            <strong>The golden set is model-drafted and only partially
            human-verified.</strong> The agreement rate is published beside it.
          </li>
          <li>
            <strong>Access control applies differently to the two retrieval
            paths.</strong> Lexical search filters before ranking and loses no
            recall. Vector search filters after approximate selection, so a
            restrictive role can lose candidates exact search would have
            returned. Measured, and reported separately from headline numbers.
          </li>
          <li>
            <strong>CUAD tenants are contract type, not counterparty.</strong>{" "}
            The 510 contracts come from 463 distinct filers, so per-counterparty
            tenants would hold about 1.1 documents each and isolation could not
            be tested meaningfully. Contract type is bounded, deterministic from
            the source, and semantically coherent, so contracts sharing a tenant
            genuinely resemble each other. Tenants below a chunk floor are
            folded into a semantic sibling for the same reason, and every
            document records both its final tenant and the unmerged original.
          </li>
          <li>
            <strong>Two document shapes from one publisher, not three
            independent sources.</strong> CUAD contracts are themselves drawn
            from EDGAR, so they are a different shape from the same publisher.
            Deduplication against the filing set is mandatory rather than
            optional.
          </li>
        </ul>
      </Prose>
    </>
  );
}
