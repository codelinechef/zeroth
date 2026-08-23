export const metadata = { title: "About · Zeroth" };

export default function AboutPage() {
  return (
    <>
      <p className="eyebrow">Clause 5 · About</p>
      <h1 className="mt-2 text-[length:var(--t-200)]">About</h1>
      <hr className="rule my-8" />

      {/* The reconstruction statement — brief §1. Reproduced in substance in
          the repository README. */}
      <blockquote className="prose-spec border-l-2 border-rule pl-5">
        <p>
          Zeroth is an open reconstruction of a production confidential-document
          RAG platform. The original was built for an employer over a private
          corpus and is not public. This is a from-scratch rebuild of the same
          architecture over public documents. Every number published here was
          measured on the public corpus described in the methodology, and
          applies only to it.
        </p>
      </blockquote>

      <h2 className="mt-10 text-[length:var(--t-125)]">Why the distinction matters</h2>
      <div className="prose-spec mt-3">
        <p>
          It is technical, not only ethical. Retrieval metrics describe a
          corpus and a query set, not an architecture. Numbers measured here
          cannot validate, reproduce, or stand in for numbers measured on a
          different corpus, and nothing on this site should be read as implying
          otherwise.
        </p>
        <p>
          What is published here is what this system scores on this corpus.
          Nothing else.
        </p>
      </div>

      <h2 className="mt-10 text-[length:var(--t-125)]">Cost and hosting</h2>
      <div className="prose-spec mt-3">
        <p>
          The platform runs locally in Docker. Only this site is publicly
          hosted, and it is fully static — it renders committed JSON and never
          queries the platform. There are no accounts, no comments, and no
          tracking cookies.
        </p>
      </div>
    </>
  );
}
