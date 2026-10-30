// Serves the exported site (out/) the way Cloudflare Pages will: the same
// files, the same clean URLs, and the headers from out/_headers -- so the
// content security policy and the caching can be tried out before they ship.
// The /api functions are not here; they only run on Cloudflare.
//
//   node scripts/serve-static.mjs [port]

import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

// The out/ next to this script, wherever it is run from.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "out");
const port = Number(process.argv[2] ?? 4173);

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".txt": "text/plain; charset=utf-8",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".wasm": "application/wasm",
};

/** The _headers file: route patterns, each with its headers. */
function readRules() {
  const file = path.join(root, "_headers");
  if (!fs.existsSync(file)) return [];
  const rules = [];
  let current = null;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    if (!line.trim()) continue;
    if (!/^\s/.test(line)) {
      current = { pattern: new RegExp(`^${line.trim().replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`), headers: [] };
      rules.push(current);
    } else if (current) {
      const at = line.indexOf(":");
      current.headers.push([line.slice(0, at).trim(), line.slice(at + 1).trim()]);
    }
  }
  return rules;
}

function resolve(urlPath) {
  const clean = decodeURIComponent(urlPath.split("?")[0]);
  const candidates = [clean, path.join(clean, "index.html"), `${clean}.html`];
  for (const c of candidates) {
    const full = path.join(root, c);
    if (full.startsWith(root) && fs.existsSync(full) && fs.statSync(full).isFile()) return full;
  }
  return null;
}

http
  .createServer((req, res) => {
    const rules = readRules();
    const file = resolve(req.url ?? "/") ?? path.join(root, "404.html");
    const status = resolve(req.url ?? "/") ? 200 : 404;
    const urlPath = (req.url ?? "/").split("?")[0];
    for (const rule of rules) if (rule.pattern.test(urlPath)) for (const [k, v] of rule.headers) res.setHeader(k, v);
    res.setHeader("content-type", TYPES[path.extname(file)] ?? "application/octet-stream");
    res.writeHead(status);
    fs.createReadStream(file).pipe(res);
  })
  .listen(port, () => console.log(`serving out/ with its headers on http://localhost:${port}`));
