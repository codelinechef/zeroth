import { dataset, type Provenance } from "./interactive";

/**
 * The access-control finding — read from the dataset rls_demo.py writes.
 *
 * This is the project's first result, and it is worth being precise about
 * what kind of result it is. Recall here is measured against EXACT search
 * under the identical policy, not against golden-set relevance grades. That
 * distinction is what makes it publishable today: it needs no human judgments,
 * so none of the golden set's current problems touch it.
 */
export type RoleResult = {
  tenants_visible: number;
  tenants_total: number;
  queries: number;
  empty_results: number;
  recall_at_10: number;
  per_query: { query_id: string; exact: number; returned: number; hit: number }[];
};

export type Findings = Provenance & {
  k: number;
  ef_sweep: number[];
  index: { type: string; m: number; ef_construction: number; build_seconds: number };
  roles: Record<string, RoleResult>;
  sweep: Record<string, Record<string, { recall_at_10: number; empty_results: number }>>;
  measured_as: string;
  code: string;
  finding: {
    holds: string[];
    does_not_hold: string[];
    why_they_differ: string;
    still_the_argument_for_partitioning: string;
    reproducibility_note: string;
  };
};

export function getFindings(): Findings | null {
  return dataset<Findings>("rls/postfilter.json");
}

/** Roles ordered widest to narrowest — the axis the finding runs along. */
export function rolesByBreadth(f: Findings): [string, RoleResult][] {
  return Object.entries(f.roles).sort(
    (a, b) => b[1].tenants_visible - a[1].tenants_visible);
}
