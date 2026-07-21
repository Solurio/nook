"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { Music4 } from "lucide-react";
import type { PlayerControl, ProviderPlayerProps } from "./types";

/** Plain audio files (mp3/ogg/wav/...). An <audio> element is fully controllable, so it stays in perfect sync. */
const AudioPlayer = forwardRef<PlayerControl, ProviderPlayerProps>(function AudioPlayer(
  { onReady, onStateChange, onDuration },
  ref,
) {
  const el = useRef<HTMLAudioElement>(null);

  useImperativeHandle(
    ref,
    (): PlayerControl => ({
      load(url, startSec, autoplay) {
        const a = el.current;
        if (!a) return;
        if (a.getAttribute("data-src") !== url) {
          a.setAttribute("data-src", url);
          a.src = url;
          a.load();
        }
        const apply = () => {
          try {
            a.currentTime = startSec;
          } catch {
            // Seeking before metadata is ready; the loadedmetadata pass retries.
          }
          if (autoplay) a.play().catch(() => {});
        };
        if (a.readyState >= 1) apply();
        else a.addEventListener("loadedmetadata", apply, { once: true });
      },
      play() {
        el.current?.play().catch(() => {});
      },
      pause() {
        el.current?.pause();
      },
      seek(sec) {
        const a = el.current;
        if (!a) return;
        try {
          a.currentTime = sec;
        } catch {
          // Ignore seeks that arrive before the source is seekable.
        }
      },
      getTime() {
        return el.current?.currentTime ?? 0;
      },
      getDuration() {
        const d = el.current?.duration;
        return d && Number.isFinite(d) ? d : 0;
      },
      setVolume(volume) {
        const a = el.current;
        if (a) a.volume = Math.max(0, Math.min(1, volume / 100));
      },
      mute() {
        if (el.current) el.current.muted = true;
      },
      unMute() {
        if (el.current) el.current.muted = false;
      },
      state() {
        const a = el.current;
        if (!a || !a.src) return "unstarted";
        if (a.ended) return "ended";
        if (a.paused) return "paused";
        if (a.readyState < 3) return "buffering";
        return "playing";
      },
    }),
    [],
  );

  // The element exists immediately, so it is ready to receive commands at once.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => onReady(), []);

  return (
    <div className="grid size-full place-items-center bg-gradient-to-br from-ink-700 to-ink-900">
      <Music4 className="size-12 text-glow/40" strokeWidth={1.3} />
      <audio
        ref={el}
        preload="metadata"
        onLoadedMetadata={() => onDuration(el.current?.duration || 0)}
        onPlay={() => onStateChange("playing")}
        onPause={() => onStateChange("paused")}
        onEnded={() => onStateChange("ended")}
        onWaiting={() => onStateChange("buffering")}
        className="hidden"
      />
    </div>
  );
});

export default AudioPlayer;
