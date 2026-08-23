import { EmptyState } from "@/components/EmptyState";
import { getRuns } from "@/lib/content";

export const metadata = { title: "Security · Zeroth" };

export default function SecurityPage() {
  const withSecurity = getRuns().filter((r) => r.security);

  return (
    <>
      <p className="eyebrow">Clause 4 · Security</p>
      <h1 className="mt-2 text-[length:var(--t-200)]">Security</h1>
      <hr className="rule my-8" />

      <p className="prose-spec">
        Authorisation is enforced inside the retrieval query using PostgreSQL
        Row-Level Security, not applied to results afterwards. Tenant
        partitioning is structural, so cross-tenant retrieval is not merely
        unlikely.
      </p>

      <h2 className="mt-10 text-[length:var(--t-125)]">4.1 Red-team results</h2>
      <div className="mt-4">
        {withSecurity.length === 0 ? (
          <EmptyState>
            The red-team suite has not run yet. Results publish when the suite
            is gated in CI, including any attacks that succeed.
          </EmptyState>
        ) : (
          <ul className="mt-2 space-y-2">
            {withSecurity.map((r) => (
              <li key={r.run_id}>
                {r.clause} · {r.security!.passed}/{r.security!.tests} passed
              </li>
            ))}
          </ul>
        )}
      </div>

      <h2 className="mt-12 text-[length:var(--t-125)]">4.2 What will be reported</h2>
      <p className="prose-spec mt-3">
        The pass rate as measured, including failures. A security section
        showing a perfect score and no failures is the least believable thing
        this site could publish, so failures are reported rather than fixed
        quietly before publication.
      </p>
      <p className="prose-spec mt-3">
        Coverage spans cross-tenant retrieval attempts, role escalation, prompt
        injection through document content, injection through the query,
        citation forgery, and abstention bypass. The suite is verified by
        deliberately introducing a Row-Level Security bug and confirming it
        fails.
      </p>
    </>
  );
}
