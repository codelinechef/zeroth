import { Prose, MarginNote } from "@/components/Paper";

export const metadata = { title: "About · Zeroth" };

export default function AboutPage() {
  return (
    <>
      <p className="eyebrow">Section 8</p>
      <h1 className="mt-2">About</h1>

      <Prose className="mt-8">
        <blockquote className="border-l-2 border-rule pl-5">
          <p>
            Zeroth is an open reconstruction of a production
            confidential-document RAG platform. The original was built for an
            employer over a private corpus and is not public. This is a
            from-scratch rebuild of the same architecture over public documents.
            Every number published here was measured on the public corpus
            described in the methodology, and applies only to it.
          </p>
        </blockquote>

        <h2>Why the distinction matters</h2>
        <MarginNote label="Not a leaderboard claim">
          A number measured on this corpus says nothing about any other corpus,
          including the one this architecture was originally built for.
        </MarginNote>
        <p>
          It is technical, not only ethical. Retrieval metrics describe a corpus
          and a query set, not an architecture. Numbers measured here cannot
          validate, reproduce, or stand in for numbers measured on a different
          corpus, and nothing on this site should be read as implying otherwise.
        </p>

        <h2>Cost and hosting</h2>
        <p>
          The platform runs locally in Docker. Only this site is publicly
          hosted, and it is fully static — it renders committed JSON and never
          queries the platform. There are no accounts, no comments, and no
          tracking.
        </p>
      </Prose>
    </>
  );
}
