/**
 * Paper primitives — brief §3.
 *
 * Prose stays at the measure; figures, tables and diagrams break out of it.
 * That contrast is much of what makes the page read as a paper.
 */

export function Prose({ children, className = "" }: {
  children: React.ReactNode; className?: string;
}) {
  return <div className={`prose-measure ${className}`}>{children}</div>;
}

/**
 * A margin note. At >=1100px it floats into the right margin, aligned to the
 * point in the text where it appears; below that it becomes an indented aside
 * in normal flow.
 */
export function MarginNote({ label, children }: {
  label?: string; children: React.ReactNode;
}) {
  return (
    <aside className="margin-note">
      {label ? <span className="eyebrow block mb-1">{label}</span> : null}
      {children}
    </aside>
  );
}

/** Full-bleed container for figures, tables and diagrams. */
export function Bleed({ children, scroll = false, className = "" }: {
  children: React.ReactNode; scroll?: boolean; className?: string;
}) {
  return (
    <div className={`bleed ${scroll ? "bleed-scroll" : ""} ${className}`}>
      {children}
    </div>
  );
}

export function Figure({ n, caption, children }: {
  n: number; caption: string; children: React.ReactNode;
}) {
  return (
    <figure className="bleed">
      <div className="bleed-scroll border border-rule bg-paper">{children}</div>
      <figcaption>
        <span className="text-ink">Figure {n}.</span> {caption}
      </figcaption>
    </figure>
  );
}
