"""
Durability of data/corpus/corpus_manifest.json under a hard kill.

`_cached` refuses to trust any file without a manifest entry, so the manifest
is the only thing standing between a crash and re-downloading the whole corpus.
On EDGAR that is a two-hour difference. These tests assert the guarantee
rather than restating it:

  * the manifest is written after EVERY document, in every source
  * a SIGKILL mid-run leaves a VALID manifest recording exactly the documents
    that completed
  * no .tmp orphan is left where the manifest should be

SIGKILL is used deliberately: it cannot be caught, so no cleanup handler,
atexit hook or `finally` block can rescue the file. If the manifest is intact
after that, it was genuinely on disk before the process died.

    python3 tests/test_manifest_durability.py
"""

from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import textwrap
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

CHILD = textwrap.dedent('''
    import importlib.util, os, signal, sys
    from pathlib import Path
    root, killat, source = Path(sys.argv[1]), int(sys.argv[2]), sys.argv[3]
    spec = importlib.util.spec_from_file_location("fm", sys.argv[4])
    m = importlib.util.module_from_spec(spec); sys.modules["fm"] = m
    spec.loader.exec_module(m)
    m.ROOT = root; m.DATA = root/"data"/"corpus"; m.RAW = m.DATA/"raw"
    m.MANIFEST = m.DATA/"corpus_manifest.json"
    m.STATE = m.DATA/".fetch_state.json"
    (m.RAW/"rfc").mkdir(parents=True); (m.RAW/"cuad").mkdir(parents=True)

    n = {"i": 0}
    real = m.write_document
    def counting(dest, body):
        n["i"] += 1
        if n["i"] == killat:
            sys.stdout.flush(); os.kill(os.getpid(), signal.SIGKILL)
        return real(dest, body)
    m.write_document = counting

    class Fake:
        def __init__(self): self.bucket = m.TokenBucket(1e6)
        def get(self, url, accept="*/*", min_bytes=0): return b"z"*30000

    if source == "rfc":
        m.RFCS = [(7000+i, "tls") for i in range(10)]
        m.fetch_rfc(Fake(), m.State(), dry_run=False)
    else:
        import zipfile
        zp = root/"cuad.zip"
        with zipfile.ZipFile(zp, "w") as z:
            for i in range(10):
                z.writestr(f"CUAD_v1/full_contract_txt/CO{i}_1999-EX-10.1-AGREEMENT.txt",
                           "x"*4000)
        (m.RAW/"cuad").mkdir(parents=True, exist_ok=True)
        (m.RAW/"cuad"/"_cuad_archive.zip").write_bytes(zp.read_bytes())
        m.fetch_cuad(Fake(), m.State(), dry_run=False)
''')


def _run(source: str, killat: int):
    tmp = Path(tempfile.mkdtemp())
    child = tmp / "child.py"
    child.write_text(CHILD)
    proc = subprocess.run(
        [sys.executable, str(child), str(tmp), str(killat), source,
         str(ROOT / "harness" / "corpus" / "fetch.py")],
        capture_output=True, text=True, cwd=ROOT)
    return tmp, proc


def _manifest(tmp: Path):
    mf = tmp / "data" / "corpus" / "corpus_manifest.json"
    assert mf.exists(), "manifest missing after the kill — a crash would cost a full re-download"
    try:
        return json.loads(mf.read_text())
    except json.JSONDecodeError as e:
        raise AssertionError(f"manifest on disk is not valid JSON: {e}")


def test_sigkill_midrun_leaves_a_valid_rfc_manifest():
    tmp, proc = _run("rfc", killat=5)
    assert proc.returncode == -9, f"child was not SIGKILLed (rc={proc.returncode})"
    man = _manifest(tmp)
    ids = [d["doc_id"] for d in man["documents"]]
    assert ids == [f"rfc-{7000+i}" for i in range(4)], ids
    assert man["counts"]["documents"] == 4


def test_manifest_matches_the_files_actually_on_disk():
    """A manifest that claims more than exists would send resume past a
    document that was never written."""
    tmp, _ = _run("rfc", killat=6)
    man = _manifest(tmp)
    on_disk = {p.name for p in (tmp/"data"/"corpus"/"raw"/"rfc").iterdir()
               if p.suffix == ".txt"}
    claimed = {Path(d["raw_path"]).name for d in man["documents"]}
    assert claimed == on_disk, f"manifest {claimed} != disk {on_disk}"


def test_no_tmp_orphan_where_the_manifest_belongs():
    tmp, _ = _run("rfc", killat=4)
    leftovers = list((tmp/"data"/"corpus").glob("*.tmp"))
    assert leftovers == [], f"atomic write left an orphan: {leftovers}"


def test_state_file_also_survives_and_agrees():
    tmp, _ = _run("rfc", killat=5)
    st = json.loads((tmp/"data"/"corpus"/".fetch_state.json").read_text())
    man = _manifest(tmp)
    assert set(st["documents"]) == {d["doc_id"] for d in man["documents"]}


def test_cuad_persists_per_document_not_once_at_the_end():
    """CUAD registered every contract but saved only after the whole loop, so a
    crash partway through lost all of them."""
    tmp, proc = _run("cuad", killat=5)
    assert proc.returncode == -9, f"child was not SIGKILLed (rc={proc.returncode})"
    man = _manifest(tmp)
    assert man["counts"]["documents"] == 4, (
        f"expected 4 CUAD documents persisted, got {man['counts']['documents']} "
        f"— the manifest is not being written per document")


def _run_standalone() -> int:
    tests = [(n, o) for n, o in sorted(globals().items())
             if n.startswith("test_") and callable(o)]
    failed = 0
    for name, fn in tests:
        try:
            fn(); print(f"  PASS  {name}")
        except Exception as e:
            failed += 1; print(f"  FAIL  {name}: {type(e).__name__}: {e}")
    print(f"\n{len(tests)-failed}/{len(tests)} passed")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(_run_standalone())
