import { getCorpusVersion } from "@/lib/content";

import { getSite } from "@/lib/site";

/**
 * Author block — brief §12. A paper's author block, not a marketing footer.
 * Carries the corpus provenance so the footer itself states what the site's
 * figures were measured against.
 */
export function Footer() {
  const corpus = getCorpusVersion();
  const site = getSite();
  const web = site?.author_links.find((l) => l.icon === "globe");
  const li = site?.author_links.find((l) => l.icon === "linkedin");
  return (
    <footer className="mt-20">
      <hr className="rule mb-4" />
      <div className="mono text-[length:var(--t-75)] text-ink-muted space-y-1">
        <p>
          <span className="text-ink">{site?.author_display ?? "Anant Sharma"}</span> · AI Engineer ·{" "}
          {web ? (
            <a href={web.href} target="_blank" rel="noopener noreferrer">{web.sub}</a>
          ) : null}
        </p>
        <p>
          {li ? <a href={li.href} target="_blank" rel="noopener noreferrer">LinkedIn</a> : null}{" "}
          · Corpus {corpus ?? "not yet ingested"}
        </p>
      </div>
    </footer>
  );
}
