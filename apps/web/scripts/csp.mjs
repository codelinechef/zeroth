#!/usr/bin/env node
/**
 * Emit a per-route Content-Security-Policy into out/_headers, pinning the
 * SHA-256 hash of every inline <script> on that route.
 *
 * Next's static export embeds the RSC payload in inline <script> tags with no
 * src. Under `script-src 'self'` Cloudflare blocks them and hydration dies —
 * and neither `next dev` nor a local static server applies _headers, so this
 * fails ONLY in production. Hashes keep the policy strict without resorting to
 * 'unsafe-inline'.
 *
 * Why per-route and not one rule on /*:
 *
 *   1. Length. The union of every route's hashes is ~4000 characters and
 *      Cloudflare ignores any _headers line over 2000, silently dropping the
 *      whole CSP. Split per route the longest is ~1400.
 *   2. Combining. Cloudflare applies *every* matching rule rather than letting
 *      the most specific win, so a CSP on /* and a CSP on /about/ both ship and
 *      the browser enforces their intersection. A /* policy without the hashes
 *      would therefore veto the per-route hashes. Exactly one rule may carry a
 *      CSP for a given path, which is why public/_headers leaves it out.
 *
 * Known gap: not_found_handling serves out/404.html at whatever path was
 * requested, so no route rule matches it and a 404 response carries the other
 * security headers but no CSP. It is a static page with no user input.
 *
 * Runs as part of `npm run build`.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const OUT = "out";
const HEADERS = join(OUT, "_headers");
const MAX_LINE = 2000; // Cloudflare drops any _headers line longer than this.

const POLICY = (scriptSrc) =>
  `default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; ` +
  `${scriptSrc}; font-src 'self'; connect-src 'self'; base-uri 'none'; ` +
  `form-action 'none'; frame-ancestors 'none'`;

function walk(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

/** out/about/index.html -> /about/ ; out/index.html -> / ; out/404.html -> /404.html */
function routeOf(file) {
  const rel = relative(OUT, file).split(sep).join("/");
  return "/" + (rel.endsWith("/index.html") ? rel.slice(0, -"index.html".length)
    : rel === "index.html" ? "" : rel);
}

const rules = [];
let total = 0;

for (const file of walk(OUT).filter((f) => f.endsWith(".html")).sort()) {
  const html = readFileSync(file, "utf8");
  const hashes = new Set();
  for (const m of html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)) {
    if (!m[1]) continue;
    hashes.add(`'sha256-${createHash("sha256").update(m[1], "utf8").digest("base64")}'`);
  }
  if (hashes.size === 0) continue;

  const route = routeOf(file);
  const line = `  Content-Security-Policy: ${POLICY(`script-src 'self' ${[...hashes].sort().join(" ")}`)}`;
  if (line.length > MAX_LINE) {
    console.error(
      `csp: ${route} needs ${hashes.size} hashes and a ${line.length}-char header, ` +
      `over Cloudflare's ${MAX_LINE} limit — it would be dropped silently. Aborting.`
    );
    process.exit(1);
  }
  rules.push(`${route}\n${line}`);
  total += hashes.size;
}

if (rules.length === 0) {
  console.error("csp: no inline scripts found in any page — refusing to write an empty policy");
  process.exit(1);
}

const headers = readFileSync(HEADERS, "utf8");
if (/^\s*Content-Security-Policy:/mi.test(headers)) {
  console.error(
    "csp: out/_headers already sets a Content-Security-Policy. Cloudflare combines " +
    "matching rules, so that one would intersect with the per-route policies and " +
    "block the very scripts these hashes allow. Remove it from public/_headers."
  );
  process.exit(1);
}

writeFileSync(HEADERS, `${headers.trimEnd()}\n\n${rules.join("\n\n")}\n`);
console.log(
  `csp: pinned ${total} inline script hash(es) across ${rules.length} route(s) into out/_headers`
);
