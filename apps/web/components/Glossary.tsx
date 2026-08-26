import { abbreviationList } from "@/lib/abbreviations";
import { getMetrics } from "@/lib/metrics";
import { FAMILY_LABEL, TAG_LABEL } from "@/lib/families";

/**
 * Every abbreviation used in the paper, written out once in one place.
 *
 * Three sources, deliberately not merged into one alphabet: a reader looking
 * up "GRD" and a reader looking up "CUAD" are asking different questions, and
 * a single A-Z list makes both of them scan the whole thing. Within each group
 * the order is alphabetical.
 *
 * Server component — it reads the metric content layer at build time. Nothing
 * here is interactive, so there is no reason to ship it to the browser.
 */
export function Glossary() {
  const abbrs = abbreviationList();

  // Only metrics whose name is actually abbreviated carry an expansion.
  const metrics = [...getMetrics().values()]
    .filter((m) => m.expansion)
    .sort((a, b) => a.name.localeCompare(b.name));

  const tags = Object.entries(TAG_LABEL).sort(([a], [b]) => a.localeCompare(b));

  return (
    <div className="glossary">
      <section>
        <h3 className="eyebrow">Family tags</h3>
        <dl className="glossary-list">
          {tags.map(([tag, label]) => (
            <div key={tag} className="glossary-row">
              <dt>{tag}</dt>
              <dd>{label}</dd>
            </div>
          ))}
        </dl>
      </section>

      {metrics.length ? (
        <section className="mt-8">
          <h3 className="eyebrow">Metric names</h3>
          <dl className="glossary-list">
            {metrics.map((m) => (
              <div key={m.id} className="glossary-row">
                <dt>{m.name}</dt>
                <dd>
                  {m.expansion}
                  <span className="glossary-note">
                    {FAMILY_LABEL[m.family]}
                  </span>
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}

      <section className="mt-8">
        <h3 className="eyebrow">Terms</h3>
        <dl className="glossary-list">
          {abbrs.map((a) => (
            <div key={a.id} className="glossary-row">
              <dt>{a.short}</dt>
              <dd>
                {a.full}
                {a.note ? <span className="glossary-note">{a.note}</span> : null}
              </dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
