# TASK: Fix and Deepen the Zeroth Web App

Two jobs. First fix what is broken — there is a hydration failure on `/` and the interactive layer is not usable. Second, make the site genuinely explanatory: a reader should be able to see how the system behaves, not just read that it behaves.

Read `docs/ZEROTH_REDESIGN_PROMPT.md` for the design direction. This continues it.

---

## PART 1 — FIX THE HYDRATION FAILURE

### The bug

`/` throws `Hydration failed because the server rendered HTML didn't match the client`, originating at `components/MetricRef.tsx:95`.

Every error in the console is the same root cause. `<Metric>` renders the full panel inline at the reference point — `<dialog>`, `<div>`, `<section>`, `<h2>`, `<h3>`, `<pre>`, `<dl>`, `<ul>` — and that reference sits inside a `<p>` in the prose.

**HTML does not permit block content inside `<p>`.** The parser auto-closes the paragraph when it hits the first block child, so the DOM the browser builds does not match the tree React expects. React then throws away the server HTML and re-renders on the client.

Do not fix this by patching each tag. The structure is wrong.

### The required fix

**Separate the inline trigger from the panel content.**

At the reference point in prose, render only phrasing content — a `<button>` and optionally a `<span>`. Nothing else. That is all that may legally live inside a `<p>`.

Render the panel elsewhere. Two viable approaches; **prefer the first**:

**A — Panels rendered once at page level (preferred).** Collect every metric referenced on a page, render each panel once at the end of the layout outside the prose tree, and have the inline button open the matching panel by id. No portal, no client-only rendering, panel content present in the static HTML — which means it is indexable and readable without JavaScript. That last property matters for a site whose purpose is explanation.

**B — Portal.** `createPortal` to `document.body`, mounted after hydration behind a `mounted` state so the server renders only the button. Works, but the panel content is absent from the static HTML.

Whichever you choose, explain the trade-off in a comment.

### Then audit the whole tree

This bug will exist wherever a component renders block content inside prose. Find all of them:

```bash
npm run build 2>&1 | tee /tmp/build.log
```

Then load every route with the console open and confirm zero hydration warnings. Check specifically anywhere a component is used inside `<Prose>`, an `<aside>`, a `<figcaption>`, a `<dt>`/`<dd>`, or a table cell.

**Add a guard** so this cannot silently return: a test that renders each page and asserts no invalid nesting, or at minimum a documented note in the component that only phrasing content may be returned inline.

### The figure tooltip bug

The screenshot shows a dark `Figure3` label floating over Figure 3, obscuring content. This is a native browser tooltip — almost certainly an SVG `<title>` element, which browsers render as a tooltip on hover.

Fix: for accessibility use `role="img"` with `aria-labelledby` pointing at a visually-hidden description, rather than `<title>`. Screen readers get the description; sighted users get no stray tooltip.

Audit every SVG for the same pattern.

---

## PART 2 — REMOVE UNBUILT SECTIONS

**Delete `/writing` and `/feed` entirely** — routes, components, navigation entries, contents-rail entries, and any `content/` directories for them.

They arrive in Phases 6 and 7. An empty section that has never had content is clutter, not a promise.

**Keep in-progress treatment** for sections that are genuinely mid-build and will fill from work already underway: the board table, `/runs`, `/security` red-team results.

**Keep `/roadmap`**, and let it carry the Writing and Feed plans. That is the right place for "this exists in the plan" — a roadmap entry reads as intent, an empty route reads as abandonment.

---

## PART 3 — MAKE THE BACKEND VISIBLE

The central request, and the one that makes this worth open-sourcing: **a reader should be able to see how the system behaves, not just read a description of it.**

Someone landing here with a retrieval problem of their own should leave understanding something they can apply. That is the bar.

### The constraint that shapes everything

This is a **static export with no backend.** Nothing can run a live query.

So every interactive element is driven by **precomputed real data, committed as JSON.** Run the real pipeline, capture the intermediate states, commit them, and let the client interpolate between them.

**Never synthesise the data.** Use real queries from `data/golden/`, real chunks from the real corpus, real scores from real runs. If a demo needs data that does not exist yet, ship the component with an honest empty state rather than inventing numbers. This is constraint one of the brief and it applies to every pixel.

### Build these, in priority order

**1. Retrieval walkthrough — the flagship**

Pick 5–8 real golden-set queries. Precompute and commit, for each: BM25 top-20 with scores, dense top-20 with scores, the RRF fusion showing how ranks combine, and the post-rerank ordering.

The reader picks a query and steps through the stages. What they should see and feel:

- Which chunks lexical finds that vector misses, and the reverse
- How RRF combines two rankings — this is the concept most people get wrong, and watching ranks merge teaches it faster than the formula
- How much the cross-encoder reorders, and what that costs in latency

Each chunk shows its real text, document, page, section and tenant. Clicking one reveals why it scored as it did.

**2. ANN post-filtering — the finding worth open-sourcing**

The most valuable thing this project has found, and almost nobody knows it.

Interactive: a role selector controlling how many tenants are visible, over a real embedding-space projection. As access narrows, the reader watches the index return its `ef_search` nearest neighbours, the policy discard the forbidden ones, and **nothing refill them** — until the result list is empty despite permitted matching documents existing.

Then an `ef_search` slider on the monolithic index, precomputed at 40 / 100 / 200 / 400 / 800. **Recall does not move.** With well-separated clusters the 800 nearest neighbours all belong to the same tenant region.

That negative result is the whole argument for partitioning, and a slider that visibly does nothing makes it in a way prose cannot.

Then the partitioned comparison alongside: nothing to post-filter away.

**3. Chunking explorer**

A real document — one 10-K, one contract, one RFC. Toggle between fixed-token and section-aware. Watch boundaries move.

Highlight where fixed chunking cuts through a clause mid-sentence and section-aware does not. Show the token counts, the overlap, and the resulting chunk count for that document under each strategy.

This is where the reader understands why chunking strategy is a real decision rather than a parameter.

**4. Embedding space projection**

2D projection (UMAP or t-SNE, computed offline and committed) of the real chunk embeddings, coloured by tenant.

This is what makes the post-filtering demo legible — the reader sees that tenants form distinct regions, and immediately understands why a restricted role's nearest neighbours all belong to someone else.

**5. The verification chain**

Walk a real golden-set query through drafting → blind judging → human sample. Show the actual grades at each stage and where they diverged.

Make the blind-judging design visible: the judge never saw the drafter's labels. That is what makes the agreement number mean something, and seeing it beats reading it.

**6. Metric calculators**

Inside each metric panel: the real retrieved set for a real query, and the arithmetic worked through step by step. For NDCG, show the discount applied per rank. For bootstrap CIs, show a resample animation.

### Interaction principles

- **Reader-driven.** Steppers and sliders, never autoplay
- **Always show the real value.** Every visual state has a number attached
- **Explain the mechanism, not just the outcome.** "Recall dropped to 0.023" is a fact; "these were the 40 nearest neighbours, 39 belonged to tenants you cannot see, and nothing replaced them" is an explanation
- **Full keyboard operation.** Sliders respond to arrow keys, steppers to enter and space
- **Reduced motion** collapses animation to final state
- **Degrade honestly.** With JavaScript disabled, show the static final state and the numbers, not a blank box

---

## PART 4 — COLOUR

**Minimal, and always meaningful.** The page stays predominantly ink on paper. Colour appears where it carries information and nowhere else.

**Where colour is earned:**

- **Metric families** — one hue each: retrieval, grounding, abstention, performance, cost. Learn the mapping once, scan a dense table by hue
- **Deltas** — `--signal` better, `--regress` worse. **Reserved exclusively**; never reused for a family or a delta becomes ambiguous
- **Tenants in visualisations** — a categorical scale, consistent across every figure so a tenant keeps its colour throughout
- **Retrieval paths** — lexical and dense distinguishable through the fusion demo, so the reader can track where a result came from
- **Permitted vs filtered** in the RLS demo — the single most important colour distinction on the site
- **Phase status** on the roadmap — done, in progress, planned

**Where colour is not earned:** section headings, body prose, borders, backgrounds, decorative accents, hover states that carry no meaning.

**Requirements:** WCAG AA on every pairing. Nothing depends on hue alone — pair with a label, pattern, position or icon. Categorical scales must be colour-blind safe; around 8% of men have some deficiency and this audience is disproportionately male. Verify with a simulator, not by eye.

---

## PART 5 — OPEN SOURCE READINESS

The owner intends to open-source this so others can use it. That changes what the site owes a reader.

- **Every visualisation links to the code that produced it** — file and function
- **Every precomputed dataset is committed and documented** — what it is, how it was generated, which script regenerates it
- **`/methodology` states limitations plainly**, including the corpus's lack of independence and any deviation from the brief
- **README explains how to reproduce every figure** from a clean clone
- **Findings are attributable** — the post-filtering behaviour and the planner flip are genuinely useful to other people, and they should be able to cite and verify them

---

## PART 6 — RUN THE CHECKS

Do not report done until all of these pass. Report actual output, not assertions.

```bash
# Type checking and lint
npx tsc --noEmit
npm run lint

# Production build
npm run build

# Serve the built output and test there — not just dev
npx serve out -l 3010
```

**Then, with the console open, load every route:**

`/` · `/methodology` · `/corpus` · `/runs` · `/security` · `/roadmap` · `/about` · a bad URL for the 404

Check on each:

- **Zero hydration warnings** — this is the gate
- Zero console errors
- No stray native tooltips over figures
- Refresh on a deep route does not 404 (static export path handling)
- All interactive elements operable by keyboard, Escape dismisses
- Layout holds at 360px with no horizontal scroll
- Lighthouse accessibility ≥ 95, performance ≥ 90

**Then verify the honesty constraints:**

```bash
ls -la content/board/          # empty except .gitkeep
grep -rn "TODO\|FIXME\|lorem\|placeholder\|example.com" apps/web/ --include="*.tsx" --include="*.ts"
```

Confirm no fabricated number appears anywhere, including in demo data. Every figure traces to real corpus or golden-set data.

---

## PART 7 — PROCESS

**Fix Part 1 first and report before continuing.** The hydration failure means the page is being thrown away and re-rendered on every load — nothing else is worth building on top of that.

Then:

1. Part 2 — remove `/writing` and `/feed`
2. Part 3 — the retrieval walkthrough and the post-filtering demo first; they carry the most weight
3. Part 4 — colour, applied once the visuals exist
4. Part 5 — reproducibility documentation
5. Part 6 — full check pass

**Before building Part 3, propose:**

- The data schema for precomputed interaction states
- Which scripts generate them and where the data is committed
- A sketch of each visualisation and what the reader manipulates
- Anything you think is wrong with this spec

Report at each step. Do not build everything and present it finished.

---

## THE TEST

An engineer with their own retrieval problem lands here, opens the post-filtering demo, drags the `ef_search` slider from 40 to 800, watches recall not move, and thinks:

> *That is exactly the bug I have been chasing.*

That is what makes this worth open-sourcing, and it is the standard every interactive element should be held to.
