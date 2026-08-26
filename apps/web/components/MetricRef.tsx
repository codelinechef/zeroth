"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { Metric } from "@/lib/metrics";
import { FAMILY_HUE, FAMILY_LABEL } from "@/lib/families";
import { panelDomId } from "@/lib/metricIds";

/**
 * Inline metric trigger — Levels 1 and 2 of the disclosure in brief §5.
 *
 * IMPORTANT: this component may return PHRASING CONTENT ONLY.
 *
 * References sit inside <p> in the prose. HTML does not permit flow content
 * (<div>, <section>, <dialog>, <h2>, <pre>, <ul>, ...) inside a paragraph: the
 * parser auto-closes the <p> at the first block child, so the DOM the browser
 * builds does not match the tree React rendered on the server, and React
 * discards the server HTML and re-renders the whole page on the client.
 *
 * The Level 3 panel therefore lives in <MetricPanels>, rendered once per page
 * outside the prose tree. This trigger opens it by id.
 *
 * Anything added here must be a <span>, <button>, <a>, <code>, <em> or similar.
 * If you need a block element, put it in the panel.
 */

export function MetricRef({
  metric,
  children,
  variant = "inline",
}: {
  metric: Metric;
  children?: React.ReactNode;
  /**
   * "inline" — inside prose. The popover leads with the one-line definition,
   *            which is the thing a reader mid-sentence is missing.
   * "list"   — in a listing that already prints that one-liner beside the
   *            name. The popover previously did not open at all here, which
   *            read as a broken control: the name carries the same dotted
   *            underline as every other metric reference, so a reader expects
   *            it to behave the same way. It now opens with the one-liner
   *            dropped and the full form, formula and range promoted, so it
   *            adds to the row instead of repeating it.
   */
  variant?: "inline" | "list";
}) {
  const [open, setOpen] = useState(false);
  const [below, setBelow] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const popId = useId();
  const hue = FAMILY_HUE[metric.family];
  const familyLabel = FAMILY_LABEL[metric.family];
  const panelId = panelDomId(metric.id);

  const show = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      // Flip below when there is not enough room above, so the popover never
      // sits over the text the reader was just looking at.
      const r = wrapRef.current?.getBoundingClientRect();
      setBelow(!!r && r.top < 220);
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

  const openPanel = () => {
    hide();
    const el = document.getElementById(panelId);
    if (el instanceof HTMLDialogElement) el.showModal();
  };

  return (
    <span className="relative inline-block" ref={wrapRef}>
      <button
        type="button"
        aria-describedby={open ? popId : undefined}
        aria-haspopup="dialog"
        aria-controls={panelId}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        onClick={openPanel}
        className="metric-ref"
        style={{ ["--hue" as string]: hue }}
      >
        <span className="tag" style={{ color: hue }} aria-hidden="true">
          {metric.tag}
        </span>
        {children ?? metric.name}
        {/* The tag itself is aria-hidden — three letters read aloud are noise.
            The family word carries it instead, along with the full form. */}
        <span className="sr-only">
          {" "}({familyLabel}
          {metric.expansion ? `, ${metric.expansion}` : ""}) — {metric.one_line}{" "}
          Activate for the full definition.
        </span>
      </button>

      {/* Level 2. Spans only: this sits inside the paragraph. */}
      {open ? (
        <span role="tooltip" id={popId}
          className={`metric-pop mono ${below ? "metric-pop-below" : ""}`}>
          {/* The three-letter tag is the family identification channel, but
              it is only spelled out in the methodology legend. Expanding it
              here means a reader never has to leave the page to learn what
              RET or GRD stands for. */}
          <span className="block metric-pop-family" style={{ color: hue }}>
            {metric.tag} · {familyLabel}
          </span>
          {/* In a list the one-liner is already printed beside the name.
              Repeating it here would spend the whole popover on text the
              reader can see, so the full form takes the lead line instead. */}
          {variant === "list" ? (
            metric.expansion ? (
              <span className="block mt-1 text-ink">{metric.expansion}</span>
            ) : null
          ) : (
            <>
              <span className="block mt-1 text-ink">{metric.one_line}</span>
              {metric.expansion ? (
                <span className="block mt-1 text-ink-muted">{metric.expansion}</span>
              ) : null}
            </>
          )}
          <span className="block mt-2 text-ink-muted whitespace-pre-wrap">
            {metric.formula.notation}
          </span>
          <span className="block mt-2 text-ink-muted">
            Range {metric.range.min}
            {metric.range.max === null ? "+" : `–${metric.range.max}`}
            {metric.range.unit ? ` ${metric.range.unit}` : ""} · activate for detail
          </span>
        </span>
      ) : null}
    </span>
  );
}
