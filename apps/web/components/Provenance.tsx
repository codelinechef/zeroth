/**
 * Every visualisation states what produced its data, from which commit, and
 * when. Attached to the figure rather than collected in a README, so it cannot
 * drift from what it describes.
 *
 * Repository paths are deliberately NOT shown. They describe a filesystem the
 * reader does not have, and with no public repository linked from this site
 * they cannot be acted on — so the directory is stripped and only the tool
 * name is kept. What makes the figure checkable is the commit and the corpus
 * id, which are here.
 */
function toolName(p: string): string {
  return p.split("/").pop() ?? p;
}
export function Provenance({
  script, commit, at, extra,
}: {
  script: string; commit: string; at: string;
  /** Accepted and ignored: callers spread a provenance block wholesale. */
  regenerate?: string;
  extra?: string;
}) {
  return (
    <p className="mono text-[length:var(--t-75)] text-ink-muted mt-2">
      Produced by <span className="text-ink">{toolName(script)}</span> · commit{" "}
      {commit} · {at.slice(0, 10)}
      {extra ? ` · ${extra}` : ""}
    </p>
  );
}
