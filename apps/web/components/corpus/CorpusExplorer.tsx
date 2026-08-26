"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { datasetUrl } from "@/lib/dataUrl";

export type CorpusDoc = {
  doc_id: string;
  source: string;
  tenant: string;
  pages: number | null;
  bytes: number;
  licence: string;
  identifier: string;
  url: string | null;
  checksum: string | null;
  dedup: unknown;
};

/**
 * The 663 documents behind the aggregate counts.
 *
 * The page renders the first rows server-side so the corpus is visible without
 * JavaScript; this component fetches the full index on mount and takes over
 * with search and filtering. 264 KB is far too much to inline into the page,
 * and far too little to paginate over a network.
 *
 * Rows are windowed rather than paginated: 663 <tr> elements is enough to make
 * scrolling stutter on a phone, and a pager would make "how many EDGAR filings
 * are there" a click-counting exercise instead of a number.
 */
const WINDOW = 60;

export function CorpusExplorer({
  initial,
  total,
}: {
  /** Server-rendered first rows, so the table is never empty. */
  initial: CorpusDoc[];
  total: number;
}) {
  const [docs, setDocs] = useState<CorpusDoc[] | null>(null);
  const [q, setQ] = useState("");
  const [source, setSource] = useState("all");
  const [shown, setShown] = useState(WINDOW);
  const [failed, setFailed] = useState(false);
  const loaded = useRef(false);

  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    fetch(datasetUrl("corpus/documents.json"))
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j: { documents: CorpusDoc[] }) => setDocs(j.documents))
      .catch(() => setFailed(true));
  }, []);

  const all = docs ?? initial;

  const sources = useMemo(() => {
    const counts = new Map<string, number>();
    for (const d of all) counts.set(d.source, (counts.get(d.source) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [all]);

  const matched = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return all.filter((d) => {
      if (source !== "all" && d.source !== source) return false;
      if (!needle) return true;
      return (
        d.doc_id.toLowerCase().includes(needle) ||
        d.tenant.toLowerCase().includes(needle) ||
        d.identifier.toLowerCase().includes(needle)
      );
    });
  }, [all, q, source]);

  const rows = matched.slice(0, shown);
  const ready = docs !== null;

  return (
    <div>
      <div className="table-controls">
        <span className="min-w-0 flex-1 basis-64">
          <label htmlFor="corpus-q" className="eyebrow block mb-1">Search</label>
          <input
            id="corpus-q"
            type="search"
            value={q}
            onChange={(e) => { setQ(e.target.value); setShown(WINDOW); }}
            placeholder="document id, tenant or filename"
            className="mono text-[length:var(--t-75)] border border-rule bg-paper px-2 py-1 w-full"
          />
        </span>
      </div>

      <div className="table-controls">
        <span className="eyebrow" id="corpus-source">Source</span>
        <span role="group" aria-labelledby="corpus-source" className="facet">
          <button type="button" aria-pressed={source === "all"}
            onClick={() => { setSource("all"); setShown(WINDOW); }}
            className="facet-option">All ({all.length})</button>
          {sources.map(([s, n]) => (
            <button key={s} type="button" aria-pressed={source === s}
              onClick={() => { setSource(s); setShown(WINDOW); }}
              className="facet-option">{s} ({n})</button>
          ))}
        </span>
      </div>

      <p className="mono text-[length:var(--t-75)] text-ink-muted mt-2" aria-live="polite">
        {failed
          ? `Could not load the full index. Showing the first ${initial.length} of ${total} documents.`
          : !ready
            ? `Showing the first ${initial.length} of ${total} documents; loading the rest…`
            : `${matched.length} of ${all.length} documents${matched.length > rows.length ? `, showing ${rows.length}` : ""}`}
      </p>

      <div className="bleed-scroll mt-3">
        <table className="w-full mono text-[length:var(--t-75)] border-collapse">
          <caption className="sr-only">
            Corpus documents with source, tenant, pages, licence and checksum
          </caption>
          <thead>
            <tr className="border-b border-rule">
              <th scope="col" className="text-left py-2 pr-4">document</th>
              <th scope="col" className="text-left py-2 pr-4">source</th>
              <th scope="col" className="text-left py-2 pr-4">tenant</th>
              <th scope="col" className="text-right py-2 pr-4">pages</th>
              <th scope="col" className="text-left py-2 pr-4">licence</th>
              <th scope="col" className="text-left py-2">sha256</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((d) => (
              <tr key={d.doc_id} className="border-b border-rule align-top">
                <th scope="row" className="text-left font-normal py-2 pr-4 text-ink">
                  <span className="block break-all">{d.doc_id}</span>
                  <span className="block text-ink-muted break-all">{d.identifier}</span>
                </th>
                <td className="py-2 pr-4 text-ink-muted">{d.source}</td>
                <td className="py-2 pr-4 text-ink-muted break-all">{d.tenant}</td>
                <td className="py-2 pr-4 text-right tabular-nums text-ink-muted">
                  {d.pages ?? "—"}
                </td>
                <td className="py-2 pr-4 text-ink-muted">{d.licence}</td>
                <td className="py-2 text-ink-muted break-all">{d.checksum ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {matched.length > rows.length ? (
        <button type="button" onClick={() => setShown((n) => n + WINDOW * 2)}
          className="facet-option mt-3">
          Show more ({matched.length - rows.length} remaining)
        </button>
      ) : null}

      {ready && matched.length === 0 ? (
        <p className="mono text-[length:var(--t-75)] text-ink-muted mt-3">
          No document matches that search.
        </p>
      ) : null}
    </div>
  );
}
