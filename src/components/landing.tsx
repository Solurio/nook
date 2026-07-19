"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight, DoorOpen, Loader2, Sparkles, X } from "lucide-react";
import { hasSupabaseConfig, supabaseBrowser } from "@/lib/supabase/client";
import { generateSlug, normalizeSlugInput } from "@/lib/slug";
import {
  forgetRoom,
  loadLocalIdentity,
  loadRecentRooms,
  randomName,
  randomTint,
  saveLocalIdentity,
  type RecentRoom,
} from "@/lib/identity";

export default function Landing() {
  const router = useRouter();
  const [recent, setRecent] = useState<RecentRoom[]>([]);
  const [joinValue, setJoinValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const configured = hasSupabaseConfig();

  // Recent rooms live in localStorage, which only exists after hydration.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setRecent(loadRecentRooms()), []);

  const createRoom = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setError(null);

    try {
      const supabase = supabaseBrowser();

      const {
        data: { session },
      } = await supabase.auth.getSession();

      let userId = session?.user?.id ?? null;
      if (!userId) {
        const { data, error: authError } = await supabase.auth.signInAnonymously();
        if (authError) throw authError;
        userId = data.user?.id ?? null;
      }
      if (!userId) throw new Error("Could not start a session.");

      if (!loadLocalIdentity()) {
        saveLocalIdentity({ name: randomName(), tint: randomTint() });
      }

      // Slugs are random, but a collision would fail the unique index rather
      // than silently hand two groups the same room.
      let slug = generateSlug();
      for (let attempt = 0; attempt < 4; attempt += 1) {
        const { data, error: insertError } = await supabase
          .from("rooms")
          .insert({ slug, name: "untitled nook", owner_id: userId })
          .select("slug")
          .single();

        if (!insertError && data) {
          router.push(`/r/${data.slug}`);
          return;
        }
        if (insertError && insertError.code !== "23505") throw insertError;
        slug = generateSlug();
      }
      throw new Error("Could not find a free name. Try again.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not make a nook.");
      setBusy(false);
    }
  }, [busy, router]);

  const join = useCallback(
    (event: React.FormEvent) => {
      event.preventDefault();
      const slug = normalizeSlugInput(joinValue);
      if (!slug) {
        setError("That does not look like a nook link.");
        return;
      }
      router.push(`/r/${slug}`);
    },
    [joinValue, router],
  );

  const drop = useCallback((slug: string) => {
    forgetRoom(slug);
    setRecent(loadRecentRooms());
  }, []);

  return (
    <main className="relative min-h-dvh overflow-hidden">
      <Backdrop />

      <div className="relative mx-auto flex min-h-dvh w-full max-w-5xl flex-col px-6 py-10">
        <header className="flex items-center gap-2.5">
          <div className="grid size-9 place-items-center rounded-xl bg-glow/20 ring-1 ring-glow/35">
            <DoorOpen className="size-4.5 text-glow" strokeWidth={2} />
          </div>
          <span className="text-lg font-semibold tracking-tight">nook</span>
        </header>

        <div className="flex flex-1 flex-col justify-center py-16">
          <div className="max-w-2xl">
            <p className="mb-5 inline-flex items-center gap-1.5 rounded-full bg-white/5 px-3 py-1 text-xs text-muted ring-1 ring-white/10">
              <Sparkles className="size-3 text-warm" strokeWidth={2.2} />
              rooms that stay put
            </p>

            <h1 className="text-5xl leading-[1.05] font-semibold tracking-tight text-balance sm:text-6xl">
              A little room on the internet,
              <br />
              <span className="text-glow">shared with people you like.</span>
            </h1>

            <p className="mt-6 max-w-lg text-base leading-relaxed text-muted">
              Pin photos, scribble notes, queue music, watch things together and
              play a round of something. Everything you drop stays exactly where
              you left it, and everyone in the room sees it happen live.
            </p>

            <div className="mt-9 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={createRoom}
                disabled={busy || !configured}
                className="group inline-flex items-center gap-2 rounded-2xl bg-chalk px-5 py-3 text-sm font-semibold text-ink-950 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy ? (
                  <Loader2 className="size-4 animate-spin" strokeWidth={2.4} />
                ) : (
                  <DoorOpen className="size-4" strokeWidth={2.4} />
                )}
                {busy ? "opening" : "make a nook"}
                {!busy && (
                  <ArrowRight
                    className="size-4 transition-transform group-hover:translate-x-0.5"
                    strokeWidth={2.4}
                  />
                )}
              </button>

              <form onSubmit={join} className="flex items-center gap-2">
                <input
                  value={joinValue}
                  onChange={(e) => setJoinValue(e.target.value)}
                  placeholder="paste a nook link"
                  spellCheck={false}
                  className="w-56 rounded-2xl bg-white/6 px-4 py-3 text-sm ring-1 ring-white/10 outline-none transition placeholder:text-muted/60 focus:bg-white/9 focus:ring-glow/45"
                />
                <button
                  type="submit"
                  className="rounded-2xl bg-white/6 px-4 py-3 text-sm font-medium text-muted ring-1 ring-white/10 transition hover:bg-white/10 hover:text-chalk"
                >
                  join
                </button>
              </form>
            </div>

            {!configured && (
              <p className="mt-5 max-w-lg rounded-xl bg-warm/10 px-4 py-3 text-xs leading-relaxed text-warm ring-1 ring-warm/25">
                Supabase keys are missing. Copy <code>.env.example</code> to{" "}
                <code>.env.local</code>, fill in your project URL and anon key, then
                restart the dev server. The README walks through it.
              </p>
            )}

            {error && (
              <p className="mt-5 max-w-lg rounded-xl bg-red-500/10 px-4 py-3 text-xs text-red-300 ring-1 ring-red-500/25">
                {error}
              </p>
            )}
          </div>

          {recent.length > 0 && (
            <section className="mt-16">
              <h2 className="mb-3 text-xs font-medium tracking-wide text-muted uppercase">
                you have been here
              </h2>
              <ul className="flex flex-wrap gap-2">
                {recent.map((entry) => (
                  <li key={entry.slug} className="group relative">
                    <Link
                      href={`/r/${entry.slug}`}
                      className="flex items-center gap-2.5 rounded-2xl bg-white/5 py-2.5 pr-9 pl-4 text-sm ring-1 ring-white/10 transition hover:bg-white/9 hover:ring-white/20"
                    >
                      <span className="font-medium">{entry.name}</span>
                      <span className="text-xs text-muted/70">{entry.slug}</span>
                    </Link>
                    <button
                      type="button"
                      onClick={() => drop(entry.slug)}
                      aria-label={`Forget ${entry.name}`}
                      className="absolute top-1/2 right-2.5 -translate-y-1/2 rounded-lg p-1 text-muted/50 opacity-0 transition group-hover:opacity-100 hover:bg-white/10 hover:text-chalk"
                    >
                      <X className="size-3.5" strokeWidth={2.4} />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <footer className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-muted/60">
          <span>anyone with the link can walk in</span>
          <span>no account, no email</span>
          <span>lock the room when you want it left alone</span>
        </footer>
      </div>
    </main>
  );
}

function Backdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      <div className="absolute inset-0 bg-[radial-gradient(90rem_50rem_at_18%_-12%,#3b2a52_0%,transparent_58%),radial-gradient(70rem_44rem_at_92%_8%,#2a3550_0%,transparent_55%),linear-gradient(180deg,#151120_0%,#100d16_60%)]" />
      <div className="absolute inset-0 opacity-[0.05] mix-blend-overlay [background-image:url('data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22200%22%20height%3D%22200%22%3E%3Cfilter%20id%3D%22n%22%3E%3CfeTurbulence%20type%3D%22fractalNoise%22%20baseFrequency%3D%220.8%22%20numOctaves%3D%224%22%2F%3E%3C%2Ffilter%3E%3Crect%20width%3D%22100%25%22%20height%3D%22100%25%22%20filter%3D%22url(%23n)%22%2F%3E%3C%2Fsvg%3E')]" />
    </div>
  );
}
