"""
Metric implementations — brief §8. Explicit, no evaluation framework.

Every metric here is a pure function over data the harness already has, so it
can be tested without a database, a model or a GPU. That matters more than it
sounds: a scorer that can only be exercised by running the whole pipeline is a
scorer nobody checks, and a silently wrong scorer produces numbers that look
fine and are not.

Relevance convention, from the golden-set rubric:

    3  fully answers the question on its own
    2  contains a substantial part of the answer
    1  related context, but does not contain the answer
    0  not relevant

A chunk counts as RELEVANT at grade >= 2. Grade 1 is deliberately excluded:
"related context" is not an answer, and counting it inflates every retrieval
number against a golden set whose 1s are the most subjective grades in it.
"""
from __future__ import annotations

import math
from dataclasses import dataclass

RELEVANT_AT = 2


@dataclass
class Judged:
    """One query's retrieval result, with the grade of each returned chunk."""
    query_id: str
    #: chunk ids in rank order, best first
    retrieved: list[str]
    #: chunk_id -> grade, for every chunk the golden set has judged
    grades: dict[str, int]

    def grade_of(self, chunk_id: str) -> int:
        """Unjudged chunks score 0.

        A chunk nobody graded is not evidence of relevance. Treating it as
        unknown and skipping it would quietly drop the hardest cases — the
        ones the retriever surfaced and the judge never saw.
        """
        return self.grades.get(chunk_id, 0)


def recall_at_k(j: Judged, k: int) -> float:
    """1.0 if any chunk graded >= 2 appears in the top k, else 0.0.

    Binary per query by design (brief §8: "proportion of queries where >=1
    chunk graded >=2 appears in top k"), then averaged across queries. This is
    NOT the ratio of relevant chunks found, and the difference matters: a query
    with eight relevant chunks should not outweigh one with a single answer.
    """
    return 1.0 if any(j.grade_of(c) >= RELEVANT_AT for c in j.retrieved[:k]) else 0.0


def mrr_at_k(j: Judged, k: int = 10) -> float:
    """Reciprocal rank of the FIRST relevant chunk, 0.0 if none in top k."""
    for i, c in enumerate(j.retrieved[:k], start=1):
        if j.grade_of(c) >= RELEVANT_AT:
            return 1.0 / i
    return 0.0


def dcg(grades: list[int]) -> float:
    """Sum of (2^grade - 1) / log2(rank + 1), rank starting at 1."""
    return sum((2 ** g - 1) / math.log2(i + 1) for i, g in enumerate(grades, start=1))


def ndcg_at_k(j: Judged, k: int = 10) -> float:
    """DCG over the returned order, normalised by the best possible order.

    The ideal ranking is drawn from every judged chunk for the query, not only
    the ones retrieved. Normalising against what was returned would score a
    retriever against its own output and make a run that missed the best chunk
    entirely look perfect.
    """
    got = [j.grade_of(c) for c in j.retrieved[:k]]
    ideal = sorted(j.grades.values(), reverse=True)[:k]
    idcg = dcg(ideal)
    if idcg == 0:
        # No relevant chunk exists for this query, so there is nothing to rank
        # correctly. Scoring 0 would punish the retriever for the golden set.
        return 0.0
    return dcg(got) / idcg


def context_precision(j: Judged, k: int = 10) -> float:
    """Proportion of the returned chunks that are actually relevant."""
    top = j.retrieved[:k]
    if not top:
        return 0.0
    return sum(1 for c in top if j.grade_of(c) >= RELEVANT_AT) / len(top)


# ---------------------------------------------------------------------------
# Grounding. These operate on the verification output the graph already
# produces, so the harness scores what the pipeline actually checked rather
# than re-deriving it differently here.
# ---------------------------------------------------------------------------

@dataclass
class AnswerRecord:
    query_id: str
    answerable: bool
    abstained: bool
    answer: str
    #: one entry per claim: {"resolved": bool, "verified": bool, "overlap": float}
    citations: list[dict]
    #: claims the model emitted, whether or not they carried a citation
    claim_count: int


def citation_accuracy(a: AnswerRecord) -> float | None:
    """Proportion of citations that resolve AND whose quote verifies.

    Returns None when the answer carried no citations at all — there is no
    accuracy to report, and averaging a 0.0 in would conflate "cited badly"
    with "did not cite", which citation_coverage measures separately.
    """
    if not a.citations:
        return None
    good = sum(1 for c in a.citations if c.get("resolved") and c.get("verified"))
    return good / len(a.citations)


def citation_coverage(a: AnswerRecord) -> float | None:
    """Proportion of claims carrying a citation. None when there are no claims."""
    if a.claim_count == 0:
        return None
    return min(len(a.citations), a.claim_count) / a.claim_count


def abstention_correct(a: AnswerRecord) -> float:
    """1.0 when the abstention decision matched the query's answerability.

    Both directions count. Declining an answerable query is as wrong as
    answering an unanswerable one, and a metric that only punished the second
    would reward a system that abstains from everything.
    """
    return 1.0 if a.abstained == (not a.answerable) else 0.0


# ---------------------------------------------------------------------------
# Latency and cost
# ---------------------------------------------------------------------------

def percentile(values: list[float], p: float) -> float:
    """Linear-interpolated percentile. p in [0, 100]."""
    if not values:
        return 0.0
    xs = sorted(values)
    if len(xs) == 1:
        return xs[0]
    pos = (len(xs) - 1) * (p / 100.0)
    lo = math.floor(pos)
    hi = math.ceil(pos)
    if lo == hi:
        return xs[int(pos)]
    return xs[lo] + (xs[hi] - xs[lo]) * (pos - lo)


def cost_per_query(prompt_tokens: int, output_tokens: int,
                   rate_in: float, rate_out: float) -> float:
    """Token cost in USD. Rates are per 1,000,000 tokens.

    Local models have rates of 0.0 and therefore cost 0.0. That is stated
    openly rather than hidden: it is a real property of the configuration, and
    a hosted variant is not comparable to it on cost without saying so.
    """
    return (prompt_tokens * rate_in + output_tokens * rate_out) / 1_000_000
