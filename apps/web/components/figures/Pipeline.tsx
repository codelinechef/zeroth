import { Svg, Box, Arrow, MUTED } from "./primitives";

/**
 * Figure 1 — the pipeline. Solid stages exist; dashed stages are planned, with
 * the phase that delivers them. Marking that difference is the point: a
 * diagram that shows planned work as though it were built is a fabrication.
 */
const STAGES = [
  { label: "Query", sub: "", built: true },
  { label: "BM25", sub: "lexical", built: false, phase: 2 },
  { label: "Dense", sub: "pgvector", built: false, phase: 2 },
  { label: "RRF", sub: "fusion", built: false, phase: 2 },
  { label: "Rerank", sub: "cross-enc", built: false, phase: 2 },
  { label: "Generate", sub: "constrained", built: false, phase: 2 },
  { label: "Verify", sub: "cite+quote", built: false, phase: 2 },
  { label: "Abstain", sub: "gate", built: false, phase: 2 },
];

export function Pipeline() {
  const W = 880, H = 150, bw = 92, bh = 44, gap = 8;
  return (
    <Svg w={W} h={H} title="Figure1"
      desc="Query flows through lexical and dense retrieval, fused by reciprocal rank fusion, then reranking, constrained generation, citation and quote verification, and an abstention gate. Only the query stage is implemented; the rest arrive in Phase 2.">
      {STAGES.map((s, i) => {
        const x = 12 + i * (bw + gap);
        return (
          <g key={s.label}>
            <Box x={x} y={40} w={bw} h={bh} label={s.label} sub={s.sub}
              dashed={!s.built} />
            {i < STAGES.length - 1 ? (
              <Arrow x1={x + bw} y1={62} x2={x + bw + gap - 1} y2={62} />
            ) : null}
            {!s.built ? (
              <text x={x + bw / 2} y={102} textAnchor="middle" fontSize="8"
                fontFamily="var(--font-mono)" fill={MUTED}>P{s.phase}</text>
            ) : null}
          </g>
        );
      })}
      <text x={12} y={128} fontSize="9" fontFamily="var(--font-mono)" fill={MUTED}>
        solid = implemented · dashed = planned, with delivering phase
      </text>
    </Svg>
  );
}
