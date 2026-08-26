import { SectionLabel } from "@/components/SectionLabel";
import Link from "next/link";
import { ConceptIndex } from "@/components/ConceptIndex";
import { Prose, MarginNote } from "@/components/Paper";
import { topicsByCategory, getTopics, CATEGORY_BLURB } from "@/lib/learn";

export const metadata = {
  title: "Learn · Zeroth",
  description:
    "The retrieval, evaluation and security concepts this project is built on, each explained in depth and tied to the implementation.",
};

export default function LearnPage() {
  const groups = topicsByCategory();
  const all = getTopics();

  return (
    <>
      <SectionLabel href="/learn" />
      <h1 className="mt-2">Learn</h1>

      <Prose className="mt-6">
        <p className="lede">
          Every concept this project is built on, explained in depth and tied to
          where it actually appears in the implementation.
        </p>
        <MarginNote label="Prerequisites">
          Comfortable reading code, and familiar with HTTP APIs and relational
          databases at a basic level. No prior knowledge of retrieval systems,
          embeddings, vector indexes or language models is assumed — those are
          what this section explains.
        </MarginNote>
        <p>
          {all.length} topics across {groups.length} areas. Each opens in place
          Each has its own page covering the concept, why it exists, how it
          works, how it is used here, the trade-offs, and the mistakes that are
          easy to make. Nothing is included that this project does not actually
          use.
        </p>
      </Prose>

      <div className="mt-12 space-y-12">
        {groups.map(([category, topics]) => (
          <section key={category}>
            <h2 className="!mt-0">{category}</h2>
            <p className="text-ink-muted prose-measure">{CATEGORY_BLURB[category]}</p>
            <ul className="topic-grid mt-4">
              {topics.map((t) => (
                <li key={t.id}>
                  <Link href={`/learn/${t.id}/`} className="topic-trigger block no-underline">
                    <span className="topic-trigger-title">{t.title}</span>
                    <span className="topic-trigger-summary">{t.summary}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>


      <h2 className="mt-16">Cross-reference index</h2>
      <Prose>
        <p>
          What connects to what, across metrics, failure modes and concepts.
          Every relationship here is one the content already declares — nothing
          is inferred, and a reference that does not resolve fails the build.
        </p>
      </Prose>
      <ConceptIndex />
    </>

  );
}
