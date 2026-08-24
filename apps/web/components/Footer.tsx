import { getCorpusVersion } from "@/lib/content";

const REPO = "https://github.com/anantsharma/zeroth";

/**
 * Author block — brief §12. A paper's author block, not a marketing footer.
 * Carries the corpus provenance so the footer itself states what the site's
 * figures were measured against.
 */
export function Footer() {
  const corpus = getCorpusVersion();
  return (
    <footer className="mt-20">
      <hr className="rule mb-4" />
      <div className="mono text-[length:var(--t-75)] text-ink-muted space-y-1">
        <p>
          <span className="text-ink">Anant Sharma</span> · AI Engineer ·{" "}
          <a
            href="https://anantsharma.co.in/"
            target="_blank"
            rel="noopener noreferrer"
          >
            anantsharma.co.in
          </a>
        </p>
        <p>
          <a href={REPO} target="_blank" rel="noopener noreferrer">
            Source and data
          </a>{" "}
          · Corpus {corpus ?? "not yet ingested"}
        </p>
      </div>
    </footer>
  );
}
