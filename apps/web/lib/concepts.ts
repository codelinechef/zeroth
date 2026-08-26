import { getMetrics } from "./metrics";
import { getTopics } from "./learn";
import { getFailureModes } from "./failureModes";

/**
 * The cross-reference index: what connects to what.
 *
 * Built entirely from ids the content layer already carries — metrics name the
 * failure modes that threaten them, failure modes name the metrics they
 * corrupt, topics name each other. Nothing here is authored; this module only
 * inverts and joins relationships that were already written down, which is why
 * it costs nothing to keep current.
 *
 * scripts/check-refs.mjs guarantees every id below resolves, so the renderer
 * never has to handle a missing target.
 */
export type ConceptLink = { kind: "metric" | "failure" | "topic"; id: string; label: string; href: string };

export type ConceptNode = {
  kind: "metric" | "failure" | "topic";
  id: string;
  label: string;
  href: string;
  /** What this concept points at, and what points back at it. */
  links: ConceptLink[];
};

export function conceptIndex(): { group: string; nodes: ConceptNode[] }[] {
  const metrics = getMetrics();
  const topics = getTopics();
  const failures = getFailureModes();

  const metricLink = (id: string): ConceptLink | null => {
    const m = metrics.get(id);
    return m ? { kind: "metric", id, label: m.name, href: "/methodology/#metrics" } : null;
  };
  const topicLink = (id: string): ConceptLink | null => {
    const t = topics.find((x) => x.id === id);
    return t ? { kind: "topic", id, label: t.title, href: `/learn/${id}/` } : null;
  };
  const failureLink = (id: string): ConceptLink | null => {
    const f = failures.find((x) => x.id === id);
    return f ? { kind: "failure", id, label: f.title, href: "/failure-modes/" } : null;
  };

  const keep = (xs: (ConceptLink | null)[]) =>
    xs.filter((x): x is ConceptLink => !!x);

  // Inverted edges: which metrics each failure mode is named by.
  const failureToMetrics = new Map<string, string[]>();
  for (const m of metrics.values()) {
    for (const f of m.failure_modes) {
      failureToMetrics.set(f, [...(failureToMetrics.get(f) ?? []), m.id]);
    }
  }

  return [
    {
      group: "Metrics",
      nodes: [...metrics.values()]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((m) => ({
          kind: "metric" as const,
          id: m.id,
          label: m.name,
          href: "/methodology/#metrics",
          links: keep([
            ...m.failure_modes.map(failureLink),
            ...m.related.map(metricLink),
          ]),
        })),
    },
    {
      group: "Failure modes",
      nodes: failures
        .slice()
        .sort((a, b) => a.title.localeCompare(b.title))
        .map((f) => ({
          kind: "failure" as const,
          id: f.id,
          label: f.title,
          href: "/failure-modes/",
          links: keep([
            ...f.metrics.map(metricLink),
            // Metrics that name this failure mode but which it does not name back.
            ...(failureToMetrics.get(f.id) ?? [])
              .filter((id) => !f.metrics.includes(id))
              .map(metricLink),
            ...(topics.some((t) => t.id === f.id) ? [topicLink(f.id)] : []),
          ]),
        })),
    },
    {
      group: "Concepts",
      nodes: topics
        .slice()
        .sort((a, b) => a.title.localeCompare(b.title))
        .map((t) => ({
          kind: "topic" as const,
          id: t.id,
          label: t.title,
          href: `/learn/${t.id}/`,
          links: keep([
            ...t.related.map(topicLink),
            ...t.interacts_with.filter((i) => !t.related.includes(i)).map(topicLink),
            ...(failures.some((f) => f.id === t.id) ? [failureLink(t.id)] : []),
          ]),
        })),
    },
  ];
}
