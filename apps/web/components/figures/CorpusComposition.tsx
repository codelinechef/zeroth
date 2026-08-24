import { getCorpusStats } from "@/lib/content";
import { Svg, MUTED, INK, RULE } from "./primitives";
import { InProgress } from "../InProgress";

/**
 * Figure 7 — corpus composition, read from the committed manifest. Never
 * hardcoded: if the manifest is absent the figure says so rather than drawing
 * a plausible shape.
 */
export function CorpusComposition() {
  const s = getCorpusStats();
  if (!s) {
    return (
      <InProgress phase={1}>
        Source counts, page and chunk totals, and the tenant distribution,
        drawn from the committed corpus manifest.
      </InProgress>
    );
  }
  const W = 720, H = 220;
  const total = s.bySource.reduce((a, b) => a + b.documents, 0) || 1;
  let x = 12;
  return (
    <Svg w={W} h={H} title="Figure7"
      desc={`Corpus ${s.corpusId}: ${s.documents} documents, ${s.pages} pages, ${s.chunks} chunks across ${s.tenants} tenants.`}>
      <text x={12} y={18} fontSize="10" fontFamily="var(--font-mono)" fill={MUTED}>
        documents by source
      </text>
      {s.bySource.map((b) => {
        const w = (b.documents / total) * 696;
        const seg = (
          <g key={b.source}>
            <rect x={x} y={26} width={Math.max(w - 2, 2)} height={30} fill="none" stroke={INK} />
            <text x={x + 6} y={46} fontSize="10" fontFamily="var(--font-mono)" fill={INK}>
              {b.source}
            </text>
            <text x={x + 6} y={72} fontSize="10" fontFamily="var(--font-mono)" fill={MUTED}>
              {b.documents.toLocaleString()}
            </text>
          </g>
        );
        x += w;
        return seg;
      })}

      <line x1={12} y1={96} x2={708} y2={96} stroke={RULE} />
      {[
        ["documents", s.documents], ["pages", s.pages],
        ["chunks (fixed-512)", s.chunks], ["tenants", s.tenants],
      ].map(([label, v], i) => (
        <g key={String(label)}>
          <text x={12 + i * 178} y={124} fontSize="9" fontFamily="var(--font-mono)" fill={MUTED}>
            {label as string}
          </text>
          <text x={12 + i * 178} y={148} fontSize="18" fontFamily="var(--font-mono)" fill={INK}>
            {(v as number).toLocaleString()}
          </text>
        </g>
      ))}
      <text x={12} y={182} fontSize="9" fontFamily="var(--font-mono)" fill={MUTED}>
        {s.pagesReal.toLocaleString()} pages counted from real page breaks; {s.pagesEstimated.toLocaleString()} estimated where the source carries no page structure.
      </text>
      <text x={12} y={200} fontSize="9" fontFamily="var(--font-mono)" fill={MUTED}>
        corpus {s.corpusId} · read from the committed manifest
      </text>
    </Svg>
  );
}
