"use client";

import { BUNDLED_CSS } from "@/lib/fonts";
import { useEffect } from "react";
import Link from "next/link";
import { Loader2, X } from "lucide-react";
import { hasSupabaseConfig } from "@/lib/supabase/client";
import { RoomProvider, useRoom } from "@/realtime/room-provider";
import { useRoomStore } from "@/state/room-store";
import type { Room } from "@/lib/types";
import Canvas from "@/components/canvas/canvas";
import JoinGate from "@/components/room/join-gate";
import TopBar from "@/components/chrome/top-bar";
import Dock from "@/components/chrome/dock";
import ChatPanel from "@/components/chrome/chat-panel";
import BackgroundPanel from "@/components/chrome/background-panel";
import PeersPanel from "@/components/chrome/peers-panel";
import Inspector from "@/components/chrome/inspector";
import FocusView from "@/components/room/focus-view";
import ChromeToggle from "@/components/chrome/chrome-toggle";
import MultiBar from "@/components/chrome/multi-bar";
import { t as tx } from "@/lib/i18n";
import { Localized } from "@/components/localized";

export default function RoomShell({
  slug,
  initialRoom,
}: {
  slug: string;
  initialRoom: Room | null;
}) {
  useEffect(() => {
    document.body.classList.add("is-room");
    return () => document.body.classList.remove("is-room");
  }, []);

  // Without keys the Supabase client throws on construction, which would take
  // the whole route down. Say what is missing instead.
  if (!hasSupabaseConfig()) {
    return (
      <Localized>
        <NotConfigured />
      </Localized>
    );
  }

  return (
    <RoomProvider slug={slug} initialRoom={initialRoom}>
      {/* Inside the provider, so changing language redraws the room without
          dropping its connection. */}
      <Localized>
        <RoomBody />
      </Localized>
    </RoomProvider>
  );
}

function NotConfigured() {
  return (
    <main className="grid min-h-dvh place-items-center bg-ink-950 px-6">
      <div className="w-full max-w-md text-center">
        <h1 className="text-xl font-semibold">{tx("Nothing is plugged in yet.")}</h1>
        <p className="mt-2.5 text-sm leading-relaxed text-muted">{tx("This nook needs a Supabase project to keep its things in. Copy")}{" "}
          <code className="rounded bg-white/8 px-1 py-0.5 text-xs">.env.example</code>{" "}{tx("to")}{" "}
          <code className="rounded bg-white/8 px-1 py-0.5 text-xs">.env.local</code>{tx(", add your project URL and anon key, then restart the dev server.")}</p>
        <Link
          href="/"
          className="mt-6 inline-block rounded-2xl bg-chalk px-5 py-2.5 text-sm font-semibold text-ink-950 transition hover:bg-white"
        >{tx("back to the front door")}</Link>
      </div>
    </main>
  );
}

function RoomBody() {
  const { status, error, joined } = useRoom();
  const panel = useRoomStore((s) => s.panel);
  const chromeHidden = useRoomStore((s) => s.chromeHidden);

  if (status === "error") {
    return (
      <main className="grid min-h-dvh place-items-center bg-ink-950 px-6">
        <div className="w-full max-w-sm text-center">
          <h1 className="text-xl font-semibold">{tx("This door does not open.")}</h1>
          <p className="mt-2.5 text-sm leading-relaxed text-muted">{error && tx(error)}</p>
          <Link
            href="/"
            className="mt-6 inline-block rounded-2xl bg-chalk px-5 py-2.5 text-sm font-semibold text-ink-950 transition hover:bg-white"
          >{tx("make your own")}</Link>
        </div>
      </main>
    );
  }

  if (status === "loading") {
    return (
      <main className="grid min-h-dvh place-items-center bg-ink-950">
        <div className="flex items-center gap-2.5 text-sm text-muted">
          <Loader2 className="size-4 animate-spin" strokeWidth={2.4} />{tx("finding the room")}</div>
      </main>
    );
  }

  if (!joined) return <JoinGate />;

  return (
    <main className="relative h-dvh w-full overflow-hidden">
      <style>{BUNDLED_CSS}</style>
      <Canvas />
      {!chromeHidden && (
        <>
          <TopBar />
          <Dock />
          <Inspector />
          <MultiBar />
        </>
      )}
      <ChromeToggle />
      <FocusView />
      {panel === "chat" && <ChatPanel />}
      {panel === "background" && <BackgroundPanel />}
      {panel === "peers" && <PeersPanel />}
      <ActionToast error={error} />
    </main>
  );
}

/**
 * Adds and edits fail through the database, not the render tree, so their errors
 * were going nowhere -- you'd click and see nothing happen. This surfaces them.
 * The classic one: a new item kind the database has not been migrated to accept.
 */
function ActionToast({ error }: { error: string | null }) {
  const { clearError } = useRoom();

  useEffect(() => {
    if (!error) return;
    const t = setTimeout(clearError, 8000);
    return () => clearTimeout(t);
  }, [error, clearError]);

  if (!error) return null;

  const needsMigration = /check constraint|items_kind_check/i.test(error);
  const message = needsMigration
    ? "Could not add that. The database needs the newer migrations (0003 and 0004) before it will accept shared browsers and tab sharing."
    : `That did not save: ${error}`;

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-24 z-50 flex justify-center px-4">
      <div className="surface pointer-events-auto flex max-w-md items-start gap-3 rounded-2xl px-4 py-3 text-sm ring-1 ring-warm/30">
        <p className="flex-1 leading-relaxed text-chalk">{tx(message)}</p>
        <button
          type="button"
          onClick={clearError}
          className="shrink-0 text-muted transition hover:text-chalk"
          title={tx("dismiss")}
        >
          <X className="size-4" strokeWidth={2.4} />
        </button>
      </div>
    </div>
  );
}
