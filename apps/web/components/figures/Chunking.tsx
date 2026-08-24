import { Svg, MUTED, INK, RULE } from "./primitives";

/** Figure 6 — fixed-token windows with overlap versus section-aware packing. */
export function Chunking() {
  const W = 720, H = 210;
  const secs = [0, 118, 268, 400, 560, 700];
  return (
    <Svg w={W} h={H} title="Figure6"
      desc="The same document chunked two ways. Fixed windows with overlap cut across section boundaries; section-aware packing never crosses one, so a chunk can be shorter but never straddles two clauses.">
      <text x={12} y={18} fontSize="10" fontFamily="var(--font-mono)" fill={MUTED}>document, with section boundaries</text>
      <rect x={12} y={26} width={696} height={22} fill="none" stroke={RULE} />
      {secs.slice(1, -1).map((x) => (
        <line key={x} x1={12 + x} y1={26} x2={12 + x} y2={48} stroke={INK} />
      ))}

      <text x={12} y={78} fontSize="10" fontFamily="var(--font-mono)" fill={INK}>fixed-512, 15% overlap</text>
      {Array.from({ length: 6 }, (_, i) => {
        const x = 12 + i * 118;
        return <rect key={i} x={x} y={86} width={136} height={20} fill="none"
          stroke={RULE} opacity={0.9} />;
      })}
      <text x={12} y={122} fontSize="9" fontFamily="var(--font-mono)" fill={MUTED}>
        windows overlap and cut across boundaries — a clause can be split
      </text>

      <text x={12} y={152} fontSize="10" fontFamily="var(--font-mono)" fill={INK}>section-aware</text>
      {secs.slice(0, -1).map((x, i) => (
        <rect key={i} x={12 + x} y={160} width={secs[i + 1] - x - 4} height={20}
          fill="none" stroke={INK} />
      ))}
      <text x={12} y={196} fontSize="9" fontFamily="var(--font-mono)" fill={MUTED}>
        never crosses a boundary — chunks vary in length, clauses stay whole
      </text>
    </Svg>
  );
}
