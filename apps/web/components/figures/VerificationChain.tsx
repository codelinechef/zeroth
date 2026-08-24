import { Svg, Box, Arrow, MUTED, INK } from "./primitives";

/** Figure 5 — the verification chain, and the cut that makes it mean anything. */
export function VerificationChain() {
  const W = 720, H = 200;
  return (
    <Svg w={W} h={H} title="Figure5"
      desc="Queries are drafted by one model, graded by a second model that never sees which passages the query was written from, then a stratified quarter of the set is graded by a human. The agreement rate compares the second model against the human.">
      <Box x={16} y={40} w={150} h={50} label="Draft" sub="queries + sources" />
      <Arrow x1={166} y1={65} x2={196} y2={65} />
      <Box x={198} y={40} w={150} h={50} label="Judge" sub="grades 0–3" />
      <Arrow x1={348} y1={65} x2={378} y2={65} />
      <Box x={380} y={40} w={160} h={50} label="Human sample" sub="stratified 25%" />
      <Arrow x1={540} y1={65} x2={570} y2={65} />
      <Box x={572} y={40} w={132} h={50} label="Agreement" sub="published" />

      <line x1={182} y1={20} x2={182} y2={132} stroke={INK} strokeDasharray="5 3" />
      <text x={190} y={122} fontSize="10" fontFamily="var(--font-mono)" fill={INK}>
        the judge never sees the drafter&apos;s labels
      </text>
      <text x={190} y={137} fontSize="9" fontFamily="var(--font-mono)" fill={MUTED}>
        only the question and the passage text cross this line
      </text>
      <text x={16} y={168} fontSize="10" fontFamily="var(--font-mono)" fill={MUTED}>
        If the judge could see them it would agree with them, and the agreement rate
      </text>
      <text x={16} y={183} fontSize="10" fontFamily="var(--font-mono)" fill={MUTED}>
        would measure conformity rather than correctness.
      </text>
    </Svg>
  );
}
