"use client";

import { useState } from "react";

type Hit = {
  chunk_id: string; doc_id: string; tenant: string; page: number;
  section: string; n_tokens: number; excerpt: string; rank: number;
  score?: number; rrf_score?: number; lexical_rank?: number; dense_rank?: number;
  lexical_contribution?: number; dense_contribution?: number;
  moved_from_fused?: number; movement?: number;
};

export type WalkthroughData = {
  query_id: string; category: string; question: string;
  config: Record<string, string | number>;
  stages: { lexical: Hit[]; dense: Hit[]; fused: Hit[]; reranked: Hit[] };
  overlap: { lexical_only: string[]; dense_only: string[]; both: string[] };
};

const STAGES = [
  { key: "lexical", label: "1 · Lexical (BM25)",
    blurb: "Term overlap. Finds exact wording, misses paraphrase." },
  { key: "dense", label: "2 · Dense (bge-small)",
    blurb: "Embedding similarity. Finds paraphrase, misses rare exact terms." },
  { key: "fused", label: "3 · RRF fusion",
    blurb: "Combines by RANK, not score — BM25 and cosine are not on comparable scales." },
  { key: "reranked", label: "4 · Cross-encoder rerank",
    blurb: "Reads query and passage together, so it can judge what neither retriever could." },
] as const;

export function RetrievalWalkthrough({ queries }: { queries: WalkthroughData[] }) {
  const [qi, setQi] = useState(0);
  const [stage, setStage] = useState<(typeof STAGES)[number]["key"]>("lexical");
  const [openChunk, setOpenChunk] = useState<string | null>(null);
  const q = queries[qi];
  const hits = q.stages[stage];
  const both = new Set(q.overlap.both);
  const lexOnly = new Set(q.overlap.lexical_only);

  return (
    <div className="border border-rule p-4 md:p-6">
      <label htmlFor="wt-query" className="eyebrow block mb-2">Query</label>
      <select id="wt-query" value={qi} onChange={(e) => { setQi(Number(e.target.value)); setOpenChunk(null); }}
        className="mono text-[length:var(--t-75)] border border-rule bg-paper px-2 py-1 w-full max-w-full">
        {queries.map((x, i) => (
          <option key={x.query_id} value={i}>
            [{x.category}] {x.question.slice(0, 60)}
          </option>
        ))}
      </select>
      <p className="mt-3 prose-measure">{q.question}</p>

      <div className="mt-5 flex flex-wrap gap-1" role="tablist" aria-label="Retrieval stage">
        {STAGES.map((s) => (
          <button key={s.key} type="button" role="tab" aria-selected={stage === s.key}
            onClick={() => setStage(s.key)}
            className={`mono text-[length:var(--t-75)] border px-2 py-1 ${
              stage === s.key ? "border-ink text-ink" : "border-rule text-ink-muted"}`}>
            {s.label}
          </button>
        ))}
      </div>
      <p className="mono text-[length:var(--t-75)] text-ink-muted mt-2">
        {STAGES.find((s) => s.key === stage)!.blurb}
      </p>

      {stage === "fused" ? (
        <p className="mono text-[length:var(--t-75)] mt-3">
          Of the top {q.stages.lexical.length} from each path,{" "}
          <span className="text-ink">{q.overlap.both.length}</span> appear in both,{" "}
          {q.overlap.lexical_only.length} are lexical-only and{" "}
          {q.overlap.dense_only.length} are dense-only. Fusion is what keeps the
          {" "}{q.overlap.lexical_only.length + q.overlap.dense_only.length} either
          path would have lost.
        </p>
      ) : null}

      <ol className="mt-4 space-y-1">
        {hits.map((h) => {
          const open = openChunk === h.chunk_id;
          const origin = both.has(h.chunk_id) ? "both"
            : lexOnly.has(h.chunk_id) ? "lexical" : "dense";
          return (
            <li key={h.chunk_id} className="border border-rule">
              <button type="button" aria-expanded={open}
                onClick={() => setOpenChunk(open ? null : h.chunk_id)}
                className="w-full text-left px-3 py-2 mono text-[length:var(--t-75)]">
                <span className="tabular-nums text-ink-muted mr-3">{String(h.rank).padStart(2, "0")}</span>
                <span className="text-ink">{h.doc_id.slice(0, 34)}</span>
                <span className="text-ink-muted"> · p{h.page} · {h.tenant}</span>
                {stage === "reranked" && h.movement !== undefined && h.movement !== 0 ? (
                  <span className={h.movement > 0 ? "text-signal" : "text-regress"}>
                    {" "}{h.movement > 0 ? "▲" : "▼"}{Math.abs(h.movement)}
                  </span>
                ) : null}
                {stage === "fused" ? (
                  <span className="text-ink-muted">
                    {" "}· rrf {h.rrf_score?.toFixed(5)}
                    {h.lexical_rank ? ` · lex#${h.lexical_rank}` : ""}
                    {h.dense_rank ? ` · dense#${h.dense_rank}` : ""}
                  </span>
                ) : h.score !== undefined ? (
                  <span className="text-ink-muted"> · {h.score.toFixed(3)}</span>
                ) : null}
                {stage !== "fused" ? (
                  <span className="text-ink-muted"> · {origin}</span>
                ) : null}
              </button>
              {open ? (
                <div className="px-3 pb-3 border-t border-rule">
                  <p className="mono text-[length:var(--t-75)] text-ink-muted mt-2">
                    {h.chunk_id} · section &quot;{h.section}&quot; · {h.n_tokens} tokens
                  </p>
                  <p className="mt-2 text-[length:var(--t-875)]">{h.excerpt}…</p>
                  {stage === "fused" ? (
                    <p className="mono text-[length:var(--t-75)] text-ink-muted mt-2">
                      {h.lexical_contribution ? `lexical 1/(60+${h.lexical_rank}) = ${h.lexical_contribution}` : "not in lexical top-20"}
                      {" + "}
                      {h.dense_contribution ? `dense 1/(60+${h.dense_rank}) = ${h.dense_contribution}` : "not in dense top-20"}
                      {" = "}{h.rrf_score}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
