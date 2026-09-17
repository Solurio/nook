"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { ExternalLink, Hand, MonitorUp, Radio, Volume2, VolumeX } from "lucide-react";
import { useRoom } from "@/realtime/room-provider";
import { useRoomStore } from "@/state/room-store";
import { useScreencast } from "@/realtime/use-screencast";
import VolumeSlider from "@/components/chrome/volume-slider";
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

  const peerIds = useMemo(() => Object.keys(peers).filter((id) => id !== myId), [peers, myId]);

  const {
    localStream,
    remoteStream,
    startShare,
    stopShare,
    hasAudio,
    audioMuted,
    setAudioMuted,
  } = useScreencast({
    itemId: item.id,
    broadcasterId: broadcaster?.userId ?? null,
    me: myId,
    peerIds,
    sendSignal,
    onSignal,
  });

  const [urlDraft, setUrlDraft] = useState(data.url ?? "");
  const [shareSound, setShareSound] = useState(true);
  const [muted, setMuted] = useState(true);
  const [volume, setVolume] = useState(80);
  const [notice, setNotice] = useState<"unsupported" | "denied" | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const stream = amBroadcaster ? localStream : remoteStream;

  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = stream;
  }, [stream]);

  // Keep the element's own volume in step with the slider.
  useEffect(() => {
    if (videoRef.current) videoRef.current.volume = volume / 100;
  }, [volume, stream]);

  // If someone else takes the seat while I was sharing, drop my capture.
  useEffect(() => {
    if (localStream && broadcaster?.userId !== myId) stopShare();
  }, [broadcaster, localStream, myId, stopShare]);

  const begin = async () => {
    if (!canEdit) return;
    setNotice(null);
    const result = await startShare(shareSound);
    if (result === "ok") {
      await updateData<"screencast">(item.id, {
        url: urlDraft.trim() || data.url,
        broadcaster: { userId: myId, name: me?.name ?? "someone" },
      });
    } else {
      setNotice(result);
    }
  };

  const end = async () => {
    stopShare();
    await updateData<"screencast">(item.id, { ...data, broadcaster: null });
  };

  const listen = () => {
    setMuted(false);
    if (volume === 0) setVolume(80);
    // Some browsers want the play nudge to come from the tap itself.
    void videoRef.current?.play().catch(() => {});
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
              connecting to the stream...
            </div>
          )}

          {/* The whole picture is the tap target. The old pill was small enough
              to miss on a phone and easy to overlook on a desktop. */}
          {!amBroadcaster && muted && remoteStream && (
            <button
              type="button"
              onClick={listen}
              className="absolute inset-0 grid place-items-center bg-ink-950/45 transition hover:bg-ink-950/35"
            >
              <span className="flex items-center gap-2 rounded-full bg-chalk px-5 py-3 text-sm font-semibold text-ink-950 shadow-xl">
                <Volume2 className="size-4.5" strokeWidth={2.4} />
                tap for sound
              </span>
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 border-t border-white/8 px-2.5 py-2">
          {amBroadcaster ? (
            <>
              <button
                type="button"
                onClick={() => void end()}
                className="flex-1 rounded-lg bg-red-500/20 py-2 text-xs font-semibold text-red-200 transition hover:bg-red-500/30"
              >
                stop sharing
              </button>
              {hasAudio && (
                <button
                  type="button"
                  onClick={() => setAudioMuted(!audioMuted)}
                  title={audioMuted ? "let them hear it again" : "cut the sound going out"}
                  className={clsx(
                    "flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-medium transition",
                    audioMuted
                      ? "bg-warm/20 text-warm"
                      : "bg-white/8 text-muted hover:bg-white/12 hover:text-chalk",
                  )}
                >
                  {audioMuted ? (
                    <VolumeX className="size-3.5" strokeWidth={2.2} />
                  ) : (
                    <Volume2 className="size-3.5" strokeWidth={2.2} />
                  )}
                  {audioMuted ? "muted" : "sound on"}
                </button>
              )}
            </>
          ) : (
            <>
              <VolumeControl
                muted={muted}
                volume={volume}
                onToggle={() => (muted ? listen() : setMuted(true))}
                onChange={(value) => {
                  setVolume(value);
                  if (value > 0 && muted) setMuted(false);
                }}
              />
              {canEdit && (
                <button
                  type="button"
                  onClick={() => void begin()}
                  className="flex shrink-0 items-center justify-center gap-1.5 rounded-lg bg-white/8 px-2.5 py-2 text-xs font-semibold text-chalk transition hover:bg-white/12"
                >
                  <Hand className="size-3.5" strokeWidth={2.2} />
                  take over
                </button>
              )}
            </>
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
            <span className="text-xs font-medium">share a tab</span>
          </div>

          <div className="flex gap-1.5">
            <input
              value={urlDraft}
              onChange={(event) => setUrlDraft(event.target.value)}
              onKeyDown={(event) => event.stopPropagation()}
              placeholder="link (optional)"
              spellCheck={false}
              className="min-w-0 flex-1 rounded-xl bg-white/8 px-3 py-2 text-xs ring-1 ring-white/12 outline-none placeholder:text-muted/60 focus:ring-glow/50"
            />
            {urlDraft.trim() && (
              <button
                type="button"
                onClick={() => window.open(normalize(urlDraft), "_blank", "noopener")}
                title="open it in a tab first, then share"
                className="grid size-9 shrink-0 place-items-center rounded-xl bg-white/8 text-muted transition hover:bg-white/12 hover:text-chalk"
              >
                <ExternalLink className="size-3.5" strokeWidth={2.2} />
              </button>
            )}
          </div>

          <label className="flex cursor-pointer items-center justify-center gap-2 text-[11px] text-muted">
            <input
              type="checkbox"
              checked={shareSound}
              onChange={(event) => setShareSound(event.target.checked)}
              className="size-3.5"
            />
            send sound too
          </label>

          <button
            type="button"
            onClick={() => void begin()}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-chalk py-2.5 text-xs font-semibold text-ink-950 transition hover:bg-white"
          >
            <MonitorUp className="size-3.5" strokeWidth={2.4} />
            pick a tab and share
          </button>

          {notice === "unsupported" && (
            <p className="rounded-lg bg-warm/10 px-2.5 py-1.5 text-[11px] leading-relaxed text-warm ring-1 ring-warm/25">
              this browser will not share a screen. most phones cannot -- use a desktop on Chrome,
              Edge or Firefox, over https.
            </p>
          )}
          {notice === "denied" && (
            <p className="rounded-lg bg-white/6 px-2.5 py-1.5 text-[11px] leading-relaxed text-muted">
              sharing was cancelled or blocked. click again and, in the browser picker, choose the
              tab or screen and confirm.
            </p>
          )}

          <p className="text-[10px] leading-relaxed text-muted/60">
            pick one tab rather than the whole screen and only that tab&apos;s sound goes out, so a
            voice call in another window stays out of it. you can also cut the sound mid-share.
          </p>
        </div>
      ) : (
        <div className="text-muted">
          <MonitorUp className="mx-auto mb-2 size-5" strokeWidth={1.8} />
          <p className="text-xs">nobody is sharing</p>
        </div>
      )}
    </div>
  );
}

/** Speaker toggle plus a slider, sized to be worked with a thumb. */
function VolumeControl({
  muted,
  volume,
  onToggle,
  onChange,
}: {
  muted: boolean;
  volume: number;
  onToggle: () => void;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <button
        type="button"
        onClick={onToggle}
        title={muted ? "unmute" : "mute"}
        aria-label={muted ? "unmute" : "mute"}
        className="grid size-9 shrink-0 place-items-center rounded-lg bg-white/8 text-chalk transition hover:bg-white/12"
      >
        {muted ? (
          <VolumeX className="size-4" strokeWidth={2.2} />
        ) : (
          <Volume2 className="size-4" strokeWidth={2.2} />
        )}
      </button>
      <VolumeSlider value={muted ? 0 : volume} onChange={onChange} className="min-w-0 flex-1" />
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
