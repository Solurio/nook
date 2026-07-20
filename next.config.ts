import type { NextConfig } from "next";

// Exported as a fully static site so it drops onto any static host (Cloudflare
// Pages, Vercel, Netlify) with no server and no adapter. Everything dynamic --
// loading a room, realtime, uploads -- happens in the browser against Supabase.
const config: NextConfig = {
  output: "export",
  reactStrictMode: true,
  // Each route becomes a folder with an index.html, which static hosts serve
  // cleanly without rewrite rules.
  trailingSlash: true,
  images: {
    // Room decorations are arbitrary URLs and animated GIFs; the optimizer
    // (which also needs a server) would only get in the way.
    unoptimized: true,
  },
};

export default config;
