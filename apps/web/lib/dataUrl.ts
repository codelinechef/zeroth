/**
 * Where the browser fetches a staged dataset from.
 *
 * Client-safe on purpose, and deliberately NOT in lib/interactive.ts: that
 * module reads the staged files with node:fs at build time, so importing this
 * helper from there drags the filesystem layer into the browser bundle and the
 * build fails with "the chunking context does not support external modules
 * (request: node:fs)". Same reason lib/families.ts exists apart from
 * lib/metrics.ts.
 *
 * `trailingSlash: true` rewrites page routes but must not touch asset paths,
 * so the URL is written out literally rather than composed from the router.
 */
export function datasetUrl(rel: string): string {
  return `/data/${rel}`;
}
