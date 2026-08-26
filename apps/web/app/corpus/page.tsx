import { SectionLabel } from "@/components/SectionLabel";
import { Prose, MarginNote, Figure } from "@/components/Paper";
import { CorpusComposition } from "@/components/figures/CorpusComposition";
import { getCorpusStats, getCorpusDocuments } from "@/lib/content";
import { Bleed } from "@/components/Paper";
import { CorpusExplorer } from "@/components/corpus/CorpusExplorer";
import { Abbr } from "@/components/Abbr";

export const metadata = { title: "Corpus · Zeroth" };

export default function CorpusPage() {
  const s = getCorpusStats();
  const docHead = getCorpusDocuments(25);
  const docTotal = getCorpusDocuments().length;
  return (
    <>
      <SectionLabel href="/corpus" />
      <h1 className="mt-2">Corpus</h1>

      <Prose className="mt-6">
        <p className="lede">
          Public documents, chosen to be long, messy, cross-referencing, and
          naturally partitioned into tenants.
        </p>
        <MarginNote label="Provenance">
          Every figure on this page is read from the committed manifest, which
          records source, identifier, URL, checksum and tenant per document.
        </MarginNote>
        <p>
          The manifest is what makes the corpus reproducible without
          redistributing gigabytes: replay the URL, verify the checksum. Raw
          documents are cached locally and not committed.
        </p>
      </Prose>

      <Figure n={7} caption="Composition by source, with page provenance separated into counted and estimated.">
        <div className="p-4"><CorpusComposition /></div>
      </Figure>

      <h2 className="mt-14">3.1 Sources</h2>
      <Prose>
        <h3>SEC EDGAR 10-K filings</h3>
        <p>
          Long, structurally messy, heavy with cross-references and tables. They
          partition naturally by filing company, which is what makes tenant
          isolation meaningful to test rather than theatrical. Only the primary
          document of each filing is fetched.
        </p>
        <h3>CUAD — Contract Understanding Atticus Dataset</h3>
        <p>
          Commercial contracts annotated with clause spans, CC BY 4.0, which
          supplies ground truth for a subset of queries. These contracts are
          themselves drawn from EDGAR, so they are a different document shape
          from the same publisher rather than an independent source, and they
          are deduplicated against the filing set by containment.
        </p>
        <h3>RFCs</h3>
        <p>
          Documents from the HTTP and <Abbr id="tls" expand /> families. Freely
          redistributable,
          densely cross-referencing, and a clean hard-mode subset — the only
          genuinely independent third source.
        </p>
      </Prose>

      <h2 className="mt-14">3.2 Attribution</h2>
      <Prose>
        <p className="text-ink-muted">
          <Abbr id="cuad" />: Hendrycks et al., NeurIPS 2021; The Atticus
          Project. Licensed <Abbr id="ccby" /> 4.0. Chunking and re-indexing
          constitute modification and are indicated as such.{" "}
          <Abbr id="edgar" /> filings are published by the US Securities and
          Exchange Commission. <Abbr id="rfc" />s are published by the{" "}
          <Abbr id="ietf" /> and RFC Editor under <Abbr id="bcp" /> 78.
        </p>
        {s ? (
          <p className="mono text-[length:var(--t-75)] text-ink-muted">
            Corpus {s.corpusId}
          </p>
        ) : null}
      </Prose>

      <h2 className="mt-16">3.3 Every document</h2>
      <Prose>
        <p>
          The manifest, not a summary of it. Each row is one document as it was
          acquired: its identifier at the source, the tenant it was assigned to,
          its page count, its licence, and the checksum that pins the bytes.
          Raw documents are not redistributed — this is what makes the corpus
          reproducible without them.
        </p>
      </Prose>
      <Bleed className="mt-6">
        {docTotal ? (
          <CorpusExplorer initial={docHead} total={docTotal} />
        ) : (
          <p className="mono text-[length:var(--t-75)] text-ink-muted">
            No corpus manifest has been committed yet.
          </p>
        )}
      </Bleed>
    </>
  );
}
