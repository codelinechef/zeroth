import { EmptyState } from "@/components/EmptyState";

export const metadata = { title: "Writing · Zeroth" };

export default function WritingPage() {
  return (
    <>
      <p className="eyebrow">Clause 6 · Writing</p>
      <h1 className="mt-2 text-[length:var(--t-200)]">Writing</h1>
      <hr className="rule my-8" />
      <EmptyState>
        Not started. This section opens after the board publishes its runs,
        because the board supplies the material worth writing about.
      </EmptyState>
    </>
  );
}
