import { Prose, MarginNote, Figure } from "@/components/Paper";
import { InProgress } from "@/components/InProgress";
import { Partitioned } from "@/components/figures/Partitioned";
import { getRuns } from "@/lib/content";

export const metadata = { title: "Security · Zeroth" };

export default function SecurityPage() {
  const withSecurity = getRuns().filter((r) => r.security);
  return (
    <>
      <p className="eyebrow">Section 5</p>
      <h1 className="mt-2">Security</h1>

      <Prose className="mt-6">
        <p className="lede">
          Authorisation is enforced inside the retrieval query using PostgreSQL
          row-level security, not applied to results afterwards.
        </p>
        <MarginNote label="Two silent bypasses">
          A superuser and a table owner are both exempt from row-level security
          by default. Neither raises an error, so every access-control test can
          pass for the wrong reason.
        </MarginNote>
        <p>
          Tenant partitioning is structural, so cross-tenant retrieval is not
          merely unlikely. The application role is neither superuser nor
          exempt, and every table carrying a policy forces row-level security
          on its owner as well.
        </p>
      </Prose>

      <Figure n={3} caption="Partitioning changes what an index contains, not who may read it. Row-level security remains the correctness boundary in both arrangements.">
        <div className="p-4"><Partitioned /></div>
      </Figure>

      <h2 className="mt-14">5.1 Red-team results</h2>
      <div className="mt-4">
        {withSecurity.length === 0 ? (
          <InProgress phase={3} blockedBy="the retrieval platform (Phase 2)">
            Cross-tenant retrieval attempts, role escalation, prompt injection
            through document content and through the query, citation forgery,
            and abstention bypass. Results publish including any attacks that
            succeed.
          </InProgress>
        ) : (
          <ul className="mono space-y-2">
            {withSecurity.map((r) => (
              <li key={r.run_id}>
                {r.clause} · {r.security!.passed}/{r.security!.tests} passed
              </li>
            ))}
          </ul>
        )}
      </div>

      <h2 className="mt-14">5.2 What will be reported</h2>
      <Prose>
        <p>
          The pass rate as measured, including failures. A security section
          showing a perfect score with no failures shown is the least believable
          thing this site could publish, so failures are reported rather than
          quietly fixed before publication.
        </p>
        <p>
          The suite is verified by deliberately introducing a row-level security
          bug and confirming it fails. A suite that has never failed has not
          been shown to work.
        </p>
      </Prose>
    </>
  );
}
