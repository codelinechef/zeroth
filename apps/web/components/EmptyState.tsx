/**
 * Honest empty states — brief §3.3 and the copy voice in §7.
 * States what has not happened yet. Never a skeleton of invented numbers,
 * never a placeholder figure.
 */
export function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="border border-rule px-5 py-6 text-ink-muted">
      <p className="max-w-[60ch]">{children}</p>
    </div>
  );
}
