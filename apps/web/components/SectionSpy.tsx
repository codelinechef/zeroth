"use client";

import { useEffect, useState } from "react";

type Section = { id: string; text: string };

/**
 * Sub-index of the current page's sections, with the one being read marked.
 *
 * Built from the DOM after mount rather than from a manifest, so it cannot
 * drift out of sync with the prose — a hand-kept list of section titles is
 * wrong the first time someone edits a heading and never noticed.
 *
 * Two consequences of that choice, both deliberate:
 *
 *   - It renders nothing on the server. Returning a list during SSR that the
 *     client then rebuilds is a hydration mismatch, and the whole page gets
 *     re-rendered on the client when React finds one.
 *   - Headings without an id get one assigned here, slugified from their text.
 *     The ids therefore exist only once JavaScript has run, which is fine for
 *     a navigation aid but is why nothing else may depend on them.
 */
export function SectionSpy() {
  const [sections, setSections] = useState<Section[]>([]);
  const [current, setCurrent] = useState<string | null>(null);

  useEffect(() => {
    const main = document.getElementById("main");
    if (!main) return;

    let raf = 0;
    let observer: IntersectionObserver | null = null;

    const seen = new Set<string>();
    const found: Section[] = [];

    for (const h of Array.from(main.querySelectorAll("h2"))) {
      const text = (h.textContent || "").trim();
      if (!text) continue;
      if (!h.id) {
        const base = text
          .toLowerCase()
          .replace(/[·—–]/g, " ")
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "") || "section";
        // Headings like "2.1 Metrics" and "2.1 Metrics" elsewhere would collide.
        let slug = base, n = 2;
        while (seen.has(slug)) slug = `${base}-${n++}`;
        h.id = slug;
      }
      if (seen.has(h.id)) continue;
      seen.add(h.id);
      found.push({ id: h.id, text });
    }

    if (found.length < 2) return; // a one-section page needs no sub-index

    // Publishing on the next frame rather than synchronously here. Setting
    // state in the body of an effect makes React render twice back-to-back,
    // and this list is a navigation aid arriving after paint either way. The
    // frame also lets the ids assigned above settle before anything observes
    // them.
    raf = requestAnimationFrame(() => {
      setSections(found);

      // rootMargin pins the trigger line near the top of the viewport: a
      // heading counts as "current" once it reaches the upper third, which is
      // where a reader's eye actually is, rather than when it first appears at
      // the bottom of the screen.
      observer = new IntersectionObserver(
        (entries) => {
          const visible = entries
            .filter((e) => e.isIntersecting)
            .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
          if (visible[0]) setCurrent(visible[0].target.id);
        },
        { rootMargin: "0px 0px -66% 0px", threshold: 0 }
      );
      for (const s of found) {
        const el = document.getElementById(s.id);
        if (el) observer.observe(el);
      }
    });

    return () => {
      cancelAnimationFrame(raf);
      observer?.disconnect();
    };
  }, []);

  if (sections.length === 0) return null;

  return (
    <ol className="section-spy" aria-label="Sections on this page">
      {sections.map((s) => (
        <li key={s.id}>
          <a
            href={`#${s.id}`}
            aria-current={current === s.id ? "location" : undefined}
            className={current === s.id ? "is-current" : ""}
          >
            {s.text}
          </a>
        </li>
      ))}
    </ol>
  );
}
