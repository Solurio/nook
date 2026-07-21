// Cloudflare Pages Function: creates and terminates Hyperbeam sessions.
//
// This is the ONLY server-side piece of the app. It exists solely to keep the
// Hyperbeam API key secret -- the key never reaches the browser. Everything
// else runs static. Cloudflare serves this at /api/cobrowse alongside the
// static site; no separate server.
//
// Env vars (set these in the Cloudflare Pages project, not in the repo):
//   HYPERBEAM_API_KEY  (required, secret)  -- from hyperbeam.com
//   SUPABASE_URL       (optional)          -- turns on the logged-in check
//   SUPABASE_ANON_KEY  (optional)
//
// Cost guard: sessions terminate on their own once everyone disconnects (see
// OFFLINE_TIMEOUT), and the client also calls DELETE when a browser is closed.

const HYPERBEAM = "https://engine.hyperbeam.com/v0/vm";

// Seconds the cloud machine keeps running after the last person disconnects.
// This is the main thing keeping the bill small -- an abandoned session dies.
const OFFLINE_TIMEOUT = 180;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/**
 * If Supabase env is configured, only let signed-in room members spin up a
 * session (they cost money). Without it, we fall back to open access guarded
 * only by the offline timeout.
 */
async function isAllowed(env, token) {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) return true;
  if (!token) return false;
  try {
    const res = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: env.SUPABASE_ANON_KEY },
    });
    return res.ok;
  } catch {
    return false;
  }
}

function normalizeUrl(raw) {
  const value = String(raw || "").trim();
  if (!value) return "https://www.google.com";
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

export async function onRequestPost({ request, env }) {
  if (!env.HYPERBEAM_API_KEY) {
    return json({ error: "not_configured" }, 501);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  if (!(await isAllowed(env, body.token))) {
    return json({ error: "unauthorized" }, 401);
  }

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

  const data = await res.json();
  return json({ embedUrl: data.embed_url, sessionId: data.session_id });
}

export async function onRequestDelete({ request, env }) {
  if (!env.HYPERBEAM_API_KEY) return json({ error: "not_configured" }, 501);

  const sessionId = new URL(request.url).searchParams.get("session_id");
  if (!sessionId) return json({ error: "missing_session" }, 400);

  try {
    await fetch(`${HYPERBEAM}/${sessionId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${env.HYPERBEAM_API_KEY}` },
    });
  } catch {
    // Best effort; the offline timeout will reap it regardless.
  }
  return json({ ok: true });
}
