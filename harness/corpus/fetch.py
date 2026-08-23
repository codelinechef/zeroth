#!/usr/bin/env python3
"""
Zeroth corpus acquisition — brief §4.1.

Fetches the three corpus sources into data/corpus/raw/ (gitignored) and writes
data/corpus/corpus_manifest.json incrementally. The manifest is what makes the
corpus reproducible without redistributing gigabytes: replay `url`, verify
`checksum`.

Standard library only. No third-party dependencies, deliberately — this is the
script a stranger runs after cloning.

    python3 harness/corpus/fetch.py                  # everything
    python3 harness/corpus/fetch.py --only edgar
    python3 harness/corpus/fetch.py --dry-run        # plan, fetch nothing
    python3 harness/corpus/fetch.py --verify         # re-check cached checksums

Safe to interrupt with Ctrl-C at any point and re-run; it resumes from
data/corpus/.fetch_state.json and never re-fetches a document already on disk
with a matching checksum.

Rate limiting is a SINGLE shared token bucket across all three sources, because
SEC's limit is per-IP and spans sec.gov and data.sec.gov together (§4.1).
"""

from __future__ import annotations

import argparse
import gzip
import hashlib
import http.client
import json
import os
import re
import ssl
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import zipfile
from dataclasses import dataclass, field
from pathlib import Path

# --------------------------------------------------------------------------
# Layout
# --------------------------------------------------------------------------

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data" / "corpus"
RAW = DATA / "raw"
MANIFEST = DATA / "corpus_manifest.json"
STATE = DATA / ".fetch_state.json"

# SEC's published ceiling is 10 requests/second per IP. Default is set just
# below it: a nominal 10.0 will drift above the limit under clock jitter, and a
# block costs far more than the seconds saved. Raise with --rps if you must.
DEFAULT_RPS = 9.0

# A response can be HTTP 200 and still not be the document: SEC serves a block
# notice, proxies serve captive portals. Written to disk that becomes an
# "Access Denied" file recorded in the manifest as a 10-K.
ERROR_MARKERS = (
    b"undeclared automated tool",
    b"request rate threshold",
    b"access denied",
    b"you have exceeded",
    b"error 403",
    b"forbidden</title>",
    b"<title>sec.gov | request rate",
)

# Floor below which a document of each kind is implausible and treated as a
# failed fetch rather than cached. A 10-K primary document is ~1 MB; anything
# in the kilobytes is a stub, a redirect page, or a truncation.
MIN_PLAUSIBLE = {"edgar": 10_000, "rfc": 1_000, "cuad": 200}

# A file on disk with no manifest entry cannot be checked against anything —
# its recorded length is exactly what we lost. Re-fetching is the only way to
# know it is whole, so that is the default. --trust-cache opts out when you
# would rather not re-download a large corpus over a lost state file.
TRUST_CACHE = False

LICENCES = {
    "edgar": "us-sec-edgar-public",
    "cuad": "CC-BY-4.0",
    "rfc": "ietf-trust-bcp78",
}

# --------------------------------------------------------------------------
# Source definitions
# --------------------------------------------------------------------------

# ~40 companies chosen to spread across sectors — the tenant partition is only
# interesting if the documents genuinely differ (§4.1). SIC code and
# description are recorded per document so the spread is auditable rather than
# asserted. Override with --tickers <file> (one ticker per line).
TICKERS = [
    # technology / software
    "MSFT", "ORCL", "CRM", "ADBE", "IBM",
    # semiconductors
    "NVDA", "INTC", "AMD", "TXN", "MU",
    # pharma / biotech / medical
    "PFE", "MRK", "ABBV", "AMGN", "MDT",
    # banks / financial services / insurance
    "JPM", "GS", "AXP", "SCHW", "MET",
    # energy / utilities
    "XOM", "CVX", "SLB", "DUK", "NEE",
    # retail / consumer
    "WMT", "TGT", "COST", "NKE", "SBUX",
    # industrials / aerospace / transport
    "CAT", "DE", "BA", "UNP", "FDX",
    # telecom / media
    "VZ", "T", "DIS", "CMCSA",
    # materials / chemicals
    "DOW", "NEM", "LIN",
]

# 10-K filings per company. ~40 companies x 8 ≈ 320 filings, against the ~300
# in §4. Companies with shorter EDGAR histories simply yield fewer.
DEFAULT_PER_COMPANY = 8

# RFCs from the HTTP and TLS families. Working group is recorded literally
# rather than derived, so tenant assignment needs no extra requests and stays
# reviewable. (§4 assigns RFC tenants by working group.)
RFCS = [
    # HTTP/1.1 — original httpbis revision
    (7230, "httpbis"), (7231, "httpbis"), (7232, "httpbis"),
    (7233, "httpbis"), (7234, "httpbis"), (7235, "httpbis"),
    # HTTP — current core specifications
    (9110, "httpbis"), (9111, "httpbis"), (9112, "httpbis"),
    (9113, "httpbis"), (9114, "httpbis"),
    # HTTP/2, HTTP/3 and related
    (7540, "httpbis"), (7541, "httpbis"), (8441, "httpbis"),
    (8470, "httpbis"), (6265, "httpstate"),
    # QUIC transport, which the HTTP/3 documents lean on
    (9000, "quic"), (9001, "quic"), (9002, "quic"),
    # TLS
    (8446, "tls"), (5246, "tls"), (6176, "tls"), (7457, "tls"),
    (7525, "tls"), (7627, "tls"), (7685, "tls"), (8447, "tls"),
    (8449, "tls"), (8773, "tls"), (9147, "tls"),
]

ZENODO_RECORD = "4595826"  # CUAD dataset. NOT 4599830 — that is the models.


# --------------------------------------------------------------------------
# Small utilities
# --------------------------------------------------------------------------

def log(msg: str) -> None:
    print(msg, flush=True)


def slug(text: str, maxlen: int = 60) -> str:
    s = re.sub(r"[^A-Za-z0-9]+", "-", text).strip("-").lower()
    return s[:maxlen] or "unnamed"


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def read_dotenv(path: Path) -> dict[str, str]:
    env: dict[str, str] = {}
    if not path.exists():
        return env
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        env[k.strip()] = v.strip().strip('"').strip("'")
    return env


def atomic_write(path: Path, data: str) -> None:
    """Write via a temp file and rename, so an interrupt cannot truncate the
    manifest into invalid JSON."""
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(data)
    os.replace(tmp, path)


# --------------------------------------------------------------------------
# Rate limiting — one bucket, shared by every source
# --------------------------------------------------------------------------

class TokenBucket:
    """Single shared token bucket. SEC's limit is per-IP across sec.gov and
    data.sec.gov together, so a per-source limiter would silently exceed it."""

    def __init__(self, rps: float):
        self.rps = rps
        # Capacity is deliberately 1.0, not `rps`. A bucket that starts full
        # fires `rps` requests instantaneously and then settles to the
        # sustained rate, which puts ~2x the ceiling into the opening second —
        # exactly the burst SEC measures. Capacity 1.0 makes this strict
        # pacing: a minimum gap of 1/rps between every request, no burst.
        self.capacity = 1.0
        self.tokens = self.capacity
        self.last = time.monotonic()
        self.waited = 0.0
        self.requests = 0

    def take(self) -> None:
        while True:
            now = time.monotonic()
            self.tokens = min(self.capacity, self.tokens + (now - self.last) * self.rps)
            self.last = now
            if self.tokens >= 1.0:
                self.tokens -= 1.0
                self.requests += 1
                return
            sleep = (1.0 - self.tokens) / self.rps
            self.waited += sleep
            time.sleep(sleep)

    def pause(self, seconds: float) -> None:
        """Server told us to back off. Drain the bucket so nothing slips out
        during the pause."""
        self.tokens = 0.0
        time.sleep(seconds)
        self.last = time.monotonic()


# --------------------------------------------------------------------------
# HTTP
# --------------------------------------------------------------------------

class BadResponse(Exception):
    """A response that arrived intact at the HTTP level but is not the
    document — short body, error page, or a length that disagrees with
    Content-Length."""


class Fetcher:
    def __init__(self, bucket: TokenBucket, user_agent: str, max_attempts: int = 5):
        self.bucket = bucket
        self.user_agent = user_agent
        self.max_attempts = max_attempts
        self.ctx = ssl.create_default_context()

    def get(self, url: str, accept: str = "*/*", min_bytes: int = 0) -> bytes:
        """GET with the shared rate limit, Retry-After honoured, exponential
        backoff on 429 and 5xx. Raises on final failure."""
        last_error: Exception | None = None

        for attempt in range(1, self.max_attempts + 1):
            self.bucket.take()
            req = urllib.request.Request(
                url,
                headers={
                    # SEC only rejects an ABSENT User-Agent — a bare browser
                    # string is served normally. Sending the real contact is a
                    # policy obligation, and blocks are applied after the fact.
                    "User-Agent": self.user_agent,
                    "Accept": accept,
                    "Accept-Encoding": "gzip",
                    "Connection": "close",
                },
            )
            try:
                with urllib.request.urlopen(req, timeout=60, context=self.ctx) as r:
                    if r.status != 200:
                        raise BadResponse(f"HTTP {r.status} after redirects")
                    raw = r.read()

                    # Compare against Content-Length BEFORE decompressing: a
                    # connection dropped mid-read yields a short body that is
                    # otherwise indistinguishable from a complete one.
                    declared = r.headers.get("Content-Length")
                    if declared is not None:
                        try:
                            want = int(declared)
                        except ValueError:
                            want = None
                        if want is not None and len(raw) != want:
                            raise BadResponse(
                                f"truncated: got {len(raw)} bytes, "
                                f"Content-Length said {want}")

                    body = (gzip.decompress(raw)
                            if r.headers.get("Content-Encoding") == "gzip" else raw)

                    self._reject_error_page(body, url)
                    if min_bytes and len(body) < min_bytes:
                        raise BadResponse(
                            f"implausibly small: {len(body)} bytes "
                            f"(expected at least {min_bytes})")
                    return body

            except urllib.error.HTTPError as e:
                last_error = e
                retry_after = e.headers.get("Retry-After") if e.headers else None
                if e.code in (429, 500, 502, 503, 504):
                    delay = self._retry_delay(retry_after, attempt)
                    log(f"    HTTP {e.code} — backing off {delay:.1f}s "
                        f"(attempt {attempt}/{self.max_attempts})")
                    self.bucket.pause(delay)
                    continue
                if e.code in (403, 404):
                    raise RuntimeError(f"HTTP {e.code} {url}") from e
                delay = self._retry_delay(retry_after, attempt)
                self.bucket.pause(delay)

            except (urllib.error.URLError, TimeoutError, OSError,
                    http.client.HTTPException, BadResponse) as e:
                # http.client.IncompleteRead is an HTTPException, NOT an
                # OSError. Without it listed here a connection dropped
                # mid-read escapes this loop instead of being retried — which
                # is precisely how a truncated document reaches the cache.
                last_error = e
                delay = min(60.0, 2.0 ** attempt)
                log(f"    {type(e).__name__}: {e} — retrying in {delay:.1f}s "
                    f"(attempt {attempt}/{self.max_attempts})")
                self.bucket.pause(delay)

        raise RuntimeError(f"giving up after {self.max_attempts} attempts: "
                           f"{url} ({last_error})")

    @staticmethod
    def _reject_error_page(body: bytes, url: str) -> None:
        """A block notice is HTML and small. Real documents are neither, so
        only sniff the head of short bodies — never scan a 1 MB filing."""
        if len(body) > 64_000:
            return
        head = body[:4096].lower()
        for marker in ERROR_MARKERS:
            if marker in head:
                raise BadResponse(f"server returned an error page, not the "
                                  f"document (matched {marker.decode()!r})")

    @staticmethod
    def _retry_delay(retry_after: str | None, attempt: int) -> float:
        if retry_after:
            try:
                return min(300.0, float(int(retry_after)))
            except ValueError:
                pass  # HTTP-date form; fall through to backoff
        return min(60.0, 2.0 ** attempt)

    def get_json(self, url: str):
        return json.loads(self.get(url, accept="application/json").decode("utf-8"))


# --------------------------------------------------------------------------
# Resumable state
# --------------------------------------------------------------------------

@dataclass
class State:
    documents: dict = field(default_factory=dict)   # doc_id -> manifest entry
    failures: dict = field(default_factory=dict)    # doc_id -> {url, error}
    meta: dict = field(default_factory=dict)

    @classmethod
    def load(cls) -> "State":
        if STATE.exists():
            try:
                raw = json.loads(STATE.read_text())
                return cls(raw.get("documents", {}), raw.get("failures", {}),
                           raw.get("meta", {}))
            except json.JSONDecodeError:
                log(f"!! {STATE} is unreadable; starting fresh "
                    f"(cached files in {RAW} are still reused)")
        return cls()

    def register(self, doc_id: str, doc: dict) -> bool:
        """Add a document, refusing to overwrite a different one.

        A truncated slug can map two distinct source files to one doc_id. A
        plain dict assignment then drops the second silently — no error, and a
        count that only disagrees with the source archive several lines later.
        This turns that into a recorded failure."""
        prior = self.documents.get(doc_id)
        if prior is not None and prior.get("identifier") != doc.get("identifier"):
            self.failures[f"{doc_id}#collision"] = {
                "doc_id": doc_id,
                "source": doc.get("source", "?"),
                "url": doc.get("url", ""),
                "error": (f"doc_id collision: {doc.get('identifier')!r} would "
                          f"overwrite {prior.get('identifier')!r}"),
                "attempted_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            }
            log(f"    !! doc_id collision on {doc_id} — {doc.get('identifier')} "
                f"not registered")
            return False
        self.documents[doc_id] = doc
        return True

    def save(self) -> None:
        atomic_write(STATE, json.dumps(
            {"documents": self.documents, "failures": self.failures, "meta": self.meta},
            indent=2, sort_keys=True))

    def write_manifest(self) -> None:
        docs = sorted(self.documents.values(), key=lambda d: (d["source"], d["doc_id"]))
        by_source: dict[str, int] = {}
        for d in docs:
            by_source[d["source"]] = by_source.get(d["source"], 0) + 1
        manifest = {
            "corpus_id": "edgar-cuad-rfc-v1",
            "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "note": (
                "Fetch stage only. 'pages', 'normalised_checksum' and 'dedup' are "
                "populated by the parsing stage; they are null here because they "
                "require extracted text, not raw bytes."
            ),
            "counts": {"documents": len(docs), "by_source": by_source,
                       "failures": len(self.failures)},
            # Recorded so a partial corpus is self-describing: what is missing
            # and why, rather than an unexplained gap in the document list.
            "failures": sorted(self.failures.values(),
                               key=lambda x: str(x.get("doc_id", ""))),
            "licences": LICENCES,
            # Not documents: the archives they were extracted from. Recorded so
            # every file in data/corpus/raw/ is accounted for, and so the CUAD
            # release actually used is pinned by checksum.
            "source_archives": self.meta.get("source_archives", []),
            "attribution": {
                "cuad": ("CUAD (Contract Understanding Atticus Dataset), "
                         "Hendrycks et al., NeurIPS 2021; The Atticus Project. "
                         "CC BY 4.0. Chunking and re-indexing constitute modification."),
                "edgar": "US SEC EDGAR full-text filings.",
                "rfc": "IETF / RFC Editor, per BCP 78.",
            },
            "documents": docs,
        }
        atomic_write(MANIFEST, json.dumps(manifest, indent=2))


def record_failure(st: "State", doc_id: str, source: str, url: str,
                   exc: BaseException) -> None:
    """One document failing must never end the run.

    Anything that is not a deliberate interrupt is logged, recorded, and
    stepped over. A crash at filing 200 of 300 costs hours; a skipped document
    costs one line in the failure summary and is retried on the next run."""
    st.failures[doc_id] = {
        "doc_id": doc_id,
        "source": source,
        "url": url,
        "error": f"{type(exc).__name__}: {exc}",
        "attempted_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }
    log(f"    !! {doc_id} FAILED — {type(exc).__name__}: {exc}")
    log(f"       continuing; re-run to retry this document")
    st.save()


def entry(doc_id, source, identifier, url, checksum, tenant, path, extra=None) -> dict:
    d = {
        "doc_id": doc_id,
        "source": source,
        "identifier": identifier,
        "url": url,
        "checksum": checksum,
        "normalised_checksum": None,   # parsing stage
        "pages": None,                 # parsing stage
        "tenant": tenant,
        "fetched_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "licence": LICENCES[source],
        "dedup": None,                 # dedup stage
        "raw_path": str(path.relative_to(ROOT)),
    }
    if extra:
        d.update(extra)
    return d


# --------------------------------------------------------------------------
# EDGAR
# --------------------------------------------------------------------------

def fetch_edgar(f: Fetcher, st: State, tickers: list[str], per_company: int,
                dry_run: bool) -> None:
    log(f"\n=== EDGAR — {len(tickers)} companies x up to {per_company} 10-Ks ===")

    cik_map = st.meta.get("cik_map")
    if dry_run:
        known = len([t for t in tickers if cik_map and t.upper() in cik_map])
        log(f"  [dry-run] {len(tickers)} tickers, "
            f"{'CIK map cached' if cik_map else 'would fetch company_tickers.json'}"
            f"{f', {known} resolvable' if cik_map else ''}")
        log(f"  [dry-run] up to {per_company} 10-K primary documents per company "
            f"= at most {len(tickers) * per_company} document fetches, "
            f"plus {len(tickers)} submissions requests")
        already = sum(1 for d in st.documents.values() if d["source"] == "edgar")
        log(f"  [dry-run] {already} already cached and would be skipped")
        return
    if not cik_map:
        log("  fetching company_tickers.json")
        data = f.get_json("https://www.sec.gov/files/company_tickers.json")
        cik_map = {v["ticker"].upper(): {"cik": int(v["cik_str"]), "title": v["title"]}
                   for v in data.values()}
        st.meta["cik_map"] = cik_map
        st.save()

    prune_edgar(st, per_company)

    missing = [t for t in tickers if t.upper() not in cik_map]
    if missing:
        log(f"  !! not found in EDGAR ticker map, skipping: {', '.join(missing)}")

    out = RAW / "edgar"
    out.mkdir(parents=True, exist_ok=True)

    for n, ticker in enumerate([t for t in tickers if t.upper() in cik_map], 1):
        info = cik_map[ticker.upper()]
        cik = info["cik"]
        cik10 = f"{cik:010d}"
        tenant = f"edgar-{slug(ticker)}"

        log(f"\n  [{n}/{len(tickers)}] {ticker} — CIK {cik10} ({info['title'][:48]})")

        sub_url = f"https://data.sec.gov/submissions/CIK{cik10}.json"
        try:
            sub = f.get_json(sub_url)
        except KeyboardInterrupt:
            raise
        except Exception as e:
            # One unreachable company must not cost the other 41.
            record_failure(st, f"edgar-{cik10}-submissions", "edgar", sub_url, e)
            continue

        sic = sub.get("sic")
        sic_desc = sub.get("sicDescription")
        filings = _collect_10ks(f, sub, cik10)
        log(f"    SIC {sic} · {sic_desc} · {len(filings)} 10-K filings on record")

        for filing in filings[:per_company]:
            acc_nodash = filing["accession"].replace("-", "")
            doc_id = f"edgar-{cik10}-{acc_nodash}"
            if _resume_ok(st, doc_id):
                continue

            # primaryDocument ONLY. A filing directory holds ~90 files including
            # separate *exhibit*.htm documents; exhibit contracts are what CUAD
            # is drawn from, so taking only the primary document removes the
            # main overlap path before dedup runs at all. (§4.1)
            url = (f"https://www.sec.gov/Archives/edgar/data/{cik}/"
                   f"{acc_nodash}/{filing['primary']}")

            dest = out / f"{doc_id}{Path(filing['primary']).suffix or '.htm'}"
            try:
                body = _cached(f, url, dest, MIN_PLAUSIBLE["edgar"])
            except KeyboardInterrupt:
                raise
            except Exception as e:
                record_failure(st, doc_id, "edgar", url, e)
                continue

            st.register(doc_id, entry(
                doc_id, "edgar", filing["accession"], url, sha256(body), tenant, dest,
                extra={
                    "cik": cik10,
                    "company": info["title"],
                    "ticker": ticker.upper(),
                    "sic": sic,
                    "sic_description": sic_desc,
                    "form": "10-K",
                    "filing_date": filing["filing_date"],
                    "report_date": filing["report_date"],
                    "primary_document": filing["primary"],
                    "bytes": len(body),
                }))
            st.save()
            st.write_manifest()
            log(f"    ok {filing['report_date']}  {len(body):>9,} B  {filing['primary']}")


def prune_edgar(st: "State", per_company: int) -> int:
    """Drop filings beyond the newest `per_company` for each CIK.

    Makes --per-company idempotent: lowering it on a later run reduces the
    corpus instead of leaving earlier extras behind. Without this, the
    committed manifest would not match what a fresh clone produces from the
    same command, which is the whole reproducibility claim (§3.2)."""
    by_cik: dict[str, list] = {}
    for doc_id, d in st.documents.items():
        if d.get("source") == "edgar":
            by_cik.setdefault(d["cik"], []).append((d.get("filing_date", ""), doc_id))

    removed = 0
    for cik, filings in by_cik.items():
        # same ordering fetch_edgar uses: newest filing_date first
        filings.sort(reverse=True)
        for _, doc_id in filings[per_company:]:
            path = ROOT / st.documents[doc_id]["raw_path"]
            path.unlink(missing_ok=True)
            st.documents.pop(doc_id, None)
            removed += 1
    if removed:
        log(f"  pruned {removed} filings beyond --per-company {per_company}")
        st.save()
        st.write_manifest()
    return removed


def _collect_10ks(f: Fetcher, sub: dict, cik10: str) -> list[dict]:
    """10-Ks from filings.recent, plus the older overflow files when a prolific
    filer has pushed them out of the recent window."""
    found: list[dict] = []

    def harvest(block: dict) -> None:
        forms = block.get("form", [])
        for i, form in enumerate(forms):
            if form != "10-K":
                continue
            primary = block["primaryDocument"][i]
            if not primary:
                continue
            found.append({
                "accession": block["accessionNumber"][i],
                "primary": primary,
                "filing_date": block["filingDate"][i],
                "report_date": (block.get("reportDate") or [])[i]
                                if i < len(block.get("reportDate") or []) else "",
            })

    harvest(sub.get("filings", {}).get("recent", {}))

    for extra in sub.get("filings", {}).get("files", []):
        name = extra.get("name")
        if not name:
            continue
        try:
            harvest(f.get_json(f"https://data.sec.gov/submissions/{name}"))
        except RuntimeError as e:
            log(f"    !! overflow file {name}: {e}")

    found.sort(key=lambda d: d["filing_date"], reverse=True)
    return found


# --------------------------------------------------------------------------
# CUAD
# --------------------------------------------------------------------------

def fetch_cuad(f: Fetcher, st: State, dry_run: bool) -> None:
    log("\n=== CUAD — Zenodo record " + ZENODO_RECORD + " ===")
    log("  (record 4595826 is the dataset; 4599830 is the fine-tuned models)")

    if dry_run:
        log("  [dry-run] would query the Zenodo API and download the archive")
        return

    out = RAW / "cuad"
    out.mkdir(parents=True, exist_ok=True)
    archive = out / "_cuad_archive.zip"

    if not archive.exists():
        rec = f.get_json(f"https://zenodo.org/api/records/{ZENODO_RECORD}")
        files = rec.get("files", [])
        if not files:
            raise RuntimeError("Zenodo record listed no files")
        # Prefer the largest zip; the record carries several assets.
        zips = [x for x in files if str(x.get("key", "")).lower().endswith(".zip")]
        chosen = max(zips or files, key=lambda x: x.get("size", 0))
        url = chosen.get("links", {}).get("self") or chosen.get("links", {}).get("download")
        log(f"  downloading {chosen.get('key')} ({chosen.get('size', 0):,} B) — this is the big one")
        archive.write_bytes(f.get(url))
    else:
        log(f"  reusing cached archive {archive.name} ({archive.stat().st_size:,} B)")

    # Pin the exact CUAD release by checksum, and account for the archive
    # itself so every file in raw/cuad/ appears somewhere in the manifest.
    archive_bytes = archive.read_bytes()
    st.meta["source_archives"] = [a for a in st.meta.get("source_archives", [])
                                  if a.get("source") != "cuad"] + [{
        "source": "cuad",
        "role": "source archive, not a corpus document",
        "path": str(archive.relative_to(ROOT)),
        "url": f"https://zenodo.org/api/records/{ZENODO_RECORD}",
        "checksum": sha256(archive_bytes),
        "bytes": len(archive_bytes),
        "licence": LICENCES["cuad"],
    }]

    # CUAD entries are derived entirely from this cached archive, so
    # re-deriving them costs nothing and keeps the manifest consistent when the
    # id scheme changes. Without this, old-scheme entries would linger beside
    # new ones and the count would double.
    stale = [k for k, d in st.documents.items() if d.get("source") == "cuad"]
    for k in stale:
        st.documents.pop(k)
    if stale:
        log(f"  re-deriving {len(stale)} existing CUAD entries from the cached archive")

    zf = zipfile.ZipFile(archive)
    names = [n for n in zf.namelist() if not n.endswith("/")]

    # Prefer the plain-text contracts. The archive's internal layout is not
    # pinned here — it is discovered and logged, so if it differs from
    # expectation you can see exactly what was found.
    txt = [n for n in names if "full_contract_txt" in n.lower() and n.lower().endswith(".txt")]
    if not txt:
        txt = [n for n in names if n.lower().endswith(".txt")]
        log("  !! no full_contract_txt/ directory found; falling back to all .txt")
    log(f"  archive holds {len(names)} files; selected {len(txt)} contract texts")
    if txt[:3]:
        log("  sample names: " + " | ".join(Path(n).name[:44] for n in txt[:3]))

    registered = 0
    for name in sorted(txt):
        base = Path(name).name
        # The slug alone is not unique: CUAD filenames routinely exceed 60
        # characters and differ only in a trailing "1"/"2" or "_AMENDMENT".
        # The hash of the full archive member name makes the id total.
        doc_id = (f"cuad-{slug(Path(base).stem, 40)}"
                  f"-{hashlib.sha1(name.encode()).hexdigest()[:8]}")
        if _resume_ok(st, doc_id):
            continue
        try:
            body = zf.read(name)
            if len(body) < MIN_PLAUSIBLE["cuad"]:
                raise BadResponse(f"{len(body)} B is below the plausibility floor")
            dest = out / base
            if not dest.exists() or dest.stat().st_size != len(body):
                write_document(dest, body)
        except KeyboardInterrupt:
            raise
        except Exception as e:
            record_failure(st, doc_id, "cuad", name, e)
            continue

        # CUAD filenames encode the filer and the EDGAR exhibit reference, e.g.
        # LIMEENERGYCO_09_09_1999-EX-10.1-JOINT VENTURE AGREEMENT.txt
        # The prefix gives a provisional tenant; the exhibit reference feeds
        # stage-1 provenance matching during dedup. Both are confirmed at
        # parsing time, not trusted here.
        prefix = re.split(r"[_\-]", Path(base).stem, maxsplit=1)[0]
        exhibit = None
        m = re.search(r"(EX-[0-9A-Za-z.]+)", base)
        if m:
            exhibit = m.group(1)

        st.register(doc_id, entry(
            doc_id, "cuad", base,
            f"https://zenodo.org/record/{ZENODO_RECORD}#{urllib.parse.quote(name)}",
            sha256(body), f"cuad-{slug(prefix, 40)}", dest,
            extra={
                "archive_member": name,
                "tenant_provisional": True,
                "edgar_exhibit_ref": exhibit,
                "bytes": len(body),
            }))
        # Persist per document, exactly as EDGAR and RFC do. Registering the
        # whole loop and saving once at the end means a crash partway through
        # loses every CUAD entry, and the next run re-extracts all of them.
        st.save()
        st.write_manifest()
        registered += 1
        if registered % 50 == 0:
            log(f"  registered {registered}/{len(txt)} contracts")

    registered_now = sum(1 for d in st.documents.values() if d["source"] == "cuad")
    collisions = sum(1 for k in st.failures if k.endswith("#collision"))
    too_small = sum(1 for k, v in st.failures.items()
                    if v.get("source") == "cuad" and not k.endswith("#collision"))
    log("")
    log(f"  CUAD reconciliation")
    log(f"    selected from archive   {len(txt)}")
    log(f"    registered              {registered_now}")
    unaccounted = len(txt) - registered_now - collisions - too_small
    if collisions:
        log(f"    doc_id collisions       {collisions}")
    if too_small:
        log(f"    below size floor        {too_small}")
    if unaccounted:
        log(f"    UNACCOUNTED             {unaccounted}  <-- investigate")
    if registered_now == len(txt):
        log(f"    every selected contract is registered")


# --------------------------------------------------------------------------
# RFCs
# --------------------------------------------------------------------------

def fetch_rfc(f: Fetcher, st: State, dry_run: bool) -> None:
    log(f"\n=== RFCs — {len(RFCS)} documents from the HTTP and TLS families ===")
    out = RAW / "rfc"
    if not dry_run:
        out.mkdir(parents=True, exist_ok=True)

    for num, wg in RFCS:
        doc_id = f"rfc-{num}"
        if _resume_ok(st, doc_id):
            continue
        url = f"https://www.rfc-editor.org/rfc/rfc{num}.txt"
        if dry_run:
            log(f"  [dry-run] RFC {num} ({wg})")
            continue

        dest = out / f"rfc{num}.txt"
        try:
            body = _cached(f, url, dest, MIN_PLAUSIBLE["rfc"])
        except KeyboardInterrupt:
            raise
        except Exception as e:
            record_failure(st, doc_id, "rfc", url, e)
            continue

        st.register(doc_id, entry(
            doc_id, "rfc", f"RFC {num}", url, sha256(body), f"rfc-{wg}", dest,
            extra={"rfc_number": num, "working_group": wg, "bytes": len(body)}))
        st.save()
        st.write_manifest()
        log(f"  ok RFC {num:<5} {wg:<10} {len(body):>9,} B")


# --------------------------------------------------------------------------
# Shared fetch-with-cache
# --------------------------------------------------------------------------

def _cached(f: Fetcher, url: str, dest: Path, min_bytes: int = 0) -> bytes:
    """Reuse a file already on disk. Re-running must not re-fetch (§4.1).

    A cached file is only trusted if it clears the plausibility floor. A
    truncated document looks complete on disk, so "the file exists" is not
    evidence that it is the document."""
    if dest.exists():
        size = dest.stat().st_size
        # Reaching here means no manifest entry vouched for this file — the
        # caller's _resume_ok already failed. Clearing the size floor only
        # proves it is not grossly truncated; a 5 KB fragment of a 60 KB RFC
        # clears it comfortably. Without a recorded length there is nothing to
        # compare against, so re-fetch rather than trust it.
        if TRUST_CACHE and size > 0 and size >= min_bytes:
            log(f"    --trust-cache: reusing unverified {dest.name} ({size:,} B)")
            return dest.read_bytes()
        log(f"    {dest.name} on disk ({size:,} B) has no manifest entry "
            f"— refetching to verify")
        dest.unlink()

    body = f.get(url, min_bytes=min_bytes)
    write_document(dest, body)
    return body


def write_document(dest: Path, body: bytes) -> None:
    """Write through a .part file and rename.

    os.replace is atomic within a filesystem, so an interrupt can never leave
    a half-written document at the real path for a later run to trust.

    The parent directory is re-created and the write retried once on OSError.
    This is defence in depth, not a diagnosed fix: a write into an existing
    directory failed once with ENOENT mid-run and was not reproducible
    afterwards, which points at something outside this process (on WSL2 an
    external scanner touching the filesystem is the usual candidate). Cheap
    to guard against, so guarded."""
    part = dest.with_suffix(dest.suffix + ".part")
    for attempt in (1, 2):
        try:
            dest.parent.mkdir(parents=True, exist_ok=True)
            part.write_bytes(body)
            os.replace(part, dest)
            return
        except OSError as e:
            part.unlink(missing_ok=True)
            if attempt == 2:
                raise
            log(f"    write failed ({type(e).__name__}: {e}) — retrying once")
            time.sleep(0.5)


def _resume_ok(st: "State", doc_id: str) -> bool:
    """True if the document recorded in state is still intact on disk.

    Checks the recorded byte count, which is what catches truncation. On
    mismatch the entry is evicted so the normal fetch path refetches it —
    otherwise a bad file is skipped forever and only surfaces as an
    inexplicable parser failure much later."""
    d = st.documents.get(doc_id)
    if not d:
        return False
    path = ROOT / d["raw_path"]
    if not path.exists():
        log(f"    {doc_id}: cached file is gone — refetching")
        st.documents.pop(doc_id, None)
        return False
    expected = d.get("bytes")
    if expected is not None and path.stat().st_size != expected:
        log(f"    {doc_id}: {path.stat().st_size} B on disk, manifest says "
            f"{expected} B — refetching")
        st.documents.pop(doc_id, None)
        path.unlink(missing_ok=True)
        return False
    return True


# --------------------------------------------------------------------------
# Verify
# --------------------------------------------------------------------------

def sweep_part_files() -> int:
    """Remove .part files orphaned by an interrupted or crashed run.

    They are never mistaken for documents — nothing reads them — but leaving
    them makes a partially fetched corpus harder to reason about."""
    if not RAW.exists():
        return 0
    stale = list(RAW.rglob("*.part"))
    for p in stale:
        p.unlink(missing_ok=True)
    if stale:
        log(f"  cleared {len(stale)} orphaned .part file(s) from an earlier run")
    return len(stale)


def verify(st: State) -> int:
    log(f"=== verifying {len(st.documents)} cached documents against the manifest ===")
    missing = mismatched = 0
    for doc_id, d in sorted(st.documents.items()):
        p = ROOT / d["raw_path"]
        if not p.exists():
            log(f"  MISSING   {doc_id}  {d['raw_path']}")
            missing += 1
            continue
        if sha256(p.read_bytes()) != d["checksum"]:
            log(f"  MISMATCH  {doc_id}  {d['raw_path']}")
            mismatched += 1
    log(f"\n  ok {len(st.documents) - missing - mismatched}   "
        f"missing {missing}   mismatched {mismatched}")
    return 1 if (missing or mismatched) else 0


# --------------------------------------------------------------------------
# Main
# --------------------------------------------------------------------------

def main() -> int:
    ap = argparse.ArgumentParser(description="Zeroth corpus acquisition (brief §4.1)")
    ap.add_argument("--only", choices=["edgar", "cuad", "rfc"], action="append",
                    help="restrict to one or more sources (repeatable)")
    ap.add_argument("--per-company", type=int, default=DEFAULT_PER_COMPANY,
                    help=f"10-K filings per company (default {DEFAULT_PER_COMPANY})")
    ap.add_argument("--tickers", type=Path,
                    help="file of tickers, one per line, replacing the built-in list")
    ap.add_argument("--rps", type=float, default=DEFAULT_RPS,
                    help=f"shared request ceiling (default {DEFAULT_RPS}; SEC allows 10)")
    ap.add_argument("--trust-cache", action="store_true",
                    help="reuse on-disk files that have no manifest entry "
                         "(default is to re-fetch, since their length cannot "
                         "be verified against anything)")
    ap.add_argument("--dry-run", action="store_true", help="show the plan, fetch nothing")
    ap.add_argument("--verify", action="store_true",
                    help="re-check cached files against manifest checksums and exit")
    args = ap.parse_args()

    st = State.load()

    # --verify and --dry-run are read-only: neither may create directories.
    if args.verify:
        return verify(st)
    if not args.dry_run:
        RAW.mkdir(parents=True, exist_ok=True)
        sweep_part_files()
        # Write the manifest immediately, before fetching anything. From here
        # on the file always exists, so "no manifest" can only ever mean
        # "looking in the wrong directory" — never "the run lost its record".
        # It costs one write and removes an entire class of ambiguity.
        st.write_manifest()

    env = read_dotenv(ROOT / ".env")
    ua = env.get("EDGAR_USER_AGENT") or os.environ.get("EDGAR_USER_AGENT", "")
    if not ua.strip():
        log("!! EDGAR_USER_AGENT is not set in .env.\n"
            "   SEC requires an identifying contact, e.g. 'Jane Doe jane@example.com'.\n"
            "   Refusing to fetch anonymously.")
        return 2

    sources = args.only or ["edgar", "cuad", "rfc"]
    tickers = TICKERS
    if args.tickers:
        tickers = [l.strip().upper() for l in args.tickers.read_text().splitlines()
                   if l.strip() and not l.startswith("#")]

    global TRUST_CACHE
    TRUST_CACHE = args.trust_cache

    bucket = TokenBucket(args.rps)
    f = Fetcher(bucket, ua)

    log("Zeroth corpus acquisition — brief §4.1")
    log(f"  user-agent   {ua}")
    log(f"  rate ceiling {args.rps} req/s, single bucket shared across all sources")
    log(f"  raw cache    {RAW}")
    log(f"  manifest     {MANIFEST}")
    log(f"  sources      {', '.join(sources)}")
    if st.documents:
        log(f"  resuming     {len(st.documents)} documents already fetched")
    if st.failures:
        log(f"  {len(st.failures)} previous failures will be retried")
        st.failures.clear()

    started = time.time()
    interrupted = False
    try:
        if "edgar" in sources:
            fetch_edgar(f, st, tickers, args.per_company, args.dry_run)
        if "cuad" in sources:
            fetch_cuad(f, st, args.dry_run)
        if "rfc" in sources:
            fetch_rfc(f, st, args.dry_run)
    except KeyboardInterrupt:
        interrupted = True
        log("\n\n!! interrupted — state saved; re-run to resume where this stopped")

    if not args.dry_run:
        st.save()
        st.write_manifest()

    elapsed = time.time() - started
    by_source: dict[str, int] = {}
    total_bytes = 0
    for d in st.documents.values():
        by_source[d["source"]] = by_source.get(d["source"], 0) + 1
        total_bytes += d.get("bytes", 0)

    log("\n" + "=" * 62)
    log(f"  documents   {len(st.documents)}")
    for s in sorted(by_source):
        log(f"    {s:<8}  {by_source[s]}")
    log(f"  raw bytes   {total_bytes:,}")
    log(f"  requests    {bucket.requests}   (rate-limit sleep {bucket.waited:.1f}s)")
    log(f"  elapsed     {elapsed:.1f}s")
    log(f"  manifest    {MANIFEST}")
    log("=" * 62)

    if st.failures:
        by_src: dict[str, list] = {}
        for info in st.failures.values():
            by_src.setdefault(info.get("source", "?"), []).append(info)
        log(f"\n  {len(st.failures)} DOCUMENT(S) FAILED — the run continued past each")
        for src in sorted(by_src):
            log(f"\n  {src}  ({len(by_src[src])})")
            for info in sorted(by_src[src], key=lambda x: str(x.get("doc_id"))):
                log(f"    {info.get('doc_id')}")
                log(f"      {info.get('error')}")
                log(f"      {info.get('url')}")
        log("\n  These are recorded in the manifest under \"failures\".")
        log("  Re-run the same command to retry only these; everything else "
            "is skipped.")
    else:
        log("\n  No failures.")
    log("\n'pages', 'normalised_checksum' and 'dedup' are null until the parsing "
        "stage — they need extracted text, not raw bytes.")

    return 130 if interrupted else (1 if st.failures else 0)


if __name__ == "__main__":
    sys.exit(main())
