"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ExternalLink, Hand, MonitorUp, Radio, Volume2, VolumeX } from "lucide-react";
import { useRoom } from "@/realtime/room-provider";
import { useRoomStore } from "@/state/room-store";
import { useScreencast } from "@/realtime/use-screencast";
import type { Item } from "@/lib/types";

/**
 * A live tab/screen share. Whoever "takes the seat" shares a tab from their own
 * browser -- with their own logins -- and everyone else watches it live, with
 * sound. Hand off by taking the seat; the previous sharer stops automatically.
 */
export default function ScreencastItem({ item }: { item: Item<"screencast"> }) {
  const { updateData, canEdit, sendSignal, onSignal } = useRoom();
  const me = useRoomStore((s) => s.me);
  const peers = useRoomStore((s) => s.peers);
  const data = item.data;

  const myId = me?.userId ?? "me";
  const broadcaster = data.broadcaster;
  const amBroadcaster = broadcaster?.userId === myId;

  const peerIds = useMemo(
    () => Object.keys(peers).filter((id) => id !== myId),
    [peers, myId],
  );

  const { localStream, remoteStream, cancelled, startShare, stopShare } = useScreencast({
    itemId: item.id,
    broadcasterId: broadcaster?.userId ?? null,
    me: myId,
    peerIds,
    sendSignal,
    onSignal,
  });

  const [urlDraft, setUrlDraft] = useState(data.url ?? "");
  const [muted, setMuted] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);

  const stream = amBroadcaster ? localStream : remoteStream;

  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = stream;
  }, [stream]);

  // If someone else takes the seat while I was sharing, drop my capture.
  useEffect(() => {
    if (localStream && broadcaster?.userId !== myId) stopShare();
  }, [broadcaster, localStream, myId, stopShare]);

  const begin = async () => {
    if (!canEdit) return;
    const ok = await startShare();
    if (ok) {
      await updateData<"screencast">(item.id, {
        url: urlDraft.trim() || data.url,
        broadcaster: { userId: myId, name: me?.name ?? "someone" },
      });
    }
  };

  const end = async () => {
    stopShare();
    await updateData<"screencast">(item.id, { ...data, broadcaster: null });
  };

  // ----- Someone is broadcasting -----
  if (broadcaster) {
    return (
      <div className="surface relative flex size-full flex-col overflow-hidden rounded-2xl">
        <div className="flex items-center gap-2 border-b border-white/8 px-3 py-2">
          <Radio className="size-3.5 shrink-0 animate-pulse text-red-400" strokeWidth={2.4} />
          <span className="min-w-0 flex-1 truncate text-[11px] text-muted">
            {amBroadcaster ? "you are sharing" : `${broadcaster.name} is sharing`}
            {data.url ? ` · ${safeHost(data.url)}` : ""}
          </span>
          {!amBroadcaster && (
            <button
              type="button"
              onClick={() => setMuted((m) => !m)}
              title={muted ? "unmute" : "mute"}
              className="shrink-0 text-muted transition hover:text-chalk"
            >
              {muted ? <VolumeX className="size-3.5" strokeWidth={2.2} /> : <Volume2 className="size-3.5" strokeWidth={2.2} />}
            </button>
          )}
        </div>

        <div className="relative min-h-0 flex-1 bg-black">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted={amBroadcaster || muted}
            className="size-full object-contain"
          />
          {!amBroadcaster && !remoteStream && (
            <div className="absolute inset-0 grid place-items-center text-xs text-muted">
              conectando ao stream…
            </div>
          )}
          {!amBroadcaster && muted && remoteStream && (
            <button
              type="button"
              onClick={() => setMuted(false)}
              className="absolute bottom-2 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-chalk/95 px-3 py-1.5 text-xs font-semibold text-ink-950 shadow-lg transition hover:bg-white"
            >
              <VolumeX className="size-3.5" strokeWidth={2.4} />
              tocar com som
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5 border-t border-white/8 px-2.5 py-2">
          {amBroadcaster ? (
            <button
              type="button"
              onClick={() => void end()}
              className="flex-1 rounded-lg bg-red-500/20 py-1.5 text-xs font-semibold text-red-200 transition hover:bg-red-500/30"
            >
              parar de transmitir
            </button>
          ) : (
            canEdit && (
              <button
                type="button"
                onClick={() => void begin()}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-white/8 py-1.5 text-xs font-semibold text-chalk transition hover:bg-white/12"
              >
                <Hand className="size-3.5" strokeWidth={2.2} />
                assumir (transmitir eu)
              </button>
            )
          )}
        </div>
      </div>
    );
  }

  // ----- Idle: nobody sharing -----
  return (
    <div className="surface grid size-full place-items-center rounded-2xl p-5 text-center">
      {canEdit ? (
        <div className="w-full max-w-[320px] space-y-2.5">
          <div className="flex items-center justify-center gap-1.5 text-muted">
            <MonitorUp className="size-4" strokeWidth={2} />
            <span className="text-xs font-medium">transmitir uma aba</span>
          </div>
          <div className="flex gap-1.5">
            <input
              value={urlDraft}
              onChange={(event) => setUrlDraft(event.target.value)}
              onKeyDown={(event) => event.stopPropagation()}
              placeholder="link (opcional)"
              spellCheck={false}
              className="min-w-0 flex-1 rounded-xl bg-white/8 px-3 py-2 text-xs ring-1 ring-white/12 outline-none placeholder:text-muted/60 focus:ring-glow/50"
            />
            {urlDraft.trim() && (
              <button
                type="button"
                onClick={() => window.open(normalize(urlDraft), "_blank", "noopener")}
                title="abrir numa aba pra depois compartilhar"
                className="grid size-9 shrink-0 place-items-center rounded-xl bg-white/8 text-muted transition hover:bg-white/12 hover:text-chalk"
              >
                <ExternalLink className="size-3.5" strokeWidth={2.2} />
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => void begin()}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-chalk py-2 text-xs font-semibold text-ink-950 transition hover:bg-white"
          >
            <MonitorUp className="size-3.5" strokeWidth={2.4} />
            escolher aba e transmitir
          </button>
          {cancelled && (
            <p className="text-[11px] text-muted/70">
              compartilhamento cancelado. abra a aba do site, clique acima e escolha essa aba.
            </p>
          )}
          <p className="text-[10px] leading-relaxed text-muted/60">
            você escolhe uma aba do seu navegador (com seus logins), e todo mundo vê ao vivo. quem
            quiser jogar/usar, clica em assumir.
          </p>
        </div>
      ) : (
        <div className="text-muted">
          <MonitorUp className="mx-auto mb-2 size-5" strokeWidth={1.8} />
          <p className="text-xs">ninguém transmitindo</p>
        </div>
      )}
    </div>
  );
}

function normalize(raw: string): string {
  const value = raw.trim();
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

function safeHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
