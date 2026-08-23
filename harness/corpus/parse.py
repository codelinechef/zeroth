#!/usr/bin/env python3
"""
Zeroth Phase 1 — parse, assign tenants, chunk, deduplicate.

Reads data/corpus/raw/ and the manifest written by fetch.py, then:

  1. extracts text with page and section provenance preserved
  2. assigns every document to a tenant
  3. chunks with two strategies behind one interface
  4. deduplicates CUAD against the 10-K set by containment (brief §4.1)
  5. writes pages, normalised_checksum and dedup back into the manifest

    python3 harness/corpus/parse.py
    python3 harness/corpus/parse.py --limit 20        # quick pass
    python3 harness/corpus/parse.py --stage dedup     # re-run one stage

Outputs (gitignored except the manifest):
    data/corpus/parsed/<doc_id>.json      text + block provenance
    data/corpus/chunks/fixed-512.jsonl
    data/corpus/chunks/section-aware.jsonl
    data/corpus/corpus_manifest.json      updated in place
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
import time
import unicodedata
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data" / "corpus"
RAW = DATA / "raw"
PARSED = DATA / "parsed"
CHUNKS = DATA / "chunks"
MANIFEST = DATA / "corpus_manifest.json"

EMBED_MODEL = "BAAI/bge-small-en-v1.5"
CHUNK_TOKENS = 512
OVERLAP_FRACTION = 0.15
CONTAINMENT_THRESHOLD = 0.80
SHINGLE_WORDS = 5
# Keep 1 shingle in SHINGLE_SAMPLE. Hash-based sampling is uniform, so
# containment estimated from the sample is unbiased; it cuts the index for
# 140 MB of filing text from tens of millions of entries to a few million.
SHINGLE_SAMPLE = 16

# Characters per synthesised page, for sources that carry no page structure.
# Used ONLY where a document has no real page breaks, and recorded as such.
CHARS_PER_PAGE = 3000

# A tenant below this many chunks is folded into a semantic sibling. Per-tenant
# HNSW is meaningless on a 43-chunk partition — ef_search=200 exceeds the whole
# partition — and a 150x spread between the largest and smallest tenant makes
# isolation tests measure partition size rather than access control.
MIN_TENANT_CHUNKS = 500

# Siblings are semantic, never arbitrary: merged tenants must still hold
# documents that genuinely resemble each other, or the embedding clustering
# that makes RLS testing realistic is lost.
RFC_FAMILY = {"httpstate": "httpbis", "quic": "tls"}

CUAD_FAMILY = {
    "license": "license-ip", "intellectual-property": "license-ip",
    "distribution": "distribution", "reseller": "distribution",
    "affiliate": "distribution", "remarketing": "distribution",
    "agency": "distribution",
    "marketing": "marketing", "promotion": "marketing",
    "sponsorship": "marketing", "endorsement": "marketing",
    "co-branding": "marketing",
    "service": "services", "maintenance": "services", "hosting": "services",
    "outsourcing": "services", "consulting": "services",
    "supply": "supply", "manufacturing": "supply", "transportation": "supply",
    "joint-venture": "alliance", "strategic-alliance": "alliance",
    "collaboration": "alliance", "development": "alliance",
    "franchise": "other", "employment": "other", "other": "other",
}

# SIC major group -> division, for folding small filers into a sector sibling.
SIC_DIVISIONS = [
    (1, 9, "agriculture"), (10, 14, "mining"), (15, 17, "construction"),
    (20, 39, "manufacturing"), (40, 49, "transport-utilities"),
    (50, 51, "wholesale"), (52, 59, "retail"), (60, 67, "finance"),
    (70, 89, "services"), (91, 99, "public"),
]


def log(m: str) -> None:
    print(m, flush=True)


def atomic_write(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(text)
    os.replace(tmp, path)


def sic_division(sic: str | None) -> str:
    try:
        major = int(str(sic)[:2])
    except (TypeError, ValueError):
        return "unclassified"
    for lo, hi, name in SIC_DIVISIONS:
        if lo <= major <= hi:
            return name
    return "unclassified"


def merge_small_tenants(chunk_counts: dict[str, int],
                        doc_meta: dict[str, dict]) -> dict[str, str]:
    """Map base tenant -> final tenant, folding anything under the floor.

    The family of a tenant is derived ONCE, from the metadata of the documents
    it actually holds. Deriving it again from an already-merged name is what
    produced `edgar-unclassified`: a family bucket owns no documents, so the
    lookup found nothing and invented a division.

    CUAD and RFC pool the WHOLE family when any member is short — contract
    types and protocol families are peers, and pooling only the small ones
    leaves a large sibling stranded beside a bucket named after it. EDGAR does
    not: a filing company is the tenant the specification asks for, so large
    companies keep their own tenant and only short ones fall back to a sector
    bucket."""
    # family per base tenant, computed once from the documents themselves
    base_family: dict[str, str] = {}
    for tenant in chunk_counts:
        if tenant.startswith("rfc-"):
            wg = tenant[4:]
            base_family[tenant] = f"rfc-{RFC_FAMILY.get(wg, wg)}"
        elif tenant.startswith("cuad-"):
            base_family[tenant] = f"cuad-{CUAD_FAMILY.get(tenant[5:], 'misc')}"
        elif tenant.startswith("edgar-"):
            sic = next((d.get("sic") for d in doc_meta.values()
                        if d.get("tenant_base") == tenant), None)
            base_family[tenant] = f"edgar-{sic_division(sic)}"
        else:
            base_family[tenant] = tenant

    mapping = {t: t for t in chunk_counts}

    # CUAD / RFC: if any peer in a family is short, the family becomes the tenant
    members: dict[str, list[str]] = {}
    for base, fam in base_family.items():
        members.setdefault(fam, []).append(base)
    for fam, mem in members.items():
        if fam.startswith("edgar-"):
            continue
        if any(chunk_counts[b] < MIN_TENANT_CHUNKS for b in mem):
            for b in mem:
                mapping[b] = fam

    # EDGAR: only short filers fall back to their sector
    for base in chunk_counts:
        if base.startswith("edgar-") and chunk_counts[base] < MIN_TENANT_CHUNKS:
            mapping[base] = base_family[base]

    # anything still short after that goes to a per-source bucket
    counts: dict[str, int] = {}
    for base, n in chunk_counts.items():
        counts[mapping[base]] = counts.get(mapping[base], 0) + n
    for base, cur in list(mapping.items()):
        if counts.get(cur, 0) < MIN_TENANT_CHUNKS:
            mapping[base] = cur.split("-")[0] + "-misc"
    return mapping


# --------------------------------------------------------------------------
# Parsing — one Block per (text, page, section)
# --------------------------------------------------------------------------

@dataclass
class Block:
    text: str
    page: int
    section: str


def parse_edgar(raw: bytes) -> tuple[list[Block], int, str]:
    """10-K HTML. Page breaks are real: filings carry explicit
    page-break styling, one per rendered page."""
    import lxml.html

    doc = lxml.html.fromstring(raw)
    for bad in doc.xpath("//script | //style"):
        bad.getparent().remove(bad)

    blocks: list[Block] = []
    page = 1
    section = "front-matter"
    item_re = re.compile(r"^\s*ITEM\s+(\d+[AB]?)\s*[.\-—:]", re.I)

    # Test each element directly rather than pre-collecting ids. lxml creates
    # element proxies on demand and frees them, so id() values are REUSED —
    # a set of ids from an earlier xpath silently matches unrelated elements
    # later. That over-counted pages by 3-5x.
    for el in doc.iter():
        if el.tag == "hr" or "page-break" in (el.get("style") or "").lower():
            page += 1
        text = (el.text or "").strip()
        if not text:
            continue
        mt = item_re.match(text)
        if mt and len(text) < 120:
            section = f"Item {mt.group(1).upper()}"
        blocks.append(Block(text, page, section))

    return blocks, page, "page-break"


def parse_plaintext(text: str, numbered_sections: bool) -> tuple[list[Block], int, str]:
    """RFCs and CUAD contracts. Form feeds are real page breaks where present;
    otherwise pages are synthesised and labelled as such."""
    has_ff = "\f" in text
    # Contracts and RFCs both carry real section structure: "1.2. Title",
    # "ARTICLE IV", "Section 3.1". Discarding it costs section-level
    # provenance and collapses section-aware chunking into fixed chunking.
    heading_res = [
        re.compile(r"^\s*(\d+(?:\.\d+)*)\.?\s+(\S.{0,70})$"),
        re.compile(r"^\s*(ARTICLE\s+[IVXLC0-9]+)\b[.\-—:]?\s*(.{0,60})$", re.I),
        re.compile(r"^\s*(SECTION\s+[0-9]+(?:\.[0-9]+)*)\b[.\-—:]?\s*(.{0,60})$", re.I),
    ]

    blocks: list[Block] = []
    page = 1
    section = "preamble"
    chars_on_page = 0

    for line in text.splitlines():
        if "\f" in line:
            page += 1
            chars_on_page = 0
            line = line.replace("\f", "")
        stripped = line.strip()
        if not stripped:
            continue
        if numbered_sections and len(stripped) < 120:
            for hre in heading_res:
                ms = hre.match(line)
                if ms:
                    section = f"{ms.group(1)} {ms.group(2).strip()}".strip()[:80]
                    break
        if not has_ff:
            chars_on_page += len(stripped) + 1
            if chars_on_page > CHARS_PER_PAGE:
                page += 1
                chars_on_page = 0
        blocks.append(Block(stripped, page, section))

    return blocks, page, ("form-feed" if has_ff else "estimated")


def parse_document(doc: dict) -> dict | None:
    path = ROOT / doc["raw_path"]
    if not path.exists():
        return None
    try:
        if doc["source"] == "edgar":
            blocks, pages, page_src = parse_edgar(path.read_bytes())
        else:
            text = path.read_text(encoding="utf-8", errors="replace")
            blocks, pages, page_src = parse_plaintext(text, numbered_sections=True)
    except Exception as e:                       # one bad document, not a dead run
        log(f"    !! {doc['doc_id']}: {type(e).__name__}: {e}")
        return None

    full = "\n".join(b.text for b in blocks)
    if len(full.strip()) < 200:
        log(f"    !! {doc['doc_id']}: only {len(full.strip())} chars of text — skipped")
        return None

    return {
        "doc_id": doc["doc_id"],
        "source": doc["source"],
        "text": full,
        "pages": pages,
        "pages_source": page_src,
        "blocks": [{"len": len(b.text), "page": b.page, "section": b.section}
                   for b in blocks],
        "normalised_checksum": normalised_checksum(full),
    }


def normalised_checksum(text: str) -> str:
    """Case-folded, punctuation-stripped, whitespace-collapsed. Catches the
    same document reformatted (§4.1 dedup stage 2)."""
    t = unicodedata.normalize("NFKC", text).lower()
    t = re.sub(r"[^a-z0-9\s]+", " ", t)
    t = re.sub(r"\s+", " ", t).strip()
    return hashlib.sha256(t.encode()).hexdigest()


# --------------------------------------------------------------------------
# Tenants
# --------------------------------------------------------------------------

AGREEMENT_KEYWORDS = [
    "JOINT VENTURE", "STRATEGIC ALLIANCE", "COLLABORATION", "DISTRIBUTOR",
    "DISTRIBUTION", "RESELLER", "FRANCHISE", "LICENSING", "LICENSE", "SUPPLY",
    "MANUFACTURING", "MAINTENANCE", "SERVICE", "CONSULTING", "EMPLOYMENT",
    "ENDORSEMENT", "SPONSORSHIP", "MARKETING", "PROMOTION", "AGENCY",
    "HOSTING", "OUTSOURCING", "DEVELOPMENT", "TRANSPORTATION",
    "INTELLECTUAL PROPERTY", "CO-BRANDING", "AFFILIATE", "REMARKETING",
]
AGREEMENT_ALIAS = {"LICENSING": "LICENSE", "DISTRIBUTOR": "DISTRIBUTION"}


def cuad_agreement_type(identifier: str) -> str:
    stem = Path(identifier).stem
    tail = re.split(r"-EX-[0-9A-Za-z.]+[-_]?", stem)[-1]
    tail = re.sub(r"^\d+[-_]", "", tail)
    tail = re.sub(r"[_(]\d+\)?$|\d+$", "", tail).strip(" _-")
    tail = re.sub(r"\s+", " ", tail.replace("_", " ")).strip().upper()
    for kw in AGREEMENT_KEYWORDS:
        if kw in tail:
            return AGREEMENT_ALIAS.get(kw, kw)
    return "OTHER"


def assign_tenant(doc: dict) -> tuple[str, bool]:
    """Returns (tenant, provisional).

    EDGAR partitions by filing company and RFCs by working group, both exactly
    as brief §4 describes. CUAD cannot: 510 contracts come from 463 distinct
    filers, so one tenant per counterparty would mean ~1.1 documents each,
    which makes tenant isolation meaningless to test. Contract TYPE is used
    instead — bounded, semantically coherent (contracts of a type genuinely
    resemble each other, so they cluster in embedding space the way a real
    tenant's documents do), and derived deterministically from the source."""
    if doc["source"] == "edgar":
        return f"edgar-{doc['ticker'].lower()}", False
    if doc["source"] == "rfc":
        return f"rfc-{doc['working_group']}", False
    t = cuad_agreement_type(doc["identifier"])
    return "cuad-" + re.sub(r"[^a-z0-9]+", "-", t.lower()).strip("-"), False


# --------------------------------------------------------------------------
# Chunking — two strategies behind one interface
# --------------------------------------------------------------------------

class Chunker:
    def __init__(self, tokenizer):
        self.tok = tokenizer

    def _encode(self, text: str):
        enc = self.tok(text, add_special_tokens=False, truncation=False,
                       return_offsets_mapping=True)
        return enc["input_ids"], enc["offset_mapping"]

    @staticmethod
    def _locate(blocks: list[dict], char_pos: int) -> tuple[int, str]:
        """Page and section for a character offset, via the block map."""
        run = 0
        for b in blocks:
            run += b["len"] + 1
            if char_pos < run:
                return b["page"], b["section"]
        return (blocks[-1]["page"], blocks[-1]["section"]) if blocks else (1, "")

    def fixed(self, parsed: dict) -> list[dict]:
        text, blocks = parsed["text"], parsed["blocks"]
        ids, offsets = self._encode(text)
        step = max(1, CHUNK_TOKENS - int(CHUNK_TOKENS * OVERLAP_FRACTION))
        out = []
        for ordinal, start in enumerate(range(0, max(1, len(ids)), step)):
            window = offsets[start:start + CHUNK_TOKENS]
            if not window:
                break
            c0, c1 = window[0][0], window[-1][1]
            body = text[c0:c1].strip()
            if len(body) < 40:
                continue
            page, section = self._locate(blocks, c0)
            out.append(self._chunk(parsed, "fixed-512", ordinal, body, page,
                                   section, len(window)))
            if start + CHUNK_TOKENS >= len(ids):
                break
        return out

    def section_aware(self, parsed: dict) -> list[dict]:
        """Never crosses a section boundary. Sections longer than the window
        are split inside the section, with the same overlap."""
        text, blocks = parsed["text"], parsed["blocks"]
        groups: list[tuple[str, int, str]] = []
        pos = 0
        cur_sec, cur_page, buf = None, 1, []
        for b in blocks:
            seg = text[pos:pos + b["len"]]
            pos += b["len"] + 1
            if b["section"] != cur_sec:
                if buf:
                    groups.append(("\n".join(buf), cur_page, cur_sec))
                cur_sec, cur_page, buf = b["section"], b["page"], []
            buf.append(seg)
        if buf:
            groups.append(("\n".join(buf), cur_page, cur_sec))

        step = max(1, CHUNK_TOKENS - int(CHUNK_TOKENS * OVERLAP_FRACTION))
        out, ordinal = [], 0
        for body, page, section in groups:
            if len(body.strip()) < 40:
                continue
            ids, offsets = self._encode(body)
            if len(ids) <= CHUNK_TOKENS:
                out.append(self._chunk(parsed, "section-aware", ordinal,
                                       body.strip(), page, section, len(ids)))
                ordinal += 1
                continue
            for start in range(0, len(ids), step):
                window = offsets[start:start + CHUNK_TOKENS]
                if not window:
                    break
                piece = body[window[0][0]:window[-1][1]].strip()
                if len(piece) < 40:
                    continue
                out.append(self._chunk(parsed, "section-aware", ordinal, piece,
                                       page, section, len(window)))
                ordinal += 1
                if start + CHUNK_TOKENS >= len(ids):
                    break
        return out

    @staticmethod
    def _chunk(parsed, strategy, ordinal, body, page, section, n_tokens) -> dict:
        return {
            "chunk_id": f"{parsed['doc_id']}::{strategy}::{ordinal:05d}",
            "doc_id": parsed["doc_id"],
            "source": parsed["source"],
            "tenant": parsed["tenant"],
            "strategy": strategy,
            "ordinal": ordinal,
            "page": page,
            "section": section,
            "n_tokens": n_tokens,
            "checksum": hashlib.sha256(body.encode()).hexdigest(),
            "text": body,
        }


# --------------------------------------------------------------------------
# Dedup — containment, not similarity (brief §4.1)
# --------------------------------------------------------------------------

def shingles(text: str) -> set[int]:
    words = re.sub(r"[^a-z0-9\s]+", " ", text.lower()).split()
    out = set()
    for i in range(len(words) - SHINGLE_WORDS + 1):
        h = hash(" ".join(words[i:i + SHINGLE_WORDS])) & 0xFFFFFFFFFFFFFFFF
        if h % SHINGLE_SAMPLE == 0:
            out.add(h)
    return out


def run_dedup(parsed_docs: dict[str, dict], manifest_by_id: dict) -> dict:
    """Stage 1 provenance, stage 2 normalised checksum, stage 3 containment.

    Jaccard is wrong here: an exhibit contract inside a 10-K is a SUBSET of it,
    so complete overlap still scores low because the filing is far larger.
    Containment measures |A n B| / |A| with A the smaller document."""
    edgar = [d for d in parsed_docs.values() if d["source"] == "edgar"]
    cuad = [d for d in parsed_docs.values() if d["source"] == "cuad"]
    decisions: dict[str, dict] = {}

    # stage 1 — provenance: same EDGAR accession referenced by both
    edgar_acc = {manifest_by_id[d["doc_id"]]["identifier"].replace("-", ""): d["doc_id"]
                 for d in edgar}
    for d in cuad:
        ident = manifest_by_id[d["doc_id"]]["identifier"]
        m = re.search(r"(\d{10,})", ident)
        if m and m.group(1) in edgar_acc:
            decisions[d["doc_id"]] = {"dropped_for": edgar_acc[m.group(1)],
                                      "containment": 1.0, "stage": 1}

    # stage 2 — normalised checksum, across the whole corpus
    by_norm: dict[str, list[str]] = {}
    for d in parsed_docs.values():
        by_norm.setdefault(d["normalised_checksum"], []).append(d["doc_id"])
    for ids in by_norm.values():
        if len(ids) > 1:
            keeper = sorted(ids)[0]
            for other in sorted(ids)[1:]:
                decisions.setdefault(other, {"dropped_for": keeper,
                                             "containment": 1.0, "stage": 2})

    # stage 3 — containment over sampled shingles, via one inverted index
    log(f"  building shingle index over {len(edgar)} filings "
        f"(1 in {SHINGLE_SAMPLE} sampled)")
    index: dict[int, list[str]] = {}
    for i, d in enumerate(edgar, 1):
        for h in shingles(d["text"]):
            index.setdefault(h, []).append(d["doc_id"])
        if i % 50 == 0:
            log(f"    {i}/{len(edgar)} filings indexed, {len(index):,} shingles")
    log(f"  index holds {len(index):,} sampled shingles")

    for i, d in enumerate(cuad, 1):
        if d["doc_id"] in decisions:
            continue
        sh = shingles(d["text"])
        if not sh:
            continue
        hits: dict[str, int] = {}
        for h in sh:
            for owner in index.get(h, ()):
                hits[owner] = hits.get(owner, 0) + 1
        if hits:
            best, n = max(hits.items(), key=lambda kv: kv[1])
            containment = n / len(sh)
            if containment >= CONTAINMENT_THRESHOLD:
                decisions[d["doc_id"]] = {"dropped_for": best,
                                          "containment": round(containment, 4),
                                          "stage": 3}
        if i % 100 == 0:
            log(f"    {i}/{len(cuad)} contracts checked, {len(decisions)} duplicates")
    return decisions


# --------------------------------------------------------------------------
# Main
# --------------------------------------------------------------------------

def main() -> int:
    ap = argparse.ArgumentParser(description="Zeroth Phase 1 parse/chunk/dedup")
    ap.add_argument("--limit", type=int, help="only process N documents")
    ap.add_argument("--stage", choices=["parse", "chunk", "dedup", "all"],
                    default="all")
    args = ap.parse_args()

    manifest = json.loads(MANIFEST.read_text())
    docs = manifest["documents"]
    if args.limit:
        docs = docs[:args.limit]
    by_id = {d["doc_id"]: d for d in docs}
    PARSED.mkdir(parents=True, exist_ok=True)
    CHUNKS.mkdir(parents=True, exist_ok=True)

    log(f"Zeroth Phase 1 — {len(docs)} documents")
    started = time.time()

    # ---- parse + tenants ---------------------------------------------------
    log("\n=== parse ===")
    parsed_docs: dict[str, dict] = {}
    failed = []
    for i, d in enumerate(docs, 1):
        cached = PARSED / f"{d['doc_id']}.json"
        if cached.exists() and args.stage != "parse":
            parsed_docs[d["doc_id"]] = json.loads(cached.read_text())
            continue
        p = parse_document(d)
        if p is None:
            failed.append(d["doc_id"])
            continue
        tenant, provisional = assign_tenant(d)
        p["tenant"] = tenant
        p["tenant_provisional"] = provisional
        atomic_write(cached, json.dumps(p))
        parsed_docs[d["doc_id"]] = p
        if i % 50 == 0:
            log(f"  {i}/{len(docs)} parsed")
    log(f"  parsed {len(parsed_docs)}, failed {len(failed)}")

    log(f"  base tenants: {len({p['tenant'] for p in parsed_docs.values()})}")

    # ---- dedup -------------------------------------------------------------
    log("\n=== dedup (containment) ===")
    decisions = run_dedup(parsed_docs, by_id)
    log(f"  {len(decisions)} duplicates identified")

    # ---- chunk -------------------------------------------------------------
    log(f"\n=== chunk (tokenizer: {EMBED_MODEL}) ===")
    from transformers import AutoTokenizer, logging as hf_logging
    hf_logging.set_verbosity_error()   # "sequence longer than 512" is expected here
    tok = AutoTokenizer.from_pretrained(EMBED_MODEL)
    ch = Chunker(tok)

    counts = {}
    per_tenant_chunks: dict[str, int] = {}
    for strategy, fn in (("fixed-512", ch.fixed), ("section-aware", ch.section_aware)):
        out_path = CHUNKS / f"{strategy}.jsonl"
        n = 0
        with open(out_path.with_suffix(".jsonl.tmp"), "w") as fh:
            for i, (doc_id, p) in enumerate(sorted(parsed_docs.items()), 1):
                if doc_id in decisions:          # duplicates are not indexed
                    continue
                for c in fn(p):
                    fh.write(json.dumps(c) + "\n")
                    n += 1
                    if strategy == "fixed-512":
                        per_tenant_chunks[c["tenant"]] = \
                            per_tenant_chunks.get(c["tenant"], 0) + 1
                if i % 100 == 0:
                    log(f"  {strategy}: {i}/{len(parsed_docs)} docs, {n:,} chunks")
        counts[strategy] = n
        log(f"  {strategy}: {n:,} chunks (base tenants)")

    # ---- merge small tenants, then rewrite both files ----------------------
    log("\n=== tenant merge ===")
    doc_meta = {d["doc_id"]: {**by_id[d["doc_id"]],
                              "tenant_base": parsed_docs[d["doc_id"]]["tenant"]}
                for d in docs if d["doc_id"] in parsed_docs}
    mapping = merge_small_tenants(per_tenant_chunks, doc_meta)
    merged = {b: f for b, f in mapping.items() if b != f}
    log(f"  {len(per_tenant_chunks)} base tenants -> "
        f"{len(set(mapping.values()))} after merge ({len(merged)} folded)")
    for b, f in sorted(merged.items()):
        log(f"    {b:<34} -> {f}  ({per_tenant_chunks[b]:,} chunks)")

    for strategy in ("fixed-512", "section-aware"):
        src = CHUNKS / f"{strategy}.jsonl.tmp"
        dst = CHUNKS / f"{strategy}.jsonl"
        with open(src) as fin, open(str(dst) + ".2", "w") as fout:
            for line in fin:
                c = json.loads(line)
                c["tenant_base"] = c["tenant"]
                c["tenant"] = mapping.get(c["tenant"], c["tenant"])
                fout.write(json.dumps(c) + "\n")
        os.replace(str(dst) + ".2", dst)
        src.unlink(missing_ok=True)
        log(f"  rewrote {strategy}.jsonl with final tenants")

    for p in parsed_docs.values():
        p["tenant_base"] = p["tenant"]
        p["tenant"] = mapping.get(p["tenant"], p["tenant"])

    # ---- manifest ----------------------------------------------------------
    for d in manifest["documents"]:
        p = parsed_docs.get(d["doc_id"])
        if not p:
            continue
        d["pages"] = p["pages"]
        d["pages_source"] = p["pages_source"]
        d["normalised_checksum"] = p["normalised_checksum"]
        d["tenant"] = p["tenant"]
        d["tenant_base"] = p.get("tenant_base", p["tenant"])
        d.pop("tenant_provisional", None)
        d["dedup"] = decisions.get(d["doc_id"])

    kept = [d for d in manifest["documents"] if not d.get("dedup")]
    manifest["corpus_stats"] = {
        "documents_total": len(manifest["documents"]),
        "documents_after_dedup": len(kept),
        "duplicates_removed": len(decisions),
        "pages_total": sum(d.get("pages") or 0 for d in kept),
        "pages_real": sum(d.get("pages") or 0 for d in kept
                          if d.get("pages_source") in ("page-break", "form-feed")),
        "pages_estimated": sum(d.get("pages") or 0 for d in kept
                               if d.get("pages_source") == "estimated"),
        "tenants": len({p["tenant"] for p in parsed_docs.values()}),
        "tenants_before_merge": len(per_tenant_chunks),
        "tenant_merges": merged,
        "min_tenant_chunks": MIN_TENANT_CHUNKS,
        "chunks": counts,
        "parse_failures": failed,
        "dedup_config": {"metric": "containment", "threshold": CONTAINMENT_THRESHOLD,
                         "shingle_words": SHINGLE_WORDS,
                         "shingle_sample_rate": f"1/{SHINGLE_SAMPLE}"},
        "chunk_config": {"tokenizer": EMBED_MODEL, "max_tokens": CHUNK_TOKENS,
                         "overlap": OVERLAP_FRACTION},
    }
    atomic_write(MANIFEST, json.dumps(manifest, indent=2))

    log("\n" + "=" * 62)
    for k, v in manifest["corpus_stats"].items():
        if k not in ("parse_failures", "dedup_config", "chunk_config"):
            log(f"  {k:<24} {v}")
    log(f"  elapsed                  {time.time()-started:.0f}s")
    log("=" * 62)
    return 0


if __name__ == "__main__":
    sys.exit(main())
