"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { loadSoundCloudApi, type SCWidget } from "@/lib/soundcloud-api";
import type { PlayerControl, PlayerState, ProviderPlayerProps } from "./types";

const IFRAME_SRC =
  "https://w.soundcloud.com/player/?url=&visual=true&show_comments=false&hide_related=true&buying=false&sharing=false&download=false";

/**
 * SoundCloud via its Widget API. The getters are callback-based, so position
 * and duration are cached from PLAY_PROGRESS/READY and served synchronously.
 */
const SoundCloudPlayer = forwardRef<PlayerControl, ProviderPlayerProps>(function SoundCloudPlayer(
  { onReady, onStateChange, onDuration },
  ref,
) {
  const iframe = useRef<HTMLIFrameElement>(null);
  const widget = useRef<SCWidget | null>(null);
  const posMs = useRef(0);
  const durMs = useRef(0);
  const st = useRef<PlayerState>("unstarted");
  const vol = useRef(60);
  const pendingLoad = useRef<{ url: string; startSec: number; autoplay: boolean } | null>(null);

  useImperativeHandle(
    ref,
    (): PlayerControl => ({
      load(url, startSec, autoplay) {
        const w = widget.current;
        if (!w) {
          pendingLoad.current = { url, startSec, autoplay };
          return;
        }
        posMs.current = startSec * 1000;
        durMs.current = 0;
        w.load(url, {
          auto_play: autoplay,
          callback: () => {
            if (startSec > 0) w.seekTo(startSec * 1000);
            w.getDuration((d) => {
              durMs.current = d;
              onDuration(d / 1000);
            });
          },
        });
      },
      play() {
        widget.current?.play();
      },
      pause() {
        widget.current?.pause();
      },
      seek(sec) {
        posMs.current = sec * 1000;
        widget.current?.seekTo(sec * 1000);
      },
      getTime() {
        return posMs.current / 1000;
      },
      getDuration() {
        return durMs.current / 1000;
      },
      setVolume(volume) {
        vol.current = volume;
        widget.current?.setVolume(volume);
      },
      mute() {
        widget.current?.setVolume(0);
      },
      unMute() {
        widget.current?.setVolume(vol.current);
      },
      state() {
        return st.current;
      },
    }),
    [onDuration],
  );

  useEffect(() => {
    let disposed = false;

    loadSoundCloudApi()
      .then((SC) => {
        if (disposed || !iframe.current) return;
        const w = SC.Widget(iframe.current);
        widget.current = w;

        w.bind(SC.Widget.Events.READY, () => {
          if (disposed) return;
          onReady();
          const pending = pendingLoad.current;
          pendingLoad.current = null;
          if (pending) {
            w.load(pending.url, {
              auto_play: pending.autoplay,
              callback: () => {
                if (pending.startSec > 0) w.seekTo(pending.startSec * 1000);
                w.getDuration((d) => {
                  durMs.current = d;
                  onDuration(d / 1000);
                });
              },
            });
          }
        });
        w.bind(SC.Widget.Events.PLAY, () => {
          st.current = "playing";
          onStateChange("playing");
        });
        w.bind(SC.Widget.Events.PAUSE, () => {
          st.current = "paused";
          onStateChange("paused");
        });
        w.bind(SC.Widget.Events.FINISH, () => {
          st.current = "ended";
          onStateChange("ended");
        });
        w.bind(SC.Widget.Events.PLAY_PROGRESS, (payload) => {
          if (payload?.currentPosition !== undefined) posMs.current = payload.currentPosition;
        });
      })
      .catch(() => {
        // Widget API blocked or offline.
      });

    return () => {
      disposed = true;
      widget.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <iframe
      ref={iframe}
      src={IFRAME_SRC}
      title="soundcloud"
      allow="autoplay"
      className="size-full"
      scrolling="no"
      frameBorder="no"
    />
  );
});

export default SoundCloudPlayer;
