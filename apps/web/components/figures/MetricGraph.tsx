import { Svg, Box, Arrow, MUTED, INK } from "./primitives";

/** Figure 8 — how a retrieval failure propagates downstream. */
export function MetricGraph() {
  const W = 720, H = 230;
  return (
    <Svg w={W} h={H} title="Figure8"
      desc="Retrieval quality feeds grounding and abstention. A retrieval failure therefore moves faithfulness, citation accuracy and abstention numbers without any of those components being at fault.">
      <Box x={24} y={90} w={150} h={50} label="Retrieval" sub="RET" />
      <Arrow x1={174} y1={102} x2={252} y2={62} />
      <Arrow x1={174} y1={128} x2={252} y2={168} />
      <Box x={254} y={38} w={150} h={50} label="Grounding" sub="GRD" />
      <Box x={254} y={142} w={150} h={50} label="Abstention" sub="ABS" />
      <Arrow x1={404} y1={62} x2={482} y2={92} />
      <Arrow x1={404} y1={168} x2={482} y2={138} />
      <Box x={484} y={90} w={212} h={50} label="Published answer quality" />
      <text x={24} y={206} fontSize="10" fontFamily="var(--font-mono)" fill={MUTED}>
        A retrieval failure moves grounding and abstention numbers even when neither component is at fault.
      </text>
      <text x={24} y={222} fontSize="10" fontFamily="var(--font-mono)" fill={INK}>
        That is why access-control effects are reported separately, not folded into headline results.
      </text>
    </Svg>
  );
}
