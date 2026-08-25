#!/usr/bin/env node
/**
 * Guard against invalid HTML nesting in the static export.
 *
 * The failure this prevents: a component rendering flow content (<div>,
 * <section>, <dialog>, <h2>, <pre>, <ul>, ...) inside a <p>. The HTML parser
 * auto-closes the paragraph at the first block child, so the DOM the browser
 * builds does not match the tree React rendered, React discards the server
 * HTML and re-renders the entire page on the client, and the only symptom is a
 * minified error in the console.
 *
 * This scans the emitted HTML with an explicit element stack — unlike a browser
 * parser it does NOT auto-close, so the stack reflects what the components
 * actually rendered.
 *
 * Also flags interactive content nested inside a <button>, which breaks
 * keyboard semantics in a quieter way.
 *
 *   node scripts/check-nesting.mjs        # after next build
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const OUT = "out";

// Not permitted inside <p>. Any of these auto-closes the paragraph.
const FLOW = new Set([
  "div", "section", "article", "aside", "header", "footer", "nav", "main",
  "h1", "h2", "h3", "h4", "h5", "h6", "p", "ul", "ol", "li", "dl", "dt", "dd",
  "table", "thead", "tbody", "tr", "td", "th", "form", "figure", "figcaption",
  "pre", "hr", "blockquote", "dialog", "address", "fieldset", "details",
]);
const INTERACTIVE = new Set(["a", "button", "select", "textarea", "input", "dialog"]);
const VOID = new Set([
  "area","base","br","col","embed","hr","img","input","link","meta","param",
  "source","track","wbr",
]);

function walk(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const TAG = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)([^>]*?)(\/?)>/g;
const violations = [];

for (const file of walk(OUT).filter((f) => f.endsWith(".html"))) {
  const html = readFileSync(file, "utf8");
  const stack = [];
  let m;
  TAG.lastIndex = 0;
  while ((m = TAG.exec(html))) {
    const [, closing, rawName, attrs, selfClose] = m;
    const name = rawName.toLowerCase();
    if (name === "svg") {                       // SVG has its own content model
      const end = html.indexOf("</svg>", m.index);
      if (end > -1) { TAG.lastIndex = end + 6; continue; }
    }
    if (closing) {
      const i = stack.lastIndexOf(name);
      if (i > -1) stack.length = i;
      continue;
    }
    if (VOID.has(name) || selfClose) continue;

    if (stack.includes("p") && FLOW.has(name)) {
      violations.push({ file, tag: name, inside: "p",
        why: "flow content inside <p> — the parser will auto-close the paragraph" });
    }
    if (stack.includes("button") && INTERACTIVE.has(name)) {
      violations.push({ file, tag: name, inside: "button",
        why: "interactive content inside <button>" });
    }
    stack.push(name);
  }
}

const files = new Set(violations.map((v) => v.file));
if (violations.length) {
  console.error(`nesting: ${violations.length} violation(s) in ${files.size} file(s)\n`);
  for (const v of violations.slice(0, 25)) {
    console.error(`  ${v.file}`);
    console.error(`    <${v.tag}> inside <${v.inside}> — ${v.why}`);
  }
  process.exit(1);
}
console.log("nesting: no invalid nesting found");
