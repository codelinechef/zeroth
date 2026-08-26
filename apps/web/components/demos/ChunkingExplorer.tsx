"use client";

import { useState } from "react";

type Span = {
  ordinal: number; page: number; section: string; n_tokens: number;
  char_start: number; char_end: number; starts_mid_sentence: boolean;
  crosses_section: boolean; head: string; tail: string;
};
type Strategy = {
  chunks: number; max_tokens: number; overlap: number;
  mid_sentence_starts: number; crossing_sections: number; spans: Span[];
};
export type ChunkingData = {
  doc_id: string; source: string; doc_chars: number; pages: number;
  sections: number; excerpt: string;
  strategies: Record<string, Strategy>;
};

const STRATS = ["fixed-512", "section-aware"] as const;

/**
 * One boundary, in words. Reports only what the committed span record already
 * says — ordinal, page, token count, section, and the two boundary flags.
 */
function describe(x: Span): string {
  const flags = [
    x.starts_mid_sentence ? "starts mid-sentence" : null,
    x.crosses_section ? "spans a section boundary" : null,
  ].filter(Boolean);
  return (
    `Chunk #${x.ordinal} · page ${x.page} · ${x.n_tokens} tokens · ` +
    `"${x.section.slice(0, 60)}"` +
    (flags.length ? ` · ${flags.join(" · ")}` : "")
  );
}

export function ChunkingExplorer({ docs }: { docs: ChunkingData[] }) {
  const [di, setDi] = useState(0);
  const [strat, setStrat] = useState<(typeof STRATS)[number]>("fixed-512");
  const [hot, setHot] = useState<Span | null>(null);
  const d = docs[di];
  const s = d.strategies[strat];
  const other = d.strategies[strat === "fixed-512" ? "section-aware" : "fixed-512"];
  const inExcerpt = s.spans.filter((x) => x.char_start < d.excerpt.length);

  return (
    <div className="border border-rule p-4 md:p-6">
      <div className="flex flex-wrap gap-4">
        {/* A <select> sizes to its widest option, which pushed the page past
            360px. min-w-0 on the wrapper plus w-full on the control lets it
            shrink; the full id is shown below rather than inside an option. */}
        <div className="min-w-0 flex-1 basis-56">
          <label htmlFor="ch-doc" className="eyebrow block mb-2">Document</label>
          <select id="ch-doc" value={di} onChange={(e) => { setDi(Number(e.target.value)); setHot(null); }}
            className="mono text-[length:var(--t-75)] border border-rule bg-paper px-2 py-1 w-full max-w-full">
            {docs.map((x, i) => (
              <option key={x.doc_id} value={i}>{x.source}</option>
            ))}
          </select>
        </div>
        <fieldset>
          <legend className="eyebrow mb-2">Strategy</legend>
          <div className="flex gap-1">
            {STRATS.map((st) => (
              <button key={st} type="button" onClick={() => { setStrat(st); setHot(null); }}
                aria-pressed={strat === st}
                className={`mono text-[length:var(--t-75)] border px-2 py-1 ${
                  strat === st ? "border-ink text-ink" : "border-rule text-ink-muted"}`}>
                {st}
              </button>
            ))}
          </div>
        </fieldset>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-3">
        <Stat label="chunks" value={String(s.chunks)}
          note={`${other.chunks} under ${strat === "fixed-512" ? "section-aware" : "fixed-512"}`} />
        <Stat label="chunks spanning two sections" value={String(s.crossing_sections)}
          note={strat === "section-aware"
            ? "zero by construction — this is what the strategy guarantees"
            : `${other.crossing_sections} under section-aware`} />
        <Stat label="document" value={`${d.pages} pp`}
          note={`${d.sections} sections · ${d.doc_chars.toLocaleString()} chars`} />
      </div>
      <p className="mono text-[length:var(--t-75)] text-ink-muted mt-2 break-all">
        {d.doc_id}
      </p>

      <p className="eyebrow mt-6 mb-2">boundaries over the first {d.excerpt.length.toLocaleString()} characters</p>
      {/* Each boundary is a target rather than a tick. The strip already knew
          which chunk starts where; before, that was the one thing a reader
          could not ask it. The hit area is padded well beyond the 1px rule —
          a hairline is not a pointer target. */}
      <div className="relative h-10 border border-rule" role="group"
        aria-label={`${inExcerpt.length} chunk boundaries in this excerpt under ${strat}`}>
        {inExcerpt.map((x) => (
          <button
            key={x.ordinal}
            type="button"
            className={`chunk-tick ${x.crosses_section ? "is-crossing" : ""} ${
              hot?.ordinal === x.ordinal ? "is-active" : ""}`}
            style={{ left: `${(x.char_start / d.excerpt.length) * 100}%` }}
            onMouseEnter={() => setHot(x)}
            onMouseLeave={() => setHot(null)}
            onFocus={() => setHot(x)}
            onBlur={() => setHot(null)}
            aria-label={describe(x)}
          />
        ))}
      </div>
      <p className={`figure-readout mono ${hot ? "is-active" : ""}`} aria-live="polite">
        {hot
          ? describe(hot)
          : "Each line is a chunk start; red spans a section boundary. Point at one for the chunk it opens."}
      </p>

      <details className="mt-5">
        <summary className="eyebrow cursor-pointer">First three chunks, verbatim</summary>
        <ol className="mt-3 space-y-3">
          {s.spans.slice(0, 3).map((x) => (
            <li key={x.ordinal} className="border-l-2 border-rule pl-3">
              <p className="mono text-[length:var(--t-75)] text-ink-muted">
                #{x.ordinal} · p{x.page} · {x.n_tokens} tokens · &quot;{x.section.slice(0, 46)}&quot;
                {x.starts_mid_sentence ? " · starts mid-sentence" : ""}
                {x.crosses_section ? " · spans a section boundary" : ""}
              </p>
              <p className="text-[length:var(--t-875)] mt-1">{x.head}…</p>
            </li>
          ))}
        </ol>
      </details>
    </div>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div>
      <p className="eyebrow">{label}</p>
      <p className="mono text-[length:var(--t-200)] tabular-nums leading-none mt-1">{value}</p>
      <p className="mono text-[length:var(--t-75)] text-ink-muted mt-1">{note}</p>
    </div>
  );
}
