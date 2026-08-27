import Link from "next/link";
import { SectionLabel } from "@/components/SectionLabel";
import { Prose, MarginNote, Bleed } from "@/components/Paper";
import { getCorpusStats } from "@/lib/content";
import { Pipeline } from "@/components/figures/Pipeline";
import { Figure } from "@/components/Paper";
import { LinkedInIcon, GlobeIcon } from "@/components/Icons";
import { Abbr } from "@/components/Abbr";
import { Glossary } from "@/components/Glossary";
import { Cite } from "@/components/Cite";
import { References } from "@/components/References";
import { getSite } from "@/lib/site";

export const metadata = {
  title: "About · Zeroth",
  description:
    "What Zeroth is, the problem it addresses, how the system works end to end, and the technology behind each part of it.",
};

export default function AboutPage() {
  const c = getCorpusStats();
  const site = getSite();

  return (
    <>
      <SectionLabel href="/about" />
      <h1 className="mt-2">About</h1>

      <Prose className="mt-6">
        <p className="lede">
          Zeroth is an open reconstruction of a production confidential-document
          retrieval platform, rebuilt over public documents so the architecture
          can be inspected, measured and argued with.
        </p>
        <MarginNote label="Reading this page">
          Concepts are explained in depth under{" "}
          <Link href="/learn/">Learn</Link>; the behaviour behind the claims is
          steppable under <Link href="/walkthroughs/">Walkthroughs</Link>.
        </MarginNote>
      </Prose>

      <h2 className="mt-14">1 · Project overview</h2>
      <Prose>
        <p>
          The original system was built for an employer over a private corpus
          and cannot leave. This is a from-scratch rebuild of the same
          architecture over public documents, together with a public evaluation
          board that measures it. Every number published here was measured on
          the corpus described in the methodology and applies only to it.
        </p>
        <p>
          That framing is technical rather than merely ethical. Retrieval
          metrics are properties of a corpus-and-query-set pair, not of an
          architecture, so numbers measured here cannot validate or stand in for
          numbers measured on a different corpus.
        </p>
      </Prose>

      <h2 className="mt-14">2 · Problem</h2>
      <Prose>
        <p>
          Retrieval systems are usually reported as a single quality number, and
          that number hides almost everything that determines whether the system
          works. It hides whether the retriever surfaced the passage, whether the
          generator used it, whether the system declined when there was nothing
          to say, and what access control did to any of it.
        </p>
        <p>
          The project&apos;s objective is narrower and harder than a leaderboard
          score: measure a full pipeline end to end, publish the confidence
          intervals, publish the failure modes, and make every figure traceable
          to committed data so a stranger can re-run it.
        </p>
      </Prose>

      <h2 className="mt-14">3 · How it works</h2>
      <Prose>
        <p>
          Documents are fetched from three public sources, parsed with page and
          section provenance preserved, chunked two ways, assigned to tenants
          and deduplicated. Chunks are embedded and indexed. A query runs through
          lexical and dense retrieval in parallel, the two ranked lists are fused
          by rank, a cross-encoder reorders the shortlist, and a language model
          answers under a schema constraint using only the retrieved passages.
          Citations are resolved, quotes are verified, and the system abstains
          when the evidence does not support an answer.
        </p>
      </Prose>

      <Figure n={1} caption="The pipeline under measurement. Solid stages are implemented; dashed stages are planned, marked with the phase that delivers them.">
        <div className="p-4"><Pipeline /></div>
      </Figure>

      <h2 className="mt-14">4 · System architecture</h2>
      <Prose>
        <p>
          The platform runs locally in Docker. Only the site is publicly hosted,
          and it is a static export that renders committed JSON and never queries
          the platform. That split is what keeps hosting free and the public
          attack surface at zero.
        </p>
      </Prose>
      <Bleed className="mt-4 bleed-scroll">
        <table className="w-full mono text-[length:var(--t-75)] border-collapse">
          <caption className="sr-only">Layer, responsibility and technology</caption>
          <thead>
            <tr className="border-b border-rule">
              <th scope="col" className="text-left py-2 pr-4">Layer</th>
              <th scope="col" className="text-left py-2 pr-4">Responsibility</th>
              <th scope="col" className="text-left py-2">Built with</th>
            </tr>
          </thead>
          <tbody>
            {[
              ["Acquisition", "Fetch three public sources, rate limited and resumable", "Python standard library only — urllib, no third-party HTTP client"],
              ["Parsing", "Extract text with page and section provenance", "lxml for filing HTML; hand-written parsers for plain text"],
              ["Chunking", "Two strategies behind one interface", "transformers tokenizer (bge-small vocabulary)"],
              ["Embedding", "384-dimension vectors for every chunk", "BAAI/bge-small-en-v1.5 on PyTorch, CUDA"],
              ["Lexical index", "BM25 over the chunk corpus", "Hand-rolled, array-backed postings, standard library"],
              ["Vector index", "Approximate nearest-neighbour search", "PostgreSQL 16 with pgvector 0.8.6, HNSW"],
              ["Access control", "Tenant isolation inside the query", "PostgreSQL row-level security, non-superuser role"],
              ["Reranking", "Reorder the shortlist", "BAAI/bge-reranker-base cross-encoder"],
              ["Generation", "Schema-constrained answers", "vLLM 0.27.1, xgrammar constrained decoding"],
              ["Golden set", "Query drafting and relevance judging", "Gemini, pinned to dated snapshots"],
              ["Site", "Static export, no runtime", "Next.js App Router, TypeScript, Tailwind CSS v4"],
              ["Figures", "Diagrams and charts", "Hand-written inline SVG — no chart library"],
            ].map(([a, b, d]) => (
              <tr key={a} className="border-b border-rule align-top">
                <th scope="row" className="text-left font-normal py-2 pr-4 text-ink">{a}</th>
                <td className="py-2 pr-4 text-ink-muted">{b}</td>
                <td className="py-2 text-ink-muted">{d}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Bleed>

      <h2 className="mt-14">5 · The corpus</h2>
      <Prose>
        {c ? (
          <p>
            {c.documents.toLocaleString()} documents, {c.pages.toLocaleString()}{" "}
            pages and {c.chunks.toLocaleString()} chunks across {c.tenants}{" "}
            {/* Bare, not expanded. Four full forms in one sentence buries the
                numbers it exists to report; each abbreviation carries its own
                definition on hover, and the corpus page spells them out. */}
            tenants, from <Abbr id="sec" /> <Abbr id="edgar" /> annual filings,
            the <Abbr id="cuad" /> contract set and <Abbr id="ietf" />{" "}
            <Abbr id="rfc" />s. Corpus id{" "}
            <span className="mono">{c.corpusId}</span>.
          </p>
        ) : (
          <p>No corpus has been ingested yet.</p>
        )}
        <p>
          Raw documents are not committed — the manifest is. It records source,
          identifier, URL, checksum, page count, licence and tenant per document,
          which is what lets someone reproduce the corpus without redistributing
          gigabytes.
        </p>
      </Prose>

      <h2 className="mt-14">6 · Key technical decisions</h2>
      <Prose>
        <ul className="list-disc pl-5 space-y-3">
          <li>
            <strong>Metrics implemented explicitly, without an evaluation
            framework.</strong> The scoring logic is the credibility of the
            project, so it is written to be read.
          </li>
          <li>
            <strong>Access control enforced in the database, not in application
            code.</strong> A forgotten filter in one query path is a data leak;
            a row-level security policy applies to every path.
          </li>
          <li>
            <strong>Access-control effects reported separately from headline
            numbers.</strong> Approximate search under a policy loses recall,
            and folding that into a headline figure would misattribute it to
            retrieval quality.
          </li>
          <li>
            <strong>Interactive demos replay committed measurements.</strong> The
            site has no backend, so every control moves over data captured by
            running the real pipeline offline. Nothing is simulated.
          </li>
          <li>
            <strong>No fabricated data anywhere.</strong> Empty states say what
            has not happened yet. An agreement rate is withheld rather than
            published when the sample cannot support it.
          </li>
        </ul>
      </Prose>

      <h2 className="mt-14">7 · Statement of origin</h2>
      <Prose>
        <blockquote className="border-l-2 border-rule pl-5">
          <p>
            Zeroth is an open reconstruction of a production
            confidential-document <Abbr id="rag" expand /> platform. The
            original was built for an
            employer over a private corpus and is not public. This is a
            from-scratch rebuild of the same architecture over public documents.
            Every number published here was measured on the public corpus
            described in the methodology, and applies only to it.
          </p>
        </blockquote>
      </Prose>

      <h2 className="mt-14">8 · Glossary</h2>
      <Prose>
        <p>
          Every abbreviation the paper uses, written out. In the prose each one
          also carries its full form on hover or focus; this is the list for
          reading straight through.
        </p>
      </Prose>
      <Glossary />

      <h2 className="mt-14">9 · References</h2>
      <Prose>
        <p>
          The works this project is built on and measured against. Each entry
          names the part of the paper that relies on it. Where a claim here
          rests on someone else&apos;s result rather than on a measurement of
          this system, the citation is the difference between an argument and
          an assertion.
        </p>
      </Prose>
      <References />

      <h2 className="mt-14">10 · Citation</h2>
      {site ? (
        <Cite
          corpusId={c?.corpusId ?? null}
          year={site.first_published_year}
          url={site.canonical_url}
          publisher={site.publisher}
          author={site.author}
          provisional={site.url_status === "provisional"}
          urlNote={site.url_note}
        />
      ) : null}

      <h2 className="mt-14">11 · Author and links</h2>
      <Prose>
        <p>
          Built by Anant Sharma. AI Engineer who builds production Python
          systems that think in steps — agentic workflows, retrieval pipelines,
          and orchestration middleware where every output is gated by automated
          evals before it ships. A year and more turning generative AI research
          into shipped infrastructure. The project carries the platform, the
          harness, the corpus manifest and this site.
        </p>
      </Prose>
      <ul className="link-cards mt-5">
        {(site?.author_links ?? []).map((l) => (
          <li key={l.href}>
            <a href={l.href} target="_blank" rel="noopener noreferrer" className="link-card">
              <span className="link-card-icon" aria-hidden="true">
                {l.icon === "linkedin" ? <LinkedInIcon /> : <GlobeIcon />}
              </span>
              <span>
                <span className="link-card-label">{l.label}</span>
                <span className="link-card-sub">{l.sub}</span>
              </span>
            </a>
          </li>
        ))}
      </ul>
    </>
  );
}
