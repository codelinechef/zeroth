import { SectionLabel } from "@/components/SectionLabel";
import { Prose, MarginNote, Figure } from "@/components/Paper";
import { getFailureModes, STATUS_LABEL } from "@/lib/failureModes";
import { PostFilter } from "@/components/figures/PostFilter";
import { Partitioned } from "@/components/figures/Partitioned";
import { PlannerFlip } from "@/components/figures/PlannerFlip";
import { VerificationChain } from "@/components/figures/VerificationChain";

export const metadata = { title: "Failure modes · Zeroth" };

const FIGURES: Record<number, { el: React.ReactNode; caption: string }> = {
  2: { el: <PostFilter />, caption: "Approximate search returns its nearest neighbours, the access policy removes what this role may not see, and nothing refills the gap. Step through it." },
  3: { el: <Partitioned />, caption: "One index over every tenant versus one index per tenant. Partitioning changes what the index contains, not who may read it." },
  4: { el: <PlannerFlip />, caption: "The same query, planned two ways, producing two different recall numbers with no error in between." },
  5: { el: <VerificationChain />, caption: "The judge never sees which passages a query was drafted from. Only the question and the passage text cross that line." },
};

export default function FailureModesPage() {
  const modes = getFailureModes();
  const observed = modes.filter((m) => m.status === "observed").length;

  return (
    <>
      <SectionLabel href="/failure-modes" />
      <h1 className="mt-2">Failure modes</h1>

      <Prose className="mt-6">
        <p className="lede">
          Ways a retrieval benchmark silently produces the wrong number, what
          each one corrupts, and how this project detects or prevents it.
        </p>
        <MarginNote label="Why this page exists">
          Almost no benchmark publishes this. The unifying property of every
          entry below is that nothing throws an error.
        </MarginNote>
        <p>
          {observed} of these were hit in the course of building this project
          and are marked as such. The rest are designed out, and the entry says
          how. The distinction matters: a list that presents prevented risks and
          observed bugs identically overstates what was actually found.
        </p>
        <p>
          None of them announce themselves. Each one produces output that
          parses, counts that look plausible, and a run that completes
          successfully.
        </p>
      </Prose>

      <div className="mt-14 space-y-16">
        {modes.map((m) => (
          <section key={m.id} id={m.id} className="scroll-mt-8">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h2 className="!mt-0 !mb-0">{m.title}</h2>
              <span className="eyebrow">{STATUS_LABEL[m.status]}</span>
            </div>

            <Prose className="mt-4">
              <p>{m.what}</p>

              <h3>Why it is invisible</h3>
              <p>{m.why_invisible}</p>

              <h3>What it corrupts</h3>
              <ul className="mono text-[length:var(--t-75)] space-y-0.5">
                {m.corrupts.map((c) => <li key={c}>{c}</li>)}
              </ul>

              <h3>How this project handles it</h3>
              <p>{m.detection}</p>

              {m.evidence ? (
                <>
                  <h3>Evidence</h3>
                  <p className="text-ink-muted">{m.evidence}</p>
                </>
              ) : null}
            </Prose>

            {m.figure && FIGURES[m.figure] ? (
              <Figure n={m.figure} caption={FIGURES[m.figure].caption}>
                <div className="p-4">{FIGURES[m.figure].el}</div>
              </Figure>
            ) : null}
          </section>
        ))}
      </div>
    </>
  );
}
