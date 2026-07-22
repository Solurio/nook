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
    (): PlayerControl => {
      // The YT.Player object exists before it is ready, but its methods are not
      // attached yet -- calling them then throws "is not a function". So every
      // call checks the method exists first and no-ops until the player is live.
      const has = (name: keyof YTPlayer): boolean =>
        typeof (player.current as unknown as Record<string, unknown> | null)?.[name] === "function";

      return {
        load(videoId, startSec, autoplay) {
          if (autoplay) {
            if (has("loadVideoById")) player.current!.loadVideoById(videoId, startSec);
          } else if (has("cueVideoById")) {
            player.current!.cueVideoById(videoId, startSec);
          }
        },
        play() {
          if (has("playVideo")) player.current!.playVideo();
        },
        pause() {
          if (has("pauseVideo")) player.current!.pauseVideo();
        },
        seek(sec) {
          if (has("seekTo")) player.current!.seekTo(sec, true);
        },
        getTime() {
          return has("getCurrentTime") ? player.current!.getCurrentTime() : 0;
        },
        getDuration() {
          return has("getDuration") ? player.current!.getDuration() : 0;
        },
        setVolume(volume) {
          if (has("setVolume")) player.current!.setVolume(volume);
        },
        mute() {
          if (has("mute")) player.current!.mute();
        },
        unMute() {
          if (has("unMute")) player.current!.unMute();
        },
        state() {
          return has("getPlayerState") ? mapState(player.current!.getPlayerState()) : "unstarted";
        },
      };
    },
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
