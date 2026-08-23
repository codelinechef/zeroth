import { DotLeader } from "@/components/DotLeader";
import { EmptyState } from "@/components/EmptyState";
import { getCorpusIds } from "@/lib/content";

export const metadata = { title: "Corpus · Zeroth" };

export default function CorpusPage() {
  const ids = getCorpusIds();

  return (
    <>
      <p className="eyebrow">Clause 3 · Corpus</p>
      <h1 className="mt-2 text-[length:var(--t-200)]">Corpus</h1>
      <hr className="rule my-8" />

      <h2 className="text-[length:var(--t-125)]">3.1 Measured composition</h2>
      <div className="mt-4">
        {ids.length === 0 ? (
          <EmptyState>
            No corpus has been ingested yet. Composition figures publish once
            the ingestion pipeline runs and the manifest is committed.
          </EmptyState>
        ) : (
          <ul className="space-y-1">
            {ids.map((id) => (
              <li key={id}>{id}</li>
            ))}
          </ul>
        )}
      </div>
      <div className="mt-6">
        <DotLeader label="Documents" value="—" />
        <DotLeader label="Pages" value="—" />
        <DotLeader label="Chunks" value="—" />
        <DotLeader label="Tenants" value="—" />
      </div>

      <h2 className="mt-12 text-[length:var(--t-125)]">3.2 Planned sources</h2>
      <p className="prose-spec mt-3">
        Described here as intent. Nothing below has been fetched, parsed, or
        counted, and no figure on this page is a measurement.
      </p>

      <div className="prose-spec mt-6 space-y-6">
        <div>
          <h3 className="font-semibold not-italic">SEC EDGAR 10-K filings</h3>
          <p className="mt-1 text-ink-muted">
            Long, structurally messy, heavy with cross-references and tables.
            They partition naturally by filing company, which is what makes the
            tenant isolation tests meaningful rather than theatrical.
          </p>
        </div>
        <div>
          <h3 className="font-semibold not-italic">
            CUAD — Contract Understanding Atticus Dataset
          </h3>
          <p className="mt-1 text-ink-muted">
            Commercial contracts annotated with clause spans, CC BY 4.0, which
            supplies free ground truth for a subset of queries. These contracts
            are themselves drawn from EDGAR, so they are a different document
            shape from the same publisher rather than an independent source,
            and they are deduplicated against the 10-K set.
          </p>
        </div>
        <div>
          <h3 className="font-semibold not-italic">RFCs</h3>
          <p className="mt-1 text-ink-muted">
            Documents from the HTTP and TLS families. Freely redistributable,
            densely cross-referencing, and a clean hard-mode subset.
          </p>
        </div>
      </div>

      <h2 className="mt-12 text-[length:var(--t-125)]">3.3 Attribution</h2>
      <p className="prose-spec mt-3 text-ink-muted">
        Source licences and attribution are recorded with the corpus manifest
        when it is committed. CUAD is CC BY 4.0; chunking and re-indexing
        constitute modification and will be indicated as such.
      </p>
    </>
  );
}
