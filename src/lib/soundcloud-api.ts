"use client";

// Minimal typing + one-shot loader for the SoundCloud Widget API. Its getters
// are callback-based, so the player caches position/duration from events and
// serves them synchronously.

export interface SCWidget {
  bind(event: string, listener: (payload?: { currentPosition?: number }) => void): void;
  play(): void;
  pause(): void;
  seekTo(milliseconds: number): void;
  setVolume(volume: number): void;
  getPosition(cb: (ms: number) => void): void;
  getDuration(cb: (ms: number) => void): void;
  load(url: string, options?: Record<string, unknown>): void;
}

interface SCNamespace {
  Widget: {
    (iframe: HTMLIFrameElement): SCWidget;
    Events: {
      READY: string;
      PLAY: string;
      PAUSE: string;
      FINISH: string;
      PLAY_PROGRESS: string;
      ERROR: string;
    };
  };
}

declare global {
  interface Window {
    SC?: SCNamespace;
  }
}

let loader: Promise<SCNamespace> | null = null;

export function loadSoundCloudApi(): Promise<SCNamespace> {
  if (typeof window === "undefined") return Promise.reject(new Error("browser only"));
  if (window.SC?.Widget) return Promise.resolve(window.SC);
  if (loader) return loader;

  loader = new Promise<SCNamespace>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://w.soundcloud.com/player/api.js";
    script.async = true;
    script.onload = () => {
      if (window.SC?.Widget) resolve(window.SC);
      else reject(new Error("SoundCloud API loaded without Widget"));
    };
    script.onerror = () => reject(new Error("Could not reach SoundCloud"));
    document.head.appendChild(script);
  });
  return loader;
}
