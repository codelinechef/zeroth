"""
Regression tests for harness/corpus/fetch.py.

These cover failure modes that are invisible until they are expensive:

  * a rate limiter that bursts past the ceiling — invisible until SEC blocks
    the IP, which costs a day
  * a truncated document that looks complete on disk — invisible until the
    parser fails, much later, for no obvious reason
  * an HTTP 200 carrying an error page, cached and recorded in the manifest
    as though it were a 10-K

No network. Runs under pytest, or standalone before pytest is installed:

    python3 tests/test_corpus_fetch.py
    pytest tests/test_corpus_fetch.py
"""

from __future__ import annotations

import http.client
import importlib.util
import io
import sys
import tempfile
import time
import urllib.error
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def _load():
    spec = importlib.util.spec_from_file_location(
        "fetchmod", ROOT / "harness" / "corpus" / "fetch.py")
    m = importlib.util.module_from_spec(spec)
    sys.modules["fetchmod"] = m          # @dataclass needs the module registered
    spec.loader.exec_module(m)
    return m


m = _load()


# ---------------------------------------------------------------- fake HTTP

class FakeResponse:
    def __init__(self, body: bytes, status=200, headers=None, short_by=0):
        self._body = body
        self.status = status
        self.headers = headers if headers is not None else {
            "Content-Length": str(len(body))
        }
        self._short_by = short_by

    def read(self):
        if self._short_by:
            return self._body[: len(self._body) - self._short_by]
        return self._body

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


def install(responses):
    """Serve `responses` in order; each may be a FakeResponse or an Exception."""
    calls = {"n": 0}

    def fake_urlopen(req, timeout=None, context=None):
        i = min(calls["n"], len(responses) - 1)
        calls["n"] += 1
        r = responses[i]
        if isinstance(r, Exception):
            raise r
        return r

    m.urllib.request.urlopen = fake_urlopen
    return calls


def fetcher(rps=10_000.0):
    return m.Fetcher(m.TokenBucket(rps), "Test Runner test@example.com", max_attempts=3)


def tmpdir() -> Path:
    return Path(tempfile.mkdtemp())


# ------------------------------------------------------------ rate limiting

def test_rate_limiter_has_no_opening_burst():
    """A bucket that starts full fires `rps` requests instantly and only then
    settles to the sustained rate, putting ~2x the ceiling into the opening
    second. SEC measures per second, so that is the request that gets blocked."""
    rps = 20.0
    b = m.TokenBucket(rps)
    stamps = []
    for _ in range(int(rps * 2)):
        b.take()
        stamps.append(time.monotonic())

    worst = max(sum(1 for t in stamps if s <= t < s + 1.0) for s in stamps)
    assert worst <= rps, f"burst of {worst} requests in one second, ceiling is {rps}"


def test_rate_limiter_sustains_the_ceiling():
    b = m.TokenBucket(50.0)
    t0 = time.monotonic()
    for _ in range(50):
        b.take()
    rate = 50 / (time.monotonic() - t0)
    assert rate <= 55.0, f"effective rate {rate:.1f}/s exceeds ceiling"


def test_pause_drains_the_bucket():
    """After a Retry-After pause nothing may slip out immediately."""
    b = m.TokenBucket(10.0)
    b.pause(0.01)
    assert b.tokens == 0.0


def test_retry_after_is_honoured_over_backoff():
    assert m.Fetcher._retry_delay("7", attempt=1) == 7.0
    assert m.Fetcher._retry_delay(None, attempt=3) == 8.0
    assert m.Fetcher._retry_delay("not-a-number", attempt=2) == 4.0
    assert m.Fetcher._retry_delay("99999", attempt=1) == 300.0   # clamped


# --------------------------------------------------------------- truncation

def test_truncated_body_is_rejected_and_retried():
    """A dropped connection yields a short body that is otherwise
    indistinguishable from a complete one. Content-Length is the only signal."""
    good = b"x" * 5000
    calls = install([
        FakeResponse(good, short_by=2000),   # truncated
        FakeResponse(good),                  # complete on retry
    ])
    f = fetcher()
    f.bucket.pause = lambda s: None          # do not sleep in tests
    body = f.get("https://example.test/doc")
    assert body == good
    assert calls["n"] == 2, "truncated response should have been retried"


def test_incomplete_read_is_retried_not_raised():
    """http.client.IncompleteRead is an HTTPException, NOT an OSError. If the
    retry loop does not name it explicitly it escapes and kills the run."""
    assert not issubclass(http.client.IncompleteRead, (OSError, TimeoutError))
    good = b"y" * 3000
    calls = install([http.client.IncompleteRead(b"partial"), FakeResponse(good)])
    f = fetcher()
    f.bucket.pause = lambda s: None
    assert f.get("https://example.test/doc") == good
    assert calls["n"] == 2


def test_implausibly_small_document_is_rejected():
    tiny = b"<html>nope</html>"
    install([FakeResponse(tiny)] * 3)
    f = fetcher()
    f.bucket.pause = lambda s: None
    try:
        f.get("https://example.test/doc", min_bytes=10_000)
    except RuntimeError as e:
        assert "implausibly small" in str(e) or "giving up" in str(e)
    else:
        raise AssertionError("a 17-byte 10-K should not be accepted")


# ------------------------------------------------------------- error bodies

def test_http_200_error_page_is_rejected():
    """A block notice arrives with a body and a 200. Cached, it becomes an
    'Access Denied' file recorded in the manifest as a 10-K."""
    page = (b"<html><head><title>SEC.gov | Request Rate Threshold Exceeded"
            b"</title></head><body>Your Request Originates from an Undeclared "
            b"Automated Tool</body></html>")
    install([FakeResponse(page)] * 3)
    f = fetcher()
    f.bucket.pause = lambda s: None
    try:
        f.get("https://example.test/doc")
    except RuntimeError:
        pass
    else:
        raise AssertionError("error page was accepted as a document")


def test_large_real_document_is_not_sniffed():
    """The sniff must not scan a 1 MB filing, and must not false-positive on a
    filing that legitimately contains the words it looks for."""
    body = b"<html>" + b"Access Denied is discussed in this filing. " * 5000
    install([FakeResponse(body)])
    f = fetcher()
    assert f.get("https://example.test/doc") == body


def test_non_200_status_after_redirect_is_rejected():
    install([FakeResponse(b"z" * 2000, status=204)] * 3)
    f = fetcher()
    f.bucket.pause = lambda s: None
    try:
        f.get("https://example.test/doc")
    except RuntimeError:
        pass
    else:
        raise AssertionError("non-200 status was accepted")


def test_403_is_not_written_to_disk():
    err = urllib.error.HTTPError(
        "https://example.test/doc", 403, "Forbidden", {},
        io.BytesIO(b"<html>Access Denied</html>"))
    install([err])
    f = fetcher()
    d = tmpdir() / "doc.htm"
    try:
        m._cached(f, "https://example.test/doc", d, min_bytes=1000)
    except (RuntimeError, m.BadResponse):
        pass
    assert not d.exists(), "a 403 body was written to the cache"


# ------------------------------------------------------------------- resume

def test_resume_evicts_a_truncated_cached_file():
    """The failure this guards: a short file that looks complete is skipped
    forever, and only surfaces as an inexplicable parser failure later."""
    tmp = tmpdir()
    m.ROOT = tmp
    raw = tmp / "data" / "corpus" / "raw"
    raw.mkdir(parents=True)
    doc = raw / "edgar-x.htm"
    doc.write_bytes(b"a" * 500)                      # truncated on disk

    st = m.State()
    st.documents["edgar-x"] = {
        "raw_path": str(doc.relative_to(tmp)),
        "bytes": 20_000,                             # manifest says it is bigger
    }
    assert m._resume_ok(st, "edgar-x") is False, "truncated file was trusted"
    assert "edgar-x" not in st.documents, "bad entry was not evicted"
    assert not doc.exists(), "truncated file was left in place"


def test_resume_accepts_an_intact_file():
    tmp = tmpdir()
    m.ROOT = tmp
    raw = tmp / "data" / "corpus" / "raw"
    raw.mkdir(parents=True)
    doc = raw / "rfc9999.txt"
    doc.write_bytes(b"b" * 4096)

    st = m.State()
    st.documents["rfc-9999"] = {
        "raw_path": str(doc.relative_to(tmp)), "bytes": 4096}
    assert m._resume_ok(st, "rfc-9999") is True
    assert "rfc-9999" in st.documents


def test_resume_refetches_a_vanished_file():
    tmp = tmpdir()
    m.ROOT = tmp
    st = m.State()
    st.documents["rfc-1"] = {"raw_path": "data/corpus/raw/gone.txt", "bytes": 10}
    assert m._resume_ok(st, "rfc-1") is False
    assert "rfc-1" not in st.documents


def test_cached_file_below_floor_is_refetched():
    tmp = tmpdir()
    dest = tmp / "doc.htm"
    dest.write_bytes(b"short")
    good = b"q" * 20_000
    calls = install([FakeResponse(good)])
    f = fetcher()
    assert m._cached(f, "https://example.test/doc", dest, min_bytes=10_000) == good
    assert calls["n"] == 1, "sub-floor cached file should have been refetched"
    assert dest.read_bytes() == good


def test_unverifiable_cached_file_is_refetched_by_default():
    """The gap this closes: a 5 KB fragment of a 60 KB RFC clears the size
    floor. With no manifest entry there is nothing to compare it against, so
    trusting it means skipping a truncated document forever."""
    tmp = tmpdir()
    dest = tmp / "rfc7525.txt"
    dest.write_bytes(b"x" * 5_000)          # plausible, but truncated
    good = b"y" * 60_283
    calls = install([FakeResponse(good)])
    m.TRUST_CACHE = False
    assert m._cached(fetcher(), "https://example.test/rfc7525.txt", dest,
                     min_bytes=m.MIN_PLAUSIBLE["rfc"]) == good
    assert calls["n"] == 1, "unverifiable cached file was trusted"
    assert dest.stat().st_size == 60_283


def test_trust_cache_opts_out_of_refetching():
    tmp = tmpdir()
    dest = tmp / "rfc7525.txt"
    dest.write_bytes(b"x" * 5_000)
    calls = install([FakeResponse(b"y" * 60_283)])
    m.TRUST_CACHE = True
    try:
        body = m._cached(fetcher(), "https://example.test/rfc7525.txt", dest,
                         min_bytes=m.MIN_PLAUSIBLE["rfc"])
        assert len(body) == 5_000 and calls["n"] == 0
    finally:
        m.TRUST_CACHE = False


def test_one_document_failure_does_not_abort_the_run():
    """The reported crash: an OSError during the write escaped the
    per-document handler and killed the run at document 25 of 30."""
    tmp = tmpdir()
    m.ROOT = tmp
    m.RAW = tmp / "raw"
    (m.RAW / "rfc").mkdir(parents=True)
    m.RFCS = [(7230, "httpbis"), (7525, "tls"), (7627, "tls")]

    real_write = m.write_document
    def exploding_write(dest, body):
        if "7525" in dest.name:
            raise FileNotFoundError(2, "No such file or directory", str(dest))
        return real_write(dest, body)
    m.write_document = exploding_write
    install([FakeResponse(b"z" * 30_000)] * 9)

    st = m.State()
    try:
        m.fetch_rfc(fetcher(), st, dry_run=False)
    except FileNotFoundError:
        raise AssertionError("a single document failure aborted the whole run")
    finally:
        m.write_document = real_write

    assert "rfc-7230" in st.documents and "rfc-7627" in st.documents, \
        "documents after the failure were not fetched"
    assert "rfc-7525" in st.failures, "the failure was not recorded"
    rec = st.failures["rfc-7525"]
    assert rec["source"] == "rfc" and "FileNotFoundError" in rec["error"]
    assert rec["url"].endswith("rfc7525.txt")


def test_failures_appear_in_the_manifest():
    tmp = tmpdir()
    m.ROOT = tmp
    m.DATA = tmp / "data" / "corpus"
    m.MANIFEST = m.DATA / "corpus_manifest.json"
    m.STATE = m.DATA / ".fetch_state.json"
    st = m.State()
    m.record_failure(st, "edgar-x", "edgar", "https://example.test/x", RuntimeError("nope"))
    st.write_manifest()
    import json
    man = json.loads(m.MANIFEST.read_text())
    assert man["counts"]["failures"] == 1
    assert man["failures"][0]["doc_id"] == "edgar-x"
    assert "nope" in man["failures"][0]["error"]


def test_keyboard_interrupt_still_aborts():
    """Isolation must not swallow a deliberate Ctrl-C."""
    tmp = tmpdir()
    m.ROOT = tmp
    m.RAW = tmp / "raw"
    (m.RAW / "rfc").mkdir(parents=True)
    m.RFCS = [(7230, "httpbis")]
    real = m.write_document
    m.write_document = lambda d, b: (_ for _ in ()).throw(KeyboardInterrupt())
    install([FakeResponse(b"z" * 30_000)])
    try:
        m.fetch_rfc(fetcher(), m.State(), dry_run=False)
    except KeyboardInterrupt:
        pass
    else:
        raise AssertionError("KeyboardInterrupt was swallowed")
    finally:
        m.write_document = real


def test_stale_part_files_are_swept():
    tmp = tmpdir()
    m.RAW = tmp / "raw"
    (m.RAW / "rfc").mkdir(parents=True)
    (m.RAW / "rfc" / "rfc7525.txt.part").write_bytes(b"partial")
    (m.RAW / "rfc" / "rfc7230.txt").write_bytes(b"real")
    assert m.sweep_part_files() == 1
    assert not (m.RAW / "rfc" / "rfc7525.txt.part").exists()
    assert (m.RAW / "rfc" / "rfc7230.txt").exists(), "swept a real document"


def test_write_document_recreates_a_missing_parent():
    tmp = tmpdir()
    dest = tmp / "gone" / "doc.txt"
    m.write_document(dest, b"a" * 100)
    assert dest.read_bytes() == b"a" * 100
    assert list(dest.parent.glob("*.part")) == []


def test_write_is_atomic_and_leaves_no_part_file():
    tmp = tmpdir()
    dest = tmp / "doc.htm"
    body = b"r" * 20_000
    install([FakeResponse(body)])
    m._cached(fetcher(), "https://example.test/doc", dest, min_bytes=1000)
    assert dest.read_bytes() == body
    assert list(tmp.glob("*.part")) == [], "a .part file was left behind"


# --------------------------------------------------------------------- main

def test_doc_id_collision_is_recorded_not_silent():
    """CUAD filenames routinely exceed the slug length and differ only in a
    trailing digit or _AMENDMENT. A plain dict assignment dropped the second
    silently; 26 real contracts were lost that way."""
    st = m.State()
    a = {"identifier": "AGREEMENT1.txt", "source": "cuad", "url": "u1"}
    b = {"identifier": "AGREEMENT2.txt", "source": "cuad", "url": "u2"}
    assert st.register("cuad-x", a) is True
    assert st.register("cuad-x", b) is False, "collision silently overwrote"
    assert st.documents["cuad-x"]["identifier"] == "AGREEMENT1.txt"
    assert "cuad-x#collision" in st.failures
    assert "collision" in st.failures["cuad-x#collision"]["error"]


def test_register_is_idempotent_for_the_same_document():
    """Re-registering the same document (a resumed run) must not be treated
    as a collision."""
    st = m.State()
    d = {"identifier": "RFC 7525", "source": "rfc", "url": "u"}
    assert st.register("rfc-7525", d) is True
    assert st.register("rfc-7525", dict(d)) is True
    assert st.failures == {}


def test_cuad_doc_ids_are_unique_for_realistic_filenames():
    names = [
        "CUAD_v1/full_contract_txt/BellringBrandsInc_20190920_S-1_EX-10.12_11817081_EX-10.12_Manufacturing Agreement1.txt",
        "CUAD_v1/full_contract_txt/BellringBrandsInc_20190920_S-1_EX-10.12_11817081_EX-10.12_Manufacturing Agreement2.txt",
        "CUAD_v1/full_contract_txt/BellringBrandsInc_20190920_S-1_EX-10.12_11817081_EX-10.12_Manufacturing Agreement3.txt",
        "CUAD_v1/full_contract_txt/FEDERATEDGOVERNMENTINCOMESECURITIESINC_04_28_2020-EX-99.SERV AGREE-SERVICES AGREEMENT.txt",
        "CUAD_v1/full_contract_txt/FEDERATEDGOVERNMENTINCOMESECURITIESINC_04_28_2020-EX-99.SERV AGREE-SERVICES AGREEMENT_AMENDMENT.txt",
    ]
    import hashlib
    from pathlib import Path as P
    ids = {f"cuad-{m.slug(P(P(n).name).stem, 40)}"
           f"-{hashlib.sha1(n.encode()).hexdigest()[:8]}" for n in names}
    assert len(ids) == len(names), f"only {len(ids)} ids for {len(names)} files"


def _run_standalone() -> int:
    tests = [(n, o) for n, o in sorted(globals().items())
             if n.startswith("test_") and callable(o)]
    failed = 0
    for name, fn in tests:
        try:
            fn()
            print(f"  PASS  {name}")
        except Exception as e:
            failed += 1
            print(f"  FAIL  {name}: {type(e).__name__}: {e}")
    print(f"\n{len(tests) - failed}/{len(tests)} passed")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(_run_standalone())
