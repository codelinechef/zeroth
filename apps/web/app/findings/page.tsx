import { SectionLabel } from "@/components/SectionLabel";
import { Subsection } from "@/components/Subsection";
import { Prose, MarginNote, Bleed } from "@/components/Paper";
import { Provenance } from "@/components/Provenance";
import { InProgress } from "@/components/InProgress";
import { Figure } from "@/components/Paper";
import { PostFilter } from "@/components/figures/PostFilter";
import { getFindings, rolesByBreadth } from "@/lib/findings";
import { RecallByRole } from "@/components/findings/RecallByRole";

export const metadata = {
  title: "Findings · Zeroth",
  description:
    "What access control costs approximate retrieval, measured against exact search under the identical policy on a 51,310-chunk corpus.",
};

export default function FindingsPage() {
  const f = getFindings();

  if (!f) {
    return (
      <>
        <SectionLabel href="/findings" />
        <h1 className="mt-2">Findings</h1>
        <div className="mt-8">
          <InProgress phase={2}>
            What access control costs approximate retrieval, measured across
            roles and search widths.
          </InProgress>
        </div>
      </>
    );
  }

  const byBreadth = rolesByBreadth(f);
  const widest = byBreadth[0];
  const narrowest = byBreadth[byBreadth.length - 1];
  const defaultEf = f.ef_sweep[0];
  const widestEf = f.ef_sweep[f.ef_sweep.length - 1];
  const narrowSweep = f.sweep[narrowest[0]];
  const plateau = narrowSweep?.[String(widestEf)]?.recall_at_10;

  return (
    <>
      <SectionLabel href="/findings" />
      <h1 className="mt-2">Findings</h1>

      <Prose className="mt-6">
        <p className="lede">
          Enforcing access control inside an approximate retrieval query costs
          recall in proportion to how restrictive the role is — and widening
          the search does not buy it back.
        </p>
        <MarginNote label="What kind of number this is">
          Recall here is measured against <strong>exact search under the
          identical policy</strong>, not against relevance judgments. It asks
          what the approximate index lost, not whether the answer was good, so
          it needs no golden set and inherits none of that set&apos;s problems.
        </MarginNote>
        <p>
          An approximate index returns its nearest neighbours by distance. Only
          then does the access policy discard the rows the querying role may not
          see, and nothing refills the discarded slots. The narrower the role,
          the more of its top-k is spent on rows it will never be shown.
        </p>
        <p>
          This is the one result on this site that does not wait on the golden
          set, because exact search is its own ground truth: run the same query
          without the approximation, under the same policy, and compare.
        </p>
      </Prose>

      {/* ---------------- the result ---------------- */}
      <Subsection href="/findings" n={1}>Recall falls with the breadth of the role</Subsection>
      <Prose>
        <p>
          Five roles over the same {widest[1].queries} queries and the same
          corpus, at the default search width of ef_search&nbsp;={defaultEf}.
          The only thing that changes between rows is how many of the{" "}
          {widest[1].tenants_total} tenants the role may read.
        </p>
      </Prose>

      <Bleed className="mt-6">
        <RecallByRole data={f} />
        <Provenance {...f.generated_by} extra={`measured as ${f.measured_as}`} />
      </Bleed>

      <Prose className="mt-8">
        <p>
          At the default width a role seeing all {widest[1].tenants_total}{" "}
          tenants recalls{" "}
          <strong>{widest[1].recall_at_10.toFixed(3)}</strong> of what exact
          search returns. A role seeing{" "}
          {narrowest[1].tenants_visible} recalls{" "}
          <strong>{narrowest[1].recall_at_10.toFixed(3)}</strong> — and returns
          nothing at all for{" "}
          <strong>{narrowest[1].empty_results} of {narrowest[1].queries}</strong>{" "}
          queries, on which exact search under the same policy returns a full
          result set. The rows exist and the role is entitled to them; the index
          simply never reached them.
        </p>
      </Prose>

      <Figure n={2} caption="Post-filtering under row-level security. The policy discards rows after the index has chosen them, and nothing refills the slots.">
        <div className="p-4"><PostFilter /></div>
      </Figure>

      {/* ---------------- widening ---------------- */}
      <Subsection href="/findings" n={2}>Widening the search plateaus below the ceiling</Subsection>
      <Prose>
        <p>
          The obvious mitigation is to search wider and let the policy discard
          more. It works, partially, and then stops: the narrowest role climbs
          from {narrowSweep?.[String(defaultEf)]?.recall_at_10.toFixed(3)} at
          ef_search&nbsp;={defaultEf} to {plateau?.toFixed(3)} at{" "}
          {widestEf} — a twentyfold increase in search width for a result that
          is still well short of the unrestricted figure, and paid for in
          latency on every query.
        </p>
      </Prose>

      <Prose className="mt-6">
        <h3>What this shows</h3>
        <ul className="list-disc pl-5 space-y-2">
          {f.finding.holds.map((h) => <li key={h}>{h}</li>)}
        </ul>
      </Prose>

      {/* ---------------- the failed replication ---------------- */}
      <Subsection href="/findings" n={3}>An earlier result that did not replicate</Subsection>
      <Prose>
        <MarginNote label="Why this is here">
          A finding that only ever reports its successes is not a finding. This
          one contradicts an earlier measurement by the same author, and the
          earlier one was wrong in an instructive way.
        </MarginNote>
        <ul className="list-disc pl-5 space-y-2">
          {f.finding.does_not_hold.map((h) => <li key={h}>{h}</li>)}
        </ul>
        <p>{f.finding.why_they_differ}</p>
        <p>
          The lesson generalises beyond this project: a synthetic corpus with
          cleanly separated tenants measures the worst case and reports it as
          the typical one. Real documents share vocabulary, boilerplate and
          structure, so the tenant regions of the embedding space overlap, and
          that overlap is what a wider search is able to exploit.
        </p>
      </Prose>

      {/* ---------------- implication ---------------- */}
      <Subsection href="/findings" n={4}>What follows from it</Subsection>
      <Prose>
        <p>{f.finding.still_the_argument_for_partitioning}</p>
        <h3>What this does not establish</h3>
        <ul className="list-disc pl-5 space-y-2">
          <li>
            <strong>That the answers were worse.</strong> This measures what the
            index lost against exact search, not answer quality. Whether a lost
            chunk mattered is a question for the golden set, and no such number
            is published yet.
          </li>
          <li>
            <strong>That the effect size transfers.</strong> It is a property of
            this corpus, this tenant assignment and this index configuration.
            A corpus whose tenants overlap more would lose less.
          </li>
          <li>
            <strong>That the figures are stable to three decimals.</strong>{" "}
            {f.finding.reproducibility_note}
          </li>
          <li>
            <strong>A confidence interval.</strong> {widest[1].queries} queries
            is too few for one worth publishing, which is why the shape of the
            result is stated and the third decimal is not.
          </li>
        </ul>
      </Prose>

      <Prose className="mt-8">
        <p className="mono text-[length:var(--t-75)] text-ink-muted">
          Index: {f.index.type} m={f.index.m}, ef_construction=
          {f.index.ef_construction}, built in {f.index.build_seconds}s ·
          top-k {f.k} · roles measured as {f.measured_as} ·
          regenerate with <code>python3 {f.code}</code>
        </p>
      </Prose>
    </>
  );
}
