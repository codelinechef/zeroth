"""
Hybrid retrieval — lexical and dense, both in-database, fused by rank.

Both paths run inside PostgreSQL so the same row-level security policy applies
to each. They are not affected identically: full-text search filters BEFORE
ranking and loses no recall, while vector search filters AFTER approximate
selection and can lose candidates. Both are correct under the policy; only one
is lossy. That asymmetry is reported rather than smoothed over.

Two things do different jobs in the SQL below and it is worth being precise:

  * The row-level security policy is the CORRECTNESS boundary. Remove the
    explicit tenant predicate and the results are unchanged.
  * The explicit tenant predicate is a PERFORMANCE hint. It lets the planner
    prune partitions at plan time instead of scanning all of them.

The security suite drops the predicate and must still pass. That is what
proves the predicate is an optimisation and not the boundary.
"""
from __future__ import annotations

import re
import time
from dataclasses import dataclass, field

from retrieval.plan import capture, assert_shape, Plan

# Measured, not defaulted. On the tuning sweep m=32/ef_construction=200 with
# ef_search=200 reached 0.998 overall recall where the defaults reached 0.836.
DEFAULT_EF_SEARCH = 200
RRF_K = 60
_WORD = re.compile(r"[a-z0-9]+")

# How many query terms the lexical path ORs together. ORing all of them made a
# 31-term question match 90% of the corpus, and ts_rank_cd then scored 46,000
# rows at 3,300 ms. The most selective terms carry nearly all the signal.
LEXICAL_TERMS = 8


@dataclass
class Hit:
    chunk_id: str
    doc_id: str
    tenant: str
    page: int | None
    section: str | None
    body: str
    score: float = 0.0
    lexical_rank: int | None = None
    dense_rank: int | None = None
    rrf: float = 0.0


@dataclass
class RetrievalResult:
    hits: list[Hit]
    lexical: list[Hit]
    dense: list[Hit]
    plans: dict[str, str] = field(default_factory=dict)
    mode: str = "approximate"
    ef_search: int = DEFAULT_EF_SEARCH
    iterative_scan: str = "off"
    elapsed_ms: float = 0.0


# OR semantics, deliberately. plainto_tsquery ANDs every term, so a natural
# question of a dozen words matched nothing in a 51,310-chunk corpus and the
# lexical half of the hybrid retriever returned zero hits for every query.
# ts_rank_cd then does the discriminating: coverage density ranks a chunk
# containing many of the query terms above one containing a single common word.
LEXICAL_SQL = """
SELECT chunk_id, doc_id, tenant, page, section, body,
       ts_rank_cd(tsv, query) AS score
FROM zeroth.chunk, websearch_to_tsquery('english', %s) AS query
WHERE tenant = ANY(%s::text[]) AND tsv @@ query
ORDER BY score DESC
LIMIT %s
"""

DENSE_SQL = """
SELECT chunk_id, doc_id, tenant, page, section, body,
       1 - (embedding <=> %s::vector) AS score
FROM zeroth.chunk
WHERE tenant = ANY(%s::text[]) AND embedding IS NOT NULL
ORDER BY embedding <=> %s::vector
LIMIT %s
"""


def _selective_query(cur, question: str) -> str:
    """Build the lexical query from the most selective terms only.

    websearch_to_tsquery ANDs by default, which matches nothing for a natural
    question. ORing every term matches almost everything. Neither is useful, so
    the terms are ranked by document frequency and only the rarest are kept —
    which is the same signal BM25's idf uses.
    """
    words = [w for w in dict.fromkeys(_WORD.findall(question.lower())) if len(w) > 2]
    if not words:
        return question
    # Normalise to lexemes so the lookup matches what is stored in tsv.
    cur.execute(
        """SELECT w, l.df
           FROM unnest(%s::text[]) AS w
           LEFT JOIN LATERAL (
               SELECT d.df FROM zeroth.lexeme_df d
               WHERE d.lexeme = (SELECT lexeme FROM unnest(
                   to_tsvector('english', w)) AS t(lexeme, positions, weights) LIMIT 1)
           ) l ON true""", (words,))
    scored = cur.fetchall()
    # A term absent from the table is either rarer than anything recorded or
    # was filtered out as too common; treat unknown as maximally selective, and
    # let the ranking sort it out.
    ranked = sorted(scored, key=lambda r: (r[1] is None and 1 or 0, r[1] or 0))
    keep = [w for w, _ in ranked[:LEXICAL_TERMS]]
    return " OR ".join(keep) if keep else question


def _rows_to_hits(rows) -> list[Hit]:
    return [Hit(chunk_id=r[0], doc_id=r[1], tenant=r[2], page=r[3],
                section=r[4], body=r[5], score=float(r[6])) for r in rows]


def retrieve(conn, question: str, query_vec, *, k: int = 20,
             ef_search: int = DEFAULT_EF_SEARCH,
             iterative_scan: str = "off",
             mode: str = "approximate",
             assert_plans: bool = True) -> RetrievalResult:
    """Run both paths and fuse. The caller must already have set the retrieval
    role on this transaction — see db.connection.as_role.

    `mode` PINS the execution plan rather than leaving it to cost estimates:

      "approximate" — force the HNSW index. What a production system at scale
                      does, and what the published recall figures describe.
      "exact"       — force a sequential scan. Ground truth for measuring how
                      much the approximate path loses.

    This exists because the planner will otherwise choose for itself and the
    choice moves with the data. At the current corpus size a per-tenant
    partition averages about 1,100 rows, and a sequential scan over that is
    genuinely cheaper than an index walk — so the planner picks it, the
    results become exact, and recall rises. Nothing errors. As tenants grow
    some partitions flip to index scans and recall silently falls again.
    Pinning removes the variable; recording the plan proves it was pinned."""
    t0 = time.time()
    plans: dict[str, str] = {}
    lit = "[" + ",".join(f"{x:.6f}" for x in query_vec) + "]"

    with conn.cursor() as cur:
        # set_config(..., is_local => true) is the parameterisable form of
        # SET LOCAL. SET itself does not accept bind parameters, and building
        # the statement by string interpolation would put caller input into
        # SQL text.
        cur.execute("SELECT set_config('hnsw.ef_search', %s, true)",
                    (str(int(ef_search)),))
        if iterative_scan not in ("off", "relaxed_order", "strict_order"):
            raise ValueError(f"unknown iterative_scan mode: {iterative_scan!r}")
        cur.execute("SELECT set_config('hnsw.iterative_scan', %s, true)",
                    (iterative_scan,))
        if mode not in ("approximate", "exact"):
            raise ValueError(f"mode must be 'approximate' or 'exact', got {mode!r}")

        # The permitted tenants, passed as an EXPLICIT predicate.
        #
        # This is a performance hint, not the security boundary. Row-level
        # security already restricts the rows; adding the same restriction as a
        # WHERE clause lets the planner PRUNE partitions instead of scanning
        # all 47 and applying the policy per row. Measured: the policy alone
        # cost 789 ms where the pruned query costs a fraction of that.
        #
        # The security suite removes this predicate and must still pass. That
        # is what proves it is an optimisation rather than the boundary.
        cur.execute("SELECT zeroth.current_tenants()")
        permitted = cur.fetchone()[0] or []

        or_query = _selective_query(cur, question)
        p_lex: Plan = capture(cur, LEXICAL_SQL, (or_query, permitted, k))
        plans["lexical"] = p_lex.shape
        cur.execute(LEXICAL_SQL, (or_query, permitted, k))
        lexical = _rows_to_hits(cur.fetchall())

        # Plan pinning applies to the DENSE query only, and is scoped to it.
        #
        # A GIN index is reachable only through a bitmap scan, so disabling
        # bitmap scans to force the HNSW walk also destroys the lexical path —
        # it collapses into a sequential scan over every chunk and the query
        # takes minutes. The knobs go on immediately before the vector query
        # and come off immediately after.
        cur.execute("SELECT set_config('enable_bitmapscan', 'off', true)")
        if mode == "approximate":
            cur.execute("SELECT set_config('enable_seqscan', 'off', true)")
        elif mode == "exact":
            cur.execute("SELECT set_config('enable_indexscan', 'off', true)")
            cur.execute("SELECT set_config('enable_indexonlyscan', 'off', true)")
        else:
            raise ValueError(f"mode must be 'approximate' or 'exact', got {mode!r}")

        p_dense: Plan = capture(cur, DENSE_SQL, (lit, permitted, lit, k))
        plans["dense"] = p_dense.shape
        if assert_plans:
            expected = "Index Scan" if mode == "approximate" else "Seq Scan"
            assert_shape(p_dense, expected, f"dense retrieval in {mode} mode")
        cur.execute(DENSE_SQL, (lit, permitted, lit, k))
        dense = _rows_to_hits(cur.fetchall())

        for knob in ("enable_bitmapscan", "enable_seqscan",
                     "enable_indexscan", "enable_indexonlyscan"):
            cur.execute(f"SELECT set_config('{knob}', 'on', true)")

    # Reciprocal Rank Fusion. Rank, never score: ts_rank_cd and cosine
    # similarity are not on comparable scales and normalising them requires
    # assumptions that are wrong differently for every query.
    fused: dict[str, Hit] = {}
    for rank, h in enumerate(lexical, 1):
        fused.setdefault(h.chunk_id, Hit(**{**h.__dict__}))
        fused[h.chunk_id].lexical_rank = rank
        fused[h.chunk_id].rrf += 1.0 / (RRF_K + rank)
    for rank, h in enumerate(dense, 1):
        cur_hit = fused.setdefault(h.chunk_id, Hit(**{**h.__dict__}))
        cur_hit.dense_rank = rank
        cur_hit.rrf += 1.0 / (RRF_K + rank)

    hits = sorted(fused.values(), key=lambda h: -h.rrf)[:k]
    return RetrievalResult(hits=hits, lexical=lexical, dense=dense, plans=plans,
                           mode=mode, ef_search=ef_search,
                           iterative_scan=iterative_scan,
                           elapsed_ms=round((time.time() - t0) * 1000, 2))
