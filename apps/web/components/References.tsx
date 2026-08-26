import { referencesByGroup } from "@/lib/references";

/**
 * The bibliography.
 *
 * Grouped by what each work supports rather than alphabetically: a reader who
 * wants to check the fusion claim should not have to know the author's name to
 * find the citation. Each entry names the part of the paper that leans on it,
 * so a claim can be traced to a source and back.
 *
 * Links open in a new tab with rel="noopener noreferrer" — these are the only
 * outbound links on the site, and the referrer policy is already `no-referrer`.
 */
export function References() {
  const groups = referencesByGroup();
  if (groups.length === 0) return null;

  return (
    <div className="refs">
      {groups.map(([group, refs]) => (
        <section key={group}>
          <h3 className="eyebrow">{group}</h3>
          <ol className="refs-list">
            {refs.map((r) => (
              <li key={r.id} id={`ref-${r.id}`}>
                <p className="refs-cite">
                  {r.authors}{" "}
                  {r.year ? <span className="refs-year">({r.year})</span> : null}{" "}
                  <a href={r.url} target="_blank" rel="noopener noreferrer">{r.title}</a>
                  {r.venue ? <span className="refs-venue">. {r.venue}.</span> : null}
                </p>
                <p className="refs-note">
                  <span className="refs-where">{r.where}</span>
                  {" — "}{r.note}
                </p>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}
