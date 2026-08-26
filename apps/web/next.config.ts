import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Fully static: the public site never queries the platform (brief §5).
  output: "standalone",
  trailingSlash: true,
  images: { unoptimized: true },
};

export default nextConfig;
