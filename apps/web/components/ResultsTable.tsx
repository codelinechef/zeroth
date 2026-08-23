"use client";

import { useState } from "react";
import Link from "next/link";
import type { Run } from "@/lib/content";
import { ClauseBlock } from "./ClauseBlock";
import { EmptyState } from "./EmptyState";

/**
 * The hero is the table — brief §7. One thesis sentence, a rule, then results.
 * Sorting arrives in Phase 5 with the ninth run; with an empty board there is
 * nothing to sort and a sort control would be furniture.
 */
export function ResultsTable({ runs }: { runs: Run[] }) {
  const [open, setOpen] = useState<string | null>(null);

  if (runs.length === 0) {
    return (
      <EmptyState>
        No runs yet. The first will publish once the baseline completes.
      </EmptyState>
    );
  }

  return (
    <table className="w-full border-collapse text-left">
      <caption className="sr-only">
        Evaluation runs, one row per configuration
      </caption>
      <thead>
        <tr className="border-b border-rule">
          <th scope="col" className="eyebrow py-2 pr-4 font-bold">Clause</th>
          <th scope="col" className="eyebrow py-2 pr-4 font-bold">Configuration</th>
          <th scope="col" className="eyebrow py-2 pr-4 font-bold">Corpus</th>
          <th scope="col" className="eyebrow py-2 font-bold">Date</th>
        </tr>
      </thead>
      <tbody>
        {runs.flatMap((r, i) => [
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
  );
}
