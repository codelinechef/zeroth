"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * The persistent numbered clause index — brief §7.
 * Mirrors a specification's table of contents. Collapses to a top drawer
 * below 900px using a native <details>, so it works without JavaScript and
 * is keyboard-operable for free.
 */
export type Clause = { num: string; title: string; href: string };

export const CLAUSES: Clause[] = [
  { num: "1", title: "Board", href: "/" },
  { num: "2", title: "Methodology", href: "/methodology" },
  { num: "3", title: "Corpus", href: "/corpus" },
  { num: "4", title: "Security", href: "/security" },
  { num: "5", title: "About", href: "/about" },
  { num: "6", title: "Writing", href: "/writing" },
  { num: "7", title: "Feed", href: "/feed" },
];

function List({ pathname }: { pathname: string }) {
  return (
    <ol className="space-y-1">
      {CLAUSES.map((c) => {
        const active = pathname === c.href || (c.href !== "/" && pathname.startsWith(c.href));
        return (
          <li key={c.href} className="flex gap-2 text-[length:var(--t-875)]">
            <span className="text-ink-muted tabular-nums" aria-hidden="true">
              {c.num}.
            </span>
            <Link
              href={c.href}
              aria-current={active ? "page" : undefined}
              className={
                active
                  ? "no-underline text-ink font-semibold"
                  : "no-underline text-ink-muted hover:text-ink"
              }
            >
              {c.title}
            </Link>
          </li>
        );
      })}
    </ol>
  );
}

export function ClauseIndex() {
  const pathname = usePathname() || "/";

  return (
    <>
      {/* Top drawer below 900px */}
      <details className="lg:hidden border-b border-rule">
        <summary className="cursor-pointer px-4 py-3 eyebrow list-none">
          Contents
        </summary>
        <nav aria-label="Clause index" className="px-4 pb-4">
          <List pathname={pathname} />
        </nav>
      </details>

      {/* Persistent left rail at 900px and up */}
      <nav
        aria-label="Clause index"
        className="hidden lg:block sticky top-0 h-dvh w-56 shrink-0 border-r border-rule px-6 py-10"
      >
        <p className="eyebrow mb-4">Contents</p>
        <List pathname={pathname} />
      </nav>
    </>
  );
}
