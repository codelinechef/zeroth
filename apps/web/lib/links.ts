/**
 * Outbound author links.
 *
 * The URLs themselves live in content/site.json, not here. scripts/check-refs
 * fails the build on a URL authored inside a component or lib module — a
 * hardcoded address once shipped a domain that had never been registered, and
 * the rule that prevents a repeat is that code renders URLs but never writes
 * them.
 */
export type AuthorLink = {
  label: string;
  sub: string;
  href: string;
  icon: "linkedin" | "globe";
};
