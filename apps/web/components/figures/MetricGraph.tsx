import { Svg, Box, Arrow, MUTED, INK } from "./primitives";
import { Inspectable, Hot } from "./Inspectable";

/**
 * Figure 8 — how a retrieval failure propagates downstream.
 *
 * The detail lines name which metrics sit in each family, which is the thing
 * the boxes cannot say in one word and the reason the figure exists.
 */
export function MetricGraph() {
  const W = 720, H = 230;
  return (
    <Inspectable hint="Point at a node for the metrics it carries and what moves them.">
      <Svg w={W} h={H} title="Figure8"
        desc="Retrieval quality feeds grounding and abstention. A retrieval failure therefore moves faithfulness, citation accuracy and abstention numbers without any of those components being at fault.">
        <Hot
          id="ret"
          detail="Retrieval (RET) — Recall@10, Recall@5, NDCG@10, MRR@10 and context precision. Measures whether the passage that answers the question reached the shortlist at all."
          x={24} y={90} w={150} h={50}
        >
          <Box x={24} y={90} w={150} h={50} label="Retrieval" sub="RET" />
        </Hot>

        <Arrow x1={174} y1={102} x2={252} y2={62} />
        <Arrow x1={174} y1={128} x2={252} y2={168} />

        <Hot
          id="grd"
          detail="Grounding (GRD) — faithfulness, citation accuracy, citation coverage, answer relevance and answer correctness. Measures whether the answer actually used what it retrieved."
          x={254} y={38} w={150} h={50}
        >
          <Box x={254} y={38} w={150} h={50} label="Grounding" sub="GRD" />
        </Hot>

        <Hot
          id="abs"
          detail="Abstention (ABS) — whether the system correctly declines when the evidence does not support an answer. A retrieval miss makes a correct abstention look like a failure to answer."
          x={254} y={142} w={150} h={50}
        >
          <Box x={254} y={142} w={150} h={50} label="Abstention" sub="ABS" />
        </Hot>

        <Arrow x1={404} y1={62} x2={482} y2={92} />
        <Arrow x1={404} y1={168} x2={482} y2={138} />

        <Hot
          id="published"
          detail="What a single headline score would collapse all of the above into — and why this board never publishes one."
          x={484} y={90} w={212} h={50}
        >
          <Box x={484} y={90} w={212} h={50} label="Published answer quality" />
        </Hot>

        <text x={24} y={206} fontSize="10" fontFamily="var(--font-mono)" fill={MUTED}>
          A retrieval failure moves grounding and abstention numbers even when neither component is at fault.
        </text>
        <text x={24} y={222} fontSize="10" fontFamily="var(--font-mono)" fill={INK}>
          That is why access-control effects are reported separately, not folded into headline results.
        </text>
      </Svg>
    </Inspectable>
  );
}
