import { getPositioning } from "@/lib/positioning";

/**
 * The honest assessment of what this is.
 *
 * On the page rather than in a README because the claim it corrects is one
 * the site itself would otherwise make. A project that says "research paper"
 * with no results is overclaiming; saying so in public is cheaper than being
 * caught, and it is the same argument the empty results table makes.
 */
export function Positioning() {
  const p = getPositioning();
  if (!p) return null;

  return (
    <div className="positioning">
      <p className="positioning-claim">{p.positioning.claim}</p>
      <p className="positioning-why">{p.positioning.why_this_one}</p>

      <h3>What it is not</h3>
      <dl className="practice-list">
        {p.positioning.rejected.map((r) => (
          <div key={r.label} className="practice-row">
            <dt>{r.label}</dt>
            <dd>{r.why}</dd>
          </div>
        ))}
      </dl>

      <h3>What is actually differentiated</h3>
      <p className="prose-measure">
        Four things, and the caveat beside each is part of the claim rather
        than a hedge attached to it.
      </p>
      <div className="decisions mt-4">
        {p.novelty.map((n) => (
          <article key={n.claim} className="decision">
            <header>
              <p className="eyebrow">{n.strength}</p>
              <h4>{n.claim}</h4>
            </header>
            <p className="decision-body">{n.detail}</p>
            {n.honest_caveat ? (
              <p className="decision-caveat">{n.honest_caveat}</p>
            ) : null}
          </article>
        ))}
      </div>

      <h3>What is established technique</h3>
      <ul className="list-disc pl-5 space-y-2 prose-measure">
        {p.established.map((e) => <li key={e}>{e}</li>)}
      </ul>

      <h3>Why this is not a PDF</h3>
      <dl className="practice-list">
        {p.why_digital.map((w) => (
          <div key={w.affordance} className="practice-row">
            <dt>{w.affordance}</dt>
            <dd>{w.detail}</dd>
          </div>
        ))}
      </dl>

      <h3>What would change the claim</h3>
      <ul className="list-disc pl-5 space-y-2 prose-measure">
        {p.what_would_change_the_claim.map((c) => <li key={c}>{c}</li>)}
      </ul>
    </div>
  );
}
