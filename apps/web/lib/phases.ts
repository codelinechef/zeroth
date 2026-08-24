export type PhaseStatus = "done" | "in-progress" | "planned";

export type Phase = {
  n: number;
  title: string;
  status: PhaseStatus;
  delivers: string;
  /** What becomes visible on this site once it lands. */
  visible: string;
  blockedBy?: string;
};

/**
 * The full arc. Status reflects what is actually in the repository, not
 * intention — a phase is "done" only when its gate was met and reported.
 */
export const PHASES: Phase[] = [
  { n: 0, title: "Shell", status: "done",
    delivers: "Static site, design tokens, layout, honest empty states.",
    visible: "Every route, with empty states that say what has not happened yet." },
  { n: 1, title: "Corpus and golden set", status: "in-progress",
    delivers: "Three public sources fetched, parsed, chunked two ways, tenants assigned, duplicates removed; 200 queries with graded relevance judgments.",
    visible: "Corpus composition, and the agreement rate between the drafted judgments and a stratified human sample.",
    blockedBy: "golden set generation" },
  { n: 2, title: "The platform", status: "planned",
    delivers: "Postgres with pgvector and row-level security, idempotent ingestion, hybrid retrieval fused by RRF, cross-encoder reranking, constrained generation, citation resolution and quote verification.",
    visible: "The pipeline figure moves from planned to implemented, and per-query drill-downs become possible." },
  { n: 3, title: "Security", status: "planned",
    delivers: "Row-level security policies enforced inside the retrieval query, and a red-team suite gated in CI.",
    visible: "Red-team results, including any attacks that succeed.",
    blockedBy: "Phase 2" },
  { n: 4, title: "Evaluation harness", status: "planned",
    delivers: "Every metric implemented explicitly, with bootstrapped confidence intervals and an embedding cache.",
    visible: "Metric panels gain real computed values and intervals.",
    blockedBy: "Phases 1 and 2" },
  { n: 5, title: "Variants and publish", status: "planned",
    delivers: "Nine configurations, each differing from the baseline by exactly one factor.",
    visible: "The results table, run detail pages, and the cost/quality frontier.",
    blockedBy: "Phase 4" },
  { n: 6, title: "Writing", status: "planned",
    delivers: "Posts on what the measurements actually showed, with a feed and search.",
    visible: "The writing section.",
    blockedBy: "Phase 5, which supplies the material" },
  { n: 7, title: "Feed", status: "planned",
    delivers: "An automated digest, pull-request gated, with no automatic publishing path.",
    visible: "The feed section.",
    blockedBy: "Phase 6 having real content" },
];
