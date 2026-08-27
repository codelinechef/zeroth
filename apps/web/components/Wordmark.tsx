/**
 * The two ordinal wordmarks: Zeroth, a research project by NthLabs.
 *
 * Both names are ordinals and both raise their "th" — Zero<sup>th</sup> and
 * N<sup>th</sup>Labs. That shared device is the identity, and it is why they
 * live in one file: if the superscript metrics drift apart the pair stops
 * reading as a system and starts reading as two typos.
 *
 * Brand architecture is ENDORSED, not co-branded. Every AI lab converges on
 * the same arrangement — the work carries the headline and the organisation
 * appears beside it in a smaller, separate register. AlphaFold is not
 * "AlphaFold by Google DeepMind" in its own header; Claude is not "Claude by
 * Anthropic". Putting the parent inside the lockup makes the project read as
 * a division rather than as a piece of work. So Zeroth is set at display size
 * and NthLabs endorses beneath it at caption size.
 *
 * Both return phrasing content only, so either is safe inside a <p>.
 *
 * `font-variant-position: super` would be the correct typographic route and is
 * deliberately not used: Archivo ships no superior glyphs, so browsers fall
 * back to full-size text with no warning. The raise is set with explicit
 * metrics in globals.css instead.
 */

/**
 * The project. Carries the headline. "Zero" takes the weight and "th" rides
 * the shoulder of the final o, the way an ordinal is set — 0<sup>th</sup>.
 */
export function Zeroth({ className = "" }: { className?: string }) {
  return (
    <span className={`ord-mark zeroth ${className}`}>
      {/* One accessible name for the whole mark: walking the <sup> otherwise
          reads it out as separate fragments. */}
      <span aria-hidden="true">
        Zero<sup>th</sup>
      </span>
      <span className="sr-only">Zeroth</span>
    </span>
  );
}

/** The parent. Endorses; never competes. */
export function NthLabs({ className = "" }: { className?: string }) {
  return (
    <span className={`ord-mark nthlabs ${className}`}>
      <span aria-hidden="true">
        N<sup>th</sup>Labs
      </span>
      <span className="sr-only">NthLabs</span>
    </span>
  );
}
