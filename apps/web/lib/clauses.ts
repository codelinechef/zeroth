/**
 * The paper's numbered clauses — the contents rail, and the "Section N" label
 * at the head of each page.
 *
 * Plain data, imported by both a client component (the rail) and server pages
 * (the labels), so it lives outside ClauseIndex.tsx's "use client" boundary.
 *
 * The numbers are DERIVED from position, never written down twice. They used to
 * be hardcoded in seven page files, which meant inserting a clause silently
 * left half the paper mis-numbered.
 */
export type Clause = { num: string; title: string; href: string };

const ORDER: { title: string; href: string }[] = [
  { title: "Board", href: "/" },
  { title: "Methodology", href: "/methodology" },
  { title: "Corpus", href: "/corpus" },
  { title: "Golden set", href: "/golden-set" },
  { title: "Failure modes", href: "/failure-modes" },
  { title: "Walkthroughs", href: "/walkthroughs" },
  { title: "Security", href: "/security" },
  { title: "Learn", href: "/learn" },
  { title: "About", href: "/about" },
];

export const CLAUSES: Clause[] = ORDER.map((c, i) => ({ ...c, num: String(i + 1) }));

/** The clause number for a route, or null if the route is not a clause. */
export function clauseNumber(href: string): string | null {
  return CLAUSES.find((c) => c.href === href)?.num ?? null;
}
