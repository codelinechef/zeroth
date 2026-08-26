"""
vLLM provider — the primary generator, OpenAI-compatible surface.

Two findings from the §14 investigation shape this:

  * The structured-output backend is process-wide, not per-request, and `auto`
    silently cascades xgrammar -> guidance -> outlines. Two runs could use
    different decoders with no signal in the output, so the backend is pinned
    explicitly at server start and recorded per run.
  * Thinking tokens are charged against the output budget, so a model that
    reasons before answering can exhaust it mid-JSON and return something that
    parses up to the cut. finish_reason is checked rather than trusted.
"""
from __future__ import annotations

import json
import time
import urllib.request
from typing import Any

from providers.base import Generation

DEFAULT_HOST = "http://localhost:8001"


class VLLMProvider:
    name = "vllm"

    def __init__(self, model: str | None = None, host: str = DEFAULT_HOST,
                 timeout: int = 180, structured_backend: str = "xgrammar"):
        self.host = host.rstrip("/")
        self.timeout = timeout
        self.structured_backend = structured_backend
        self._model = model

    @property
    def model(self) -> str:
        if self._model is None:
            req = urllib.request.Request(self.host + "/v1/models")
            with urllib.request.urlopen(req, timeout=10) as r:
                self._model = json.loads(r.read())["data"][0]["id"]
        return self._model

    @property
    def model_ref(self) -> str:
        return f"{self.model}@{self.structured_backend}"

    def generate_json(self, prompt: str, schema: dict[str, Any], *,
                      temperature: float = 0.0,
                      max_tokens: int = 1024) -> Generation:
        t0 = time.time()
        body = {
            "model": self.model,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": temperature,
            "max_tokens": max_tokens,
            "response_format": {"type": "json_schema",
                                "json_schema": {"name": "answer", "schema": schema}},
        }
        req = urllib.request.Request(
            self.host + "/v1/chat/completions", data=json.dumps(body).encode(),
            headers={"Content-Type": "application/json"}, method="POST")
        with urllib.request.urlopen(req, timeout=self.timeout) as r:
            data = json.loads(r.read())
        choice = data["choices"][0]
        if choice.get("finish_reason") == "length":
            raise RuntimeError(
                f"generation hit max_tokens ({max_tokens}); the JSON is "
                f"truncated and must not be parsed")
        usage = data.get("usage", {})
        return Generation(
            text=choice["message"]["content"], model=self.model,
            model_ref=self.model_ref,
            prompt_tokens=usage.get("prompt_tokens", 0),
            output_tokens=usage.get("completion_tokens", 0),
            finish_reason=choice.get("finish_reason", ""),
            elapsed_ms=round((time.time() - t0) * 1000, 1))

    def health(self) -> dict[str, Any]:
        try:
            return {"ok": True, "model": self.model,
                    "structured_backend": self.structured_backend}
        except Exception as e:
            return {"ok": False, "error": str(e)}
