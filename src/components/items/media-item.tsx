"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import clsx from "clsx";
import {
  ListMusic,
  Music4,
  Pause,
  Play,
  Plus,
  SkipBack,
  SkipForward,
  Trash2,
  Video,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useRoom } from "@/realtime/room-provider";
import { useRoomStore } from "@/state/room-store";
import {
  anchor,
  currentTrack,
  formatClock,
  parseMediaLink,
  projectedPosition,
  trackRef,
} from "@/lib/media";
import ProviderPlayer from "./players/provider-player";
import type { PlayerControl, PlayerState } from "./players/types";
import type { Item, MediaData, MediaProvider, MediaTrack } from "@/lib/types";

/** How far the local playhead may wander before we snap it back. */
const DRIFT_TOLERANCE_SEC = 1.4;
const SYNC_INTERVAL_MS = 1500;
const VOLUME_KEY = "nook.volume";

export default function MediaItem({
  item,
  selected,
}: {
  item: Item<"media">;
  selected: boolean;
}) {
  const { updateData, canEdit } = useRoom();
  const me = useRoomStore((s) => s.me);
  const media = item.data;
  const track = currentTrack(media);

  const playerRef = useRef<PlayerControl | null>(null);
  const suppress = useRef(false);
  const loadedRef = useRef<string | null>(null);
  const mediaRef = useRef(media);

  // Interval and player callbacks outlive the render they were created in, so
  // they read shared state through this ref rather than a stale closure.
  useEffect(() => {
    mediaRef.current = media;
  });

  // The mounted player reports which provider it is ready for; switching
  // provider (a new key) makes this false until the new one reports back.
  const [readyFor, setReadyFor] = useState<MediaProvider | null>(null);
  const ready = track != null && readyFor === track.provider;
  // We muted the player only to satisfy the browser's autoplay policy, so the
  // video can play in sync for everyone without a click; the user unmutes when
  // they want sound.
  const [autoMuted, setAutoMuted] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showQueue, setShowQueue] = useState(false);
  const [adding, setAdding] = useState("");
  const [volume, setVolume] = useState(() => {
    if (typeof window === "undefined") return 60;
    const stored = Number(window.localStorage.getItem(VOLUME_KEY));
    return Number.isFinite(stored) && stored >= 0 && stored <= 100 ? stored : 60;
  });
  const [muted, setMuted] = useState(false);

  const write = useCallback(
    (next: MediaData) => {
      void updateData(item.id, next);
    },
    [item.id, updateData],
  );

  /** Runs a player call without letting the resulting event echo back out. */
  const quietly = useCallback((fn: () => void) => {
    suppress.current = true;
    try {
      fn();
    } finally {
      window.setTimeout(() => {
        suppress.current = false;
      }, 220);
    }
  }, []);

  const advance = useCallback(
    (state: MediaData, delta: number) => {
      if (state.queue.length === 0) return;
      const next = state.index + delta;

      if (next >= state.queue.length) {
        write({ ...state, index: 0, positionSec: 0, playing: false, anchoredAt: Date.now() });
        return;
      }
      const index = Math.max(0, next);
      write({ ...state, index, positionSec: 0, playing: true, anchoredAt: Date.now() });
    },
    [write],
  );

  // ---------------------------------------------------------------------------
  // Player events (mirror a user's own play/pause/skip into shared state)
  // ---------------------------------------------------------------------------

  const handleStateChange = useCallback(
    (state: PlayerState) => {
      if (suppress.current) return;
      const s = mediaRef.current;
      const at = playerRef.current?.getTime() ?? s.positionSec;
      if (state === "playing" && !s.playing) {
        write(anchor(s, at, true));
      } else if (state === "paused" && s.playing) {
        write(anchor(s, at, false));
      } else if (state === "ended") {
        advance(s, 1);
      }
    },
    [advance, write],
  );

  // Load whichever track the room is on.
  useEffect(() => {
    const player = playerRef.current;
    if (!ready || !player || !track) return;

    const ref = trackRef(track);
    if (loadedRef.current === ref) return;

    loadedRef.current = ref;
    const start = projectedPosition(media);
    quietly(() => player.load(ref, start, media.playing));
  }, [ready, track, media, quietly]);

  // Follow shared play/pause. When someone else hits play, the browser will
  // refuse to autoplay with sound on a client that has not interacted, which is
  // exactly why "it only worked locally". Muted autoplay is always allowed, so
  // we fall back to that and let the person unmute -- everyone stays in sync.
  useEffect(() => {
    const player = playerRef.current;
    if (!ready || !player || !track) return;

    const state = player.state();
    if (media.playing && state !== "playing" && state !== "buffering") {
      quietly(() => player.play());
      window.setTimeout(() => {
        const p = playerRef.current;
        if (!p || !mediaRef.current.playing) return;
        const s = p.state();
        if (s === "unstarted" || s === "cued" || s === "paused") {
          p.mute();
          setAutoMuted(true);
          quietly(() => {
            p.seek(projectedPosition(mediaRef.current));
            p.play();
          });
        }
      }, 400);
    } else if (!media.playing && state === "playing") {
      quietly(() => player.pause());
    }
  }, [ready, media.playing, media.anchoredAt, track, quietly]);

  // Drift correction plus the local progress readout.
  useEffect(() => {
    if (!ready) return;

    const tick = () => {
      const player = playerRef.current;
      if (!player) return;

      const now = player.getTime();
      setElapsed(now);
      setDuration(player.getDuration() || 0);

      const state = mediaRef.current;
      if (!state.playing || !currentTrack(state)) return;

      const expected = projectedPosition(state);
      if (Math.abs(expected - now) > DRIFT_TOLERANCE_SEC) {
        quietly(() => player.seek(expected));
      }

      // Shared state says play but this client is stuck (autoplay blocked): force
      // muted playback so the room stays together, and offer an unmute prompt.
      const s = player.state();
      if (s !== "playing" && s !== "buffering") {
        player.mute();
        setAutoMuted(true);
        quietly(() => player.play());
      }
    };

    const fast = window.setInterval(() => {
      const player = playerRef.current;
      if (player) setElapsed(player.getTime());
    }, 250);
    const slow = window.setInterval(tick, SYNC_INTERVAL_MS);
    tick();

    return () => {
      window.clearInterval(fast);
      window.clearInterval(slow);
    };
  }, [ready, quietly]);

  useEffect(() => {
    const player = playerRef.current;
    if (!ready || !player) return;
    if (muted || autoMuted) {
      player.mute();
    } else {
      player.unMute();
      player.setVolume(volume);
    }
    if (typeof window !== "undefined") {
      window.localStorage.setItem(VOLUME_KEY, String(volume));
    }
  }, [ready, volume, muted, autoMuted]);

  // ---------------------------------------------------------------------------
  // Controls
  // ---------------------------------------------------------------------------

  const toggle = useCallback(() => {
    if (!canEdit) return;
    const player = playerRef.current;
    const at = player ? player.getTime() : media.positionSec;
    write(anchor(media, at, !media.playing));
  }, [canEdit, media, write]);

  const scrub = useCallback(
    (seconds: number) => {
      if (!canEdit) return;
      const player = playerRef.current;
      quietly(() => player?.seek(seconds));
      write(anchor(media, seconds, media.playing));
    },
    [canEdit, media, quietly, write],
  );

  const addTrack = useCallback(
    (raw: string) => {
      const parsed = parseMediaLink(raw);
      if (!parsed) return false;

      const entry: MediaTrack = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        provider: parsed.provider,
        ref: parsed.ref,
        title: parsed.title,
        addedBy: me?.name ?? "someone",
      };

      const wasEmpty = media.queue.length === 0;
      write({
        ...media,
        queue: [...media.queue, entry],
        ...(wasEmpty ? { index: 0, positionSec: 0, playing: true, anchoredAt: Date.now() } : {}),
      });
      return true;
    },
    [me, media, write],
  );

  const removeTrack = useCallback(
    (id: string) => {
      const index = media.queue.findIndex((t) => t.id === id);
      if (index < 0) return;

      const queue = media.queue.filter((t) => t.id !== id);
      let nextIndex = media.index;
      if (index < media.index) nextIndex -= 1;
      else if (index === media.index) nextIndex = Math.min(media.index, queue.length - 1);

      write({
        ...media,
        queue,
        index: Math.max(0, nextIndex),
        ...(index === media.index ? { positionSec: 0, anchoredAt: Date.now() } : {}),
      });
    },
    [media, write],
  );

  const compact = media.audioOnly || item.height < 260;

  return (
    <div className="surface grain relative flex size-full flex-col overflow-hidden rounded-2xl">
      <div
        className={clsx(
          "relative bg-black transition-all",
          compact ? "h-0" : "flex-1",
        )}
      >
        {track ? (
          <ProviderPlayer
            key={track.provider}
            provider={track.provider}
            ref={playerRef}
            onReady={() => setReadyFor(track.provider)}
            onStateChange={handleStateChange}
            onDuration={setDuration}
          />
        ) : (
          <div className="absolute inset-0 grid place-items-center bg-ink-900 px-6 text-center">
            <div className="text-muted">
              <Music4 className="mx-auto mb-2 size-6" strokeWidth={1.7} />
              <p className="text-sm">nothing queued yet</p>
              <p className="mt-1 text-xs opacity-70">cola um link do youtube, soundcloud ou um .mp3</p>
            </div>
          </div>
        )}

        {/* While unselected, a transparent shield lets the canvas pan and zoom
            over the video instead of the wheel falling through to the iframe
            (which would zoom the browser). Clicking it selects the item. */}
        {!selected && <div className="absolute inset-0" />}

        {autoMuted && track && (
          <button
            type="button"
            onClick={() => {
              setAutoMuted(false);
              setMuted(false);
              const player = playerRef.current;
              player?.unMute();
              player?.setVolume(volume);
            }}
            className="absolute bottom-2.5 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-chalk/95 px-3 py-1.5 text-xs font-semibold text-ink-950 shadow-lg transition hover:bg-white"
          >
            <VolumeX className="size-3.5" strokeWidth={2.4} />
            playing muted &mdash; tap for sound
          </button>
        )}
      </div>

      {compact && track && (
        <div className="flex items-center gap-3 border-b border-white/8 px-3 py-2.5">
          <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-glow/20 ring-1 ring-glow/30">
            <Music4
              className={clsx("size-4 text-glow", media.playing && "animate-pulse")}
              strokeWidth={2.2}
            />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium">{track.title}</p>
            <p className="truncate text-[11px] text-muted">added by {track.addedBy}</p>
          </div>
        </div>
      )}

      <div className="space-y-2 px-3 py-2.5">
        <Scrubber
          elapsed={elapsed}
          duration={duration}
          disabled={!canEdit || !track}
          onSeek={scrub}
        />

        <div className="flex items-center gap-1.5">
          <IconButton
            label="previous"
            disabled={!canEdit || media.index === 0}
            onClick={() => advance(media, -1)}
          >
            <SkipBack className="size-4" strokeWidth={2.2} />
          </IconButton>

          <button
            type="button"
            onClick={toggle}
            disabled={!canEdit || !track}
            aria-label={media.playing ? "pause" : "play"}
            className="grid size-9 place-items-center rounded-full bg-chalk text-ink-950 transition hover:bg-white disabled:opacity-40"
          >
            {media.playing ? (
              <Pause className="size-4 fill-current" strokeWidth={0} />
            ) : (
              <Play className="size-4 translate-x-px fill-current" strokeWidth={0} />
            )}
          </button>

          <IconButton
            label="next"
            disabled={!canEdit || media.index >= media.queue.length - 1}
            onClick={() => advance(media, 1)}
          >
            <SkipForward className="size-4" strokeWidth={2.2} />
          </IconButton>

          <div className="mx-1 flex flex-1 items-center gap-1.5">
            <IconButton label={muted ? "unmute" : "mute"} onClick={() => setMuted((m) => !m)}>
              {muted ? (
                <VolumeX className="size-4" strokeWidth={2.2} />
              ) : (
                <Volume2 className="size-4" strokeWidth={2.2} />
              )}
            </IconButton>
            <input
              type="range"
              min={0}
              max={100}
              value={muted ? 0 : volume}
              onChange={(event) => {
                setMuted(false);
                setVolume(Number(event.target.value));
              }}
              aria-label="volume"
              className="h-1 w-full max-w-20 cursor-pointer appearance-none rounded-full bg-white/15 accent-glow"
            />
          </div>

          <IconButton
            label="audio only"
            active={media.audioOnly}
            disabled={!canEdit}
            onClick={() => write({ ...media, audioOnly: !media.audioOnly })}
          >
            {media.audioOnly ? (
              <Video className="size-4" strokeWidth={2.2} />
            ) : (
              <Music4 className="size-4" strokeWidth={2.2} />
            )}
          </IconButton>

          <IconButton
            label="queue"
            active={showQueue}
            onClick={() => setShowQueue((v) => !v)}
          >
            <ListMusic className="size-4" strokeWidth={2.2} />
          </IconButton>
        </div>

        {showQueue && (
          <div className="animate-drift-in space-y-1.5 pt-1">
            {canEdit && (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  if (addTrack(adding)) setAdding("");
                }}
                className="flex gap-1.5"
              >
                <input
                  value={adding}
                  onChange={(event) => setAdding(event.target.value)}
                  onKeyDown={(event) => event.stopPropagation()}
                  placeholder="youtube, soundcloud ou .mp3"
                  spellCheck={false}
                  className="min-w-0 flex-1 rounded-lg bg-white/8 px-2.5 py-1.5 text-xs ring-1 ring-white/10 outline-none placeholder:text-muted/60 focus:ring-glow/50"
                />
                <button
                  type="submit"
                  aria-label="add to queue"
                  className="grid size-7 shrink-0 place-items-center rounded-lg bg-glow/25 text-glow transition hover:bg-glow/35"
                >
                  <Plus className="size-3.5" strokeWidth={2.6} />
                </button>
              </form>
            )}

            <ul className="max-h-28 space-y-0.5 overflow-y-auto">
              {media.queue.map((entry, index) => (
                <li
                  key={entry.id}
                  className={clsx(
                    "group flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs",
                    index === media.index ? "bg-glow/18 text-chalk" : "text-muted hover:bg-white/5",
                  )}
                >
                  <button
                    type="button"
                    disabled={!canEdit}
                    onClick={() =>
                      write({ ...media, index, positionSec: 0, playing: true, anchoredAt: Date.now() })
                    }
                    className="min-w-0 flex-1 truncate text-left"
                  >
                    {entry.title}
                    <span className="ml-1.5 opacity-60">{entry.addedBy}</span>
                  </button>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => removeTrack(entry.id)}
                      aria-label="remove"
                      className="opacity-0 transition group-hover:opacity-100 hover:text-red-300"
                    >
                      <Trash2 className="size-3.5" strokeWidth={2.2} />
                    </button>
                  )}
                </li>
              ))}
              {media.queue.length === 0 && (
                <li className="px-2 py-1.5 text-xs text-muted/60">the queue is empty</li>
              )}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

function Scrubber({
  elapsed,
  duration,
  disabled,
  onSeek,
}: {
  elapsed: number;
  duration: number;
  disabled: boolean;
  onSeek: (seconds: number) => void;
}) {
  const pct = duration > 0 ? Math.min(100, (elapsed / duration) * 100) : 0;

  return (
    <div className="flex items-center gap-2 text-[10px] tabular-nums text-muted">
      <span className="w-8 shrink-0 text-right">{formatClock(elapsed)}</span>
      <div
        role="slider"
        aria-label="seek"
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        aria-valuenow={Math.round(elapsed)}
        tabIndex={disabled ? -1 : 0}
        onPointerDown={(event) => {
          if (disabled || duration <= 0) return;
          const rect = event.currentTarget.getBoundingClientRect();
          const ratio = (event.clientX - rect.left) / rect.width;
          onSeek(Math.max(0, Math.min(duration, ratio * duration)));
        }}
        className={clsx(
          "group relative h-3 flex-1",
          disabled ? "cursor-default" : "cursor-pointer",
        )}
      >
        <div className="absolute top-1/2 h-1 w-full -translate-y-1/2 overflow-hidden rounded-full bg-white/12">
          <div className="h-full rounded-full bg-glow" style={{ width: `${pct}%` }} />
        </div>
        <div
          className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-chalk opacity-0 transition group-hover:opacity-100"
          style={{ left: `${pct}%` }}
        />
      </div>
      <span className="w-8 shrink-0">{formatClock(duration)}</span>
    </div>
  );
}

function IconButton({
  children,
  label,
  onClick,
  disabled,
  active,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={clsx(
        "grid size-7 shrink-0 place-items-center rounded-lg transition disabled:opacity-35",
        active ? "bg-glow/25 text-glow" : "text-muted hover:bg-white/8 hover:text-chalk",
      )}
    >
      {children}
    </button>
  );
}
