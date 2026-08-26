#!/usr/bin/env node
/**
 * Guard against horizontal overflow in the export.
 *
 * The failure this prevents: a wide element — a table of run metrics, a BibTeX
 * block, a chunk id that cannot wrap — sitting directly in the page flow. On a
 * phone the body itself then scrolls sideways, every column of prose is
 * dragged off-centre, and the only symptom is that the site "feels broken" on
 * mobile while looking perfect on the laptop it was built on.
 *
 * The rule the site follows: wide content scrolls inside its OWN container.
 * So every <table> and <pre> must have an ancestor that establishes one —
 * `.bleed-scroll`, `.topic-table-wrap`, `.cite-bibtex`, or an inline
 * overflow-x. This walks the emitted HTML with an explicit element stack and
 * reports any that do not.
 *
 *   node scripts/check-overflow.mjs        # after next build
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const OUT = "out";

/** Classes that create a horizontal scroll context for their subtree. */
const SCROLLERS = [
  "bleed-scroll", "topic-table-wrap", "cite-bibtex", "topic-formula",
  "overflow-x-auto", "overflow-auto", "overflow-x-scroll",
];

const VOID = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input", "link",
  "meta", "param", "source", "track", "wbr",
]);

function walk(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

function scrolls(attrs) {
  const cls = /class="([^"]*)"/.exec(attrs)?.[1] ?? "";
  if (SCROLLERS.some((s) => cls.split(/\s+/).includes(s))) return true;
  const style = /style="([^"]*)"/.exec(attrs)?.[1] ?? "";
  return /overflow(-x)?\s*:\s*(auto|scroll)/.test(style);
}

const problems = [];

for (const file of walk(OUT).filter((f) => f.endsWith(".html"))) {
  const html = readFileSync(file, "utf8");
  const stack = [];
  // Skip <script> bodies: the RSC payload contains markup-looking strings.
  const body = html.replace(/<script[\s\S]*?<\/script>/g, "");

  for (const m of body.matchAll(/<(\/?)([a-zA-Z][a-zA-Z0-9-]*)([^>]*?)(\/?)>/g)) {
    const [, closing, tagRaw, attrs, selfClose] = m;
    const tag = tagRaw.toLowerCase();
    if (VOID.has(tag)) continue;

    if (closing) {
      const i = stack.map((s) => s.tag).lastIndexOf(tag);
      if (i >= 0) stack.length = i;
      continue;
    }
    const frame = { tag, scrolls: scrolls(attrs) };

    if (tag === "table" || tag === "pre") {
      const guarded = frame.scrolls || stack.some((s) => s.scrolls);
      if (!guarded) {
        problems.push({
          file: file.replace(`${OUT}/`, ""),
          tag,
          context: stack.slice(-3).map((s) => s.tag).join(" > "),
        });
      }
    }
    if (!selfClose) stack.push(frame);
  }
}

if (problems.length) {
  // One line per distinct (route, tag, context); pages repeat the same layout.
  const seen = new Set();
  console.error(`check-overflow: ${problems.length} unguarded wide element(s):\n`);
  for (const p of problems) {
    const key = `${p.file}|${p.tag}|${p.context}`;
    if (seen.has(key)) continue;
    seen.add(key);
    console.error(`  ${p.file}\n    <${p.tag}> inside ${p.context || "(root)"}`);
  }
  console.error(
    `\nWrap it in an element with .bleed-scroll, or give it overflow-x: auto.\n` +
    `Wide content scrolls inside its own container; the page body never does.`
  );
  process.exit(1);
}

console.log("overflow: every table and pre scrolls inside its own container");
