// Cloudflare Pages Function: proxies Klipy gif/sticker search.
//
// Klipy's API does not send CORS headers, so the browser cannot call it
// directly -- the request is blocked and the sticker search breaks. This relays
// it server-side (same-origin for the browser) and returns Klipy's JSON as-is.
//
// The key stays here, so the relay only answers the site itself: a request
// that says it comes from anywhere else is turned away, and what it can ask
// for is narrow -- gifs or stickers, a short search, a page of results.
//
// Env (Cloudflare Pages project settings): KLIPY_KEY, or the existing
// NEXT_PUBLIC_KLIPY_KEY -- either works.

const BASE = "https://api.klipy.com/api/v1";

const HEADERS = {
  "content-type": "application/json",
  "cache-control": "public, max-age=120",
  "x-content-type-options": "nosniff",
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: HEADERS });
}

/** Whether the request came from a page on this site (or names no page at all). */
function fromHere(request) {
  const host = new URL(request.url).host;
  for (const name of ["origin", "referer"]) {
    const value = request.headers.get(name);
    if (!value) continue;
    try {
      if (new URL(value).host !== host) return false;
    } catch {
      return false;
    }
  }
  return true;
}

export async function onRequestGet({ request, env }) {
  if (!fromHere(request)) return json({ error: "forbidden", data: [] }, 403);
  const key = env.KLIPY_KEY || env.NEXT_PUBLIC_KLIPY_KEY;
  if (!key) return json({ error: "not_configured", data: [] });

  const url = new URL(request.url);
  const type = url.searchParams.get("type") === "stickers" ? "stickers" : "gifs";
  const term = (url.searchParams.get("q") || "").trim().slice(0, 100);
  const perPage = String(Math.min(50, Math.max(8, Number(url.searchParams.get("per_page")) || 24)));

  const params = new URLSearchParams({ per_page: perPage, page: "1" });
  if (term) params.set("q", term);
  const path = term ? "search" : "trending";

  try {
    const res = await fetch(`${BASE}/${encodeURIComponent(key)}/${type}/${path}?${params.toString()}`, {
      headers: { accept: "application/json" },
    });
    const text = await res.text();
    return new Response(text, { status: res.ok ? 200 : res.status, headers: HEADERS });
  } catch {
    return json({ error: "klipy_unreachable", data: [] }, 502);
  }
}

export async function onRequest() {
  return json({ error: "method_not_allowed" }, 405);
}
