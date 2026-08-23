import { getRuns } from "@/lib/content";
import { ResultsTable } from "@/components/ResultsTable";

export default function BoardPage() {
  const runs = getRuns();

  return (
    <>
      <p className="eyebrow">Clause 1 · Board</p>
      <h1 className="mt-2 text-[length:var(--t-200)]">Zeroth</h1>

      {/* One thesis sentence, a rule, then results. — §7 */}
      <p className="prose-spec mt-4">
        An open reconstruction of a production confidential-document retrieval
        platform, measured on public documents, with every number traceable to
        committed data.
      </p>

      <hr className="rule my-8" />

      <ResultsTable runs={runs} />

      <p className="mt-6 text-[length:var(--t-75)] text-ink-muted">
        Retrieval metrics are properties of a corpus-and-query-set pair, not of
        an architecture. Numbers published here apply only to the corpus named
        beside them.
      </p>
    </>
  );
}
