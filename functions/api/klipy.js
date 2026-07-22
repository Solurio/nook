// Cloudflare Pages Function: proxies Klipy gif/sticker search.
//
// Klipy's API does not send CORS headers, so the browser cannot call it
// directly -- the request is blocked and the sticker search breaks. This relays
// it server-side (same-origin for the browser) and returns Klipy's JSON as-is.
//
// Env (Cloudflare Pages project settings): KLIPY_KEY, or the existing
// NEXT_PUBLIC_KLIPY_KEY -- either works.

const BASE = "https://api.klipy.com/api/v1";

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "public, max-age=120" },
  });
}

export async function onRequestGet({ request, env }) {
  const key = env.KLIPY_KEY || env.NEXT_PUBLIC_KLIPY_KEY;
  if (!key) return json({ error: "not_configured", data: [] });

  const url = new URL(request.url);
  const type = url.searchParams.get("type") === "stickers" ? "stickers" : "gifs";
  const term = (url.searchParams.get("q") || "").trim();
  const perPage = String(Math.min(50, Math.max(8, Number(url.searchParams.get("per_page")) || 24)));

  const params = new URLSearchParams({ per_page: perPage, page: "1" });
  if (term) params.set("q", term);
  const path = term ? "search" : "trending";

  try {
    const res = await fetch(`${BASE}/${encodeURIComponent(key)}/${type}/${path}?${params.toString()}`, {
      headers: { accept: "application/json" },
    });
    const text = await res.text();
    return new Response(text, {
      status: res.ok ? 200 : res.status,
      headers: { "content-type": "application/json", "cache-control": "public, max-age=120" },
    });
  } catch {
    return json({ error: "klipy_unreachable", data: [] }, 502);
  }
}
