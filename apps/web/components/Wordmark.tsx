/**
 * nthlabs imprint.
 *
 * Set in the display face at caption size, letterspaced, in muted ink — a
 * journal imprint above the paper title, not a logo competing with it. The
 * page title is the loudest thing in the header and stays that way.
 *
 * The "th" is a real <sup>, so it reads as an ordinal (n-th) rather than a
 * brand stylisation. `font-variant-position` would be cleaner typographically
 * but Archivo carries no synthesised superior figures, so the browser would
 * silently fall back to full-size text. Explicit sizing is the reliable route.
 *
 * Returns phrasing content only, so it is safe inside a <p>.
 */
export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`wordmark ${className}`}>
      {/* One accessible name for the whole mark: a screen reader that walks the
          <sup> reads "n th labs" as three fragments. */}
      <span aria-hidden="true">
        n<sup>th</sup>labs
      </span>
      <span className="sr-only">nthlabs</span>
    </span>
  );
}
