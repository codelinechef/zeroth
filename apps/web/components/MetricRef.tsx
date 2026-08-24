"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { Metric } from "@/lib/metrics";

/**
 * Progressive disclosure for a metric name — brief §5.
 *
 *   Level 1  inline trigger, dotted underline in the family hue
 *   Level 2  popover on hover OR focus after 150ms
 *   Level 3  side panel on click
 *
 * The trigger is a real <button>, so everything reachable by mouse is
 * reachable by keyboard — the standard failure of hover UIs. Level 3 uses a
 * native <dialog>, which gives focus trapping and Escape dismissal from the
 * platform rather than from hand-written key handlers.
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
  panel,
}: {
  metric: Metric;
  children?: React.ReactNode;
  /** Level 3 content, rendered on the server and passed in. */
  panel: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const popId = useId();
  const hue = HUE[metric.family];

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

  return (
    <span className="relative inline-block">
      <button
        type="button"
        aria-describedby={open ? popId : undefined}
        aria-haspopup="dialog"
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        onClick={() => { hide(); dialogRef.current?.showModal(); }}
        className="metric-ref"
        style={{ ["--hue" as string]: hue }}
      >
        <span className="tag" style={{ color: hue }} aria-hidden="true">
          {metric.tag}
        </span>
        {children ?? metric.name}
        <span className="sr-only"> — {metric.one_line} Activate for the full definition.</span>
      </button>

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

      <dialog ref={dialogRef} className="metric-panel" aria-label={`${metric.name} — full definition`}>
        <div className="metric-panel-inner">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="eyebrow">
                <span style={{ color: hue }}>{metric.tag}</span> {metric.family}
              </p>
              <h2 className="mt-1 text-[length:var(--t-150)]">{metric.name}</h2>
            </div>
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              className="mono text-[length:var(--t-75)] underline text-signal shrink-0"
            >
              Close
            </button>
          </div>
          {panel}
        </div>
      </dialog>
    </span>
  );
}
