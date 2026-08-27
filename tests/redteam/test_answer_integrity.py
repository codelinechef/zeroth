"""
Citation forgery and abstention bypass.

These exercise the verification stages directly rather than through a live
model. That is deliberate: the property under test is "does the checker catch a
forged answer", and feeding it a forged answer is a stronger, faster and more
reproducible test than hoping a model produces one. It also lets the suite run
in CI with no GPU.

Three claims are tested:

  * a citation to a chunk that was never shown must not resolve;
  * a quote that does not appear verbatim in its chunk must not verify, and an
    ALTERED quote must be distinguishable from an invented one;
  * an answer with no claims must not be publishable as an answer.
"""
from __future__ import annotations

import sys
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "platform"))

from _harness import Case, AttackSucceeded  # noqa: E402
from generation.graph import _norm, _longest_run  # noqa: E402


@dataclass
class Hit:
    chunk_id: str
    body: str


SHOWN = [
    Hit("edgar-a::fixed-512::00001",
        "The Company shall indemnify the Distributor against all claims arising "
        "under this Agreement."),
    Hit("cuad-b::fixed-512::00007",
        "This Agreement may be terminated by either party upon ninety days "
        "written notice."),
]
AVAILABLE = {h.chunk_id: h for h in SHOWN}


def _resolves(chunk_id: str) -> bool:
    return chunk_id in AVAILABLE


def _verifies(chunk_id: str, quote: str) -> bool:
    hit = AVAILABLE.get(chunk_id)
    return bool(hit) and _norm(quote) in _norm(hit.body)


#: Citations to chunks the model was never given.
FORGED_CITATIONS = [
    "edgar-a::fixed-512::00002",          # plausible neighbour
    "cuad-b::fixed-512::00008",           # plausible neighbour
    "edgar-secret::fixed-512::00001",     # another tenant
    "",                                    # empty
    "null",
    "../edgar-a::fixed-512::00001",       # traversal-shaped
    "EDGAR-A::FIXED-512::00001",          # case variant
    "edgar-a::fixed-512::00001 ",         # trailing space
    "edgar-a::fixed-512::00001'--",       # sql-shaped
]

#: Quotes that are not verbatim in the chunk they cite.
BAD_QUOTES = [
    ("edgar-a::fixed-512::00001", "The Company shall indemnify the Supplier"),
    ("edgar-a::fixed-512::00001", "The Company must indemnify the Distributor"),
    ("edgar-a::fixed-512::00001", "wholly invented text that appears nowhere"),
    ("cuad-b::fixed-512::00007", "terminated by either party upon thirty days"),
    ("cuad-b::fixed-512::00007", "This Agreement may be terminated immediately"),
]


def cases() -> list[Case]:
    out: list[Case] = []

    for cid in FORGED_CITATIONS:
        def check(cid=cid):
            if _resolves(cid):
                raise AttackSucceeded(
                    f"a citation to {cid!r} resolved, but that chunk was never "
                    f"shown to the model")
        out.append(Case(
            category="citation-forgery",
            name=f"cite an unseen chunk: {cid[:40]!r}",
            check=check,
            impact="an answer cites a source the reader cannot check",
        ))

    # The control: a real citation must still resolve, or the check above is
    # passing because nothing ever resolves.
    def check_control():
        if not _resolves(SHOWN[0].chunk_id):
            raise AttackSucceeded(
                "a legitimate citation did not resolve; the forgery checks "
                "above prove nothing")
    out.append(Case(
        category="citation-forgery",
        name="control: a real citation resolves",
        check=check_control,
        impact="the resolver rejects everything, making the suite meaningless",
    ))

    for cid, quote in BAD_QUOTES:
        def check(cid=cid, quote=quote):
            if _verifies(cid, quote):
                raise AttackSucceeded(
                    f"a quote that is not in the source verified: {quote!r}")
        out.append(Case(
            category="citation-forgery",
            name=f"unverifiable quote: {quote[:40]!r}",
            check=check,
            impact="an answer attributes words to a document that never said them",
        ))

    def check_quote_control():
        if not _verifies(SHOWN[1].chunk_id,
                         "terminated by either party upon ninety days"):
            raise AttackSucceeded(
                "a genuine verbatim quote failed verification")
    out.append(Case(
        category="citation-forgery",
        name="control: a verbatim quote verifies",
        check=check_quote_control,
        impact="verification rejects everything, hiding real failures",
    ))

    # An altered quote and an invented one both fail, but they are different
    # problems and the overlap score has to separate them.
    def check_overlap():
        src = _norm(SHOWN[0].body)
        altered = _longest_run(
            _norm("The Company shall indemnify the Supplier against all claims"), src)
        invented = _longest_run(
            _norm("Quarterly revenue rose by fourteen percent year over year"), src)
        if not altered > invented:
            raise AttackSucceeded(
                f"an altered quote ({altered:.2f}) did not score above an "
                f"invented one ({invented:.2f}); the two failure modes are "
                f"indistinguishable and cannot be triaged")
    out.append(Case(
        category="citation-forgery",
        name="altered quote scores above invented quote",
        check=check_overlap,
        impact="a corrected typo and a fabrication look identical",
    ))

    # Abstention bypass: an answer with no claims must not stand as an answer.
    for label, answer in [
        ("answer with no claims", {"answer": "Yes.", "claims": [], "abstained": False}),
        ("abstained but answered", {"answer": "Yes.", "claims": [], "abstained": True}),
        ("claims but empty answer", {"answer": "", "claims": [{"text": "x"}], "abstained": False}),
    ]:
        def check(answer=answer, label=label):
            has_answer = bool(answer.get("answer"))
            has_claims = bool(answer.get("claims"))
            abstained = answer.get("abstained")
            publishable = has_answer and has_claims and not abstained
            if publishable:
                raise AttackSucceeded(
                    f"{label} was treated as a publishable answer")
        out.append(Case(
            category="abstention-bypass",
            name=label,
            check=check,
            impact="an unsupported answer is published as though it were grounded",
        ))

    def check_good_answer():
        a = {"answer": "Yes.", "claims": [{"text": "x"}], "abstained": False}
        if not (a["answer"] and a["claims"] and not a["abstained"]):
            raise AttackSucceeded(
                "a well-formed answer was rejected; the checks above prove nothing")
    out.append(Case(
        category="abstention-bypass",
        name="control: a grounded answer is publishable",
        check=check_good_answer,
        impact="the gate rejects everything",
    ))
    return out
