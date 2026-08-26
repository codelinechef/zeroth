import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Fully static: the public site never queries the platform (brief §5).
  // Every route is prerendered at build time, reading content/ and data/ from
  // the repo. There is no request-time server — see wrangler.jsonc, which
  // uploads `out/` as Worker static assets with no `main`.
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
};

export default nextConfig;
