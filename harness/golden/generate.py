#!/usr/bin/env python3
"""
Golden set generation — brief §9 Phase 1.

Drafts 200 queries across five categories, pools candidates with BM25, and
grades each candidate 0-3. Model-drafted and only partially human-verified;
harness/golden/verify.py records the agreement rate, which is published on
/methodology. This script never claims the set is hand-labelled.

    python3 harness/golden/generate.py --stage draft
    python3 harness/golden/generate.py --stage judge
    python3 harness/golden/generate.py                 # both

Safe to interrupt and re-run. State is checkpointed after every query and
every judgment batch, so a rate-limit stop resumes where it left off instead
of restarting. One failed call is recorded and stepped over.

Outputs:
    data/golden/queries.jsonl
    data/golden/judgments.jsonl
    data/golden/.gen_state.json   (resumable, gitignored)
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import os
import random
import sys
import time
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
GOLDEN = ROOT / "data" / "golden"
CHUNKS = ROOT / "data" / "corpus" / "chunks" / "fixed-512.jsonl"
STATE = GOLDEN / ".gen_state.json"
QUERIES = GOLDEN / "queries.jsonl"
JUDGMENTS = GOLDEN / "judgments.jsonl"

# gemini-2.5-flash and -flash-lite return 404 "no longer available to new
# users" on this account, so the 2.5 pair from the cost estimate cannot be
# used. These are the closest available equivalents. Both verified callable
# with this key before the run started.
DRAFT_MODEL = "gemini-3.6-flash"
JUDGE_MODEL = "gemini-3.1-flash-lite"
DRAFT_RPM = 10.0          # free tier; --rpm overrides
JUDGE_RPM = 15.0
CANDIDATES_PER_QUERY = 50
CHUNKS_PER_JUDGE_CALL = 5
SEED = 20260824

# brief §9: 60 / 60 / 30 / 20 / 30
CATEGORIES = {
    "single-chunk":   {"n": 60, "chunks": 1},
    "multi-chunk":    {"n": 60, "chunks": 4},
    "cross-document": {"n": 30, "chunks": 3},
    "tenant-scoped":  {"n": 20, "chunks": 3},
    "unanswerable":   {"n": 30, "chunks": 2},
}


def _load(name: str):
    spec = importlib.util.spec_from_file_location(name, HERE / f"{name}.py")
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod
    spec.loader.exec_module(mod)
    return mod


gemini = _load("gemini")
bm25mod = _load("bm25")


def log(m: str) -> None:
    print(m, flush=True)


def atomic_write(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(text)
    os.replace(tmp, path)


# --------------------------------------------------------------------------
# Prompts
# --------------------------------------------------------------------------

# Relevance is ABSOLUTE, not role-relative (§8 decision). The nine benchmark
# clauses execute as all_tenants; access control is measured separately in the
# security section and never mixed into headline retrieval numbers. Both
# prompts below state this, because a judge that silently applies an access
# rule would make graded relevance depend on who is asking.
ABSOLUTE_RELEVANCE = """\
Relevance is a property of the passage and the question alone. It never depends
on who is asking, what role they hold, or what they are permitted to see. Do not
withhold or downgrade anything on access grounds."""

DRAFT_PROMPTS = {
    "single-chunk": """\
You are building an evaluation set for a document retrieval system.

Write ONE question that is answered completely by the passage below, and by that
passage alone. It must be specific enough that a different passage would not
answer it — name the company, contract, standard, figure or clause involved.
Do not write a question whose answer is a generic fact.

{absolute}

Passage (id {cid}, from {doc}, page {page}, section "{section}"):
\"\"\"{text}\"\"\"

Return JSON:
{{"question": "...", "answer": "...", "supporting_quote": "verbatim span from the passage that contains the answer"}}""",

    "multi-chunk": """\
You are building an evaluation set for a document retrieval system.

Write ONE question that requires combining information from AT LEAST TWO of the
passages below. All passages come from the same document. The question must not
be answerable from any single passage on its own.

{absolute}

{passages}

Return JSON:
{{"question": "...", "answer": "...", "requires_chunks": ["id", "id"], "reasoning": "one sentence on why a single passage is insufficient"}}""",

    "cross-document": """\
You are building an evaluation set for a document retrieval system.

Write ONE question that requires combining information from AT LEAST TWO
DIFFERENT DOCUMENTS below. A comparison, a contrast, or an aggregation across
them is ideal. It must not be answerable from any one document alone.

{absolute}

{passages}

Return JSON:
{{"question": "...", "answer": "...", "requires_chunks": ["id", "id"], "reasoning": "one sentence on why one document is insufficient"}}""",

    "tenant-scoped": """\
You are building an evaluation set for a document retrieval system that
partitions documents by tenant.

Write ONE question that is naturally scoped to a single tenant — the sort of
question where the correct answer depends on WHOSE documents are being searched,
because different tenants would each have their own different answer. Phrase it
so it reads naturally, mentioning the tenant's subject where that is how a user
would really ask it.

{absolute} The tenant matters for what the correct ANSWER is, not for which
passages count as relevant when grading.

{passages}

Return JSON:
{{"question": "...", "answer": "...", "tenant": "{tenant}", "requires_chunks": ["id"], "reasoning": "one sentence on why another tenant would answer differently"}}""",

    "unanswerable": """\
You are building an evaluation set for a document retrieval system, and you need
questions the system SHOULD decline to answer.

Write ONE question that is plausible and clearly on-topic for the passages below
— same domain, same vocabulary, same kind of document — but whose answer is
genuinely NOT present in them and would not be found elsewhere in a corpus of
SEC filings, commercial contracts and IETF RFCs.

Good: asks for a specific figure, date, party or provision of exactly the kind
these documents contain, which simply is not stated.
Bad: nonsense, obviously out-of-domain, or answerable by general knowledge.

{absolute}

{passages}

Return JSON:
{{"question": "...", "why_unanswerable": "one sentence on what is missing", "nearest_miss": "what a retriever would probably return instead"}}""",
}

JUDGE_PROMPT = """\
You are grading passages for relevance to a question, on a 0-3 scale, for a
retrieval evaluation set.

3 = fully answers the question on its own
2 = contains a substantial part of the answer
1 = related and useful context, but does not contain the answer
0 = not relevant

{absolute}

Question: {question}

Passages:
{passages}

Return a JSON array with one object per passage, in the same order:
[{{"id": "<passage id>", "grade": 0-3, "why": "at most 12 words"}}]"""


# --------------------------------------------------------------------------
# State
# --------------------------------------------------------------------------

class State:
    def __init__(self, d: dict | None = None):
        d = d or {}
        self.queries: dict = d.get("queries", {})
        self.judged: dict = d.get("judged", {})
        self.failures: dict = d.get("failures", {})

    @classmethod
    def load(cls) -> "State":
        if STATE.exists():
            try:
                return cls(json.loads(STATE.read_text()))
            except json.JSONDecodeError:
                log("!! state unreadable; starting fresh")
        return cls()

    def save(self) -> None:
        atomic_write(STATE, json.dumps(
            {"queries": self.queries, "judged": self.judged,
             "failures": self.failures}, indent=1))

    def write_outputs(self) -> None:
        qs = sorted(self.queries.values(), key=lambda q: q["query_id"])
        atomic_write(QUERIES, "\n".join(json.dumps(q) for q in qs) + "\n")
        rows = []
        for qid in sorted(self.judged):
            for j in self.judged[qid]:
                rows.append(json.dumps({"query_id": qid, **j}))
        if rows:
            atomic_write(JUDGMENTS, "\n".join(rows) + "\n")

    def record_failure(self, key: str, stage: str, exc: BaseException) -> None:
        self.failures[key] = {
            "key": key, "stage": stage,
            "error": f"{type(exc).__name__}: {exc}"[:300],
            "at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        }
        log(f"    !! {key} FAILED — {type(exc).__name__}: {str(exc)[:120]}")
        log("       continuing; re-run to retry this item")
        self.save()


# --------------------------------------------------------------------------
# Sampling
# --------------------------------------------------------------------------

def load_chunks() -> tuple[list[dict], dict[str, list[int]], dict[str, list[int]]]:
    chunks, by_doc, by_tenant = [], defaultdict(list), defaultdict(list)
    for i, line in enumerate(open(CHUNKS)):
        c = json.loads(line)
        chunks.append(c)
        by_doc[c["doc_id"]].append(i)
        by_tenant[c["tenant"]].append(i)
    return chunks, by_doc, by_tenant


def pick_sources(cat: str, rng: random.Random, chunks, by_doc, by_tenant) -> list[int]:
    """Deterministic under SEED, so a re-run selects the same source material."""
    spec = CATEGORIES[cat]
    need = spec["chunks"]
    if cat in ("single-chunk", "unanswerable"):
        docs = [d for d, ix in by_doc.items() if len(ix) >= need]
        return rng.sample(by_doc[rng.choice(docs)], need)
    if cat == "multi-chunk":
        docs = [d for d, ix in by_doc.items() if len(ix) >= need]
        return rng.sample(by_doc[rng.choice(docs)], need)
    if cat == "cross-document":
        tenants = [t for t, ix in by_tenant.items() if len({chunks[i]["doc_id"] for i in ix}) >= need]
        t = rng.choice(tenants)
        docs = rng.sample(sorted({chunks[i]["doc_id"] for i in by_tenant[t]}), need)
        return [rng.choice(by_doc[d]) for d in docs]
    if cat == "tenant-scoped":
        tenants = [t for t, ix in by_tenant.items() if len(ix) >= need]
        return rng.sample(by_tenant[rng.choice(tenants)], need)
    raise ValueError(cat)


def render_passages(chunks: list[dict], idxs: list[int], limit: int = 1800) -> str:
    out = []
    for i in idxs:
        c = chunks[i]
        out.append(f"[{c['chunk_id']}] document={c['doc_id']} tenant={c['tenant']} "
                   f"page={c['page']} section=\"{c['section']}\"\n"
                   f"\"\"\"{c['text'][:limit]}\"\"\"")
    return "\n\n".join(out)


# --------------------------------------------------------------------------
# Stages
# --------------------------------------------------------------------------

def stage_draft(st: State, client, chunks, by_doc, by_tenant, only: str | None) -> None:
    log(f"\n=== draft ({client.model}) ===")
    rng = random.Random(SEED)
    plan: list[tuple[str, int]] = []
    for cat, spec in CATEGORIES.items():
        for n in range(spec["n"]):
            plan.append((cat, n))

    for cat, n in plan:
        qid = f"{cat}-{n:03d}"
        srcs = pick_sources(cat, rng, chunks, by_doc, by_tenant)  # keep rng in step
        if qid in st.queries or (only and cat != only):
            continue
        src_chunks = [chunks[i] for i in srcs]
        try:
            if cat == "single-chunk":
                c = src_chunks[0]
                prompt = DRAFT_PROMPTS[cat].format(
                    absolute=ABSOLUTE_RELEVANCE, cid=c["chunk_id"],
                    doc=c["doc_id"], page=c["page"], section=c["section"],
                    text=c["text"][:2400])
            elif cat == "tenant-scoped":
                prompt = DRAFT_PROMPTS[cat].format(
                    absolute=ABSOLUTE_RELEVANCE, tenant=src_chunks[0]["tenant"],
                    passages=render_passages(chunks, srcs))
            else:
                prompt = DRAFT_PROMPTS[cat].format(
                    absolute=ABSOLUTE_RELEVANCE,
                    passages=render_passages(chunks, srcs))

            data = gemini.extract_json(client.generate(prompt, temperature=0.7, max_output_tokens=4096))
            q = (data.get("question") or "").strip()
            if len(q) < 15:
                raise ValueError(f"question too short: {q!r}")

            st.queries[qid] = {
                "query_id": qid,
                "category": cat,
                "question": q,
                "answer": data.get("answer"),
                "answerable": cat != "unanswerable",
                "source_chunk_ids": [c["chunk_id"] for c in src_chunks],
                "source_doc_ids": sorted({c["doc_id"] for c in src_chunks}),
                "tenant": src_chunks[0]["tenant"],
                "supporting_quote": data.get("supporting_quote"),
                "requires_chunks": data.get("requires_chunks"),
                "why_unanswerable": data.get("why_unanswerable"),
                "nearest_miss": data.get("nearest_miss"),
                "reasoning": data.get("reasoning"),
                "drafted_by": client.ref,
                "drafted_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                "human_verified": False,
            }
            st.save(); st.write_outputs()
            log(f"  {qid}  {q[:78]}")
        except gemini.QuotaExhausted as e:
            log(f"\n!! daily quota exhausted after {client.calls} calls")
            log(f"   {str(e)[:180]}")
            log("   state saved — re-run tomorrow, or raise the quota, to resume")
            raise
        except KeyboardInterrupt:
            raise
        except Exception as e:
            st.record_failure(qid, "draft", e)


def stage_judge(st: State, client, chunks) -> None:
    log(f"\n=== judge ({client.model}) ===")
    if not st.queries:
        log("  no queries drafted yet"); return
    by_id = {c["chunk_id"]: c for c in chunks}

    log("  building BM25 index for candidate pooling")
    idx = bm25mod.BM25().build(CHUNKS, progress_every=0)
    log(f"  {len(idx.chunk_ids):,} chunks, {len(idx.postings):,} terms")

    todo = [q for q in sorted(st.queries.values(), key=lambda q: q["query_id"])
            if q["query_id"] not in st.judged]
    log(f"  {len(todo)} queries to judge, "
        f"{len(st.judged)} already done")

    for q in todo:
        qid = q["query_id"]
        hits = idx.search(q["question"], k=CANDIDATES_PER_QUERY)
        cand_ids = [idx.chunk_ids[i] for i, _ in hits]
        # the passages the query was written from must be graded even if BM25
        # misses them, or the set can never contain a known positive
        for cid in q["source_chunk_ids"]:
            if cid not in cand_ids:
                cand_ids.append(cid)

        graded: list[dict] = []
        try:
            for start in range(0, len(cand_ids), CHUNKS_PER_JUDGE_CALL):
                batch = cand_ids[start:start + CHUNKS_PER_JUDGE_CALL]
                passages = "\n\n".join(
                    f"[{cid}]\n\"\"\"{by_id[cid]['text'][:1600]}\"\"\"" for cid in batch)
                prompt = JUDGE_PROMPT.format(absolute=ABSOLUTE_RELEVANCE,
                                             question=q["question"],
                                             passages=passages)
                rows = gemini.extract_json(client.generate(prompt, temperature=0.0, max_output_tokens=3072))
                if isinstance(rows, dict):
                    rows = rows.get("judgments") or rows.get("results") or [rows]
                by_cid = {str(r.get("id")): r for r in rows if isinstance(r, dict)}
                for cid in batch:
                    r = by_cid.get(cid, {})
                    try:
                        g = int(r.get("grade", 0))
                    except (TypeError, ValueError):
                        g = 0
                    graded.append({
                        "chunk_id": cid,
                        "grade": max(0, min(3, g)),
                        "why": str(r.get("why", ""))[:120],
                        "is_source": cid in q["source_chunk_ids"],
                        "judged_by": client.ref,
                        "human_verified": False,
                    })
                # checkpoint per batch, not per query: a quota stop mid-query
                # keeps the batches already paid for
                st.judged[qid] = graded
                st.save()
            st.write_outputs()
            pos = sum(1 for g in graded if g["grade"] >= 2)
            log(f"  {qid}  {len(graded)} graded, {pos} relevant(>=2)")
        except gemini.QuotaExhausted as e:
            st.judged[qid] = graded
            st.save(); st.write_outputs()
            log(f"\n!! daily quota exhausted after {client.calls} calls")
            log(f"   {str(e)[:180]}")
            log(f"   {len(st.judged)} queries judged; re-run to resume")
            raise
        except KeyboardInterrupt:
            st.judged[qid] = graded; st.save(); raise
        except Exception as e:
            st.record_failure(qid, "judge", e)


# --------------------------------------------------------------------------

def main() -> int:
    ap = argparse.ArgumentParser(description="Golden set generation (§9 Phase 1)")
    ap.add_argument("--stage", choices=["draft", "judge", "all"], default="all")
    ap.add_argument("--only", choices=list(CATEGORIES), help="one category only")
    ap.add_argument("--rpm", type=float, help="override requests/minute")
    ap.add_argument("--limit", type=int, help="stop after N new items (smoke test)")
    ap.add_argument("--draft-model", default=DRAFT_MODEL)
    ap.add_argument("--judge-model", default=JUDGE_MODEL)
    args = ap.parse_args()

    env = gemini.read_dotenv(ROOT / ".env")
    key = env.get("GEMINI_API_KEY") or os.environ.get("GEMINI_API_KEY", "")
    if not key.strip():
        log("!! GEMINI_API_KEY not set in .env"); return 2

    GOLDEN.mkdir(parents=True, exist_ok=True)
    st = State.load()
    if st.failures:
        log(f"  retrying {len(st.failures)} previous failures")
        st.failures.clear()

    log("Golden set generation — brief §9 Phase 1")
    log(f"  draft model  {args.draft_model} @ {args.rpm or DRAFT_RPM} rpm")
    log(f"  judge model  {args.judge_model} @ {args.rpm or JUDGE_RPM} rpm")
    log(f"  target       {sum(c['n'] for c in CATEGORIES.values())} queries, "
        f"{CANDIDATES_PER_QUERY} candidates each")
    if st.queries:
        log(f"  resuming     {len(st.queries)} queries, {len(st.judged)} judged")

    log("\n  loading chunks")
    chunks, by_doc, by_tenant = load_chunks()
    log(f"  {len(chunks):,} chunks, {len(by_doc):,} documents, {len(by_tenant)} tenants")

    run_config = {
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "draft_model": args.draft_model,
        "judge_model": args.judge_model,
        "candidates_per_query": CANDIDATES_PER_QUERY,
        "chunks_per_judge_call": CHUNKS_PER_JUDGE_CALL,
        "seed": SEED,
        "relevance": "absolute — not role-relative; benchmark clauses run as all_tenants",
        "categories": {k: v["n"] for k, v in CATEGORIES.items()},
        "corpus_chunks": str(CHUNKS.relative_to(ROOT)),
    }

    started = time.time()
    rc = 0
    try:
        if args.stage in ("draft", "all"):
            if args.limit:
                for cat in CATEGORIES:
                    CATEGORIES[cat] = {**CATEGORIES[cat],
                                       "n": min(CATEGORIES[cat]["n"], args.limit)}
            c = gemini.Gemini(key, args.draft_model, args.rpm or DRAFT_RPM)
            run_config["draft_model_ref"] = c.ref
            log(f"  draft snapshot  {c.ref}")
            stage_draft(st, c, chunks, by_doc, by_tenant, args.only)
            log(f"  drafting used {c.calls} calls, "
                f"{c.tokens_in:,} in / {c.tokens_out:,} out")
        if args.stage in ("judge", "all"):
            c = gemini.Gemini(key, args.judge_model, args.rpm or JUDGE_RPM)
            run_config["judge_model_ref"] = c.ref
            log(f"  judge snapshot  {c.ref}")
            stage_judge(st, c, chunks)
            log(f"  judging used {c.calls} calls, "
                f"{c.tokens_in:,} in / {c.tokens_out:,} out")
    except gemini.QuotaExhausted:
        rc = 3
    except KeyboardInterrupt:
        log("\n!! interrupted — state saved; re-run to resume")
        rc = 130

    st.save(); st.write_outputs()
    atomic_write(GOLDEN / "run_config.json", json.dumps(run_config, indent=2))
    counts: dict[str, int] = defaultdict(int)
    for q in st.queries.values():
        counts[q["category"]] += 1
    log("\n" + "=" * 60)
    for cat, spec in CATEGORIES.items():
        log(f"  {cat:<16} {counts[cat]:>4}/{spec['n']}")
    log(f"  queries total    {len(st.queries):>4}")
    log(f"  judged           {len(st.judged):>4}")
    log(f"  failures         {len(st.failures):>4}")
    log(f"  elapsed          {time.time()-started:>4.0f}s")
    log("=" * 60)
    for f in list(st.failures.values())[:10]:
        log(f"  {f['key']} ({f['stage']}): {f['error'][:110]}")
    return rc


if __name__ == "__main__":
    sys.exit(main())
