import { clauseNumber } from "@/lib/clauses";

/**
 * A numbered subsection heading, e.g. "6.2 How a query becomes a ranked list".
 *
 * The number is derived from the page's clause, never written down. These used
 * to be hardcoded strings, and the result was exactly what you would expect:
 * Walkthroughs read 5.1–5.3 while sitting at section 6, and Security read
 * 5.1–5.2 while sitting at section 7 — it had been wrong even before a new
 * clause was inserted ahead of it. Deriving the number means inserting a
 * section renumbers the whole paper.
 */
export function Subsection({
  href, n, children, className = "mt-14",
}: {
  /** The clause this page belongs to, e.g. "/walkthroughs". */
  href: string;
  /** Position within the clause, 1-based. */
  n: number;
  children: React.ReactNode;
  className?: string;
}) {
  const clause = clauseNumber(href);
  return (
    <h2 className={className}>
      {clause ? `${clause}.${n} ` : ""}{children}
    </h2>
  );
}
