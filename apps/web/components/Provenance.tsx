/**
 * Every visualisation states the script that produced its data and the command
 * that regenerates it — Part 5 of the brief. Attached to the figure rather than
 * collected in a README, so it cannot drift from what it describes.
 */
export function Provenance({
  script, regenerate, commit, at, extra,
}: {
  script: string; regenerate: string; commit: string; at: string;
  extra?: string;
}) {
  return (
    <p className="mono text-[length:var(--t-75)] text-ink-muted mt-2">
      Data: <span className="text-ink">{script}</span> · regenerate with{" "}
      <code>{regenerate}</code> · commit {commit} · {at.slice(0, 10)}
      {extra ? ` · ${extra}` : ""}
    </p>
  );
}
