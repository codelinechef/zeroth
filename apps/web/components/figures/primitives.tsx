/** Shared SVG primitives. Theme tokens only — no hardcoded colours. */

export const INK = "var(--ink)";
export const MUTED = "var(--ink-muted)";
export const RULE = "var(--rule)";

export function Box({ x, y, w, h, label, sub, dashed, hue }: {
  x: number; y: number; w: number; h: number;
  label: string; sub?: string; dashed?: boolean; hue?: string;
}) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} fill="none"
        stroke={hue ?? RULE} strokeWidth={1}
        strokeDasharray={dashed ? "4 3" : undefined} />
      <text x={x + w / 2} y={y + (sub ? h / 2 - 4 : h / 2 + 4)}
        textAnchor="middle" fontSize="11"
        fontFamily="var(--font-mono)" fill={INK}>{label}</text>
      {sub ? (
        <text x={x + w / 2} y={y + h / 2 + 12} textAnchor="middle" fontSize="9"
          fontFamily="var(--font-mono)" fill={MUTED}>{sub}</text>
      ) : null}
    </g>
  );
}

export function Arrow({ x1, y1, x2, y2 }: {
  x1: number; y1: number; x2: number; y2: number;
}) {
  return (
    <g stroke={MUTED} strokeWidth={1} fill="none">
      <line x1={x1} y1={y1} x2={x2} y2={y2} markerEnd="url(#arrowhead)" />
    </g>
  );
}

export function Defs() {
  return (
    <defs>
      <marker id="arrowhead" markerWidth="7" markerHeight="7"
        refX="6" refY="3.5" orient="auto">
        <path d="M0,0 L7,3.5 L0,7 z" fill="var(--ink-muted)" />
      </marker>
    </defs>
  );
}

export function Svg({ w, h, title, desc, children }: {
  w: number; h: number; title: string; desc: string; children: React.ReactNode;
}) {
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" role="img"
      aria-labelledby={`${title}-t ${title}-d`}
      style={{ display: "block", minWidth: `${Math.min(w, 560)}px` }}>
      <title id={`${title}-t`}>{title}</title>
      <desc id={`${title}-d`}>{desc}</desc>
      <Defs />
      {children}
    </svg>
  );
}
