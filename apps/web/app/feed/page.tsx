import { EmptyState } from "@/components/EmptyState";

export const metadata = { title: "Feed · Zeroth" };

export default function FeedPage() {
  return (
    <>
      <p className="eyebrow">Clause 7 · Feed</p>
      <h1 className="mt-2 text-[length:var(--t-200)]">Feed</h1>
      <hr className="rule my-8" />
      <EmptyState>
        Not started. This section opens after the writing section has real
        content. Every digest will pass through a pull request before it
        publishes; there is no automatic publishing path.
      </EmptyState>
    </>
  );
}
