// Cloudflare Pages Function: creates and terminates Hyperbeam sessions.
//
// This is the only server-side piece of the app besides the gif proxy. It
// exists to keep the Hyperbeam API key secret -- the key never reaches the
// browser -- and, since every session costs money, to decide who may start
// one: a signed-in person, in the room they say it is for, not too often.
//
// Env vars (set these in the Cloudflare Pages project, not in the repo):
//   HYPERBEAM_API_KEY                    (required, secret) -- from hyperbeam.com
//   SUPABASE_URL / SUPABASE_ANON_KEY     (or the NEXT_PUBLIC_ ones the site
//                                         already builds with) -- required:
//                                         without them nobody is let in.
//
// Cost guard: sessions terminate on their own once everyone disconnects (see
// OFFLINE_TIMEOUT), the client calls DELETE when a browser is closed, and a
// person can only start one every COOLDOWN seconds.

const HYPERBEAM = "https://engine.hyperbeam.com/v0/vm";

// Seconds the cloud machine keeps running after the last person disconnects.
// This is the main thing keeping the bill small -- an abandoned session dies.
const OFFLINE_TIMEOUT = 180;

// Seconds between two sessions started by the same person, or from the same address.
const COOLDOWN = 30;

const SECURITY_HEADERS = {
  "content-type": "application/json",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: SECURITY_HEADERS });
}

function supabaseEnv(env) {
  const url = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return url && key ? { url: url.replace(/\/+$/, ""), key } : null;
}

function bearer(request, body) {
  const header = request.headers.get("authorization") || "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (match) return match[1].trim();
  // Older clients sent it in the body.
  return typeof body?.token === "string" ? body.token : null;
}

/** A request from another site is not ours to serve, whatever it carries. */
function sameSite(request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch {
    return false;
  }
}

/** The signed-in person behind a token, or null. */
async function whoIs(sb, token) {
  if (!token) return null;
  try {
    const res = await fetch(`${sb.url}/auth/v1/user`, { headers: { Authorization: `Bearer ${token}`, apikey: sb.key } });
    if (!res.ok) return null;
    const user = await res.json();
    return typeof user?.id === "string" ? user.id : null;
  } catch {
    return null;
  }
}

/** Whether that person can see the room -- which, with the database's rules, means they are in it. */
async function inRoom(sb, token, room) {
  if (typeof room !== "string" || !/^[0-9a-f-]{36}$/i.test(room)) return false;
  try {
    const res = await fetch(`${sb.url}/rest/v1/rooms?id=eq.${room}&select=id`, {
      headers: { Authorization: `Bearer ${token}`, apikey: sb.key, accept: "application/json" },
    });
    if (!res.ok) return false;
    const rows = await res.json();
    return Array.isArray(rows) && rows.length === 1;
  } catch {
    return false;
  }
}

/**
 * Too soon since the last one? Kept in the edge cache, per person and per
 * address. Not a perfect lock -- each data centre has its own cache -- but it
 * stops a loop from starting machines by the hundred.
 */
async function tooSoon(keys) {
  const cache = caches.default;
  for (const key of keys) {
    if (await cache.match(key)) return true;
  }
  return false;
}

async function remember(keys, context) {
  const cache = caches.default;
  for (const key of keys) {
    const mark = new Response("1", { headers: { "cache-control": `max-age=${COOLDOWN}` } });
    context.waitUntil(cache.put(key, mark));
  }
}

function normalizeUrl(raw) {
  const value = String(raw || "").trim().slice(0, 2000);
  if (!value) return "https://www.google.com";
  const withScheme = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  try {
    const parsed = new URL(withScheme);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.toString() : "https://www.google.com";
  } catch {
    return "https://www.google.com";
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.HYPERBEAM_API_KEY) return json({ error: "not_configured" }, 501);
  if (!sameSite(request)) return json({ error: "forbidden" }, 403);

  // Without a way to check who is asking, nobody gets a paid machine.
  const sb = supabaseEnv(env);
  if (!sb) return json({ error: "not_configured" }, 501);

  let body;
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const token = bearer(request, body);
  const user = await whoIs(sb, token);
  if (!user) return json({ error: "unauthorized" }, 401);
  if (body.room !== undefined && !(await inRoom(sb, token, body.room))) return json({ error: "unauthorized" }, 401);

  const ip = request.headers.get("cf-connecting-ip") || "unknown";
  const keys = [`https://cooldown.nook/cobrowse/user/${user}`, `https://cooldown.nook/cobrowse/ip/${encodeURIComponent(ip)}`];
  if (await tooSoon(keys)) return json({ error: "too_soon", detail: `one shared browser every ${COOLDOWN} seconds` }, 429);

  let res;
  try {
    res = await fetch(HYPERBEAM, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.HYPERBEAM_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        start_url: normalizeUrl(body.url),
        offline_timeout: OFFLINE_TIMEOUT,
      }),
    });
  } catch {
    return json({ error: "hyperbeam_unreachable" }, 502);
  }

  if (!res.ok) {
    // Forward Hyperbeam's own message so the room can show *why* -- almost
    // always a free-tier limit (too many concurrent sessions, or out of
    // minutes) rather than a bad link.
    const detail = await res.text().catch(() => "");
    return json({ error: "hyperbeam_error", status: res.status, detail: detail.slice(0, 300) }, 502);
  }

  await remember(keys, context);
  const data = await res.json();
  return json({ embedUrl: data.embed_url, sessionId: data.session_id });
}

export async function onRequestDelete({ request, env }) {
  if (!env.HYPERBEAM_API_KEY) return json({ error: "not_configured" }, 501);
  if (!sameSite(request)) return json({ error: "forbidden" }, 403);
  const sb = supabaseEnv(env);
  if (!sb) return json({ error: "not_configured" }, 501);
  if (!(await whoIs(sb, bearer(request, null)))) return json({ error: "unauthorized" }, 401);

  const sessionId = new URL(request.url).searchParams.get("session_id");
  if (!sessionId || !/^[\w-]{8,80}$/.test(sessionId)) return json({ error: "missing_session" }, 400);

  try {
    await fetch(`${HYPERBEAM}/${encodeURIComponent(sessionId)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${env.HYPERBEAM_API_KEY}` },
    });
  } catch {
    // Best effort; the offline timeout will reap it regardless.
  }
  return json({ ok: true });
}

// Anything else is not something this endpoint does.
export async function onRequest() {
  return json({ error: "method_not_allowed" }, 405);
}
