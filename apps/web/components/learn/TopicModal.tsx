"use client";

import { useEffect, useRef } from "react";
import type { Topic } from "@/lib/learn";

/**
 * Centred topic modal — one <dialog> per topic, rendered once at page level
 * outside the prose tree so nothing block-level lands inside a paragraph.
 *
 * <dialog> supplies focus trapping and Escape dismissal from the platform. The
 * body has its own scroll container so a long explanation stays usable without
 * moving the page behind it.
 */
export function TopicModal({ topic, children }: {
  topic: Topic; children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const sync = () =>
      document.documentElement.classList.toggle("modal-open", el.open);
    const obs = new MutationObserver(sync);
    obs.observe(el, { attributes: true, attributeFilter: ["open"] });
    return () => {
      obs.disconnect();
      document.documentElement.classList.remove("modal-open");
    };
  }, []);

  return (
    <dialog
      ref={ref}
      id={`topic-${topic.id}`}
      className="topic-modal"
      aria-labelledby={`topic-${topic.id}-title`}
    >
      <div className="topic-modal-head">
        <div className="min-w-0">
          <p className="eyebrow">{topic.category}</p>
          <h2 id={`topic-${topic.id}-title`} className="mt-1 text-[length:var(--t-150)]">
            {topic.title}
          </h2>
        </div>
        <form method="dialog" className="shrink-0">
          <button className="topic-close" aria-label={`Close ${topic.title}`}>
            Close
          </button>
        </form>
      </div>
      <div className="topic-modal-body">{children}</div>
    </dialog>
  );
}

/** Inline trigger. Phrasing content only — it sits inside list items. */
export function TopicTrigger({ topic }: { topic: Topic }) {
  const open = () => {
    const el = document.getElementById(`topic-${topic.id}`);
    if (el instanceof HTMLDialogElement) el.showModal();
  };
  return (
    <button
      type="button"
      onClick={open}
      aria-haspopup="dialog"
      aria-controls={`topic-${topic.id}`}
      className="topic-trigger"
    >
      <span className="topic-trigger-title">{topic.title}</span>
      <span className="topic-trigger-summary">{topic.summary}</span>
    </button>
  );
}
