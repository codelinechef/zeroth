#!/usr/bin/env python3
"""
Precompute the chunking explorer dataset — one real document per source.

Re-runs the real chunkers from harness/corpus/parse.py over real parsed text,
so the boundaries shown are the boundaries the corpus actually has.

    python3 harness/interactive/chunking.py
"""
from __future__ import annotations

import importlib.util
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from _provenance import ROOT, write  # noqa: E402

spec = importlib.util.spec_from_file_location(
    "parsemod", ROOT / "harness" / "corpus" / "parse.py")
pm = importlib.util.module_from_spec(spec)
sys.modules["parsemod"] = pm
spec.loader.exec_module(pm)

PARSED = ROOT / "data" / "corpus" / "parsed"
SENTENCE_END = re.compile(r"[.!?:;]\s*$")


def pick_documents() -> dict[str, str]:
    """One document per source, chosen deterministically: the median-length
    parsed document of each source, so nothing is cherry-picked for effect."""
    by_source: dict[str, list[tuple[int, str]]] = {}
    for f in sorted(PARSED.glob("*.json")):
        d = json.loads(f.read_text())
        by_source.setdefault(d["source"], []).append((len(d["text"]), d["doc_id"]))
    picks = {}
    for src, items in by_source.items():
        items.sort()
        picks[src] = items[len(items) // 2][1]
    return picks


def section_at(parsed: dict, pos: int) -> str:
    run = 0
    for b in parsed["blocks"]:
        run += b["len"] + 1
        if pos < run:
            return b["section"]
    return parsed["blocks"][-1]["section"] if parsed["blocks"] else ""


def spans(parsed: dict, chunks: list[dict]) -> list[dict]:
    """Locate each chunk in the document text so boundaries can be drawn."""
    text = parsed["text"]
    out, cursor = [], 0
    for c in chunks:
        body = c["text"]
        i = text.find(body[:120], cursor)
        if i == -1:
            i = text.find(body[:60])
        start = i if i != -1 else cursor
        end = start + len(body)
        prefix = text[max(0, start - 60):start]
        # A boundary that does not follow sentence-ending punctuation has cut
        # into a sentence. This is the difference the explorer exists to show.
        mid_sentence = bool(prefix.strip()) and not SENTENCE_END.search(prefix)
        # The real differentiator between the strategies. Starting mid-sentence
        # is common to both — section-aware splits long sections internally
        # with the same overlap, so only its section-boundary chunks start
        # cleanly. What section-aware actually guarantees is that a chunk never
        # spans two sections, and that is what this measures.
        crosses = section_at(parsed, start) != section_at(parsed, max(start, end - 1))
        out.append({
            "ordinal": c["ordinal"], "page": c["page"], "section": c["section"],
            "n_tokens": c["n_tokens"], "char_start": start, "char_end": end,
            "starts_mid_sentence": mid_sentence,
            "crosses_section": crosses,
            "head": body[:180], "tail": body[-120:],
        })
        cursor = max(cursor, start + 1)
    return out


def main() -> int:
    from transformers import AutoTokenizer, logging as hf
    hf.set_verbosity_error()
    tok = AutoTokenizer.from_pretrained(pm.EMBED_MODEL)
    ch = pm.Chunker(tok)

    picks = pick_documents()
    print(f"documents: {picks}")
    index = []

    for source, doc_id in picks.items():
        parsed = json.loads((PARSED / f"{doc_id}.json").read_text())
        parsed.setdefault("tenant", "")
        fixed = ch.fixed(parsed)
        section = ch.section_aware(parsed)
        f_spans, s_spans = spans(parsed, fixed), spans(parsed, section)

        payload = {
            "doc_id": doc_id,
            "source": source,
            "doc_chars": len(parsed["text"]),
            "pages": parsed["pages"],
            "pages_source": parsed["pages_source"],
            "sections": len({b["section"] for b in parsed["blocks"]}),
            "strategies": {
                "fixed-512": {
                    "chunks": len(f_spans),
                    "max_tokens": pm.CHUNK_TOKENS,
                    "overlap": pm.OVERLAP_FRACTION,
                    "mid_sentence_starts": sum(c["starts_mid_sentence"] for c in f_spans),
                    "crossing_sections": sum(c["crosses_section"] for c in f_spans),
                    "spans": f_spans,
                },
                "section-aware": {
                    "chunks": len(s_spans),
                    "max_tokens": pm.CHUNK_TOKENS,
                    "overlap": pm.OVERLAP_FRACTION,
                    "mid_sentence_starts": sum(c["starts_mid_sentence"] for c in s_spans),
                    "crossing_sections": sum(c["crosses_section"] for c in s_spans),
                    "spans": s_spans,
                },
            },
            # a real excerpt, so the reader can see a boundary land in real text
            "excerpt": parsed["text"][:6000],
        }
        write(f"chunking/{source}.json", payload,
              script="harness/interactive/chunking.py",
              describes=f"Both chunking strategies over one real {source} document, "
                        f"with character spans so boundaries can be drawn.",
              source={"doc_id": doc_id, "tokenizer": pm.EMBED_MODEL})
        index.append({"source": source, "doc_id": doc_id,
                      "fixed": len(f_spans), "section_aware": len(s_spans),
                      "fixed_crossing": payload["strategies"]["fixed-512"]["crossing_sections"],
                      "section_crossing": payload["strategies"]["section-aware"]["crossing_sections"],
                      "fixed_mid_sentence": payload["strategies"]["fixed-512"]["mid_sentence_starts"],
                      "section_mid_sentence": payload["strategies"]["section-aware"]["mid_sentence_starts"]})

    write("chunking/index.json", {"documents": index},
          script="harness/interactive/chunking.py",
          describes="Which document represents each source in the chunking explorer.")
    for d in index:
        print(f"  {d['source']:<6} fixed {d['fixed']:>3} chunks, "
              f"{d['fixed_crossing']:>3} cross a section · "
              f"section-aware {d['section_aware']:>3} chunks, "
              f"{d['section_crossing']:>3} cross")
    return 0


if __name__ == "__main__":
    sys.exit(main())
