/**
 * Unbuilt sections — brief §13.
 *
 * States what the section will contain, which phase delivers it, and what has
 * to happen first, so a reader sees a dependency chain rather than a promise.
 *
 * Hard rule: this never renders a number, not even greyed out or illustrative.
 * One plausible figure in a placeholder makes every real figure on the site
 * suspect.
 */
export function InProgress({
  phase,
  children,
  blockedBy,
}: {
  phase: number;
  /** What the section will contain, concretely. */
  children: React.ReactNode;
  /** What has to land first. */
  blockedBy?: string;
}) {
  return (
    <div className="border border-rule px-5 py-4">
      <p className="eyebrow">In progress — Phase {phase}</p>
      <p className="mt-2 text-ink-muted max-w-[60ch]">{children}</p>
      {blockedBy ? (
        <p className="mt-2 mono text-[length:var(--t-75)] text-ink-muted">
          Waiting on {blockedBy}
        </p>
      ) : null}
    </div>
  );
}
