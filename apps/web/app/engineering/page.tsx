import { SectionLabel } from "@/components/SectionLabel";
import { Subsection } from "@/components/Subsection";
import { Prose, MarginNote, Bleed } from "@/components/Paper";
import { InProgress } from "@/components/InProgress";
import { getEngineering } from "@/lib/engineering";

export const metadata = {
  title: "Engineering · Zeroth",
  description:
    "The engineering substrate behind the benchmark: the measured decisions, the evaluation apparatus, the guardrails, and the pinned stack it all runs on.",
};

export default function EngineeringPage() {
  const e = getEngineering();

  if (!e) {
    return (
      <>
        <SectionLabel href="/engineering" />
        <h1 className="mt-2">Engineering</h1>
        <div className="mt-8">
          <InProgress phase={2}>
            The measured decisions behind the pipeline, and the parameters they
            produced.
          </InProgress>
        </div>
      </>
    );
  }

  const measured = e.decisions.filter((d) => d.measured).length;

  return (
    <>
      <SectionLabel href="/engineering" />
      <h1 className="mt-2">Engineering</h1>

      <Prose className="mt-6">
        <p className="lede">
          A benchmark is only as trustworthy as the system underneath it. This
          is that system: what was chosen, what it was measured at, and what
          each choice cost.
        </p>
        <MarginNote label="What is not here">
          No projected throughput, no vendor benchmark, no figure from a machine
          this was not built on. {measured} of {e.decisions.length} decisions
          below cite a measurement; the rest are argued and say so.
        </MarginNote>
        <p>{e.note}</p>
        <p>
          Everything runs on one machine: <strong>{e.hardware.gpu}</strong>.{" "}
          {e.hardware.why}
        </p>
      </Prose>

      {/* -------------------- decisions -------------------- */}
      <Subsection href="/engineering" n={1}>Decisions, and what they cost</Subsection>
      <Prose>
        <p>
          Each entry names the alternative it was chosen over. A decision
          recorded without its alternative is a preference; recorded with one,
          it is an argument that can be checked.
        </p>
      </Prose>

      <div className="decisions mt-6">
        {e.decisions.map((d) => (
          <article key={d.id} className="decision">
            <header>
              <p className="eyebrow">{d.area}</p>
              <h3>{d.decision}</h3>
              <p className={`decision-flag ${d.measured ? "is-measured" : ""}`}>
                {d.measured ? "measured" : "argued, not measured"}
              </p>
            </header>
            <dl>
              <div><dt>Instead of</dt><dd>{d.alternative}</dd></div>
              <div><dt>Evidence</dt><dd>{d.evidence}</dd></div>
              <div><dt>Cost</dt><dd>{d.cost}</dd></div>
              <div><dt>Why</dt><dd>{d.why}</dd></div>
            </dl>
          </article>
        ))}
      </div>

      {/* -------------------- evaluation -------------------- */}
      <Subsection href="/engineering" n={2}>How the numbers are kept honest</Subsection>
      <Prose>
        <p>
          The measurement apparatus is the part of this project that took the
          longest and is the easiest to skip. Every practice below exists
          because skipping it produces a number that looks fine and is not.
        </p>
      </Prose>
      <dl className="practice-list mt-4">
        {e.evaluation.map((p) => (
          <div key={p.id} className="practice-row">
            <dt>{p.practice}</dt>
            <dd>{p.detail}</dd>
          </div>
        ))}
      </dl>

      {/* -------------------- guardrails -------------------- */}
      <Subsection href="/engineering" n={3}>Guardrails</Subsection>
      <Prose>
        <p>
          A retrieved passage is untrusted input. It reaches a prompt, and
          anything in it that reads as an instruction can be followed. These are
          the boundaries that assumption produces.
        </p>
      </Prose>
      <dl className="practice-list mt-4">
        {e.guardrails.map((g) => (
          <div key={g.id} className="practice-row">
            <dt>{g.control}</dt>
            <dd>{g.detail}</dd>
          </div>
        ))}
      </dl>

      {/* -------------------- stack -------------------- */}
      <Subsection href="/engineering" n={4}>The stack, pinned</Subsection>
      <Prose>
        <p>
          Versions are pinned because a benchmark whose dependencies float is
          not reproducible. A model that silently updates changes every number
          measured against it.
        </p>
      </Prose>
      <Bleed className="mt-4 bleed-scroll">
        <table className="w-full mono text-[length:var(--t-75)] border-collapse">
          <caption className="sr-only">Layer and the pinned choice for each</caption>
          <thead>
            <tr className="border-b border-rule">
              <th scope="col" className="text-left py-2 pr-4">Layer</th>
              <th scope="col" className="text-left py-2">Pinned to</th>
            </tr>
          </thead>
          <tbody>
            {e.stack.map((s) => (
              <tr key={s.layer} className="border-b border-rule align-top">
                <th scope="row" className="text-left font-normal py-2 pr-4 text-ink">{s.layer}</th>
                <td className="py-2 text-ink-muted">{s.choice}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Bleed>
    </>
  );
}
