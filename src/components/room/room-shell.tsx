"use client";

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
import StickersPanel from "@/components/chrome/stickers-panel";
import Inspector from "@/components/chrome/inspector";

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
  if (!hasSupabaseConfig()) return <NotConfigured />;

  return (
    <RoomProvider slug={slug} initialRoom={initialRoom}>
      <RoomBody />
    </RoomProvider>
  );
}

function NotConfigured() {
  return (
    <main className="grid min-h-dvh place-items-center bg-ink-950 px-6">
      <div className="w-full max-w-md text-center">
        <h1 className="text-xl font-semibold">Nothing is plugged in yet.</h1>
        <p className="mt-2.5 text-sm leading-relaxed text-muted">
          This nook needs a Supabase project to keep its things in. Copy{" "}
          <code className="rounded bg-white/8 px-1 py-0.5 text-xs">.env.example</code> to{" "}
          <code className="rounded bg-white/8 px-1 py-0.5 text-xs">.env.local</code>, add your
          project URL and anon key, then restart the dev server.
        </p>
        <Link
          href="/"
          className="mt-6 inline-block rounded-2xl bg-chalk px-5 py-2.5 text-sm font-semibold text-ink-950 transition hover:bg-white"
        >
          back to the front door
        </Link>
      </div>
    </main>
  );
}

function RoomBody() {
  const { status, error, joined } = useRoom();
  const panel = useRoomStore((s) => s.panel);

  if (status === "error") {
    return (
      <main className="grid min-h-dvh place-items-center bg-ink-950 px-6">
        <div className="w-full max-w-sm text-center">
          <h1 className="text-xl font-semibold">This door does not open.</h1>
          <p className="mt-2.5 text-sm leading-relaxed text-muted">{error}</p>
          <Link
            href="/"
            className="mt-6 inline-block rounded-2xl bg-chalk px-5 py-2.5 text-sm font-semibold text-ink-950 transition hover:bg-white"
          >
            make your own
          </Link>
        </div>
      </main>
    );
  }

  if (status === "loading") {
    return (
      <main className="grid min-h-dvh place-items-center bg-ink-950">
        <div className="flex items-center gap-2.5 text-sm text-muted">
          <Loader2 className="size-4 animate-spin" strokeWidth={2.4} />
          finding the room
        </div>
      </main>
    );
  }

  if (!joined) return <JoinGate />;

  return (
    <main className="relative h-dvh w-full overflow-hidden">
      <Canvas />
      <TopBar />
      <Dock />
      <Inspector />
      {panel === "chat" && <ChatPanel />}
      {panel === "background" && <BackgroundPanel />}
      {panel === "peers" && <PeersPanel />}
      {panel === "stickers" && <StickersPanel />}
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
    ? "Não consegui adicionar isso. O banco precisa das migrações mais novas (0003 e 0004) pra aceitar transmissão de aba e navegador compartilhado."
    : `Algo não salvou: ${error}`;

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-24 z-50 flex justify-center px-4">
      <div className="surface pointer-events-auto flex max-w-md items-start gap-3 rounded-2xl px-4 py-3 text-sm ring-1 ring-warm/30">
        <p className="flex-1 leading-relaxed text-chalk">{message}</p>
        <button
          type="button"
          onClick={clearError}
          className="shrink-0 text-muted transition hover:text-chalk"
          title="fechar"
        >
          <X className="size-4" strokeWidth={2.4} />
        </button>
      </div>
    </div>
  );
}
