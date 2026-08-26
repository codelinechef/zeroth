import Link from "next/link";
import { conceptIndex } from "@/lib/concepts";

/**
 * The cross-reference index — every concept and what it connects to.
 *
 * Rendered as a definition list rather than a node-and-edge diagram. A
 * force-directed graph of 48 nodes is a hairball at this size, needs a layout
 * library the site otherwise does without, and cannot be read by keyboard or
 * screen reader. A structured index is navigable, works with JavaScript off,
 * and is the form a paper's index has taken for centuries.
 */
export function ConceptIndex() {
  const groups = conceptIndex();
  return (
    <div className="concept-index">
      {groups.map((g) => (
        <section key={g.group}>
          <h3 className="eyebrow">{g.group}</h3>
          <dl>
            {g.nodes.map((n) => (
              <div key={`${n.kind}-${n.id}`} className="concept-row">
                <dt>
                  {n.kind === "topic" ? (
                    <Link href={n.href}>{n.label}</Link>
                  ) : (
                    <span>{n.label}</span>
                  )}
                </dt>
                <dd>
                  {n.links.length ? (
                    n.links.map((l, i) => (
                      <span key={`${l.kind}-${l.id}`}>
                        {i > 0 ? <span aria-hidden="true"> · </span> : null}
                        {l.kind === "topic" ? (
                          <Link href={l.href} className="concept-link">{l.label}</Link>
                        ) : (
                          <span className={`concept-link is-${l.kind}`}>{l.label}</span>
                        )}
                      </span>
                    ))
                  ) : (
                    <span className="text-ink-muted">no cross-references</span>
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}
