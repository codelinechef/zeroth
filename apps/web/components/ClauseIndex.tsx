"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SectionSpy } from "./SectionSpy";
import { CLAUSES } from "@/lib/clauses";

/**
 * The numbered contents rail — brief §3.
 * Sticky at >=900px, a native <details> drawer below it, so it works without
 * JavaScript and is keyboard-operable for free.
 */
export { CLAUSES, type Clause } from "@/lib/clauses";

function List({ pathname, spy = false }: { pathname: string; spy?: boolean }) {
  return (
    <ol className="space-y-1.5">
      {CLAUSES.map((c) => {
        const active =
          pathname === c.href || (c.href !== "/" && pathname.startsWith(c.href));
        return (
          <li key={c.href} className="mono text-[length:var(--t-75)]">
            <span className="flex gap-2">
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
            </span>
            {/* Sections of the page currently open, nested under its clause.
                Only in the sticky rail — the mobile drawer is a jump menu the
                reader opens deliberately, and a live-updating sub-list inside
                a collapsed <details> is invisible work. */}
            {active && spy ? <SectionSpy /> : null}
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
        className="hidden lg:block sticky top-0 h-dvh w-[var(--rail)] shrink-0 border-r border-rule px-6 py-12 overflow-y-auto"
      >
        <p className="eyebrow mb-4">Contents</p>
        <List pathname={pathname} spy />
      </nav>
    </>
  );
}
