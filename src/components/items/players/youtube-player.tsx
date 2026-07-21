"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { loadYouTubeApi, YT_STATE, type YTPlayer } from "@/lib/youtube-api";
import type { PlayerControl, PlayerState, ProviderPlayerProps } from "./types";

function mapState(code: number): PlayerState {
  switch (code) {
    case YT_STATE.PLAYING:
      return "playing";
    case YT_STATE.PAUSED:
      return "paused";
    case YT_STATE.BUFFERING:
      return "buffering";
    case YT_STATE.ENDED:
      return "ended";
    case YT_STATE.CUED:
      return "cued";
    default:
      return "unstarted";
  }
}

const YouTubePlayer = forwardRef<PlayerControl, ProviderPlayerProps>(function YouTubePlayer(
  { onReady, onStateChange, onDuration },
  ref,
) {
  const host = useRef<HTMLDivElement>(null);
  const player = useRef<YTPlayer | null>(null);

  useImperativeHandle(
    ref,
    (): PlayerControl => ({
      load(videoId, startSec, autoplay) {
        const p = player.current;
        if (!p) return;
        if (autoplay) p.loadVideoById(videoId, startSec);
        else p.cueVideoById(videoId, startSec);
      },
      play() {
        player.current?.playVideo();
      },
      pause() {
        player.current?.pauseVideo();
      },
      seek(sec) {
        player.current?.seekTo(sec, true);
      },
      getTime() {
        return player.current?.getCurrentTime() ?? 0;
      },
      getDuration() {
        return player.current?.getDuration() ?? 0;
      },
      setVolume(volume) {
        player.current?.setVolume(volume);
      },
      mute() {
        player.current?.mute();
      },
      unMute() {
        player.current?.unMute();
      },
      state() {
        const code = player.current?.getPlayerState();
        return code === undefined ? "unstarted" : mapState(code);
      },
    }),
    [],
  );

  useEffect(() => {
    let disposed = false;

    loadYouTubeApi()
      .then((YT) => {
        if (disposed || !host.current) return;
        player.current = new YT.Player(host.current, {
          playerVars: { controls: 0, disablekb: 1, modestbranding: 1, rel: 0, playsinline: 1, fs: 0 },
          events: {
            onReady: () => {
              if (!disposed) onReady();
            },
            onStateChange: ({ data, target }) => {
              if (disposed) return;
              onDuration(target.getDuration() || 0);
              onStateChange(mapState(data));
            },
          },
        });
      })
      .catch(() => {
        // API blocked or offline; there is simply nothing to play.
      });

    return () => {
      disposed = true;
      const p = player.current;
      player.current = null;
      try {
        p?.destroy();
      } catch {
        // Iframe already gone.
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="size-full">
      <div ref={host} className="size-full" />
    </div>
  );
});

export default YouTubePlayer;
