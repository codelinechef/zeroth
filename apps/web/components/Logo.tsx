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

/**
 * E — Ranked rows. Four rules of decreasing width: a results table, read as a
 * mark. The most literal fit for a company whose first project is a benchmark,
 * and the only candidate that says what the work IS rather than what "nth"
 * means. Reads cleanly at 16px because it is four straight lines.
 */
export function MarkRanked(p: MarkProps) {
  return (
    <Frame {...p}>
      <line x1={2} y1={6} x2={30} y2={6} />
      <line x1={2} y1={13} x2={24} y2={13} />
      <line x1={2} y1={20} x2={16} y2={20} />
      <line x1={2} y1={27} x2={9} y2={27} />
    </Frame>
  );
}

/**
 * F — Aperture. Two squares, one rotated 45°, sharing a centre: convergence
 * from two directions, which is what hybrid retrieval does. Geometric and
 * quiet; the rotated square is what keeps it from being a plain box.
 */
export function MarkAperture(p: MarkProps) {
  return (
    <Frame {...p}>
      <rect x={6.5} y={6.5} width={19} height={19} />
      <path d="M16 1.5 L30.5 16 L16 30.5 L1.5 16 Z" />
    </Frame>
  );
}

/**
 * G — Nth term. A triangle of dots with the apex raised clear of the run: a
 * sequence and the term that sits above it. The most abstract, and the one
 * that pairs most naturally with the raised "th" in the wordmark.
 */
export function MarkTerm(p: MarkProps) {
  return (
    <Frame {...p}>
      <circle cx={5} cy={26} r={2} />
      <circle cx={13} cy={26} r={2} />
      <circle cx={21} cy={26} r={2} />
      <circle cx={16} cy={7} r={3.5} />
      <line x1={16} y1={10.5} x2={16} y2={22} strokeDasharray="2 2.5" />
    </Frame>
  );
}

/**
 * H — Indexed cell. A 3x3 grid with one cell marked: retrieval as addressing
 * the right cell out of many. Densest of the set; the marked cell is the first
 * thing lost below 20px, so this one wants to be used large.
 */
export function MarkIndexed(p: MarkProps) {
  return (
    <Frame {...p}>
      <rect x={2.5} y={2.5} width={27} height={27} />
      <line x1={11.5} y1={2.5} x2={11.5} y2={29.5} />
      <line x1={20.5} y1={2.5} x2={20.5} y2={29.5} />
      <line x1={2.5} y1={11.5} x2={29.5} y2={11.5} />
      <line x1={2.5} y1={20.5} x2={29.5} y2={20.5} />
      <rect x={21.5} y={12.5} width={7} height={7} fill="currentColor" stroke="none" />
    </Frame>
  );
}

export const MARKS = {
  steps: { component: MarkSteps, label: "Steps" },
  nested: { component: MarkNested, label: "Nested" },
  sequence: { component: MarkSequence, label: "Sequence" },
  ordinal: { component: MarkOrdinal, label: "Ordinal N" },
  ranked: { component: MarkRanked, label: "Ranked rows" },
  aperture: { component: MarkAperture, label: "Aperture" },
  term: { component: MarkTerm, label: "Nth term" },
  indexed: { component: MarkIndexed, label: "Indexed cell" },
} as const;
