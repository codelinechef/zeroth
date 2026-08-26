"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { datasetUrl } from "@/lib/dataUrl";

/* ---------------------------------------------------------------------------
   Shapes. These match what scripts/prepare-data.mjs writes: chunk bodies are
   hoisted into `chunks`, and the stages carry only positional fields.
--------------------------------------------------------------------------- */

export type ChunkBody = {
  doc_id: string; tenant: string; page: number;
  section: string; n_tokens: number; excerpt: string;
};

export type Position = {
  chunk_id: string;
  rank: number;
  score?: number;
  rrf_score?: number;
  lexical_rank?: number;
  dense_rank?: number;
  lexical_contribution?: number;
  dense_contribution?: number;
  movement?: number;
  moved_from_fused?: number;
};

export type StageKey = "lexical" | "dense" | "fused" | "reranked";

export type WalkthroughData = {
  query_id: string;
  category: string;
  question: string;
  config: Record<string, string | number>;
  chunks: Record<string, ChunkBody>;
  stages: Record<StageKey, Position[]>;
  overlap: { lexical_only: string[]; dense_only: string[]; both: string[] };
};

/** What the page inlines for every query: enough to populate the picker. */
export type QueryMeta = { query_id: string; category: string; question: string };

const STAGES: { key: StageKey; label: string; short: string; blurb: string }[] = [
  { key: "lexical", label: "1 · Lexical (BM25)", short: "BM25",
    blurb: "Term overlap. Finds exact wording, misses paraphrase." },
  { key: "dense", label: "2 · Dense (bge-small)", short: "Dense",
    blurb: "Embedding similarity. Finds paraphrase, misses rare exact terms." },
  { key: "fused", label: "3 · RRF fusion", short: "RRF",
    blurb: "Combines by RANK, not score — BM25 and cosine are not on comparable scales." },
  { key: "reranked", label: "4 · Cross-encoder rerank", short: "Rerank",
    blurb: "Reads query and passage together, so it can judge what neither retriever could." },
];

export function RetrievalWalkthrough({
  queries,
  initial,
}: {
  queries: QueryMeta[];
  /** The first trace, inlined so the demo renders without a round trip. */
  initial: WalkthroughData;
}) {
  const [qid, setQid] = useState(initial.query_id);
  const [data, setData] = useState<WalkthroughData>(initial);
  const [stage, setStage] = useState<StageKey>("lexical");
  const [openChunk, setOpenChunk] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  // Traces already fetched. Keeps switching back to a query instant, and keeps
  // the inlined first trace as the seed so it is never re-fetched.
  const cache = useRef<Map<string, WalkthroughData>>(
    new Map([[initial.query_id, initial]])
  );
  // Guards against a slow response for a query the reader has already left.
  const wanted = useRef(initial.query_id);

  const select = useCallback(async (next: string) => {
    setQid(next);
    setOpenChunk(null);
    setFailed(null);
    wanted.current = next;

    const hit = cache.current.get(next);
    if (hit) { setData(hit); setLoading(false); return; }

    setLoading(true);
    try {
      const res = await fetch(datasetUrl(`retrieval/${next}.json`));
      if (!res.ok) throw new Error(String(res.status));
      const json = (await res.json()) as WalkthroughData;
      cache.current.set(next, json);
      if (wanted.current !== next) return; // reader moved on
      setData(json);
    } catch {
      if (wanted.current !== next) return;
      setFailed(next);
    } finally {
      if (wanted.current === next) setLoading(false);
    }
  }, []);

  // Warm the next likely selection once the page is idle, so the common case
  // of stepping through queries in order costs nothing visible.
  useEffect(() => {
    const i = queries.findIndex((q) => q.query_id === qid);
    const next = queries[i + 1]?.query_id;
    if (!next || cache.current.has(next)) return;
    const idle = window.requestIdleCallback?.bind(window) ??
      ((cb: () => void) => window.setTimeout(cb, 1200));
    const handle = idle(() => {
      // datasetUrl throws on a path that fails validation, and this runs
      // outside the fetch's own catch, so it is guarded here too. A prefetch
      // is best-effort by definition: on any failure the real selection
      // re-fetches and reports properly.
      try {
        fetch(datasetUrl(`retrieval/${next}.json`))
          .then((r) => (r.ok ? r.json() : null))
          .then((j) => { if (j) cache.current.set(next, j); })
          .catch(() => {});
      } catch { /* invalid id — selection will surface it */ }
    });
    return () => window.cancelIdleCallback?.(handle as number);
  }, [qid, queries]);

  const positions = data.stages[stage] ?? [];
  const both = new Set(data.overlap.both);
  const lexOnly = new Set(data.overlap.lexical_only);

  /**
   * Where one chunk sits in every stage — the point of the demo.
   * A rank of null means the stage never surfaced it, which is as informative
   * as any number here: it is how you see fusion rescue a chunk one retriever
   * missed entirely.
   */
  const journey = (chunkId: string) =>
    STAGES.map((s) => ({
      ...s,
      rank: data.stages[s.key]?.find((p) => p.chunk_id === chunkId)?.rank ?? null,
    }));

  return (
    <div className="border border-rule p-4 md:p-6">
      <label htmlFor="wt-query" className="eyebrow block mb-2">Query</label>
      <select
        id="wt-query"
        value={qid}
        onChange={(e) => select(e.target.value)}
        className="mono text-[length:var(--t-75)] border border-rule bg-paper px-2 py-1 w-full max-w-full"
      >
        {queries.map((x) => (
          <option key={x.query_id} value={x.query_id}>
            [{x.category}] {x.question.slice(0, 60)}
          </option>
        ))}
      </select>

      {/* Reserved row: the status line must not push the demo down when it
          appears, or every query change becomes a layout shift. */}
      <p className="mono text-[length:var(--t-75)] text-ink-muted mt-2 min-h-[1.4em]" aria-live="polite">
        {failed ? `Could not load ${failed}. Select it again to retry.`
          : loading ? "Loading trace…"
          : ""}
      </p>

      <p className="mt-1 prose-measure">{data.question}</p>

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
          Of the top {data.stages.lexical.length} from each path,{" "}
          <span className="text-ink">{data.overlap.both.length}</span> appear in both,{" "}
          {data.overlap.lexical_only.length} are lexical-only and{" "}
          {data.overlap.dense_only.length} are dense-only. Fusion is what keeps the
          {" "}{data.overlap.lexical_only.length + data.overlap.dense_only.length} either
          path would have lost.
        </p>
      ) : null}

      <ol className={`mt-4 space-y-1 ${loading ? "opacity-50" : ""}`}>
        {positions.map((h) => {
          const c = data.chunks[h.chunk_id];
          if (!c) return null;
          const open = openChunk === h.chunk_id;
          const origin = both.has(h.chunk_id) ? "both"
            : lexOnly.has(h.chunk_id) ? "lexical" : "dense";
          return (
            <li key={h.chunk_id} className="border border-rule">
              <button type="button" aria-expanded={open}
                onClick={() => setOpenChunk(open ? null : h.chunk_id)}
                className="w-full text-left px-3 py-2 mono text-[length:var(--t-75)]">
                <span className="tabular-nums text-ink-muted mr-3">{String(h.rank).padStart(2, "0")}</span>
                <span className="text-ink">{c.doc_id.slice(0, 34)}</span>
                <span className="text-ink-muted"> · p{c.page} · {c.tenant}</span>
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
                  {/* The journey. Reading one row across is the whole argument
                      for a hybrid pipeline: you can see which stage found this
                      chunk and which stage nearly lost it. */}
                  <p className="eyebrow mt-3 mb-1.5">Rank at each stage</p>
                  <ol className="journey">
                    {journey(h.chunk_id).map((j) => (
                      <li key={j.key} className={j.key === stage ? "is-current" : ""}>
                        <span className="journey-stage">{j.short}</span>
                        <span className={`journey-rank ${j.rank === null ? "is-absent" : ""}`}>
                          {j.rank === null ? "—" : String(j.rank).padStart(2, "0")}
                        </span>
                      </li>
                    ))}
                  </ol>
                  <p className="mono text-[length:var(--t-75)] text-ink-muted mt-1.5">
                    &mdash; means the stage did not return this chunk at all.
                  </p>

                  <p className="mono text-[length:var(--t-75)] text-ink-muted mt-3">
                    {h.chunk_id} · section &quot;{c.section}&quot; · {c.n_tokens} tokens
                  </p>
                  <p className="mt-2 text-[length:var(--t-875)]">{c.excerpt}…</p>
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
