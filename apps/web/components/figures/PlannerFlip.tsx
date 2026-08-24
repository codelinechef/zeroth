import { Svg, Box, MUTED, INK, RULE } from "./primitives";

/** Figure 4 — one query, two plans, no error between them. */
export function PlannerFlip() {
  const W = 720, H = 250;
  return (
    <Svg w={W} h={H} title="Figure4"
      desc="A single query planned two ways: a sequential scan producing exact results, or an index scan producing approximate results with the policy applied afterwards. Neither raises an error, so the difference appears only as a change in the recall number. A plan assertion in the harness is the intervention.">
      <Box x={286} y={12} w={148} h={34} label="one query" />
      <line x1={330} y1={46} x2={200} y2={78} stroke={MUTED} markerEnd="url(#arrowhead)" />
      <line x1={390} y1={46} x2={520} y2={78} stroke={MUTED} markerEnd="url(#arrowhead)" />

      <Box x={70} y={80} w={260} h={54} label="Seq Scan + Filter" sub="exact, slower" />
      <Box x={392} y={80} w={260} h={54} label="Index Scan + Filter" sub="approximate, post-filtered" />

      <text x={200} y={156} textAnchor="middle" fontSize="10" fontFamily="var(--font-mono)" fill={INK}>recall as measured</text>
      <text x={522} y={156} textAnchor="middle" fontSize="10" fontFamily="var(--font-mono)" fill={INK}>a different recall</text>
      <text x={360} y={182} textAnchor="middle" fontSize="11" fontFamily="var(--font-mono)" fill={MUTED}>
        no error in between — the number simply moves
      </text>

      <rect x={130} y={198} width={460} height={36} fill="none" stroke={INK} strokeDasharray="4 3" />
      <text x={360} y={215} textAnchor="middle" fontSize="10" fontFamily="var(--font-mono)" fill={INK}>
        intervention: assert the executed plan shape, record it in the run
      </text>
      <text x={360} y={228} textAnchor="middle" fontSize="9" fontFamily="var(--font-mono)" fill={MUTED}>
        planned for Phase 4 — not yet built
      </text>
    </Svg>
  );
}
