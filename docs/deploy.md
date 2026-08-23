# Deploying the site

The site is a static export. It renders committed JSON and never queries the
platform, so hosting is free and there is no server-side attack surface.

## Cloudflare Pages

Requires the owner's Cloudflare account, so this step is done by hand once.

1. Cloudflare Dashboard → **Workers & Pages** → **Create** → **Pages** →
   **Connect to Git**, and select this repository.
2. Build settings:

   | Setting | Value |
   |---|---|
   | Framework preset | None |
   | Build command | `npm run build` |
   | Build output directory | `out` |
   | Root directory | `apps/web` |
   | Node version | `20` (set `NODE_VERSION=20` under Environment variables) |

3. Deploy. Confirm the generated `*.pages.dev` URL resolves over HTTPS.
4. **Custom domain** → add `zeroth.anantsharma.co.in`. If the zone is already on
   Cloudflare this creates the CNAME automatically; otherwise add a CNAME from
   `zeroth` to the `*.pages.dev` hostname at your DNS provider.
5. Confirm `https://zeroth.anantsharma.co.in` resolves and serves over HTTPS.

`public/_headers` is picked up automatically by Pages and sets the CSP and
caching rules. It has no effect on the local `npm run dev` server.

## Verifying the accessibility gate

Full Chrome segfaults on this WSL2 kernel; `chrome-headless-shell` works.
Lighthouse's own launcher also misdetects WSL as Windows and fails on a temp
directory, so launch the browser separately and connect over the debug port:

```bash
~/.cache/puppeteer/chrome-headless-shell/linux-*/chrome-headless-shell-linux64/chrome-headless-shell \
  --no-sandbox --disable-gpu --remote-debugging-port=9223 \
  --user-data-dir=/tmp/zeroth-chrome about:blank &

npx lighthouse http://localhost:3010/ --port=9223 --only-categories=accessibility
```

Install the browser with `npx puppeteer browsers install chrome-headless-shell`.
