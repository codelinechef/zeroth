"use client";

import { useState } from "react";

type RoleResult = {
  tenants_visible: number; tenants_total: number; queries: number;
  empty_results: number; recall_at_10: number;
};
type Sweep = Record<string, Record<string, { recall_at_10: number; empty_results: number }>>;

export type PostFilterData = {
  k: number;
  ef_sweep: number[];
  index: { type: string; m: number; ef_construction: number; build_seconds: number };
  roles: Record<string, RoleResult>;
  sweep: Sweep;
  measured_as: string;
  finding: {
    holds: string[]; does_not_hold: string[]; why_they_differ: string;
    still_the_argument_for_partitioning: string; reproducibility_note: string;
  };
};

const ROLE_LABEL: Record<string, string> = {
  all_tenants: "Unrestricted", analyst_broad: "Broad",
  analyst_mid: "Mid", analyst_narrow: "Narrow", single_tenant: "Single tenant",
};

/**
 * The access-control effect on approximate search, over real measurements.
 *
 * Two controls, both keyboard-operable: a role selector and an ef_search
 * slider. Every state carries the real recall and the real number of empty
 * results — no state is a picture without a number.
 *
 * Degrades honestly: with JavaScript off the reader still gets the full sweep
 * table rendered below by the server, carrying the same figures.
 */
export function PostFilterDemo({ data }: { data: PostFilterData }) {
  const roles = Object.keys(data.roles);
  const [role, setRole] = useState(roles[roles.length - 1] ?? "single_tenant");
  const [efIdx, setEfIdx] = useState(0);
  const ef = data.ef_sweep[efIdx];
  const cell = data.sweep[role]?.[String(ef)];
  const unrestricted = data.sweep["all_tenants"]?.[String(ef)];
  const total = data.roles[role]?.queries ?? 0;
  const empty = cell?.empty_results ?? 0;
  const filledSlots = Math.round((cell?.recall_at_10 ?? 0) * data.k);

  return (
    <div className="border border-rule p-4 md:p-6">
      <div className="flex flex-wrap gap-6">
        <fieldset>
          <legend className="eyebrow mb-2">Role — how much of the corpus is visible</legend>
          <div className="flex flex-wrap gap-1">
            {roles.map((rk) => (
              <button
                key={rk} type="button" onClick={() => setRole(rk)}
                aria-pressed={role === rk}
                className={`mono text-[length:var(--t-75)] border px-2 py-1 ${
                  role === rk ? "border-ink text-ink" : "border-rule text-ink-muted"}`}
              >
                {ROLE_LABEL[rk] ?? rk}
                <span className="ml-1 tabular-nums">
                  {data.roles[rk].tenants_visible}/{data.roles[rk].tenants_total}
                </span>
              </button>
            ))}
          </div>
        </fieldset>

        <div className="min-w-[16rem] flex-1">
          <label htmlFor="ef-search" className="eyebrow block mb-2">
            ef_search — how wide the index searches
          </label>
          <input
            id="ef-search" type="range" min={0} max={data.ef_sweep.length - 1} step={1}
            value={efIdx} onChange={(e) => setEfIdx(Number(e.target.value))}
            aria-valuetext={`ef_search ${ef}`}
            className="w-full"
          />
          <div className="flex justify-between mono text-[length:var(--t-75)] text-ink-muted">
            {data.ef_sweep.map((v) => (
              <span key={v} className={v === ef ? "text-ink" : ""}>{v}</span>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <Stat label="recall@10" value={cell ? cell.recall_at_10.toFixed(3) : "—"}
          note="exact search under the same policy = 1.000" />
        <Stat label="queries returning nothing" value={`${empty} of ${total}`}
          note={empty > 0 ? "permitted matches exist; none were reached"
                          : "every query returned something"} />
        <Stat label="unrestricted, same ef_search"
          value={unrestricted ? unrestricted.recall_at_10.toFixed(3) : "—"}
          note="the ceiling this role is measured against" />
      </div>

      <div className="mt-6">
        <p className="eyebrow mb-2">of the top {data.k} exact search would return</p>
        <div className="flex gap-1" role="img"
          aria-label={`${filledSlots} of ${data.k} results recovered by approximate search under this policy`}>
          {Array.from({ length: data.k }, (_, i) => (
            <span key={i}
              className={`h-8 flex-1 border ${
                i < filledSlots ? "border-ink bg-ink/10" : "border-rule"}`} />
          ))}
        </div>
        <p className="mono text-[length:var(--t-75)] text-ink-muted mt-2">
          filled = also returned by approximate search · empty = lost to
          post-filtering, and nothing refilled it
        </p>
      </div>
    </div>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div>
      <p className="eyebrow">{label}</p>
      <p className="mono text-[length:var(--t-200)] tabular-nums leading-none mt-1">{value}</p>
      <p className="mono text-[length:var(--t-75)] text-ink-muted mt-1">{note}</p>
    </div>
  );
}
