import type { NextConfig } from "next";

const supabaseHost = (() => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return null;
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
})();

const config: NextConfig = {
  reactStrictMode: true,
  images: {
    // Room decorations come from arbitrary URLs people paste in, so the
    // optimizer is off and we render plain <img>. Uploads still go to Supabase.
    unoptimized: true,
    remotePatterns: supabaseHost
      ? [{ protocol: "https", hostname: supabaseHost }]
      : [],
  },
};

export default config;
