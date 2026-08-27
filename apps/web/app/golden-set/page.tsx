import { SectionLabel } from "@/components/SectionLabel";
import { Subsection } from "@/components/Subsection";
import { Prose, MarginNote, Bleed } from "@/components/Paper";
import { InProgress } from "@/components/InProgress";
import { GoldenQueries } from "@/components/golden/GoldenQueries";
import { goldenSummary, queryDetails, getConsistency, RUBRIC } from "@/lib/golden";
import { Provenance } from "@/components/Provenance";

export const metadata = {
  title: "Golden set · Zeroth",
  description:
    "The query set every metric is computed against — its queries, its relevance judgments, and how often a human disagreed with the model that produced them.",
};

export default function GoldenSetPage() {
  const s = goldenSummary();
  const queries = queryDetails();
  const consistency = getConsistency();

  if (!s) {
    return (
      <>
        <SectionLabel href="/golden-set" />
        <h1 className="mt-2">Golden set</h1>
        <div className="mt-8">
          <InProgress phase={1}>
            The query set, its relevance judgments, and the human verification
            sample.
          </InProgress>
        </div>
      </>
    );
  }

  const agreementPct = (100 * s.agreements) / s.verified;
  const humanHigher = s.deltas
    .filter((d) => d.delta > 0)
    .reduce((a, b) => a + b.count, 0);
  const humanLower = s.deltas
    .filter((d) => d.delta < 0)
    .reduce((a, b) => a + b.count, 0);
  const judgedPct = (100 * s.verified) / s.judgments;

  return (
    <>
      <SectionLabel href="/golden-set" />
      <h1 className="mt-2">Golden set</h1>

      <Prose className="mt-6">
        <p className="lede">
          Every retrieval number on this site is computed against this query
          set. Publishing it is the only way a reader can judge whether those
          numbers mean anything.
        </p>
        <MarginNote label="Why this page exists">
          Benchmarks are usually reported without their query set, which makes
          the scores unfalsifiable. The set below is small and unfinished, and
          both of those facts are visible here rather than described.
        </MarginNote>
        <p>
          A golden set is a list of questions, the passages that actually answer
          them, and a relevance grade for every candidate a retriever might
          return. Recall, NDCG and MRR are all defined against those grades — a
          flawed golden set does not produce a slightly wrong score, it produces
          a confidently wrong one.
        </p>
      </Prose>

      {/* ---------------- state of the set ---------------- */}
      <Subsection href="/golden-set" n={1}>State of the set</Subsection>
      <Bleed className="mt-4">
        <dl className="stat-row">
          <div>
            <dt className="eyebrow">Queries</dt>
            <dd>{s.queries}</dd>
            <p className="stat-note">
              {s.answerable} answerable · {s.unanswerable} deliberately not
            </p>
          </div>
          <div>
            <dt className="eyebrow">Relevance judgments</dt>
            <dd>{s.judgments}</dd>
            <p className="stat-note">one per candidate chunk considered</p>
          </div>
          <div>
            <dt className="eyebrow">Human-verified</dt>
            <dd>{s.verified}</dd>
            <p className="stat-note">
              {judgedPct.toFixed(0)}% of judgments, across{" "}
              {s.queriesWithVerification} of {s.queries} queries
            </p>
          </div>
        </dl>
      </Bleed>

      <Prose className="mt-8">
        <p>
          The set was drafted by {s.draftedBy.join(", ")} and graded by{" "}
          {s.judgedBy.join(", ")}, both pinned to dated snapshots. Nothing here
          is hand-written by the author except the verification grades, which is
          precisely the part that matters.
        </p>
      </Prose>

      {/* ---------------- the finding ---------------- */}
      <Subsection href="/golden-set" n={2}>Where the human and the model disagree</Subsection>
      <Prose>
        <MarginNote label="Read this before any score">
          No retrieval metric is published on this site yet. This is the reason.
        </MarginNote>
        <p>
          Verification presents a stratified 25% sample by category, showing the
          eight highest-graded candidates for each sampled query, and the author
          re-grades them against the same rubric the model was given. Of{" "}
          <strong>{s.verified}</strong> judgments checked so far, the human and
          the model agreed on <strong>{s.agreements}</strong> —{" "}
          <strong>{agreementPct.toFixed(0)}%</strong>.
        </p>
      </Prose>

      <Bleed className="mt-6 bleed-scroll">
        <table className="w-full mono text-[length:var(--t-75)] border-collapse">
          <caption className="sr-only">
            Distribution of human grade minus model grade over verified judgments
          </caption>
          <thead>
            <tr className="border-b border-rule">
              <th scope="col" className="text-left py-2 pr-4">human − model</th>
              <th scope="col" className="text-right py-2 pr-4">judgments</th>
              <th scope="col" className="text-left py-2">meaning</th>
            </tr>
          </thead>
          <tbody>
            {s.deltas.map((d) => (
              <tr key={d.delta} className="border-b border-rule">
                <th scope="row" className="text-left font-normal py-2 pr-4 tabular-nums text-ink">
                  {d.delta > 0 ? `+${d.delta}` : d.delta}
                </th>
                <td className="text-right py-2 pr-4 tabular-nums">{d.count}</td>
                <td className="py-2 text-ink-muted">
                  {d.delta === 0
                    ? "agreed"
                    : d.delta > 0
                      ? `human graded ${d.delta} step${d.delta > 1 ? "s" : ""} higher — the model called it less relevant than it was`
                      : `human graded ${-d.delta} step${d.delta < -1 ? "s" : ""} lower`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Bleed>

      <Prose className="mt-6">
        <p>
          Every disagreement runs one way. In {humanHigher} of{" "}
          {s.verified} checked judgments the human graded the chunk{" "}
          <em>higher</em> than the model did
          {humanLower === 0 ? ", and in none did the human grade it lower" : `, and in ${humanLower} lower`}.
          The pattern is strongest on chunks the model had scored as irrelevant.
        </p>
        <h3>What this does not establish</h3>
        <ul className="list-disc pl-5 space-y-2">
          <li>
            <strong>Which grade is correct.</strong> One annotator disagreeing
            with one model is a disagreement, not a correction. Neither side is
            ground truth here.
          </li>
          <li>
            <strong>That the pattern holds.</strong> {s.verified} judgments
            across {s.queriesWithVerification} of {s.queries} queries is a small
            sample, and verification is still in progress.
          </li>
          <li>
            <strong>An independent second opinion.</strong> Verification is not
            blind — <span className="mono">harness/golden/verify.py</span> prints
            the model&apos;s grade and its stated reason before asking for the
            human&apos;s. Anchoring is possible in either direction, and a blind
            pass would be a stronger instrument.
          </li>
          <li>
            <strong>A published error rate.</strong> No retrieval score has been
            computed from this set, so nothing on this site is currently affected
            by it. That is the point of checking first.
          </li>
        </ul>
        <p>
          What it does establish is that this set is not yet fit to compute a
          published metric from, and that a run shipped today would have
          inherited the disagreement silently.
        </p>
      </Prose>

      {/* ---------------- internal contradictions ---------------- */}
      {consistency && consistency.issues.length ? (
        <>
          <Subsection href="/golden-set" n={3}>Contradictions inside the set</Subsection>
          <Prose>
            <MarginNote label="Found by hand-checking">
              These surfaced while checking the first baseline run query by
              query, not from a test that was looking for them.
            </MarginNote>
            <p>
              The disagreement above counts how often the human and the model
              differ. It does not say which is right. Checking the set against
              itself does say something: these are statements the golden set
              makes that cannot all be true at once, whoever made them.
            </p>
            <p>
              The clearest is the unanswerable query. It is marked as having no
              answer in the corpus, and eight of its chunks carry a human grade
              of 3 — <em>fully answers the question on its own</em>. If a chunk
              fully answers it, the query is answerable. One of those two
              statements is wrong, and the model&apos;s stated reasoning on
              those same chunks (&ldquo;lacks a specific timeframe&rdquo;) reads
              as the correct one.
            </p>
            <p>
              That matters for how the disagreement figure above should be read.
              It was tempting to conclude the judge under-grades. On at least
              this query the judge looks right and the verification looks wrong,
              so the 28 disagreements are not all the same kind of thing.
            </p>
          </Prose>
          <dl className="practice-list mt-4">
            {consistency.issues.map((i, n) => (
              <div key={`${i.kind}-${n}`} className="practice-row">
                <dt>{i.kind}</dt>
                <dd>
                  <span className="mono text-ink">{i.where}</span>
                  <span className="block mt-1">{i.detail}</span>
                </dd>
              </div>
            ))}
          </dl>
          <Provenance {...consistency.generated_by} />
          <Prose className="mt-6">
            <p>
              No retrieval metric is published anywhere on this site, and this
              is the second reason. The first is the sample size; this is the
              set disagreeing with itself. Both are fixable, and neither is
              fixed by publishing a number and adding a footnote.
            </p>
          </Prose>
        </>
      ) : null}

      {/* ---------------- rubric and grades ---------------- */}
      <Subsection href="/golden-set" n={4}>The rubric</Subsection>
      <Prose>
        <p>
          The same four grades are given to the model and to the human verifier.
        </p>
      </Prose>
      <dl className="rubric mt-4">
        {RUBRIC.map((r) => {
          const d = s.gradeDistribution.find((g) => g.grade === r.grade);
          return (
            <div key={r.grade} className="rubric-row">
              <dt>{r.grade}</dt>
              <dd>
                {r.meaning}
                <span className="rubric-count">
                  {d?.count ?? 0} of {s.judgments} judgments
                </span>
              </dd>
            </div>
          );
        })}
      </dl>
      <p className="mono text-[length:var(--t-75)] text-ink-muted mt-3 prose-measure">
        {s.gradeDistribution.find((g) => g.grade === 0)?.count} of {s.judgments}{" "}
        candidates were graded not relevant. A retrieval candidate pool is mostly
        misses by construction; that is what makes the few positives worth
        checking.
      </p>

      {/* ---------------- categories ---------------- */}
      <Subsection href="/golden-set" n={5}>Query categories</Subsection>
      <Prose>
        <p>
          Categories are not decoration — the set is sampled and the agreement
          rate reported per category, so a category that is thin is visible
          rather than averaged away.
        </p>
      </Prose>
      <dl className="rubric mt-4">
        {s.categories.map((c) => (
          <div key={c.name} className="rubric-row">
            <dt>{c.queries}</dt>
            <dd>{c.name}</dd>
          </div>
        ))}
      </dl>

      {/* ---------------- the queries themselves ---------------- */}
      <Subsection href="/golden-set" n={6}>Every query</Subsection>
      <Prose>
        <p>
          The full set, with each query&apos;s candidate grades and the
          verification result where one exists.
        </p>
      </Prose>
      <Bleed className="mt-6">
        <GoldenQueries queries={queries} />
      </Bleed>
    </>
  );
}
