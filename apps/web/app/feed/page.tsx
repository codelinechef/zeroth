import { Prose } from "@/components/Paper";
import { InProgress } from "@/components/InProgress";

export const metadata = { title: "Feed · Zeroth" };

export default function FeedPage() {
  return (
    <>
      <p className="eyebrow">Feed</p>
      <h1 className="mt-2">Feed</h1>
      <Prose className="mt-6">
        <p className="lede">
          The site&apos;s third section.
        </p>
      </Prose>
      <div className="mt-8">
        <InProgress phase={7} blockedBy="the writing section having real content">
          An automated digest of retrieval and evaluation research. Every issue passes through a pull request before it publishes; there is no automatic publishing path.
        </InProgress>
      </div>
    </>
  );
}
