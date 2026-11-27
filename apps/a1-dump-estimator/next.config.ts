import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // This app is isolated inside hurkl-platform's repo (see README) but must
  // never have Next.js treat the parent Mason app as part of its workspace —
  // pin the root explicitly rather than letting lockfile-detection guess it.
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;
