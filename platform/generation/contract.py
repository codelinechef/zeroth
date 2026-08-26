"""
The answer contract.

Constrained decoding guarantees the output PARSES and matches the grammar. It
does not guarantee every assertion in the schema — numeric bounds, string
lengths and array lengths are not expressible in the grammars these backends
compile. So the schema is kept structural and every semantic assertion lives in
the validation pass below.

This is not the retry loop the brief rules out. Structure is still enforced at
the sampler; this catches what a grammar cannot express.
"""
from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field, field_validator


class Claim(BaseModel):
    text: str = Field(min_length=1)
    chunk_id: str = Field(min_length=1)
    quote: str = Field(min_length=1)


class Answer(BaseModel):
    answer: str
    claims: list[Claim] = Field(default_factory=list)
    abstained: bool = False
    abstain_reason: str | None = None

    @field_validator("answer")
    @classmethod
    def _answer_present(cls, v: str) -> str:
        return v.strip()


# Kept deliberately structural: types, required fields, nesting. Anything a
# grammar cannot enforce is checked by the Pydantic model instead.
ANSWER_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "answer": {"type": "string"},
        "abstained": {"type": "boolean"},
        "abstain_reason": {"type": "string"},
        "claims": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "text": {"type": "string"},
                    "chunk_id": {"type": "string"},
                    "quote": {"type": "string"},
                },
                "required": ["text", "chunk_id", "quote"],
            },
        },
    },
    "required": ["answer", "abstained", "claims"],
}
