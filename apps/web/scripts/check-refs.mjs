#!/usr/bin/env node
/**
 * Validate every cross-reference in the content layer.
 *
 * Metrics, failure modes and learn topics all point at each other by id. Those
 * ids are written by hand in JSON, nothing checks them, and a typo produces a
 * silent dead end rather than an error — the concept index simply omits the
 * link and no one notices.
 *
 * This found `latency_p95_s.related = ["cost_per_query"]` pointing at a metric
 * whose id is `cost_per_query_usd`.
 *
 * Runs as part of `npm run build`, before next build, so a bad reference fails
 * the build instead of shipping.
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = join("..", "..");
const DIRS = {
  metric: join(ROOT, "content", "metrics"),
  failure: join(ROOT, "content", "failure-modes"),
  topic: join(ROOT, "content", "learn"),
};

function load(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => ({ file: f, data: JSON.parse(readFileSync(join(dir, f), "utf8")) }));
}

const metrics = load(DIRS.metric);
const failures = load(DIRS.failure);
const topics = load(DIRS.topic);

const ids = {
  metric: new Set(metrics.map((m) => m.data.id)),
  failure: new Set(failures.map((f) => f.data.id)),
  topic: new Set(topics.map((t) => t.data.id)),
};

/** [collection, file, field, values, the id space those values must live in] */
const CHECKS = [
  ...metrics.flatMap((m) => [
    ["metrics", m.file, "failure_modes", m.data.failure_modes ?? [], "failure"],
    ["metrics", m.file, "related", m.data.related ?? [], "metric"],
  ]),
  ...failures.flatMap((f) => [
    ["failure-modes", f.file, "metrics", f.data.metrics ?? [], "metric"],
  ]),
  ...topics.flatMap((t) => [
    ["learn", t.file, "related", t.data.related ?? [], "topic"],
    ["learn", t.file, "interacts_with", t.data.interacts_with ?? [], "topic"],
  ]),
];

const broken = [];
for (const [collection, file, field, values, space] of CHECKS) {
  for (const v of values) {
    if (!ids[space].has(v)) {
      broken.push({ collection, file, field, value: v, space });
    }
  }
}

if (broken.length) {
  console.error(`check-refs: ${broken.length} dangling reference(s):\n`);
  for (const b of broken) {
    console.error(
      `  content/${b.collection}/${b.file}\n` +
      `    ${b.field}: "${b.value}" is not a known ${b.space} id`
    );
  }
  console.error(
    `\nA dangling reference renders as a missing link rather than an error, ` +
    `which is why this check exists.`
  );
  process.exit(1);
}

console.log(
  `check-refs: ${CHECKS.reduce((n, c) => n + c[3].length, 0)} reference(s) across ` +
  `${metrics.length} metrics, ${failures.length} failure modes and ` +
  `${topics.length} topics all resolve`
);
