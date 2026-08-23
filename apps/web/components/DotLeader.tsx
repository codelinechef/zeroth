/**
 * A specification dot leader — brief §7.
 *
 *     Recall@10 ............ 0.912    +0.084
 *     Cost per query ....... $0.0031  +$0.0009
 *
 * The whole line is emitted as ONE pre-formatted monospace text run, so the
 * label, the dots, the value and the delta cannot drift out of alignment at
 * any width. The dots are real characters occupying real columns — there is no
 * CSS border trick — and the value always begins at the same column, so values
 * of different lengths still line up down the page.
 *
 * The visual line is hidden from assistive technology (a screen reader
 * announcing twenty full stops is noise); a plain label/value pair is exposed
 * in its place.
 */

export const LEADER_COLS = 52;
/** Column at which every value begins. */
const VALUE_START = 34;
const VALUE_COLS = 9;

export function DotLeader({
  label,
  value,
  delta,
  valueStart = VALUE_START,
}: {
  label: string;
  /** Rendered as given. An em dash means "not measured yet". */
  value: string;
  delta?: string;
  valueStart?: number;
}) {
  const room = valueStart - label.length - 2; // one space either side of dots
  // A label too long for the grid keeps its leader by giving up characters,
  // rather than pushing the value column out of alignment.
  const shown = room < 1 ? label.slice(0, valueStart - 4) + "…" : label;
  const dots = Math.max(1, valueStart - shown.length - 2);
  const head = `${shown} ${".".repeat(dots)} `;
  const line = delta ? head + value.padEnd(VALUE_COLS, " ") : head + value;

  return (
    <span className="block">
      <span className="leader-line" aria-hidden="true">
        {line}
        {delta ? (
          <span className={delta.startsWith("-") ? "text-regress" : "text-signal"}>
            {delta}
          </span>
        ) : null}
      </span>
      <span className="sr-only">
        {label}: {value}
        {delta ? `, change ${delta}` : ""}
      </span>
    </span>
  );
}
