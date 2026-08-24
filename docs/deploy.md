# Deploying the site

Complete guide, assuming no prior Cloudflare Pages experience. The site is a
static export: it renders committed JSON and never queries the platform, so
hosting is free and there is no server-side attack surface.

Target: `zeroth.anantsharma.co.in`.

---

## 0. Audit — what deployment requires

Checked against the actual files, not assumed.

| Check | Finding | Action |
|---|---|---|
| `output: 'export'` | Present in `next.config.ts:5` | None |
| `trailingSlash` | `true`, line 6 | None. This is what makes deep-route refresh work |
| `images.unoptimized` | `true`, line 7 | None. Required: the optimizer needs a server |
| `basePath` | Absent | None. Correct — the site is served at a domain root |
| Build script | `next build && node scripts/csp.mjs` | None |
| Node version | No `engines` field; CI pins 20 | Set `NODE_VERSION=20` in Pages |
| Client-side env vars | **None.** No `NEXT_PUBLIC_*`, no `process.env` outside `process.cwd()` | None. No secret can reach the bundle |
| Server runtime / API routes | None. All 11 routes prerender as static | None |
| Content files in the export | Metric JSON and the corpus manifest are read at build and inlined into the HTML | None. Verified in `out/` |
| Monorepo layout | Yes — the app is at `apps/web` | Set **Root directory** to `apps/web` |
| `public/_headers` | CSP would have blocked hydration | **Fixed** — see below |

**The one real issue, now fixed.** `public/_headers` set `script-src 'self'`,
but Next's static export embeds the RSC payload in inline `<script>` tags with
no `src`. Cloudflare Pages applies `_headers`; `next dev` and a local static
server do not. Hydration would therefore have broken **in production only**,
passing every local check. `scripts/csp.mjs` now runs as part of `npm run build`
and pins a SHA-256 hash for every inline script — strict policy, no
`'unsafe-inline'`. Verified: 35 inline scripts across all pages, 35 covered.

Everything else: no changes required.

---

## 1. Prerequisites

- Repository pushed to GitHub.
- `npm ci && npm run build` succeeding locally from `apps/web`.
- The branch you want deployed (`main` below).

---

## 2. Create the Pages project

1. <https://dash.cloudflare.com> → **Workers & Pages**.
2. **Create** → **Pages** → **Connect to Git**.
3. Authorise Cloudflare for GitHub. Grant access to this repository only —
   Cloudflare needs read access to clone it and webhook access to rebuild on
   push. It does not need write access.
4. Select the repository → **Begin setup**.

---

## 3. Build configuration

| Field | Value | Where this came from |
|---|---|---|
| Production branch | `main` | Your deploy branch |
| Framework preset | **None** | Presets assume a repo-root Next app; this is a monorepo |
| Build command | `npm run build` | `package.json` scripts |
| Build output directory | `out` | `output: 'export'` writes here |
| Root directory | `apps/web` | The app is not at the repo root |
| Environment variable | `NODE_VERSION` = `20` | No `engines` field; CI pins 20 |

Do not add any other environment variables. The build reads no secrets, and
anything added here is visible to the build.

---

## 4. First deploy

**Save and Deploy.** Expect 2–4 minutes: clone, `npm ci`, `next build`, upload.

Read the log at **Workers & Pages → your project → Deployments → the run**.
A failure is almost always in `npm ci` (lockfile out of sync — commit
`package-lock.json`) or `next build` (a type error that `npm run build` locally
would also have caught).

---

## 5. Test on `.pages.dev` before touching DNS

You get a URL like `zeroth-abc.pages.dev`. Check all of it there first.

- Every route in the table in `apps/web/README.md`
- `/does-not-exist` → the 404 page
- **Refresh directly on `/methodology/`** — do not navigate to it. This is the
  classic static-export failure and `trailingSlash: true` is what prevents it
- Hover and keyboard-focus a metric name; open and `Escape` the panel
- Step through Figure 2 on `/failure-modes`
- **Open DevTools → Console. It must be empty.** A CSP violation appears here
  and nowhere else
- Resize to 360px: no horizontal scroll

Do not proceed until the console is clean.

---

## 6. Add the custom domain

**Your project → Custom domains → Set up a domain** → enter
`zeroth.anantsharma.co.in` → **Continue**.

Cloudflare shows the CNAME target, typically `zeroth-abc.pages.dev`. Copy it.

If `anantsharma.co.in` is already on Cloudflare DNS, the record is created for
you — skip to step 8.

---

## 7. The DNS record

At whichever provider hosts DNS for `anantsharma.co.in`:

| Field | Value |
|---|---|
| Type | `CNAME` |
| Host / Name | `zeroth` |
| Value / Target | `zeroth-abc.pages.dev` (the exact target from step 6) |
| TTL | Automatic, or 300 |
| Proxy | On, if the provider is Cloudflare |

**The mistake almost everyone makes.** Most registrars append the root domain
to whatever you type in the host field. Entering `zeroth.anantsharma.co.in`
there produces `zeroth.anantsharma.co.in.anantsharma.co.in`, which resolves to
nothing and looks exactly like a propagation delay.

To find out which convention your provider uses, look at an existing record. If
`www` is stored as `www`, enter `zeroth`. If it is stored as
`www.anantsharma.co.in`, enter the full name. When in doubt enter `zeroth`
first — it is right far more often.

---

## 8. Propagation

Usually under five minutes, occasionally up to an hour. Verify with a resolver,
not a browser — browsers and the OS cache aggressively:

```bash
dig zeroth.anantsharma.co.in CNAME +short
# expect: zeroth-abc.pages.dev.

nslookup zeroth.anantsharma.co.in
```

If `dig` returns nothing, the record is wrong or not yet published. Refreshing
a browser tab tells you nothing either way.

---

## 9. HTTPS

Cloudflare issues the certificate automatically once DNS resolves. Typically
under fifteen minutes, occasionally up to an hour.

**A certificate warning during that window is expected**, not a
misconfiguration. Pages shows the status under **Custom domains**. Only
investigate if it is still pending after an hour — the usual cause is DNS not
actually resolving yet, so re-run the `dig` from step 8.

---

## 10. Verification checklist

- [ ] `https://zeroth.anantsharma.co.in` serves the site
- [ ] Certificate valid, no browser warning
- [ ] Every route resolves
- [ ] **Refresh directly on a deep route** — no 404
- [ ] `/does-not-exist` shows the 404 page
- [ ] Fonts render (serif body, mono numbers) — a CSP or font failure shows as
      system fallbacks
- [ ] **Console clean** — no CSP violations
- [ ] Metric popovers open on keyboard focus; panel opens and `Escape` closes
- [ ] 360px: no horizontal scroll
- [ ] Lighthouse in production: accessibility 100, performance ≥ 95

---

## 11. Ongoing

- **Auto-deploy:** every push to `main` rebuilds and deploys.
- **Previews:** every other branch and pull request gets its own preview URL.
  Use one to review a design change before merging.
- **Rollback:** Deployments → an earlier successful deployment → **Rollback to
  this deployment**. Instant; no rebuild.

---

## 12. Linking from the portfolio

Add the link on `anantsharma.co.in` where projects are listed. The site's own
footer already links back, so the pair is bidirectional.

---

## 13. Troubleshooting

**Builds locally, fails on Pages.** Almost always Node version or a lockfile
drift. Confirm `NODE_VERSION=20` and that `package-lock.json` is committed and
current. Reproduce with `rm -rf node_modules .next out && npm ci && npm run build`.

**DNS not resolving after an hour.** Re-read step 7 — it is nearly always the
appended-root-domain mistake. `dig zeroth.anantsharma.co.in CNAME +short`
returning empty confirms it.

**Certificate stuck pending.** Requires DNS to resolve first. Fix DNS; the
certificate follows on its own.

**Deep routes 404 on refresh.** `trailingSlash: true` must be in
`next.config.ts`. It is, so if this appears the build output directory is
probably wrong — it must be `out`, not `.next`.

**Fonts fail, or the page renders in system fonts.** Check the console for CSP
violations. `font-src 'self'` is correct because `next/font` self-hosts; a
failure here means the fonts were not uploaded, which points at the output
directory.

**Console shows `Refused to execute inline script`.** `scripts/csp.mjs` did not
run, or `out/_headers` was overwritten after it did. Re-run `npm run build` and
confirm the log line `csp: pinned N inline script hash(es)`.

**Stale content after deploy.** Cloudflare purges its cache on deploy, so this
is nearly always the browser. Hard-reload, or check the deployment actually
succeeded rather than being queued.

---

## Local Lighthouse — the two WSL2 quirks

Full Chrome segfaults on this WSL2 kernel, and Lighthouse's launcher misdetects
WSL as Windows and fails creating a temp directory. Use `chrome-headless-shell`
and connect over the debug port:

```bash
npx puppeteer browsers install chrome-headless-shell
```

```bash
~/.cache/puppeteer/chrome-headless-shell/linux-*/chrome-headless-shell-linux64/chrome-headless-shell \
  --no-sandbox --disable-gpu --remote-debugging-port=9223 \
  --user-data-dir=/tmp/zeroth-chrome about:blank &
```

```bash
npx lighthouse http://localhost:3010/ --port=9223 --only-categories=accessibility,performance
```
