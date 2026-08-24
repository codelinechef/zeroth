import { Svg, Box, MUTED, INK, RULE } from "./primitives";

/** Figure 3 — monolithic versus partitioned. */
export function Partitioned() {
  const W = 720, H = 240;
  return (
    <Svg w={W} h={H} title="Figure3"
      desc="On the left, one index over every tenant: the policy filters after the index has chosen, so permitted rows can be missing entirely. On the right, one index per tenant: the index contains only permitted rows, so there is nothing to filter away.">
      <text x={12} y={20} fontSize="11" fontFamily="var(--font-mono)" fill={INK}>Monolithic index</text>
      <rect x={12} y={30} width={320} height={120} fill="none" stroke={RULE} />
      {Array.from({ length: 24 }, (_, i) => (
        <circle key={i} cx={30 + (i % 8) * 38} cy={54 + Math.floor(i / 8) * 34} r={7}
          fill="none" stroke={i % 8 === 3 ? INK : RULE} />
      ))}
      <text x={12} y={172} fontSize="10" fontFamily="var(--font-mono)" fill={MUTED}>
        index chooses first, policy filters after
      </text>
      <text x={12} y={188} fontSize="10" fontFamily="var(--font-mono)" fill={MUTED}>
        permitted rows may never be reached
      </text>

      <text x={392} y={20} fontSize="11" fontFamily="var(--font-mono)" fill={INK}>Partitioned by tenant</text>
      {Array.from({ length: 4 }, (_, p) => (
        <g key={p}>
          <rect x={392 + p * 78} y={30} width={68} height={120} fill="none"
            stroke={p === 1 ? INK : RULE} />
          {Array.from({ length: 6 }, (_, i) => (
            <circle key={i} cx={410 + p * 78 + (i % 2) * 32} cy={54 + Math.floor(i / 2) * 34}
              r={7} fill="none" stroke={p === 1 ? INK : RULE} />
          ))}
        </g>
      ))}
      <text x={392} y={172} fontSize="10" fontFamily="var(--font-mono)" fill={MUTED}>
        only permitted partitions are scanned
      </text>
      <text x={392} y={188} fontSize="10" fontFamily="var(--font-mono)" fill={INK}>
        nothing to post-filter away
      </text>
      <text x={12} y={222} fontSize="9" fontFamily="var(--font-mono)" fill={MUTED}>
        Row-level security remains the correctness boundary in both. Partitioning changes what the index contains, not who may read it.
      </text>
    </Svg>
  );
}
