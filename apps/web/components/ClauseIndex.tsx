"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * The numbered contents rail — brief §3.
 * Sticky at >=900px, a native <details> drawer below it, so it works without
 * JavaScript and is keyboard-operable for free.
 */
export type Clause = { num: string; title: string; href: string };

export const CLAUSES: Clause[] = [
  { num: "1", title: "Board", href: "/" },
  { num: "2", title: "Methodology", href: "/methodology" },
  { num: "3", title: "Corpus", href: "/corpus" },
  { num: "4", title: "Failure modes", href: "/failure-modes" },
  { num: "5", title: "Security", href: "/security" },
  { num: "6", title: "Roadmap", href: "/roadmap" },
  { num: "7", title: "Writing", href: "/writing" },
  { num: "8", title: "Feed", href: "/feed" },
  { num: "9", title: "About", href: "/about" },
];

function List({ pathname }: { pathname: string }) {
  return (
    <ol className="space-y-1.5">
      {CLAUSES.map((c) => {
        const active =
          pathname === c.href || (c.href !== "/" && pathname.startsWith(c.href));
        return (
          <li key={c.href} className="flex gap-2 mono text-[length:var(--t-75)]">
            <span className="text-ink-muted tabular-nums" aria-hidden="true">
              {c.num}
            </span>
            <Link
              href={c.href}
              aria-current={active ? "page" : undefined}
              className={
                active
                  ? "no-underline text-ink font-medium"
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
      <details className="lg:hidden border-b border-rule">
        <summary className="cursor-pointer px-4 py-3 eyebrow list-none">
          Contents
        </summary>
        <nav aria-label="Contents" className="px-4 pb-4">
          <List pathname={pathname} />
        </nav>
      </details>

      <nav
        aria-label="Contents"
        className="hidden lg:block sticky top-0 h-dvh w-[var(--rail)] shrink-0 border-r border-rule px-6 py-12"
      >
        <p className="eyebrow mb-4">Contents</p>
        <List pathname={pathname} />
      </nav>
    </>
  );
}
