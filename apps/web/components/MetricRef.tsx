"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { Metric } from "@/lib/metrics";
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

const HUE: Record<string, string> = {
  retrieval: "var(--fam-retrieval)",
  grounding: "var(--fam-grounding)",
  abstention: "var(--fam-abstention)",
  performance: "var(--fam-performance)",
  cost: "var(--fam-cost)",
};

export function MetricRef({
  metric,
  children,
}: {
  metric: Metric;
  children?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const popId = useId();
  const hue = HUE[metric.family];
  const panelId = panelDomId(metric.id);

  const show = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(true), 150);
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
    <span className="relative inline-block">
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
        <span className="sr-only">
          {" "}— {metric.one_line} Activate for the full definition.
        </span>
      </button>

      {/* Level 2. Spans only: this sits inside the paragraph. */}
      {open ? (
        <span role="tooltip" id={popId} className="metric-pop mono">
          <span className="block text-ink">{metric.one_line}</span>
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
