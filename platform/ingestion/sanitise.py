"""
Ingestion-time sanitisation against injected instructions.

A retrieved chunk is placed into a prompt. Anything inside it that reads as an
instruction can be followed by the generator, so a document is an untrusted
input even when the corpus is public — an attacker who can get one document
into the corpus can otherwise steer every answer that retrieves it.

Two rules shape this:

  1. Be conservative. This corpus is contracts, filings and RFCs. "The system
     shall ignore malformed records" is ordinary standards prose, not an
     injection. Over-matching would quietly rewrite the corpus, and a corpus
     that has been quietly rewritten is not the corpus the manifest describes.

  2. Never remove silently. Every removal is counted and the neutralised span
     is replaced with a marker, so a reader of the chunk can see that something
     was taken out and the count is recorded on the document row.
"""
from __future__ import annotations

import re
from dataclasses import dataclass

MARKER = "[instruction removed during ingestion]"

# Each pattern must be specific enough that ordinary legal or standards prose
# does not match. Anchored on the imperative-to-the-reader forms that only
# appear in prompt injection.
PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("override", re.compile(
        r"(?i)\b(?:ignore|disregard|forget|override)\b[^.\n]{0,40}?"
        r"\b(?:previous|prior|earlier|above|all)\b[^.\n]{0,20}?"
        r"\b(?:instruction|instructions|prompt|prompts|context|rules?)\b[^.\n]{0,80}")),
    ("role-reassign", re.compile(
        r"(?i)\byou\s+are\s+(?:now\s+)?(?:an?\s+)?"
        r"(?:AI|assistant|language\s+model|chatbot|helpful\b)[^.\n]{0,80}")),
    # A bare "System:" at line start is a field label in contracts and spec
    # sheets, not a chat turn — it fired on a real contract's component table.
    # A role marker is only an injection when it introduces an instruction, so
    # require one to follow.
    ("chat-role-marker", re.compile(
        r"(?im)^\s*(?:system|assistant|user)\s*:\s*"
        r"(?=[^\n]{0,80}?\b(?:ignore|disregard|forget|override|you\s+are|"
        r"you\s+have|instead|always|must\s+now|from\s+now\s+on|"
        r"your\s+(?:task|job|role|orders)|new\s+(?:instructions?|orders|rules))\b)")),
    ("tag-injection", re.compile(
        r"(?i)</?(?:system|assistant|user|instructions?|prompt)>")),
    ("exfiltration", re.compile(
        r"(?i)\b(?:reveal|print|output|repeat|disclose)\b[^.\n]{0,30}?"
        r"\b(?:system\s+prompt|your\s+instructions|the\s+prompt)\b[^.\n]{0,60}")),
    # Narrow deliberately. "The Company will always answer inquiries from the
    # Commission" is ordinary filing prose and matched an earlier, looser
    # version of this rule. An override names what to say: a quoted string, a
    # shouted literal, or "with ...".
    ("answer-override", re.compile(
        r"(?i)\b(?:always|instead)\s+(?:answer|respond|reply|say)\s+"
        # An override names WHAT to say. A noun phrase does not: RFC 7231 and
        # 9110 both contain "MAY instead respond with a status code of 404",
        # which an earlier version of this rule removed from the corpus.
        r"(?:with\s+(?:the\s+following|the\s+text|exactly)\b"
        r"|(?:with\s+)?[\"\'][^\"\'\n]{1,60}[\"\']"
        r"|(?:with\s+)?(?-i:[A-Z]{2,})\b)")),
]


@dataclass
class Sanitised:
    text: str
    spans: int
    by_rule: dict[str, int]

    @property
    def changed(self) -> bool:
        return self.spans > 0


def sanitise(text: str) -> Sanitised:
    by_rule: dict[str, int] = {}
    out = text
    for name, pat in PATTERNS:
        out, n = pat.subn(MARKER, out)
        if n:
            by_rule[name] = by_rule.get(name, 0) + n
    return Sanitised(out, sum(by_rule.values()), by_rule)
