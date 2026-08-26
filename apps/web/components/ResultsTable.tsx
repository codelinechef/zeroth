"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { Run } from "@/lib/content";
import { ClauseBlock } from "./ClauseBlock";
import { EmptyState } from "./EmptyState";

/**
 * The hero is the table — brief §7. One thesis sentence, a rule, then results.
 *
 * Sorting and filtering are implemented here but DELIBERATELY GATED on the
 * board actually holding enough rows to need them. The original note in this
 * file was right: a sort control over an empty board is furniture, and a
 * corpus filter offering a single corpus is worse than none. So the controls
 * mount only when they would change what the reader sees —
 * `runs.length >= SORT_MIN` for the column sorts, and a facet only when the
 * board holds more than one distinct value for it.
 *
 * The consequence is that with `content/board/` empty, as it is until the
 * baseline run completes, this renders exactly the empty state it always did.
 * The interaction arrives with the data rather than ahead of it.
 */

/** Below this a sort is a no-op the reader still has to read past. */
const SORT_MIN = 3;

type SortKey = "clause" | "label" | "corpus" | "date";
type Direction = "asc" | "desc";

const COLUMNS: { key: SortKey; label: string; numeric: boolean }[] = [
  { key: "clause", label: "Clause", numeric: true },
  { key: "label", label: "Configuration", numeric: false },
  { key: "corpus", label: "Corpus", numeric: false },
  { key: "date", label: "Date", numeric: true },
];

function valueOf(r: Run, key: SortKey): string {
  switch (key) {
    case "clause": return r.clause;
    case "label": return r.label;
    case "corpus": return r.corpus.id;
    case "date": return r.run_date;
  }
}

export function ResultsTable({ runs }: { runs: Run[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const [sort, setSort] = useState<{ key: SortKey; dir: Direction } | null>(null);
  const [corpus, setCorpus] = useState<string>("all");

  // Facet values, in the order they appear on the board.
  const corpora = useMemo(() => {
    const seen: string[] = [];
    for (const r of runs) if (!seen.includes(r.corpus.id)) seen.push(r.corpus.id);
    return seen;
  }, [runs]);

  const rows = useMemo(() => {
    const filtered = corpus === "all"
      ? runs
      : runs.filter((r) => r.corpus.id === corpus);
    if (!sort) return filtered;
    const col = COLUMNS.find((c) => c.key === sort.key)!;
    // Copy before sorting: the prop array is shared with the server render.
    return [...filtered].sort((a, b) => {
      const x = valueOf(a, sort.key);
      const y = valueOf(b, sort.key);
      // Clause ids ("1.2.10") and ISO dates both sort correctly with a numeric
      // collator; localeCompare alone puts 1.2.10 before 1.2.9.
      const cmp = col.numeric
        ? x.localeCompare(y, undefined, { numeric: true })
        : x.localeCompare(y);
      return sort.dir === "asc" ? cmp : -cmp;
    });
  }, [runs, sort, corpus]);

  if (runs.length === 0) {
    return (
      <EmptyState>
        No runs yet. The first will publish once the baseline completes.
      </EmptyState>
    );
  }

  const sortable = runs.length >= SORT_MIN;
  const showFacet = corpora.length > 1;

  const toggle = (key: SortKey) => {
    setOpen(null); // a re-ordered table should not keep an expanded row open
    setSort((s) =>
      s?.key === key
        ? { key, dir: s.dir === "asc" ? "desc" : "asc" }
        : { key, dir: "asc" }
    );
  };

  return (
    <>
      {showFacet ? (
        <div className="table-controls">
          <span className="eyebrow" id="corpus-facet-label">Corpus</span>
          {/* Radio semantics, not a listbox: the set is small and every option
              is worth showing at once. */}
          <span role="group" aria-labelledby="corpus-facet-label" className="facet">
            {["all", ...corpora].map((id) => (
              <button
                key={id}
                type="button"
                aria-pressed={corpus === id}
                onClick={() => { setCorpus(id); setOpen(null); }}
                className="facet-option"
              >
                {id === "all" ? `All (${runs.length})` : id}
              </button>
            ))}
          </span>
        </div>
      ) : null}

      <table className="w-full border-collapse text-left">
        <caption className="sr-only">
          Evaluation runs, one row per configuration
          {sortable ? ", sortable by column" : ""}
        </caption>
        <thead>
          <tr className="border-b border-rule">
            {COLUMNS.map((c) => {
              const active = sort?.key === c.key;
              return (
                <th
                  key={c.key}
                  scope="col"
                  className="eyebrow py-2 pr-4 font-bold"
                  // Announce the current sort to assistive tech, and only when
                  // sorting is actually available.
                  aria-sort={
                    !sortable ? undefined
                      : active ? (sort!.dir === "asc" ? "ascending" : "descending")
                      : "none"
                  }
                >
                  {sortable ? (
                    <button
                      type="button"
                      onClick={() => toggle(c.key)}
                      className="col-sort"
                    >
                      {c.label}
                      <span className="col-sort-mark" aria-hidden="true">
                        {active ? (sort!.dir === "asc" ? "▲" : "▼") : "↕"}
                      </span>
                    </button>
                  ) : (
                    c.label
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.flatMap((r, i) => [
            <tr
              key={r.run_id}
              className="typeset-row border-b border-rule align-baseline"
              style={{ ["--row" as string]: i }}
            >
              <td className="py-3 pr-4 tabular-nums">{r.clause}</td>
              <td className="py-3 pr-4">
                <button
                  type="button"
                  onClick={() => setOpen(open === r.run_id ? null : r.run_id)}
                  aria-expanded={open === r.run_id}
                  className="text-left underline text-signal"
                >
                  {r.label}
                </button>{" "}
                <Link href={`/runs/${r.run_id}/`} className="text-[length:var(--t-75)]">
                  detail
                </Link>
              </td>
              <td className="py-3 pr-4 text-ink-muted">{r.corpus.id}</td>
              <td className="py-3 tabular-nums text-ink-muted">{r.run_date}</td>
            </tr>,
            open === r.run_id ? (
              <tr key={`${r.run_id}-clause`} className="border-b border-rule">
                <td colSpan={4} className="pb-2">
                  <ClauseBlock
                    run={r}
                    baseline={runs.find((b) => b.clause === r.baseline_ref)}
                  />
                </td>
              </tr>
            ) : null,
          ])}
        </tbody>
      </table>

      {rows.length === 0 ? (
        <p className="mono text-[length:var(--t-75)] text-ink-muted mt-3">
          No runs on corpus {corpus}.
        </p>
      ) : null}
    </>
  );
}
