import { Prose, MarginNote, Bleed } from "@/components/Paper";
import { Provenance } from "@/components/Provenance";
import { InProgress } from "@/components/InProgress";
import { dataset, datasetList } from "@/lib/interactive";
import { PostFilterDemo, type PostFilterData } from "@/components/demos/PostFilterDemo";
import { RetrievalWalkthrough, type WalkthroughData } from "@/components/demos/RetrievalWalkthrough";
import { ChunkingExplorer, type ChunkingData } from "@/components/demos/ChunkingExplorer";

export const metadata = {
  title: "Walkthroughs · Zeroth",
  description:
    "Step through the real behaviour of the retrieval pipeline: access control, ranking and fusion, and where a document gets cut.",
};

export default function ExplorePage() {
  const rls = dataset<PostFilterData>("rls/postfilter.json");
  const walk = datasetList("retrieval")
    .map((f) => dataset<WalkthroughData>(`retrieval/${f}`))
    .filter((x): x is NonNullable<typeof x> => !!x)
    .slice(0, 8);
  const chunking = ["edgar", "cuad", "rfc"]
    .map((s) => dataset<ChunkingData>(`chunking/${s}.json`))
    .filter((x): x is NonNullable<typeof x> => !!x);

  return (
    <>
      <p className="eyebrow">Section 5</p>
      <h1 className="mt-2">Walkthroughs</h1>

      <Prose className="mt-6">
        <p className="lede">
          The system&apos;s behaviour, not a description of it. Every control
          below moves over measurements taken on the real corpus.
        </p>
        <MarginNote label="No live backend">
          The site is a static export. Each demo replays state captured by
          running the real retriever offline and committing the result, so
          nothing here is simulated and nothing is a live query.
        </MarginNote>
        <p>
          The retrieval platform is Phase 2 and does not exist yet as a service.
          What does exist is the corpus, the embedder, a lexical index and a
          cross-encoder, so these captures were produced by running those over
          the committed corpus directly.
        </p>
      </Prose>

      {/* ---------------- 1. access control vs approximate search ---------- */}
      <h2 className="mt-14">5.1 What access control does to approximate search</h2>
      <Prose>
        <p>
          An approximate index returns its nearest neighbours by distance, and
          only then does the access policy discard the ones this role may not
          see. Nothing refills the discarded slots. Narrow the role and watch
          the result shrink.
        </p>
      </Prose>

      <Bleed className="mt-6">
        {rls ? (
          <>
            <PostFilterDemo data={rls} />
            <Provenance {...rls.generated_by}
              extra={`measured as ${rls.measured_as}`} />

            {/* Server-rendered, so the numbers survive with JavaScript off. */}
            <div className="bleed-scroll mt-6">
              <table className="w-full mono text-[length:var(--t-75)] border-collapse">
                <caption className="sr-only">
                  recall@10 by role and ef_search, with empty results in brackets
                </caption>
                <thead>
                  <tr className="border-b border-rule">
                    <th scope="col" className="text-left py-1 pr-4">role</th>
                    {rls.ef_sweep.map((e) => (
                      <th key={e} scope="col" className="text-right py-1 pr-4">ef {e}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(rls.sweep).map(([role, cells]) => (
                    <tr key={role} className="border-b border-rule">
                      <th scope="row" className="text-left font-normal py-1 pr-4">
                        {role} <span className="text-ink-muted">
                          {rls.roles[role]?.tenants_visible}/{rls.roles[role]?.tenants_total}
                        </span>
                      </th>
                      {rls.ef_sweep.map((e) => (
                        <td key={e} className="text-right py-1 pr-4 tabular-nums">
                          {cells[String(e)].recall_at_10.toFixed(3)}
                          <span className="text-ink-muted">
                            {" "}[{cells[String(e)].empty_results}]
                          </span>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mono text-[length:var(--t-75)] text-ink-muted mt-2">
                recall@10 against exact search under the identical policy · [n] = queries returning nothing
              </p>
            </div>
          </>
        ) : (
          <InProgress phase={2}>
            Recall under row-level security across roles and search widths,
            measured on the real corpus.
          </InProgress>
        )}
      </Bleed>

      {rls ? (
        <Prose className="mt-8">
          <h3>What this shows</h3>
          <ul className="list-disc pl-5 space-y-2">
            {rls.finding.holds.map((h) => <li key={h}>{h}</li>)}
          </ul>
          <h3>What it does not show</h3>
          <ul className="list-disc pl-5 space-y-2">
            {rls.finding.does_not_hold.map((h) => <li key={h}>{h}</li>)}
          </ul>
          <p className="text-ink-muted">{rls.finding.why_they_differ}</p>
          <p>{rls.finding.still_the_argument_for_partitioning}</p>
          <p className="mono text-[length:var(--t-75)] text-ink-muted">
            {rls.finding.reproducibility_note}
          </p>
        </Prose>
      ) : null}

      {/* ---------------- 2. retrieval walkthrough ------------------------- */}
      <h2 className="mt-16">5.2 How a query becomes a ranked list</h2>
      <Prose>
        <p>
          Four stages, each with its real output. The stage most people get
          wrong is fusion: reciprocal rank fusion combines the two lists by
          rank position, never by raw score, because BM25 scores and cosine
          similarities are not on comparable scales.
        </p>
      </Prose>
      <Bleed className="mt-6">
        {walk.length ? (
          <>
            <RetrievalWalkthrough queries={walk} />
            <Provenance {...walk[0].generated_by} />
          </>
        ) : (
          <InProgress phase={2}>
            Every retrieval stage for a real query, with the scores that
            produced each ordering.
          </InProgress>
        )}
      </Bleed>

      {/* ---------------- 3. chunking ------------------------------------- */}
      <h2 className="mt-16">5.3 Where a document gets cut</h2>
      <Prose>
        <p>
          Two strategies over the same document. What section-aware chunking
          actually guarantees is not that a chunk never starts mid-sentence —
          it splits long sections internally with the same overlap, so it often
          does — but that a chunk never spans two sections.
        </p>
      </Prose>
      <Bleed className="mt-6">
        {chunking.length ? (
          <>
            <ChunkingExplorer docs={chunking} />
            <Provenance {...chunking[0].generated_by} />
          </>
        ) : (
          <InProgress phase={1}>
            Both chunking strategies over one real document per source, with
            the boundaries drawn where they actually land.
          </InProgress>
        )}
      </Bleed>
    </>
  );
}
