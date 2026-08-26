import Link from "next/link";
import { notFound } from "next/navigation";
import { Prose } from "@/components/Paper";
import { TopicBody } from "@/components/learn/TopicBody";
import { getTopics } from "@/lib/learn";

/**
 * One route per topic.
 *
 * This replaced 26 <dialog> elements rendered into /learn. That page was
 * 556 KB because every explanation was inlined into it, and none of them had
 * a URL — a reader could not link anyone to a concept, and the browser back
 * button did nothing after opening one.
 *
 * Static export needs the full set up front, so generateStaticParams emits all
 * 26 at build time. Each is its own small document, still server-rendered and
 * still fully readable with JavaScript off.
 */
export function generateStaticParams() {
  return getTopics().map((t) => ({ topic: t.id }));
}

/**
 * `params` is a Promise in Next 16 and must be awaited. Typing it as a plain
 * object compiles cleanly and then resolves to undefined at runtime, so every
 * topic rendered the not-found body while still returning HTTP 200 — a static
 * export writes whatever it rendered to the file either way.
 */
type Params = Promise<{ topic: string }>;

export async function generateMetadata({ params }: { params: Params }) {
  const { topic } = await params;
  const t = getTopics().find((x) => x.id === topic);
  if (!t) return { title: "Not found · Zeroth" };
  return { title: `${t.title} · Learn · Zeroth`, description: t.summary };
}

export default async function TopicPage({ params }: { params: Params }) {
  const { topic: slug } = await params;
  const all = getTopics();
  const topic = all.find((t) => t.id === slug);
  if (!topic) notFound();

  const related = topic.related
    .map((id) => all.find((t) => t.id === id))
    .filter((t): t is NonNullable<typeof t> => !!t);

  return (
    <>
      <p className="eyebrow">
        <Link href="/learn/" className="no-underline text-ink-muted hover:text-ink">
          Section 7 · Learn
        </Link>
        {" · "}{topic.category}
      </p>
      <h1 className="mt-2">{topic.title}</h1>

      <Prose className="mt-6">
        <p className="lede">{topic.summary}</p>
      </Prose>

      <div className="mt-8 topic-page">
        <TopicBody topic={topic} all={all} />
      </div>

      {related.length ? (
        <nav className="mt-14" aria-label="Related topics">
          <h2 className="!mt-0 !mb-3">Related</h2>
          <ul className="topic-grid">
            {related.map((r) => (
              <li key={r.id}>
                <Link href={`/learn/${r.id}/`} className="topic-trigger block no-underline">
                  <span className="topic-trigger-title">{r.title}</span>
                  <span className="topic-trigger-summary">{r.summary}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}

      <p className="mt-12">
        <Link href="/learn/">← All topics</Link>
      </p>
    </>
  );
}
