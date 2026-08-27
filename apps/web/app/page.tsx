import { getRuns } from "@/lib/content";
import { ResultsTable } from "@/components/ResultsTable";
import { Prose, MarginNote, Bleed, Figure } from "@/components/Paper";
import { Pipeline } from "@/components/figures/Pipeline";
import { CorpusComposition } from "@/components/figures/CorpusComposition";
import { InProgress } from "@/components/InProgress";
import { Metric } from "@/components/Metric";
import { NthLabs, Zeroth } from "@/components/Wordmark";
import { MarkRanked } from "@/components/Logo";
import { Abbr } from "@/components/Abbr";

export default function BoardPage() {
  const runs = getRuns();

  return (
    <>
      <header>
        {/* Endorsed brand architecture, not a co-brand.
            
            The pattern every AI lab converges on: the PROJECT name stands
            alone and the parent appears as a small, separate endorsement.
            AlphaFold is not "AlphaFold by Google DeepMind" in its own header;
            Claude is not "Claude by Anthropic". Putting the parent inside the
            lockup makes the project look like a division rather than a work.
            
            So the mark locks up with Zeroth, and NthLabs sits beneath as an
            endorsement line at caption size. The earlier arrangement had it
            backwards — NthLabs was the masthead and the paper title came
            second, which read as a company page that happened to contain a
            benchmark. */}
        <div className="masthead">
          <p className="masthead-lockup">
            <MarkRanked size={40} className="masthead-mark" />
            <span className="display"><Zeroth /></span>
          </p>
          <p className="masthead-endorse">
            a research project by <NthLabs className="is-endorsement" />
          </p>
        </div>
        <p className="mt-4 text-[length:var(--t-125)] text-ink-muted prose-measure">
          A reproducible benchmark of end-to-end <Abbr id="rag" expand /> pipeline
          quality, measured on a public corpus.
        </p>
        <hr className="rule mt-8 mb-3 max-w-[var(--measure)]" />
        <p className="mono text-[length:var(--t-75)] text-ink-muted">
          Anant Sharma · 2026
        </p>
      </header>

      <Prose className="mt-14">
        <h2 id="abstract">Abstract</h2>
        <MarginNote label="Scope">
          Retrieval metrics describe a corpus and a query set, not an
          architecture. Numbers here apply only to the corpus named beside them.
        </MarginNote>
        <p>
          Zeroth is an open reconstruction of a production confidential-document
          retrieval platform, rebuilt from scratch over public documents so the
          design can be inspected and argued with. Every number published here
          was measured on the corpus described in the methodology, and applies
          only to it.
        </p>
        <p>
          The benchmark measures a full pipeline rather than a retriever in
          isolation: hybrid retrieval, cross-encoder reranking, constrained
          generation, citation resolution, quote verification, and abstention.
          Access control is enforced inside the retrieval query itself, and its
          effect on measured recall is reported separately rather than folded
          into headline numbers.
        </p>
      </Prose>

      <Figure n={1} caption="The pipeline under measurement. Solid stages are implemented; dashed stages are planned, marked with the phase that delivers them.">
        <div className="p-4"><Pipeline /></div>
      </Figure>

      <Prose className="mt-12">
        <h2>What is measured</h2>
        <MarginNote label="Open any metric">
          Hover or focus a metric name for a one-line definition; activate it
          for the formula, a worked example, and the failure modes that
          threaten it.
        </MarginNote>
        <p>
          Retrieval quality by <Metric id="recall_at_10" /> and{" "}
          <Metric id="ndcg_at_10" />; grounding by <Metric id="faithfulness" />{" "}
          and <Metric id="citation_accuracy" />; and{" "}
          <Metric id="abstention_correct" />, which is the one most benchmarks
          leave out — whether the system declines when the evidence is not
          there.
        </p>
      </Prose>

      <Figure n={7} caption="Corpus composition, read from the committed manifest rather than hardcoded.">
        <div className="p-4"><CorpusComposition /></div>
      </Figure>

      <Bleed className="mt-14">
        <h2 className="mb-4">Results</h2>
        {runs.length === 0 ? (
          <InProgress phase={5} blockedBy="the security suite (Phase 3) and the evaluation harness (Phase 4)">
            Nine configurations, each differing from the baseline by exactly one
            factor, so every difference is attributable to a single change.
          </InProgress>
        ) : (
          <div className="bleed-scroll"><ResultsTable runs={runs} /></div>
        )}
      </Bleed>
    </>
  );
}
