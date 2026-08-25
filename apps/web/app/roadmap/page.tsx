import { Prose, MarginNote } from "@/components/Paper";
import { PHASES } from "@/lib/phases";

export const metadata = { title: "Roadmap · Zeroth" };

const STATUS: Record<string, string> = {
  done: "Done", "in-progress": "In progress", planned: "Planned",
};

export default function RoadmapPage() {
  return (
    <>
      <p className="eyebrow">Section 7</p>
      <h1 className="mt-2">Roadmap</h1>

      <Prose className="mt-6">
        <p className="lede">
          Eight phases, what each delivers, and what becomes visible here once
          it lands.
        </p>
        <MarginNote label="Sequencing">
          The order is deliberate. The platform comes before any measurement,
          because a benchmark with nothing behind it measures nothing.
        </MarginNote>
        <p>
          Status reflects what is in the repository, not what is intended. A
          phase is marked done only when its gate was met and reported.
        </p>
      </Prose>

      <ol className="mt-12 space-y-10">
        {PHASES.map((p) => (
          <li key={p.n}>
            <div className="flex flex-wrap items-baseline gap-x-3">
              <span className="mono text-[length:var(--t-75)] text-ink-muted tabular-nums">
                Phase {p.n}
              </span>
              <h2 className="!mt-0 !mb-0 text-[length:var(--t-150)]">{p.title}</h2>
              <span className="eyebrow">{STATUS[p.status]}</span>
            </div>
            <div className="prose-measure mt-2">
              <p>{p.delivers}</p>
              <p className="text-ink-muted">
                <span className="eyebrow">Visible here — </span>
                {p.visible}
              </p>
              {p.blockedBy ? (
                <p className="mono text-[length:var(--t-75)] text-ink-muted">
                  Waiting on {p.blockedBy}
                </p>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
    </>
  );
}
