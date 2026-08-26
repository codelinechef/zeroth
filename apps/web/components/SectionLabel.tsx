import { clauseNumber } from "@/lib/clauses";

/**
 * The "Section N" eyebrow at the head of a clause page.
 * Reads its number from lib/clauses so the paper cannot be mis-numbered by
 * inserting a section.
 */
export function SectionLabel({ href }: { href: string }) {
  const n = clauseNumber(href);
  if (!n) return null;
  return <p className="eyebrow">Section {n}</p>;
}
