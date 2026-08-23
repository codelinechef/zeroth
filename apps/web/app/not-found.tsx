import Link from "next/link";

export default function NotFound() {
  return (
    <>
      <p className="eyebrow">Not found</p>
      <h1 className="mt-2 text-[length:var(--t-200)]">No such page</h1>
      <hr className="rule my-8" />
      <p className="prose-spec">
        That address does not correspond to anything published here.{" "}
        <Link href="/">Return to the board</Link>.
      </p>
    </>
  );
}
