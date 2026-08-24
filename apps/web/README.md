# apps/web

The public site. Next.js App Router, static export, no server runtime.

## Prerequisites

- **Node 20.** Verified against `package.json` — there is no `engines` field, so
  this is the version the lockfile and CI use (`.github/workflows/web.yml` pins
  `node-version: 20`). Node 22 also builds; 18 does not.
- **npm** (a `package-lock.json` is committed; do not switch package manager).
- Run inside the `zeroth` WSL distro at `~/projects/zeroth`. Never from
  `/mnt/c` — small-file IO there is roughly ten times slower and `next dev`
  file watching is unreliable.

```bash
node -v            # expect v20.x
```

## Install

```bash
cd ~/projects/zeroth/apps/web
npm ci
```

`npm ci` rather than `npm install`, so the lockfile is respected.

## Dev server

```bash
npm run dev
```

Serves on <http://localhost:3010>. WSL forwards the port, so that URL opens in a
Windows browser without extra configuration.

## Production build

```bash
npm run build
npm run start        # serves ./out on http://localhost:3010
```

**Build the static export before believing anything.** Static export behaves
differently from dev, particularly on route resolution: a page can render in
dev and 404 in production. `npm run build` also runs `scripts/csp.mjs`, which
pins the Content-Security-Policy hashes — see below.

## Routes to check

| Route | Expect |
|---|---|
| `/` | Masthead, abstract, Figure 1, Figure 7, results in-progress block |
| `/methodology` | Metric list by family, Figures 5, 6, 8 |
| `/corpus` | Figure 7 with real manifest counts |
| `/failure-modes` | Nine entries, Figures 2–5, step control on Figure 2 |
| `/roadmap` | Eight phases with status |
| `/security` | Figure 3, red-team in-progress block |
| `/about` | Reconstruction statement |
| `/writing`, `/feed`, `/runs` | In-progress blocks, no numbers |
| `/does-not-exist` | The 404 page, not a server error |

Refresh directly on a deep route (not via client navigation). That is the
classic static-export failure.

## Responsive check

```bash
# In DevTools: device toolbar, set width to 360
```

At 360px the contents rail becomes a top drawer, margin notes fall inline, and
**there must be no horizontal scroll on the body**. Wide figures and tables
scroll inside their own container instead. The margin column reappears at
1220px — not 1100px, which overflows by 61px.

## Accessibility check

Two environment quirks are already documented in `docs/deploy.md`: full Chrome
segfaults on this WSL2 kernel, and Lighthouse's launcher misdetects WSL as
Windows and fails on a temp directory. The working invocation:

```bash
npx puppeteer browsers install chrome-headless-shell
~/.cache/puppeteer/chrome-headless-shell/linux-*/chrome-headless-shell-linux64/chrome-headless-shell \
  --no-sandbox --disable-gpu --remote-debugging-port=9223 \
  --user-data-dir=/tmp/zeroth-chrome about:blank &
npx lighthouse http://localhost:3010/ --port=9223 \
  --only-categories=accessibility,performance
```

Expect accessibility 100 and performance ≥ 97 on every route.

## Keyboard testing

Everything reachable by mouse must be reachable by keyboard.

1. `Tab` to a metric name (dotted underline). The popover opens **on focus
   alone**, not just hover.
2. `Escape` dismisses the popover.
3. `Enter` opens the side panel; focus moves inside it.
4. `Escape` closes the panel and returns focus.
5. On `/failure-modes`, `Tab` to the Figure 2 step controls and advance with
   `Enter`. The figure never advances on its own.

## Editing content

No component changes required for any of these:

| Content | Location |
|---|---|
| Metric explanations | `content/metrics/<id>.json` |
| Failure modes | `content/failure-modes/<id>.json` |
| Roadmap phases | `apps/web/lib/phases.ts` |
| Run results | `content/board/<run-id>.json` |
| Corpus figures | `data/corpus/corpus_manifest.json` (generated, not hand-edited) |

To add a metric: drop in a JSON file with the same shape as an existing one and
reference it as `<Metric id="your_id" />`. An unknown id fails the build rather
than rendering blank.

## Common problems

**Port 3010 already in use.**
```bash
ss -ltnp | grep :3010          # find the pid
kill <pid>
```

**Stale build.** Delete `.next` and `out`, then rebuild.
```bash
rm -rf .next out && npm run build
```

**Fonts not loading / everything looks like Times.** `next/font` self-hosts the
three families; a stale `.next` is the usual cause. If the page renders in a
sans fallback where it should be serif, check that base element styles are
still inside `@layer base` in `globals.css` — unlayered CSS beats Tailwind
utilities regardless of specificity and will silently override them.

**Styles not applying after a token change.** Tokens are defined twice on
purpose: as raw custom properties on `:root` for hand-written CSS, and in
`@theme` for Tailwind utilities. Use plain `@theme`, never `@theme inline` —
`inline` stops the custom properties being emitted at all, so `var(--font-mono)`
resolves to nothing.

**CSP blocks scripts in production but not locally.** Expected if
`scripts/csp.mjs` did not run. `_headers` is applied by Cloudflare Pages only;
`npm run dev` and `npm run start` ignore it entirely.
