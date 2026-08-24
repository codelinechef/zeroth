# TASK: Redesign the Zeroth Web App — Research Paper Direction

Redesign `apps/web` so the site reads like a **modern research paper** rather than a documentation site, and make every published number explorable — a reader who wants to know how a metric was computed should be able to find out without leaving the page.

Read `docs/ZEROTH_BUILD_BRIEF_V2.md` §3 (the current design system) before starting. This is an evolution of that direction, not a replacement — read §"What carries over" below.

---

## 0. WHAT EXISTS NOW

Next.js static export, nine routes, a six-colour token set, three typefaces, a numbered clause index, dot-leader alignment, and honest empty states. Lighthouse 100 on every route.

**Critically: `content/board/` is empty.** No benchmark runs exist yet — they arrive in Phase 5. Everything you build must work correctly with no data, and must never display a number that did not come from a real run.

---

## 1. THE DIRECTION

**From:** a published specification — RFC vernacular, clause numbering, dot leaders, restrained ink.

**To:** a modern research paper — the kind published on a good academic group's site rather than typeset for print. Think of the papers people actually enjoy reading online: generous typography, figures with captions, margin notes, and interactive explanations of the hard parts.

### What carries over

- **Colour always means something.** This is non-negotiable even as the palette expands. In a benchmark, a reader must be able to trust that a coloured element is coloured *because of what it is*, not for visual interest
- **No fabricated data, anywhere.** Not in a placeholder, not in a screenshot, not in a design fixture rendered to production
- **Honest empty states.** "No runs yet — the first publishes once the baseline completes," never "Coming soon"
- **Accessibility floor:** Lighthouse ≥ 95, visible keyboard focus, `prefers-reduced-motion` respected, semantic HTML, works at 360px

### What changes

- Serif becomes the primary reading face; the page reads like prose, not like a spec
- Display type gets substantially larger and more confident
- Figures become first-class — numbered, captioned, referenced from the text
- The palette expands, but every new colour is assigned a meaning
- Metrics become interactive rather than static

---

## 2. TYPOGRAPHY

Three faces are already loaded — Archivo, IBM Plex Mono, Source Serif 4. **Rebalance their roles rather than adding more.** Every additional webfont costs load time, and three is enough for a clear hierarchy.

| Role | Face | Notes |
|---|---|---|
| **Display** | Archivo, or swap to a high-contrast editorial serif | Large. Paper titles are the largest thing on the page and should feel it |
| **Body prose** | Source Serif 4 | Now the primary reading face. Papers are read in serif |
| **Data, UI, code, captions** | IBM Plex Mono | All numbers, table cells, figure labels, clause references |

**If you want a serif display face**, propose one and explain the pairing before switching. Candidates worth considering: Newsreader, Instrument Serif, Spectral. Do not add a fourth family without removing one.

**Scale.** Extend the existing rem scale upward for display sizes. Page title should be dramatically larger than section headings — that contrast is much of what makes a paper feel like a paper.

**Measure.** Body prose stays capped for readability. The current 72-character cap references RFC line width; for a paper direction, 62–68 characters is the more conventional range. Pick one, apply it consistently, and say why in a comment.

---

## 3. LAYOUT — READ THIS BEFORE BUILDING TWO COLUMNS

The request is a two-column paper layout. **Two columns on the web usually fail**, and it is worth understanding why before implementing it.

Print papers are two-column because the page is a fixed physical height — your eye reaches the bottom of column one and moves to the top of column two, a short journey. A web page scrolls indefinitely. Two columns mean the reader scrolls to the bottom of column one, scrolls all the way back up, and reads column two. It is genuinely unpleasant, and on mobile it collapses to one column anyway.

**Build this instead** — it reads as a paper without the failure mode:

```
┌──────────────────────────────────────────────────────────────┐
│                                                              │
│              ZEROTH                        ← display, large  │
│              A reproducible benchmark of                     │
│              end-to-end RAG pipeline quality                 │
│              ─────────────────────────────                   │
│              Anant Sharma · 2026                             │
│                                                              │
├────────────┬─────────────────────────────────┬───────────────┤
│            │                                 │               │
│  CONTENTS  │   Abstract                      │   § 2.1       │
│            │   ─────────────────────────     │   Recall@10   │
│  1 Board   │   Serif prose, ~65ch, generous  │   measures    │
│  2 Method  │   leading. Reads like a paper.  │   whether…    │
│  3 Corpus  │                                 │               │
│  4 Runs    │   ┌───────────────────────────┐ │   ← margin    │
│  5 Repro   │   │  Figure 1 — full width    │ │     notes,    │
│            │   │  breaks the measure       │ │     glossary  │
│  (sticky)  │   └───────────────────────────┘ │     asides    │
│            │   Fig 1. Caption in mono.       │               │
│            │                                 │               │
└────────────┴─────────────────────────────────┴───────────────┘
```

**Three zones:** sticky numbered contents on the left, a single readable prose column in the centre, and a margin column on the right for asides, definitions and figure references.

The margin column is what actually produces the paper feel — it is how well-typeset academic writing has always worked, and it gives you somewhere to put explanation without interrupting the argument.

**Responsive:** below ~1100px the margin column folds into the flow as indented asides. Below ~900px the contents rail becomes a top drawer. At 360px everything is a single column with no horizontal scroll.

**Full-bleed exceptions:** figures, the results table, and diagrams break out of the prose measure and use the full width. That contrast — narrow prose, wide figures — is a large part of the effect.

---

## 4. COLOUR

The palette expands, but the rule holds: **every colour carries meaning.**

Keep the existing six tokens as the base. Add a **metric-family encoding** — one hue per family, used consistently everywhere that family appears:

| Family | Metrics |
|---|---|
| Retrieval | Recall@k, NDCG@k, MRR, context precision |
| Grounding | Faithfulness, citation accuracy, citation coverage |
| Abstention | Correct abstention rate |
| Performance | Latency percentiles |
| Cost | Cost per query |

Then a reader learns the mapping once and can scan a dense table by hue. That is colour doing work.

**Keep `--signal` and `--regress` reserved exclusively for deltas** — better and worse than baseline. Do not reuse those hues for a metric family, or a delta becomes ambiguous.

**Constraints:** every pairing meets WCAG AA. Nothing depends on colour alone — pair hue with a label, an icon, or a position. Around 8% of men have some colour vision deficiency, and this is a technical audience.

Propose the palette with hex values and contrast ratios before implementing.

---

## 5. INTERACTIVE METRIC EXPLANATIONS — THE CENTRAL FEATURE

Every metric name in the site is interactive. Hover or focus reveals a short definition; click opens the full explanation.

The reference point is Distill.pub and the explorable-explanations tradition: the paper reads normally, and the reader who wants the mechanism can open it in place rather than hunting for a methodology page.

**Progressive disclosure, three levels:**

**Level 1 — inline.** The metric name is styled to indicate interactivity — a dotted underline in its family hue, not a link colour. It must be obvious it does something without looking like navigation.

**Level 2 — hover/focus popover.** Appears after ~150ms. Contains: one-sentence plain definition, the formula in mono, the typical range, and "click for detail". Dismisses on blur or Escape. **Must be keyboard reachable** — this is the accessibility trap in hover UIs, and a tooltip only reachable by mouse fails half your audience.

**Level 3 — expanded panel.** Click opens a side panel or inline expansion containing:

- **What it measures**, in plain language
- **The formula**, properly typeset
- **A worked example** using a real query from `data/golden/` — the actual question, the actual retrieved chunks, the actual arithmetic. Not a synthetic illustration
- **How this project computes it** — the exact function and file, linked to the repo
- **What can go wrong** — see §6. This is where the failure modes attach
- **Confidence interval method** — bootstrap resampling, why a point estimate from a few hundred queries is indefensible without one
- **Related metrics** — links to the others in its family

**Where the content lives:** a structured data file (`content/metrics/*.json` or MDX), not hardcoded in components. It is documentation and should be editable without touching React.

**Behaviour with no data:** definitions, formulas and failure modes are static and always available. Anything requiring a run says so plainly.

---

## 6. FAILURE MODES — MAKE THESE VISIBLE

A distinguishing feature, and the owner has asked for it specifically: **show what happens when things go wrong.**

Almost no benchmark does this. Publishing your failure modes is a strong credibility signal, and this project has unusually good material for it — the §14 investigations are a catalogue of ways a RAG evaluation can silently produce wrong numbers.

**Build a `/failure-modes` route**, and cross-link each entry from the metrics it threatens.

Source the content from `docs/investigations/FINDINGS.md` and `docs/known-issues.md`. Each entry gets:

- **What goes wrong**
- **Why it is invisible** — the unifying property of every one of these is that nothing throws an error
- **What it corrupts** — which specific published number becomes wrong
- **How this project detects or prevents it**
- **A visual** — see §7

**The entries, at minimum:**

| Failure | Effect |
|---|---|
| **ANN post-filtering under RLS** | Recall tracks how much corpus a role can see, not retrieval quality. Also inflates abstention — the system abstains because retrieval returned nothing, not because it judged evidence insufficient |
| **The planner flip** | Same query silently switches between exact and approximate execution. Recall moves *upward*, so it never looks like a bug — a run just scores higher on one machine |
| **Superuser RLS bypass** | Connect as `postgres` and every policy silently does nothing. All security tests pass for the wrong reason |
| **Table-owner RLS bypass** | Same effect, different cause. Needs `FORCE ROW LEVEL SECURITY` |
| **Judge sees draft labels** | Agreement measures conformity, not correctness. Inflates the published agreement rate |
| **`slug()` collision** | 26 real contracts silently dropped. Registration and extraction failed together, so the loss was invisible |
| **`MAX_TOKENS` truncation** | Half-written JSON parsed into real-looking records |
| **`lxml` `id()` reuse** | Page counts over-counted 3–5× |
| **Unpinned model reference** | A floating `-latest` alias means re-running months later silently changes the judge |

Frame these as *"here is what we checked for and how"* — not as an apology. That framing is the point.

---

## 7. DIAGRAMS

Figures are first-class: numbered, captioned in mono, referenced from prose, full-bleed.

**Build as inline SVG or lightweight React components — not images.** They need to respond to the theme, scale cleanly, and be readable by screen readers via `<title>` and `<desc>`.

### Priority order

**Figure 1 — The pipeline.** Query → hybrid retrieval (BM25 + dense, RRF fusion) → cross-encoder rerank → generation with constrained decoding → citation resolution → quote verification → abstention gate. Each stage links to its metrics. Mark clearly which stages are implemented versus planned.

**Figure 2 — ANN post-filtering.** The most important diagram on the site, and the hardest to explain in prose. A stepped or animated sequence: the index returns its `ef_search` nearest neighbours by distance → the RLS policy discards the ones this role cannot see → **nothing refills them** → the result is empty even though permitted matching documents exist.

Include the negative result, because it is what proves the point: raising `ef_search` from 40 to 800 changes nothing. With well-separated clusters, the 800 nearest neighbours all belong to the same tenant region. No search parameter fixes this. Partitioning is not an optimisation — it is the only thing that works.

**Figure 3 — Monolithic versus partitioned.** Side by side, showing why per-tenant partitions have nothing to post-filter away.

**Figure 4 — The planner flip.** One query, two execution plans, two different recall numbers, no error in between. Show the plan guard as the intervention.

**Figure 5 — The verification chain.** Draft → blind judge → stratified human sample → agreement rate. Emphasise that the judge never sees the drafter's labels, and why that is what makes the number mean anything.

**Figure 6 — Chunking strategies.** Fixed-token windows with overlap versus section-aware packing, over the same document, showing where boundaries land relative to clauses.

**Figure 7 — Corpus composition.** Sources, documents, pages, chunks, tenant distribution. Pull from the committed manifest — never hardcode.

**Figure 8 — Metric dependency graph.** Which metrics depend on which upstream properties. Makes it visible that a retrieval failure propagates into grounding and abstention numbers.

**Figure 9 — Cost/quality frontier.** Build the component; render an empty state until Phase 5 supplies runs.

---

## 8. MOTION

Restrained. One orchestrated moment per view, nothing ambient.

- Popovers: fade and slight rise, under 150ms
- Panels: slide, under 250ms
- Stepped diagrams: reader-driven — a step control, not autoplay
- Table rows: keep the existing typeset stagger

`prefers-reduced-motion: reduce` disables all of it and shows stepped diagrams in their final state. No parallax, no scroll-jacking, no counting-up numbers.

---

## 9. CONSTRAINTS

- **No fabricated data.** If a design fixture is needed, mark it unmistakably and exclude it from the production build
- **Static export must still work** — no server runtime, hosting stays free
- **Lighthouse ≥ 95** on accessibility and performance
- **Keyboard parity** — everything reachable by mouse is reachable by keyboard
- **360px** — no horizontal scroll
- **Font budget** — three families maximum, subset, self-hosted via `next/font`
- **No chart library.** Hand-rolled SVG. Library defaults would fight the typographic direction and add weight

---

## 10. WHAT NOT TO DO

- Don't build literal two-column body text (§3)
- Don't add colour that means nothing
- Don't autoplay animations
- Don't use hover-only reveals with no keyboard path
- Don't put explanation content in component files
- Don't seed the board with example numbers, however clearly labelled
- Don't add a fourth typeface

---

## 11. PROCESS

**Propose before building.** In your first response, give:

1. The typographic proposal — faces, roles, scale, measure, with reasoning
2. The colour palette — hex values, family assignments, contrast ratios
3. A layout wireframe for `/` and `/methodology` at desktop and mobile
4. The metric explanation data schema
5. Figure list with a one-line description of each visual approach
6. Anything in this spec you think is wrong, and why

**Wait for approval, then build in this order:**

1. Typography and colour tokens — nothing else works without these
2. Layout shell — three zones, responsive, footer (§12)
3. Metric explanation system — data schema, the three disclosure levels, one metric end to end as reference
4. Remaining metric content
5. `/failure-modes`
6. `InProgress` component, applied everywhere, plus `/roadmap` (§13)
7. Figures, in the priority order above
8. Apply across all routes
9. Accessibility and performance audit
10. `apps/web/README.md` (§14) and `docs/deploy.md` (§15)

Steps 1 and 2 are the ones to get right — typography and colour decisions cascade, and changing them later means redoing everything downstream.

Report at each step. Do not build all of it and present it finished — the typography and colour decisions cascade, and getting them wrong means redoing everything downstream.

---

## 12. FOOTER

Present on every route. Understated, in mono, separated from the content by a hairline rule.

**Must contain:**

- **Anant Sharma** — the author
- **AI Engineer** — the role
- **https://anantsharma.co.in/** — linked, opening in a new tab with `rel="noopener noreferrer"`
- A link to the project repository
- The corpus id and version the site's figures were measured against, so the footer itself carries provenance

Keep it to two or three lines. This is a paper's author block, not a marketing footer — no social icons, no newsletter form, no "built with" badges.

---

## 13. UNBUILT SECTIONS — "IN PROGRESS" TREATMENT

Most of this project does not exist yet. The site must say so in a way that reads as *deliberate sequencing* rather than *abandoned scaffolding*.

**Build a reusable `InProgress` component** used everywhere something is planned. It states:

- **What the section will contain**, concretely — not "coming soon"
- **Which phase delivers it**
- **What has to happen first**, so the reader sees a dependency chain rather than a vague promise

Something in this register:

> **In progress — Phase 5**
> Nine configurations, each differing from the baseline by exactly one factor. Waiting on the retrieval platform (Phase 2) and the evaluation harness (Phase 4).

**Apply to:**

| Surface | Phase |
|---|---|
| `/` — the board table | 5 |
| `/runs` | 5 |
| `/security` — red-team results | 3 |
| `/writing` | 6 |
| `/feed` | 7 |
| Figure 9 — cost/quality frontier | 5 |
| Any metric panel needing run data | 4 |

**Add a `/roadmap` route** showing all eight phases with status — done, in progress, planned — and what becomes visible publicly after each. A reader who wants to know what this becomes should be able to see the whole arc on one page.

**Tone:** confident and specific. "Nine configurations, one-factor-at-a-time, Phase 5" reads as a plan. "Coming soon!" reads as a placeholder someone forgot. Never use an exclamation mark, a rocket, or a construction emoji.

**Hard rule:** an in-progress state never shows a number, not even a greyed-out or illustrative one. The moment a reader sees a plausible figure in a placeholder, every real figure on the site becomes suspect.

---

## 14. LOCAL DEVELOPMENT — DOCUMENT IT

Write `apps/web/README.md` covering how to run and test the site locally. Assume a fresh clone.

**Cover:**

1. **Prerequisites** — Node version (verify against `package.json` engines, don't assume), package manager, and the note that this runs inside the `zeroth` WSL distro at `~/projects/zeroth`, never on `/mnt/c`
2. **Install** — the exact command
3. **Dev server** — command, the URL, and that WSL forwards the port so it opens in a Windows browser
4. **Production build locally** — how to build and serve the static export, and why this matters: static export behaves differently from dev, especially on route resolution, so a page can work in dev and 404 in production
5. **Every route to check**, including the 404
6. **Responsive check** — how to test 360px, and what should happen (rail collapses to a drawer, no horizontal scroll)
7. **Accessibility check** — running Lighthouse locally, and the two environment quirks already documented: Chrome segfaults on this WSL2 kernel, and Lighthouse's launcher misdetects WSL as Windows. Reference the working invocation in `docs/deploy.md`
8. **Keyboard testing** — tab through the metric popovers and panels, confirming everything reachable by mouse is reachable by keyboard and Escape dismisses
9. **Editing content** — where metric explanations, failure modes and figures live, and how to add one without touching a component
10. **Common problems** — port already in use, stale `.next` cache, font not loading, styles not applying after a token change

Keep it to commands and expected output. No prose about what Next.js is.

---

## 15. DEPLOYMENT — FULL STEP-BY-STEP GUIDE

Write `docs/deploy.md` — or update it if it exists — as a complete guide. Assume the reader has not used Cloudflare Pages before. **Do not summarise or skip steps.**

The owner controls DNS for `anantsharma.co.in` and will deploy to `zeroth.anantsharma.co.in`.

### Before the guide — audit what must change

**Inspect the code and list every change deployment requires.** Only real ones — do not invent work. Check specifically:

- `next.config.ts` — is `output: 'export'` set? `trailingSlash`? `images.unoptimized`? Any `basePath` needed?
- `package.json` — build script, Node version constraint
- Are any environment variables referenced client-side? If any secret could reach the bundle, that is a blocker and must be reported first
- `apps/web/public/_headers` — is it correct for Cloudflare Pages? Does the CSP allow the fonts actually used?
- Does anything assume a server runtime, an API route, or dynamic rendering?
- Do the metric explanation and figure data files get included in the static export?
- Is the repository root a monorepo layout Pages needs told about?

**If nothing needs changing, say so explicitly.** "No changes required, verified against `next.config.ts`" is a useful sentence.

### The guide

**1. Prerequisites** — repo pushed to GitHub, `npm run build` succeeding locally, deploy branch identified.

**2. Create the Pages project** — Cloudflare dashboard path, connecting GitHub, which permissions to grant and why.

**3. Build configuration** — build command, output directory, root directory, Node version, environment variables. **Verify each against the actual config files**, and state where each value came from.

**4. First deploy** — expected duration, where to read the build log, how to read a failure.

**5. Test on `.pages.dev`** — every route, the 404, the metric interactions, mobile width. Do not touch DNS until this passes.

**6. Add the custom domain** — where in Pages, entering `zeroth.anantsharma.co.in`, and the CNAME target it returns.

**7. The DNS record** — registrar-agnostic. Record type, host/name field, value, TTL. **Call out the common mistake explicitly:** most registrars append the root domain to the host field, so entering `zeroth.anantsharma.co.in` produces `zeroth.anantsharma.co.in.anantsharma.co.in`. Usually only `zeroth` goes in that field. Tell the reader how to check which convention their registrar uses.

**8. Propagation** — realistic timing, and how to verify with `dig zeroth.anantsharma.co.in CNAME` or `nslookup` rather than refreshing a browser.

**9. HTTPS** — certificate issuance timing, and that a certificate warning during that window is expected rather than a misconfiguration.

**10. Verification checklist** — domain serves, HTTPS valid, every route resolves, refresh on a deep route does not 404 (the classic static-export failure), assets load, no console errors, Lighthouse still ≥ 95 in production.

**11. Ongoing** — auto-deploy on push, preview deployments for branches, how to roll back.

**12. Linking from the portfolio** — where the link goes on `anantsharma.co.in`.

**13. Troubleshooting** — build passes locally but fails on Pages, DNS not resolving after propagation, certificate stuck pending, deep routes 404 on refresh, fonts failing under CSP, stale content after deploy.

---

## 16. THE TEST

When it is done, the site should pass this:

> An engineer lands on it, reads the abstract, sees a number they don't recognise, hovers it, gets a one-line definition, clicks it, sees the formula and a worked example from the real golden set, scrolls to "what can go wrong", and comes away thinking: *these people know exactly what could make their numbers wrong, and they checked.*

That reaction is the entire point of the redesign.
