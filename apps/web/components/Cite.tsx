"use client";

import { useState } from "react";

/**
 * Citation export.
 *
 * A benchmark that asks to be trusted has to be citable. The corpus id and the
 * access date are what make a citation of a living document meaningful — the
 * numbers here will change as phases land, so a citation without them refers
 * to nothing in particular.
 *
 * The year and access date are read at render time on the server, so the
 * committed corpus id is the only thing that has to be passed in.
 */
export function Cite({
  corpusId, year, url, publisher, author, provisional, urlNote,
}: {
  corpusId: string | null;
  year: number;
  /** From content/site.json — never hardcoded here. */
  url: string;
  publisher: string;
  author: string;
  provisional: boolean;
  urlNote: string;
}) {
  const [copied, setCopied] = useState<"bibtex" | "text" | null>(null);
  const accessed = new Date().toISOString().slice(0, 10);
  const note = corpusId ? `Corpus ${corpusId}` : "Corpus not yet ingested";

  const key = author.split(",")[0].trim().toLowerCase().replace(/[^a-z]/g, "");
  const bibtex = [
    "@misc{" + key + "_zeroth_" + year + ",",
    "  author       = {" + author + "},",
    "  title        = {Zeroth: a reproducible benchmark of end-to-end RAG pipeline quality},",
    "  year         = {" + year + "},",
    "  howpublished = {\\url{" + url + "}},",
    "  note         = {" + note + ". Accessed " + accessed + "},",
    "  organization = {" + publisher + "}",
    "}",
  ].join("\n");

  const plain =
    `${author} (${year}). Zeroth: a reproducible benchmark of end-to-end RAG ` +
    `pipeline quality. ${publisher}. ${note}. Retrieved ${accessed}, from ${url}`;

  const copy = async (what: "bibtex" | "text", value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(what);
      window.setTimeout(() => setCopied(null), 2000);
    } catch {
      // Clipboard is blocked in some contexts; the text is on screen and
      // selectable, so there is nothing to recover from.
    }
  };

  return (
    <div className="cite">
      <p className="eyebrow">Cite this</p>
      <p className="cite-plain">{plain}</p>
      <pre className="cite-bibtex"><code>{bibtex}</code></pre>
      <p className="cite-actions">
        <button type="button" className="facet-option" onClick={() => copy("bibtex", bibtex)}>
          {copied === "bibtex" ? "Copied BibTeX" : "Copy BibTeX"}
        </button>
        <button type="button" className="facet-option" onClick={() => copy("text", plain)}>
          {copied === "text" ? "Copied citation" : "Copy citation"}
        </button>
      </p>
      <p className="mono text-[length:var(--t-75)] text-ink-muted">
        The corpus id is part of the citation on purpose: every number here is a
        property of that corpus and does not transfer to another one.
      </p>
      {provisional ? (
        <p className="cite-provisional mono">
          Provisional address. {urlNote}
        </p>
      ) : null}
    </div>
  );
}
