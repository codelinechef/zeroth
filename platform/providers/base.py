"""
Swappable model providers.

The brief requires vLLM as the primary generator with a hosted API behind the
same interface, so a regression in one never blocks the pipeline. Everything
downstream depends only on this protocol.

Constrained decoding is part of the interface rather than an implementation
detail: the JSON contract is enforced at the sampler, not by a retry loop.
What that guarantees is grammar conformance — the output parses and matches the
structure. It does NOT guarantee every semantic assertion in the schema, so
generation is always followed by validation.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Protocol


@dataclass
class Generation:
    text: str
    model: str
    model_ref: str          # name@snapshot, so a run records what actually ran
    prompt_tokens: int = 0
    output_tokens: int = 0
    finish_reason: str = ""
    elapsed_ms: float = 0.0


class Provider(Protocol):
    name: str

    def generate_json(self, prompt: str, schema: dict[str, Any], *,
                      temperature: float = 0.0,
                      max_tokens: int = 1024) -> Generation:
        """Return text guaranteed to match `schema` structurally."""
        ...

    def health(self) -> dict[str, Any]:
        ...
