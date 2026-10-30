// Writes out/_headers, which Cloudflare Pages reads to set response headers
// on the static site: a content security policy, the usual hardening headers,
// and long caching for the files whose names change when their contents do.
//
// Runs after `next build` (npm's postbuild). The policy allows the inline
// scripts the build actually produced by their hashes, worked out here from
// the exported HTML, instead of allowing inline script wholesale -- so a
// script someone manages to inject into a page will not run.
//
//   node scripts/security-headers.mjs [outDir]

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const out = path.resolve(process.argv[2] ?? "out");
if (!fs.existsSync(out)) {
  console.error(`no ${out} -- run the build first`);
  process.exit(1);
}

// The database's address, for the realtime socket. Read from the same env the
// build used; without it, any Supabase project's socket is allowed.
function envValue(name) {
  if (process.env[name]) return process.env[name];
  try {
    const line = fs
      .readFileSync(".env.local", "utf8")
      .split(/\r?\n/)
      .find((l) => l.startsWith(`${name}=`));
    return line ? line.slice(name.length + 1).trim() : "";
  } catch {
    return "";
  }
}
let supabaseHost = "*.supabase.co";
try {
  const url = envValue("NEXT_PUBLIC_SUPABASE_URL");
  if (url) supabaseHost = new URL(url).host;
} catch {
  // Keep the wildcard.
}

// Every inline script in every exported page, hashed.
const walk = (dir) =>
  fs.readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return fs.statSync(full).isDirectory() ? walk(full) : [full];
  });
const hashes = new Set();
for (const file of walk(out).filter((f) => f.endsWith(".html"))) {
  const html = fs.readFileSync(file, "utf8");
  for (const match of html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)) {
    hashes.add(`'sha256-${crypto.createHash("sha256").update(match[1], "utf8").digest("base64")}'`);
  }
}

const csp = [
  "default-src 'self'",
  // The YouTube and SoundCloud players' own scripts; WebAssembly for the PDF reader's image decoders.
  `script-src 'self' ${[...hashes].join(" ")} 'wasm-unsafe-eval' https://www.youtube.com https://w.soundcloud.com`,
  "style-src 'self' 'unsafe-inline'",
  // Pictures, music and video come from wherever people link them.
  "img-src 'self' data: blob: https:",
  "media-src 'self' data: blob: https:",
  "font-src 'self' data:",
  // PDFs and gif searches reach other sites; the database's socket is the one websocket.
  `connect-src 'self' https: wss://${supabaseHost}`,
  // Windows onto other sites are the point of embeds.
  "frame-src https:",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
  "upgrade-insecure-requests",
].join("; ");

const everywhere = [
  `Content-Security-Policy: ${csp}`,
  "X-Content-Type-Options: nosniff",
  "X-Frame-Options: SAMEORIGIN",
  "Referrer-Policy: strict-origin-when-cross-origin",
  // Nothing here uses the camera, microphone or location; screen sharing stays with the page itself.
  "Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), bluetooth=(), hid=(), midi=(), display-capture=(self)",
  "Strict-Transport-Security: max-age=31536000; includeSubDomains",
  "Cross-Origin-Opener-Policy: same-origin-allow-popups",
];

const rules = [
  ["/*", everywhere],
  // Named by their contents: a new version is a new name, so keep them forever.
  ["/_next/static/*", ["Cache-Control: public, max-age=31536000, immutable"]],
  ["/fonts/*", ["Cache-Control: public, max-age=2592000"]],
  ["/words/*", ["Cache-Control: public, max-age=604800"]],
  ["/pdf.worker.min.mjs", ["Cache-Control: public, max-age=604800"]],
];

const text = `${rules.map(([route, headers]) => `${route}\n${headers.map((h) => `  ${h}`).join("\n")}`).join("\n\n")}\n`;
fs.writeFileSync(path.join(out, "_headers"), text);
console.log(`_headers: ${hashes.size} inline script hashes, socket ${supabaseHost}`);
