import type { MediaProvider } from "@/lib/types";

export type PlayerState =
  | "unstarted"
  | "cued"
  | "playing"
  | "paused"
  | "buffering"
  | "ended";

/**
 * The common surface every provider (YouTube, plain audio, SoundCloud) exposes,
 * so the media item can drive them all with the same sync logic. Positions are
 * in seconds; volume is 0-100.
 */
export interface PlayerControl {
  load(ref: string, startSec: number, autoplay: boolean): void;
  play(): void;
  pause(): void;
  seek(sec: number): void;
  getTime(): number;
  getDuration(): number;
  setVolume(volume: number): void;
  mute(): void;
  unMute(): void;
  state(): PlayerState;
}

export interface ProviderPlayerProps {
  provider: MediaProvider;
  onReady: () => void;
  onStateChange: (state: PlayerState) => void;
  onDuration: (seconds: number) => void;
}
