import { Svg, Box, Arrow, MUTED } from "./primitives";
import { Inspectable, Hot } from "./Inspectable";

/**
 * Figure 1 — the pipeline. Solid stages exist; dashed stages are planned, with
 * the phase that delivers them. Marking that difference is the point: a
 * diagram that shows planned work as though it were built is a fabrication.
 *
 * Each stage carries a `detail` line, shown in the readout beneath the figure
 * on hover or focus. These are descriptions of what a stage does, written by
 * hand — deliberately not measurements. No stage reports a latency or a score
 * here, because seven of the eight have never run.
 */
const STAGES = [
  {
    label: "Query", sub: "", built: true,
    detail: "The reader's question, before any retrieval. The only stage that currently exists.",
  },
  {
    label: "BM25", sub: "lexical", built: false, phase: 2,
    detail: "Sparse lexical retrieval over the chunk corpus. Catches exact terms — defined names, section numbers, identifiers — that embeddings routinely miss.",
  },
  {
    label: "Dense", sub: "pgvector", built: false, phase: 2,
    detail: "Approximate nearest-neighbour search over 384-dimension embeddings, using an HNSW index in pgvector. Catches paraphrase, where BM25 fails.",
  },
  {
    label: "RRF", sub: "fusion", built: false, phase: 2,
    detail: "Reciprocal rank fusion merges the two ranked lists by position rather than score, so the lexical and dense scales never have to be made comparable.",
  },
  {
    label: "Rerank", sub: "cross-enc", built: false, phase: 2,
    detail: "A cross-encoder reads query and chunk together and reorders the shortlist. Far more accurate than the first-stage retrievers, and far too slow to run over the whole corpus.",
  },
  {
    label: "Generate", sub: "constrained", built: false, phase: 2,
    detail: "The answer is decoded under a schema constraint, using only the retrieved passages. The constraint is what makes citations parseable rather than hoped for.",
  },
  {
    label: "Verify", sub: "cite+quote", built: false, phase: 2,
    detail: "Every citation is resolved back to a chunk and every quoted span is checked against the source text. A citation that does not resolve fails the answer.",
  },
  {
    label: "Abstain", sub: "gate", built: false, phase: 2,
    detail: "The last gate. When the evidence does not support an answer the system declines rather than producing one — the behaviour the abstention family measures.",
  },
];

export function Pipeline() {
  const W = 880, H = 150, bw = 92, bh = 44, gap = 8;
  return (
    <Inspectable hint="Point at a stage for what it does. Solid = implemented; dashed = planned, with the phase that delivers it.">
      <Svg w={W} h={H} title="Figure1"
        desc="Query flows through lexical and dense retrieval, fused by reciprocal rank fusion, then reranking, constrained generation, citation and quote verification, and an abstention gate. Only the query stage is implemented; the rest arrive in Phase 2.">
        {STAGES.map((s, i) => {
          const x = 12 + i * (bw + gap);
          return (
            <g key={s.label}>
              <Hot
                id={s.label}
                detail={
                  s.built
                    ? `${s.label} — ${s.detail}`
                    : `${s.label} (planned, Phase ${s.phase}) — ${s.detail}`
                }
                x={x} y={40} w={bw} h={bh}
              >
                <Box x={x} y={40} w={bw} h={bh} label={s.label} sub={s.sub}
                  dashed={!s.built} />
              </Hot>
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
    </Inspectable>
  );
}
