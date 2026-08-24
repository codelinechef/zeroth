#!/usr/bin/env python3
"""
Minimal Gemini client with the same resumability discipline as the corpus
fetcher: shared rate limit, Retry-After honoured, backoff on 429/5xx, and one
failed call never aborts a run.

Standard library only, deliberately — same reason as harness/corpus/fetch.py.
"""
from __future__ import annotations

import json
import os
import re
import ssl
import time
import urllib.error
import urllib.request
from pathlib import Path

API = "https://generativelanguage.googleapis.com/v1beta/models"


def read_dotenv(path: Path) -> dict[str, str]:
    env: dict[str, str] = {}
    if not path.exists():
        return env
    for line in path.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip().strip('"').strip("'")
    return env


class RateLimit:
    """Strict pacing, no burst — a bucket that starts full puts ~2x the ceiling
    into the opening minute, which is exactly what a per-minute quota measures.
    (Same bug this project already hit once in the corpus fetcher.)"""

    def __init__(self, rpm: float):
        self.interval = 60.0 / rpm
        self.last = 0.0
        self.waited = 0.0

    def take(self) -> None:
        now = time.monotonic()
        gap = self.interval - (now - self.last)
        if gap > 0:
            self.waited += gap
            time.sleep(gap)
        self.last = time.monotonic()

    def pause(self, seconds: float) -> None:
        self.waited += seconds
        time.sleep(seconds)
        self.last = time.monotonic()


class QuotaExhausted(Exception):
    """Quota or credit is gone for the rest of this run.

    Distinct from a transient 429: retrying inside the same run cannot help, so
    the caller should checkpoint and stop cleanly rather than burn attempts.
    Covers both free-tier daily caps and a depleted prepaid balance — the
    latter arrives as a plain 429 with no quota metric attached, so without
    matching the message every one of 2,300 calls would back off five times
    before failing."""


class Gemini:
    def __init__(self, api_key: str, model: str, rpm: float, max_attempts: int = 5):
        self.key = api_key
        self.model = model
        self.limit = RateLimit(rpm)
        self.max_attempts = max_attempts
        self.ctx = ssl.create_default_context()
        self.calls = 0
        self.tokens_in = 0
        self.tokens_out = 0
        self._version: str | None = None

    @property
    def version(self) -> str:
        """The dated snapshot behind the model name.

        `gemini-flash-lite-latest` reports its version as a floating label;
        `gemini-3.1-flash-lite` reports `3.1-flash-lite-05-2026`. The judge
        sets the published agreement rate, so the snapshot actually used is
        recorded rather than inferred from the name."""
        if self._version is None:
            try:
                req = urllib.request.Request(
                    f"{API}/{self.model}?key={self.key}")
                with urllib.request.urlopen(req, timeout=30, context=self.ctx) as r:
                    self._version = json.loads(r.read()).get("version", "unknown")
            except Exception:
                self._version = "unknown"
        return self._version

    @property
    def ref(self) -> str:
        """Exact reference recorded in outputs: name@snapshot."""
        return f"{self.model}@{self.version}"

    def generate(self, prompt: str, *, temperature: float = 0.2,
                 max_output_tokens: int = 4096, json_mode: bool = True,
                 thinking_level: str | None = "low") -> str:
        # thoughtsTokenCount is charged against maxOutputTokens, so a model
        # that thinks by default can spend the entire budget and return
        # truncated JSON with finishReason=MAX_TOKENS. Pinning the level low
        # removed the truncation and halved latency.
        cfg = {"temperature": temperature, "maxOutputTokens": max_output_tokens}
        if thinking_level:
            cfg["thinkingConfig"] = {"thinkingLevel": thinking_level}
        body = {"contents": [{"parts": [{"text": prompt}]}],
                "generationConfig": cfg}
        if json_mode:
            body["generationConfig"]["responseMimeType"] = "application/json"

        payload = json.dumps(body).encode()
        url = f"{API}/{self.model}:generateContent?key={self.key}"
        last: Exception | None = None

        for attempt in range(1, self.max_attempts + 1):
            self.limit.take()
            req = urllib.request.Request(
                url, data=payload,
                headers={"Content-Type": "application/json"}, method="POST")
            try:
                with urllib.request.urlopen(req, timeout=180, context=self.ctx) as r:
                    data = json.loads(r.read())
                self.calls += 1
                usage = data.get("usageMetadata", {})
                self.tokens_in += usage.get("promptTokenCount", 0)
                self.tokens_out += usage.get("candidatesTokenCount", 0)
                cands = data.get("candidates") or []
                if not cands:
                    raise RuntimeError(f"no candidates: {str(data)[:200]}")
                finish = cands[0].get("finishReason")
                parts = cands[0].get("content", {}).get("parts") or []
                text = "".join(p.get("text", "") for p in parts)
                # Truncated output is not a usable answer. Raising here means
                # it is retried; returning it would let half-written JSON be
                # parsed into a partial record and saved as if it were real.
                if finish == "MAX_TOKENS":
                    raise RuntimeError(
                        f"truncated at maxOutputTokens "
                        f"(thoughts={usage.get('thoughtsTokenCount', 0)}, "
                        f"got {len(text)} chars)")
                if not text.strip():
                    raise RuntimeError(f"empty text (finishReason={finish})")
                return text

            except urllib.error.HTTPError as e:
                raw = e.read().decode("utf-8", "replace")
                last = RuntimeError(f"HTTP {e.code}: {raw[:300]}")
                if e.code == 429:
                    if self._is_daily_quota(raw):
                        raise QuotaExhausted(raw[:300]) from e
                    delay = self._retry_delay(e.headers, raw, attempt)
                    print(f"      429 — backing off {delay:.0f}s "
                          f"(attempt {attempt}/{self.max_attempts})", flush=True)
                    self.limit.pause(delay)
                    continue
                if e.code in (500, 502, 503, 504):
                    delay = min(120.0, 2.0 ** attempt)
                    print(f"      HTTP {e.code} — retrying in {delay:.0f}s",
                          flush=True)
                    self.limit.pause(delay)
                    continue
                raise last                       # 400/403 will not fix themselves

            except (urllib.error.URLError, TimeoutError, OSError,
                    json.JSONDecodeError, RuntimeError) as e:
                last = e
                delay = min(120.0, 2.0 ** attempt)
                print(f"      {type(e).__name__}: {str(e)[:120]} — "
                      f"retrying in {delay:.0f}s", flush=True)
                self.limit.pause(delay)

        raise RuntimeError(f"gave up after {self.max_attempts} attempts: {last}")

    @staticmethod
    def _is_daily_quota(raw: str) -> bool:
        low = raw.lower()
        squashed = low.replace("_", "").replace(" ", "")
        if "perday" in squashed or "daily" in low or "per day" in low:
            return True
        # Prepaid balance exhausted. Billing is enabled, but there is no
        # credit left, so nothing in this run will succeed.
        return ("prepayment credits are depleted" in low
                or "credits are depleted" in low
                or "billing account" in low and "disabled" in low)

    @staticmethod
    def _retry_delay(headers, raw: str, attempt: int) -> float:
        ra = headers.get("Retry-After") if headers else None
        if ra:
            try:
                return min(300.0, float(int(ra)))
            except ValueError:
                pass
        m = re.search(r'"retryDelay"\s*:\s*"(\d+)s"', raw)
        if m:
            return min(300.0, float(m.group(1)))
        return min(120.0, 2.0 ** attempt)


def extract_json(text: str):
    """Models occasionally wrap JSON in prose or a fence even in JSON mode."""
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text, flags=re.S)
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    for opener, closer in (("[", "]"), ("{", "}")):
        i, j = text.find(opener), text.rfind(closer)
        if i != -1 and j > i:
            try:
                return json.loads(text[i:j + 1])
            except json.JSONDecodeError:
                continue
    raise ValueError(f"no JSON in response: {text[:200]}")
