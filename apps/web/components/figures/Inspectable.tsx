"use client";

import { createContext, useContext, useId, useState } from "react";

/**
 * Hover-to-inspect for the figures.
 *
 * A diagram box has room for two words. The material that actually explains a
 * stage — what it does, what it costs, which phase delivers it — has nowhere
 * to go, and stuffing it into the SVG turns a figure into a wall.
 *
 * So the detail lives in a readout line beneath the figure, and the boxes
 * become targets that fill it. Three properties matter:
 *
 *   - The readout occupies its row whether or not anything is hovered, so
 *     pointing at a stage never reflows the page. When nothing is active it
 *     shows the figure's standing hint.
 *   - Targets are real buttons in the tab order with an accessible name, so
 *     the detail is reachable without a pointer. Touch gets it on tap.
 *   - Nothing here renders a number. The detail strings are authored beside
 *     the figure that owns them; this component only routes them.
 */

type Active = { id: string; detail: string } | null;

const InspectCtx = createContext<{
  active: Active;
  set: (v: Active) => void;
  readoutId: string;
} | null>(null);

export function Inspectable({
  hint,
  children,
}: {
  /** Shown in the readout when nothing is being pointed at. */
  hint: string;
  children: React.ReactNode;
}) {
  const [active, set] = useState<Active>(null);
  const readoutId = useId();

  return (
    <InspectCtx.Provider value={{ active, set, readoutId }}>
      {children}
      {/* aria-live so a keyboard user tabbing through targets hears the detail
          change; "polite" because it must not interrupt. */}
      <p
        id={readoutId}
        aria-live="polite"
        className={`figure-readout mono ${active ? "is-active" : ""}`}
      >
        {active ? active.detail : hint}
      </p>
    </InspectCtx.Provider>
  );
}

/**
 * Marks an SVG group as inspectable. Must be rendered inside <Inspectable>.
 *
 * Renders a <g>, so it is only valid inside an <svg>. The hit area is whatever
 * the children draw plus `pad`, via a transparent rect — a 1px stroked
 * rectangle is nearly impossible to hover precisely, and hovering the label
 * text alone feels broken.
 */
export function Hot({
  id,
  detail,
  x,
  y,
  w,
  h,
  pad = 2,
  children,
}: {
  id: string;
  /** The line that fills the readout. Authored, never computed. */
  detail: string;
  x: number; y: number; w: number; h: number;
  pad?: number;
  children: React.ReactNode;
}) {
  const ctx = useContext(InspectCtx);
  if (!ctx) throw new Error("<Hot> must be rendered inside <Inspectable>");
  const { active, set, readoutId } = ctx;
  const on = active?.id === id;

  return (
    <g
      className={`fig-hot ${on ? "is-active" : ""}`}
      tabIndex={0}
      role="button"
      aria-describedby={readoutId}
      aria-label={detail}
      onMouseEnter={() => set({ id, detail })}
      onMouseLeave={() => set(null)}
      onFocus={() => set({ id, detail })}
      onBlur={() => set(null)}
      onKeyDown={(e) => {
        if (e.key === "Escape") set(null);
      }}
    >
      <rect
        x={x - pad}
        y={y - pad}
        width={w + pad * 2}
        height={h + pad * 2}
        fill="transparent"
      />
      {children}
    </g>
  );
}
