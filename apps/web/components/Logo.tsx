/**
 * NthLabs marks — four candidates.
 *
 * All four share the constraints the rest of this site works under: hairline
 * geometry, no fill, `currentColor` only so the mark inherits ink and can
 * never introduce a colour (every hue in the palette is already committed to a
 * metric family or a delta), and a 32×32 grid on whole or half units so the
 * strokes stay crisp at favicon size.
 *
 * `vectorEffect="non-scaling-stroke"` keeps the hairline a hairline at every
 * rendered size — without it a 16px logo has a 0.5px stroke and disappears.
 *
 * Swap the mark used in the masthead by changing the import in app/page.tsx.
 */

type MarkProps = {
  /** Rendered size in px. The grid is designed to hold from 16 up. */
  size?: number;
  className?: string;
  /** Marks are decorative beside the wordmark; give a title only if standalone. */
  title?: string;
};

function Frame({ size = 32, className = "", title, children }: MarkProps & {
  children: React.ReactNode;
}) {
  return (
    <svg
      viewBox="0 0 32 32"
      width={size}
      height={size}
      className={`logo-mark ${className}`}
      role={title ? "img" : "presentation"}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      vectorEffect="non-scaling-stroke"
    >
      {children}
    </svg>
  );
}

/**
 * A — Steps. Three squares ascending.
 *
 * Taken from the company's own description: systems that think in steps. It is
 * the only one of the four that means something specific about the work rather
 * than something generic about mathematics, which is why it is the default.
 */
export function MarkSteps(p: MarkProps) {
  return (
    <Frame {...p}>
      <rect x={1.5} y={21.5} width={9} height={9} />
      <rect x={11.5} y={13.5} width={9} height={9} />
      <rect x={21.5} y={5.5} width={9} height={9} />
    </Frame>
  );
}

/**
 * B — Nested. Squares receding inward: the nth iteration, and depth.
 * Reads well small; the innermost square is the first thing lost.
 */
export function MarkNested(p: MarkProps) {
  return (
    <Frame {...p}>
      <rect x={1.5} y={1.5} width={29} height={29} />
      <rect x={8.5} y={8.5} width={15} height={15} />
      <rect x={14.5} y={14.5} width={3} height={3} />
    </Frame>
  );
}

/**
 * C — Sequence. Terms 1, 2, 3 … n, the last one raised into the ordinal
 * position the wordmark uses for its "th". The most literal reading of "Nth".
 */
export function MarkSequence(p: MarkProps) {
  return (
    <Frame {...p}>
      <circle cx={4} cy={24} r={1.5} />
      <circle cx={11} cy={24} r={1.5} />
      <circle cx={18} cy={24} r={1.5} />
      {/* the nth term, lifted */}
      <rect x={24.5} y={6.5} width={6} height={6} />
      <line x1={27.5} y1={13} x2={27.5} y2={24} />
    </Frame>
  );
}

/**
 * D — Ordinal. The superscript device itself: a baseline rule with the mark
 * raised off its end. The most minimal, and the most abstract — it carries no
 * meaning at all until it sits next to the wordmark.
 */
export function MarkOrdinal(p: MarkProps) {
  return (
    <Frame {...p}>
      <path d="M4 26 V10 L18 26 V10" />
      <circle cx={26.5} cy={8.5} r={2.5} />
    </Frame>
  );
}

export const MARKS = {
  steps: { component: MarkSteps, label: "Steps" },
  nested: { component: MarkNested, label: "Nested" },
  sequence: { component: MarkSequence, label: "Sequence" },
  ordinal: { component: MarkOrdinal, label: "Ordinal N" },
} as const;
