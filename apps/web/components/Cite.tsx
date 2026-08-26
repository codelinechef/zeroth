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
export function Cite({ corpusId, year }: { corpusId: string | null; year: number }) {
  const [copied, setCopied] = useState<"bibtex" | "text" | null>(null);

  const url = "https://zeroth.nthlabs.dev";
  const accessed = new Date().toISOString().slice(0, 10);
  const note = corpusId ? `Corpus ${corpusId}` : "Corpus not yet ingested";

  const bibtex = [
    "@misc{sharma_zeroth_" + year + ",",
    "  author       = {Sharma, Anant},",
    "  title        = {Zeroth: a reproducible benchmark of end-to-end RAG pipeline quality},",
    "  year         = {" + year + "},",
    "  howpublished = {\\url{" + url + "}},",
    "  note         = {" + note + ". Accessed " + accessed + "},",
    "  organization = {NthLabs}",
    "}",
  ].join("\n");

  const plain =
    `Sharma, A. (${year}). Zeroth: a reproducible benchmark of end-to-end RAG ` +
    `pipeline quality. NthLabs. ${note}. Retrieved ${accessed}, from ${url}`;

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
    </div>
  );
}
