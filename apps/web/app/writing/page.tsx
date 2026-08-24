import { Prose } from "@/components/Paper";
import { InProgress } from "@/components/InProgress";

export const metadata = { title: "Writing · Zeroth" };

export default function WritingPage() {
  return (
    <>
      <p className="eyebrow">Writing</p>
      <h1 className="mt-2">Writing</h1>
      <Prose className="mt-6">
        <p className="lede">
          The site&apos;s second section.
        </p>
      </Prose>
      <div className="mt-8">
        <InProgress phase={6} blockedBy="the board publishing its runs (Phase 5), which supplies the material">
          Posts on what the measurements actually showed — what the reranker bought, why abstention is the metric nobody publishes, and which failure modes cost the most. With a feed and static search.
        </InProgress>
      </div>
    </>
  );
}
