"use client";

import { useState } from "react";
import { Svg, Box, MUTED, INK, RULE } from "./primitives";

/**
 * Figure 2 — ANN post-filtering under row-level security.
 *
 * Reader-driven, never autoplaying. Under prefers-reduced-motion there is no
 * animation to suppress: the steps are discrete states, and step 4 is the
 * resting state.
 */
const STEPS = [
  "The index returns its ef_search nearest neighbours, ranked by distance.",
  "The access policy discards the ones this role may not see.",
  "Nothing refills them. The gap is not repaired.",
  "The result is empty, although permitted matching documents exist.",
];

// 12 candidate slots; which tenant each belongs to. The reader's role may see
// only tenant B. Positions are illustrative of mechanism, not measurements.
const SLOTS = Array.from({ length: 12 }, (_, i) => ({
  id: i,
  permitted: i === 9 || i === 11,
}));

export function PostFilter() {
  const [step, setStep] = useState(0);
  const W = 720, H = 210;

  return (
    <div>
      <Svg w={W} h={H} title="Figure2"
        desc="Twelve nearest neighbours are returned by the index. The access policy removes those the role cannot see, leaving gaps that are never refilled, so the final result is empty even though permitted matching documents exist elsewhere in the corpus.">
        <text x={12} y={22} fontSize="10" fontFamily="var(--font-mono)" fill={MUTED}>
          nearest neighbours, ranked by distance →
        </text>
        {SLOTS.map((s, i) => {
          const x = 12 + i * 56;
          const removed = step >= 1 && !s.permitted;
          const gone = step >= 2 && !s.permitted;
          const finalEmpty = step >= 3;
          return (
            <g key={s.id} opacity={gone ? 0.18 : 1}>
              <rect x={x} y={40} width={48} height={40} fill="none"
                stroke={removed ? RULE : INK} strokeWidth={1}
                strokeDasharray={removed ? "3 3" : undefined} />
              <text x={x + 24} y={65} textAnchor="middle" fontSize="10"
                fontFamily="var(--font-mono)"
                fill={removed ? MUTED : INK}>
                {removed ? "×" : s.permitted ? "✓" : String(i + 1)}
              </text>
              {finalEmpty && s.permitted ? (
                <text x={x + 24} y={98} textAnchor="middle" fontSize="8"
                  fontFamily="var(--font-mono)" fill={MUTED}>kept</text>
              ) : null}
            </g>
          );
        })}
        <line x1={12} y1={118} x2={W - 12} y2={118} stroke={RULE} />
        <text x={12} y={140} fontSize="11" fontFamily="var(--font-mono)" fill={INK}>
          {STEPS[step]}
        </text>
        {step >= 3 ? (
          <text x={12} y={162} fontSize="10" fontFamily="var(--font-mono)" fill={MUTED}>
            Raising ef_search from 40 to 800 changes nothing: with well-separated
          </text>
        ) : null}
        {step >= 3 ? (
          <text x={12} y={177} fontSize="10" fontFamily="var(--font-mono)" fill={MUTED}>
            tenant clusters the 800 nearest all belong to the same region.
          </text>
        ) : null}
        {step >= 3 ? (
          <text x={12} y={196} fontSize="10" fontFamily="var(--font-mono)" fill={INK}>
            No search parameter fixes this. Partitioning is the only thing that does.
          </text>
        ) : null}
      </Svg>

      <div className="flex items-center gap-3 mt-3">
        <button type="button" onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0}
          className="mono text-[length:var(--t-75)] border border-rule px-2 py-1 disabled:opacity-40">
          ← Previous
        </button>
        <button type="button" onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}
          disabled={step === STEPS.length - 1}
          className="mono text-[length:var(--t-75)] border border-rule px-2 py-1 disabled:opacity-40">
          Next step →
        </button>
        <span className="mono text-[length:var(--t-75)] text-ink-muted">
          Step {step + 1} of {STEPS.length}
        </span>
      </div>
    </div>
  );
}
