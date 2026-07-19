import { createClient } from "@supabase/supabase-js";

/**
 * Read-only client for server components. Rooms are world-readable by policy,
 * so the anon key is enough to render the shell before hydration.
 */
export function supabaseServer() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
