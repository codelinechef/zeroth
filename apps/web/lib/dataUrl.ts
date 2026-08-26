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
 *
 * SECURITY — why the id is validated rather than interpolated directly.
 *
 * The demos build this path from a value that reaches them through the DOM: a
 * <select> whose options the page rendered. That value is trivially editable
 * from devtools, which makes it externally controlled input at a trust
 * boundary, however benign its origin. An id of "../../something" would walk
 * the fetch outside /data and pull an unrelated same-origin document into a
 * component that renders parts of it.
 *
 * The site is a static export with no backend, so the worst case is reading
 * another public file rather than a server-side traversal — but the whole
 * point of validating at a boundary is not to depend on that reasoning holding
 * after the next change. Ids are restricted to the shape the staging script
 * actually produces: lowercase, digits, hyphen, single dot before the
 * extension, no separators.
 */

/** Matches "retrieval/single-chunk-000.json", rejects anything with a path segment trick. */
const SAFE_REL = /^[a-z0-9][a-z0-9-]*\/[a-z0-9][a-z0-9-]*\.json$/;

export class UnsafeDatasetPath extends Error {}

export function datasetUrl(rel: string): string {
  if (!SAFE_REL.test(rel)) {
    // Fail loudly rather than fetching something unintended. A caller passing
    // a malformed id is a bug; a caller passing a traversal is an attack.
    throw new UnsafeDatasetPath(`refusing to fetch dataset path "${rel}"`);
  }
  return `/data/${rel}`;
}
