"""
Ollama provider — the local fallback the brief keeps behind the same interface
so a vLLM regression never blocks the pipeline.

Ollama accepts a JSON Schema in `format`, which constrains decoding at the
sampler rather than validating afterwards.
"""
from __future__ import annotations

import json
import time
import urllib.error
import urllib.request
from typing import Any

from providers.base import Generation

DEFAULT_HOST = "http://localhost:11435"


class OllamaProvider:
    name = "ollama"

    def __init__(self, model: str = "qwen2.5:3b-instruct-q4_K_M",
                 host: str = DEFAULT_HOST, timeout: int = 180):
        self.model = model
        self.host = host.rstrip("/")
        self.timeout = timeout
        self._digest: str | None = None

    # ------------------------------------------------------------------
    @property
    def model_ref(self) -> str:
        """name@digest. A bare tag is a moving target: re-pulling changes the
        weights without changing the name, and a published number would then
        be attributed to a model that no longer exists."""
        if self._digest is None:
            try:
                r = self._post("/api/show", {"model": self.model}, raw=True)
                self._digest = (r.get("details", {}).get("parameter_size", "")
                                + "-" + str(r.get("digest", ""))[:12]).strip("-")
            except Exception:
                self._digest = "unknown"
        return f"{self.model}@{self._digest}"

    def _post(self, path: str, body: dict, raw: bool = False) -> dict:
        req = urllib.request.Request(
            self.host + path, data=json.dumps(body).encode(),
            headers={"Content-Type": "application/json"}, method="POST")
        with urllib.request.urlopen(req, timeout=self.timeout) as r:
            return json.loads(r.read())

    # ------------------------------------------------------------------
    def generate_json(self, prompt: str, schema: dict[str, Any], *,
                      temperature: float = 0.0,
                      max_tokens: int = 1024) -> Generation:
        t0 = time.time()
        data = self._post("/api/generate", {
            "model": self.model,
            "prompt": prompt,
            "stream": False,
            # The schema goes to the sampler. This is the constrained-decoding
            # path, not a post-hoc validation.
            "format": schema,
            "options": {"temperature": temperature, "num_predict": max_tokens},
        })
        text = data.get("response", "")
        done_reason = data.get("done_reason", "")
        # A truncated response still parses up to the cut and would otherwise
        # be saved as a real record.
        if done_reason == "length":
            raise RuntimeError(
                f"generation hit the token limit ({max_tokens}); the JSON is "
                f"truncated and must not be parsed")
        return Generation(
            text=text, model=self.model, model_ref=self.model_ref,
            prompt_tokens=data.get("prompt_eval_count", 0),
            output_tokens=data.get("eval_count", 0),
            finish_reason=done_reason,
            elapsed_ms=round((time.time() - t0) * 1000, 1))

    def health(self) -> dict[str, Any]:
        try:
            req = urllib.request.Request(self.host + "/api/tags")
            with urllib.request.urlopen(req, timeout=5) as r:
                models = [m["name"] for m in json.loads(r.read()).get("models", [])]
            return {"ok": self.model in models, "models": models,
                    "model_ref": self.model_ref}
        except Exception as e:
            return {"ok": False, "error": str(e)}
