import { SectionLabel } from "@/components/SectionLabel";
import { RedTeamResults } from "@/components/RedTeamResults";
import { Provenance } from "@/components/Provenance";
import { getRedTeam } from "@/lib/security";
import { Subsection } from "@/components/Subsection";
import { Prose, MarginNote, Figure } from "@/components/Paper";
import { InProgress } from "@/components/InProgress";
import { Partitioned } from "@/components/figures/Partitioned";

export const metadata = { title: "Security · Zeroth" };

export default function SecurityPage() {
  const redteam = getRedTeam();
  return (
    <>
      <SectionLabel href="/security" />
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

      <Subsection href="/security" n={1} className="mt-14">Red-team results</Subsection>
      <div className="mt-4">
        {redteam ? (
          <>
            <RedTeamResults data={redteam} />
            <Provenance {...redteam.generated_by}
              extra={`${redteam.source.roles} roles x ${redteam.source.tenants} tenants on corpus ${redteam.source.corpus}`} />
          </>
        ) : (
          <InProgress phase={3}>
            Cross-tenant retrieval attempts, role escalation, prompt injection
            through document content and through the query, citation forgery,
            and abstention bypass. Results publish including any attacks that
            succeed.
          </InProgress>
        )}
      </div>

      <Subsection href="/security" n={2} className="mt-14">What will be reported</Subsection>
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
