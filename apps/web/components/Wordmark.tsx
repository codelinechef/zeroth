/**
 * The two ordinal wordmarks.
 *
 * NthLabs and Zeroth are the same joke twice: both are ordinals, and both set
 * their "th" as a raised suffix — N<sup>th</sup> Labs, Zero<sup>th</sup>. That
 * shared device is the identity. It is also why they must be built from one
 * file: if the superscript metrics drift apart the pair stops reading as a
 * system and starts reading as two typos.
 *
 * Both return phrasing content only, so either is safe inside a <p>.
 *
 * `font-variant-position: super` would be the correct typographic route and is
 * deliberately not used: Archivo ships no superior glyphs, so browsers fall
 * back to full-size text with no warning. The raise is done with explicit
 * metrics in globals.css instead.
 */

/** Parent company. The mark that sits above the paper. */
export function NthLabs({ className = "" }: { className?: string }) {
  return (
    <span className={`ord-mark nthlabs ${className}`}>
      {/* One accessible name for the whole mark: walking the <sup> otherwise
          reads it out as three separate fragments. */}
      <span aria-hidden="true">
        N<sup>th</sup>Labs
      </span>
      <span className="sr-only">NthLabs</span>
    </span>
  );
}

/**
 * The project. "Zero" carries the weight and "th" rides on the shoulder of the
 * final o, the way an ordinal is set — 0<sup>th</sup>.
 */
export function Zeroth({ className = "" }: { className?: string }) {
  return (
    <span className={`ord-mark zeroth ${className}`}>
      <span aria-hidden="true">
        Zero<sup>th</sup>
      </span>
      <span className="sr-only">Zeroth</span>
    </span>
  );
}
