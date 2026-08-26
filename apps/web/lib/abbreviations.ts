/**
 * Abbreviations used in the prose, written out in full.
 *
 * Plain data, no filesystem access — this module is imported by a client
 * component, so it must not reach for `fs` the way lib/metrics.ts does.
 *
 * Scope rule: an entry earns its place only if the abbreviation actually
 * appears somewhere in the site's prose, figures or formulas. This is a
 * glossary of the paper, not a dictionary of the field.
 *
 * Metric NAMES are deliberately not duplicated here. Their full forms live in
 * the `expansion` field of content/metrics/*.json so the definition sits
 * beside the formula and range it belongs to, and there is one source of
 * truth. The bare mathematical abbreviations that appear inside those formulas
 * (DCG, IDCG) do live here, because the formula notation is where a reader
 * meets them.
 */

export type Abbreviation = {
  /** As written in the prose. */
  short: string;
  /** The full form. */
  full: string;
  /** One clause of context, where the full form alone does not settle it. */
  note?: string;
};

export const ABBREVIATIONS = {
  rag: {
    short: "RAG",
    full: "Retrieval-Augmented Generation",
    note: "Generation conditioned on documents fetched at query time rather than on model weights alone.",
  },
  sec: {
    short: "SEC",
    full: "US Securities and Exchange Commission",
  },
  edgar: {
    short: "EDGAR",
    full: "Electronic Data Gathering, Analysis, and Retrieval",
    note: "The SEC's public filing system, and the source of the 10-K filings in the corpus.",
  },
  cuad: {
    short: "CUAD",
    full: "Contract Understanding Atticus Dataset",
    note: "A set of commercial contracts with expert clause annotations, released by The Atticus Project.",
  },
  rfc: {
    short: "RFC",
    full: "Request for Comments",
    note: "The document series in which internet standards are published.",
  },
  ietf: {
    short: "IETF",
    full: "Internet Engineering Task Force",
  },
  bcp: {
    short: "BCP",
    full: "Best Current Practice",
    note: "An RFC sub-series carrying operational practice rather than a wire protocol.",
  },
  hnsw: {
    short: "HNSW",
    full: "Hierarchical Navigable Small World",
    note: "The graph index used for approximate nearest-neighbour search over the embedding vectors.",
  },
  ann: {
    short: "ANN",
    full: "Approximate Nearest Neighbour",
    note: "Trades exactness for speed: the index may miss a true neighbour, which is why post-filtering under access control can silently cost recall.",
  },
  baai: {
    short: "BAAI",
    full: "Beijing Academy of Artificial Intelligence",
    note: "Publisher of the bge embedding and reranker models used here.",
  },
  cuda: {
    short: "CUDA",
    full: "Compute Unified Device Architecture",
    note: "NVIDIA's GPU computing platform.",
  },
  tls: {
    short: "TLS",
    full: "Transport Layer Security",
  },
  ci: {
    short: "CI",
    full: "Confidence interval",
    note: "Here always a bootstrapped 95% interval over 1,000 resamples of the query set.",
  },
  dcg: {
    short: "DCG",
    full: "Discounted Cumulative Gain",
    note: "Sums graded relevance down the ranking, discounting each position logarithmically.",
  },
  idcg: {
    short: "IDCG",
    full: "Ideal Discounted Cumulative Gain",
    note: "The DCG of the best possible ordering, used as the normaliser.",
  },
  ccby: {
    short: "CC BY",
    full: "Creative Commons Attribution",
    note: "A licence permitting reuse with attribution.",
  },
} as const satisfies Record<string, Abbreviation>;

export type AbbrId = keyof typeof ABBREVIATIONS;

export function getAbbreviation(id: AbbrId): Abbreviation {
  return ABBREVIATIONS[id];
}

/** Alphabetical by the abbreviation as written, for the glossary. */
export function abbreviationList(): (Abbreviation & { id: AbbrId })[] {
  return (Object.keys(ABBREVIATIONS) as AbbrId[])
    .map((id) => ({ id, ...ABBREVIATIONS[id] }))
    .sort((a, b) => a.short.localeCompare(b.short));
}
