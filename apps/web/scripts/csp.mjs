#!/usr/bin/env node
/**
 * Regenerate the Content-Security-Policy script-src with the SHA-256 hashes of
 * every inline <script> in the export.
 *
 * Next's static export embeds the RSC payload in inline <script> tags with no
 * src. Under `script-src 'self'` Cloudflare Pages blocks them and hydration
 * dies — and neither `next dev` nor a local static server applies _headers, so
 * this fails ONLY in production. Hashes keep the policy strict without
 * resorting to 'unsafe-inline'.
 *
 * Runs as part of `npm run build`.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const OUT = "out";
const HEADERS = join(OUT, "_headers");

function walk(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const hashes = new Set();
for (const file of walk(OUT).filter((f) => f.endsWith(".html"))) {
  const html = readFileSync(file, "utf8");
  for (const m of html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)) {
    if (!m[1]) continue;
    hashes.add(`'sha256-${createHash("sha256").update(m[1], "utf8").digest("base64")}'`);
  }
}

if (hashes.size === 0) {
  console.log("csp: no inline scripts found — leaving script-src as-is");
  process.exit(0);
}

const scriptSrc = `script-src 'self' ${[...hashes].sort().join(" ")}`;
const headers = readFileSync(HEADERS, "utf8");
const updated = headers.replace(/script-src 'self'[^;]*/, scriptSrc);
if (updated === headers) {
  console.error("csp: could not find script-src in out/_headers — not rewriting");
  process.exit(1);
}
writeFileSync(HEADERS, updated);
console.log(`csp: pinned ${hashes.size} inline script hash(es) into out/_headers`);
