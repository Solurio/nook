// Animation, the way FireAlpaca's onion skin mode and most drawing apps do it:
// each frame is a layer. Layers that are not frames stay put under (or over)
// every frame -- a background, a foreground -- and the frames either side of
// the one in hand show faintly, so the next drawing can follow the last.

import type { StudioLayer } from "./render";

export interface Frame {
  layer: string;
  /** How many ticks it stays up for: 2 is "on twos". */
  hold?: number;
}

export interface AnimationState {
  frames: Frame[];
  fps: number;
  onion: { before: number; after: number; opacity: number };
  loop: boolean;
}

export const MAX_FRAMES = 60;

export const emptyAnimation = (): AnimationState => ({ frames: [], fps: 8, onion: { before: 1, after: 0, opacity: 0.3 }, loop: true });

/** An animation as saved, with its frames only where their layers still are. */
export function tidyAnimation(raw: Partial<AnimationState> | undefined, layers: StudioLayer[]): AnimationState | null {
  if (!raw?.frames?.length) return null;
  const ids = new Set(layers.map((l) => l.id));
  const seen = new Set<string>();
  const frames = raw.frames
    .filter((f) => f && ids.has(f.layer) && !seen.has(f.layer) && seen.add(f.layer))
    .slice(0, MAX_FRAMES)
    .map((f) => ({ layer: f.layer, hold: Math.max(1, Math.min(12, Math.round(Number(f.hold) || 1))) }));
  if (!frames.length) return null;
  const onion = raw.onion ?? emptyAnimation().onion;
  return {
    frames,
    fps: Math.max(1, Math.min(30, Math.round(Number(raw.fps) || 8))),
    onion: {
      before: Math.max(0, Math.min(3, Math.round(Number(onion.before) || 0))),
      after: Math.max(0, Math.min(3, Math.round(Number(onion.after) || 0))),
      opacity: Math.max(0.05, Math.min(0.8, Number(onion.opacity) || 0.3)),
    },
    loop: raw.loop !== false,
  };
}

/** The frame in hand: the layer being drawn on when it is a frame, else the first. */
export function currentFrame(anim: AnimationState, active: string): string {
  return anim.frames.some((f) => f.layer === active) ? active : anim.frames[0].layer;
}

/**
 * The layers as they should be shown for one frame: that frame, the layers
 * that are not frames, and -- when drawing, not playing -- the frames either
 * side of it, faint.
 */
export function shownLayers(layers: StudioLayer[], anim: AnimationState | null, frame: string | null, onion: boolean): StudioLayer[] {
  if (!anim || !frame) return layers;
  const order = anim.frames.map((f) => f.layer);
  const at = order.indexOf(frame);
  return layers.map((layer) => {
    const i = order.indexOf(layer.id);
    if (i < 0 || layer.id === frame) return layer;
    const away = i - at;
    const near = onion && ((away < 0 && -away <= anim.onion.before) || (away > 0 && away <= anim.onion.after));
    if (!near || !layer.visible) return { ...layer, visible: false };
    // Fainter the further it is from the one in hand.
    return { ...layer, opacity: layer.opacity * anim.onion.opacity * (1 - (Math.abs(away) - 1) * 0.3), clip: false };
  });
}

/** How long each frame stays up, in milliseconds. */
export const frameDelay = (anim: AnimationState, frame: Frame) => Math.round((1000 / anim.fps) * (frame.hold ?? 1));
