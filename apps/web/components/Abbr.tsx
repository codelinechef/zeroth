"use client";

import { useEffect, useId, useRef, useState } from "react";
import { getAbbreviation, type AbbrId } from "@/lib/abbreviations";

/**
 * An abbreviation with its full form available on hover, focus or tap.
 *
 * IMPORTANT: this component may return PHRASING CONTENT ONLY — see the note in
 * MetricRef.tsx. It sits inside <p> throughout the prose, and a <div> here
 * would auto-close the paragraph and throw away the server HTML. Every element
 * below is a <span> or a <button>. scripts/check-nesting.mjs enforces this at
 * build time.
 *
 * Two shapes:
 *
 *   <Abbr id="rag" />           RAG                                (definition on demand)
 *   <Abbr id="rag" expand />    Retrieval-Augmented Generation (RAG)
 *
 * The convention the prose follows is `expand` on first use in a page, bare
 * afterwards — the reader who already knows the term is not made to read the
 * expansion four times, and the reader who does not can always reach it.
 */
export function Abbr({
  id,
  expand = false,
}: {
  id: AbbrId;
  /** Write the full form out inline, with the abbreviation in parentheses. */
  expand?: boolean;
}) {
  // Read through the accessor, not the literal map: `as const` narrows each
  // entry to its own shape, so ABBREVIATIONS[id].note does not typecheck for
  // the entries that have no note.
  const a = getAbbreviation(id);
  const [open, setOpen] = useState(false);
  const [below, setBelow] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const popId = useId();

  const show = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const r = wrapRef.current?.getBoundingClientRect();
      setBelow(!!r && r.top < 200);
      setOpen(true);
    }, 150);
  };
  const hide = () => {
    if (timer.current) clearTimeout(timer.current);
    setOpen(false);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") hide(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  return (
    <span className="relative inline-block" ref={wrapRef}>
      <button
        type="button"
        aria-describedby={open ? popId : undefined}
        aria-expanded={open}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        onClick={() => (open ? hide() : show())}
        className="abbr-ref"
      >
        {expand ? `${a.full} (${a.short})` : a.short}
        {/* When the full form is already written inline there is nothing extra
            to announce; otherwise carry it in the accessible name so a screen
            reader never meets a bare initialism. */}
        {expand ? null : <span className="sr-only"> — {a.full}</span>}
      </button>

      {open ? (
        <span role="tooltip" id={popId}
          className={`metric-pop mono ${below ? "metric-pop-below" : ""}`}>
          <span className="block text-ink">{a.full}</span>
          {a.note ? (
            <span className="block mt-2 text-ink-muted">{a.note}</span>
          ) : null}
        </span>
      ) : null}
    </span>
  );
}
