"""
Bootstrapped confidence intervals — brief §8.

Every quality metric carries a 95% interval over 1,000 resamples of the query
set. A point estimate from a few hundred queries without an interval is the
first thing a reviewer attacks, and with twelve queries in the current golden
set the interval is the honest part of the answer.

Resampling is over QUERIES, not over per-query scores pooled together. The
query set is the sample; the scores are deterministic given it. Resampling the
scores would measure the wrong population and produce intervals that are too
narrow.

The seed is fixed and recorded, so two runs of the same data produce the same
interval. An interval that moves between runs of identical inputs is not a
measurement.
"""
from __future__ import annotations

import random
from dataclasses import dataclass

RESAMPLES = 1000
LEVEL = 0.95
SEED = 20260826


@dataclass
class Interval:
    value: float
    low: float
    high: float
    resamples: int
    level: float
    n: int

    def as_dict(self) -> dict:
        return {
            "value": round(self.value, 6),
            "ci95": [round(self.low, 6), round(self.high, 6)],
            "n": self.n,
            "resamples": self.resamples,
            "level": self.level,
        }


def mean(xs: list[float]) -> float:
    return sum(xs) / len(xs) if xs else 0.0


def bootstrap(scores: list[float], resamples: int = RESAMPLES,
              level: float = LEVEL, seed: int = SEED) -> Interval | None:
    """Percentile bootstrap over per-query scores.

    Returns None for an empty sample rather than a zero with a [0, 0] interval,
    which would read as a measured result rather than an absent one.
    """
    scores = [s for s in scores if s is not None]
    n = len(scores)
    if n == 0:
        return None
    point = mean(scores)
    if n == 1:
        # One query cannot produce an interval. Report the point with an
        # interval spanning itself and let n=1 speak for how much that is worth.
        return Interval(point, point, point, 0, level, 1)

    rng = random.Random(seed)
    means = []
    for _ in range(resamples):
        sample = [scores[rng.randrange(n)] for _ in range(n)]
        means.append(sum(sample) / n)
    means.sort()
    alpha = (1.0 - level) / 2.0
    lo = means[int(alpha * resamples)]
    hi = means[min(resamples - 1, int((1.0 - alpha) * resamples))]
    return Interval(point, lo, hi, resamples, level, n)
