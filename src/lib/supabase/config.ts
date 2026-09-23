/** Whether the site has a Supabase project to talk to. Kept apart from the client, so asking costs nothing to load. */
export function hasSupabaseConfig(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}
