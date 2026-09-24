"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import { ChevronLeft, ChevronRight, Copy, Film, Pause, Play, Plus, Repeat, Trash2 } from "lucide-react";
import { MAX_FRAMES, type AnimationState } from "@/lib/studio/animation";
import type { Studio, StudioLayer } from "@/lib/studio/render";
import { Panel, Range, Watched, type WatchedValue } from "./widgets";
import { t } from "@/lib/i18n";

/** A frame's picture, redrawn when the board has drawn something new. */
function FrameThumb({ studio, bus, layer }: { studio: Studio; bus: EventTarget; layer: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const draw = () => {
      clearTimeout(timer);
      // Not on every stroke: a moment after the last one.
      timer = setTimeout(() => setSrc(studio.thumbnail(layer, 64)), 250);
    };
    draw();
    bus.addEventListener("synced", draw);
    return () => {
      clearTimeout(timer);
      bus.removeEventListener("synced", draw);
    };
  }, [studio, bus, layer]);
  return src ? <img src={src} alt="" className="size-full object-contain" draggable={false} /> : null;
}

/**
 * The timeline: each frame is a layer. The one in hand is the layer being
 * drawn on; the ones either side show faintly (onion skin) while drawing.
 */
export default function AnimationPanel({
  studio,
  bus,
  anim,
  layers,
  current,
  playing,
  playFrame,
  canEdit,
  busy,
  onStart,
  onStop,
  onSelect,
  onAdd,
  onDuplicate,
  onDelete,
  onMove,
  onChange,
  onPlay,
  onGif,
  onClose,
}: {
  studio: Studio;
  bus: EventTarget;
  anim: AnimationState | null;
  layers: StudioLayer[];
  current: string | null;
  playing: boolean;
  playFrame: WatchedValue<number>;
  canEdit: boolean;
  busy: boolean;
  onStart: () => void;
  onStop: () => void;
  onSelect: (layer: string) => void;
  onAdd: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onMove: (by: -1 | 1) => void;
  onChange: (next: AnimationState) => void;
  onPlay: () => void;
  onGif: () => void;
  onClose: () => void;
}) {
  if (!anim) {
    return (
      <Panel title={t("animation")} onClose={onClose} className="bottom-2 left-2 w-80">
        <div className="space-y-2 text-[11px] text-muted">
          <p>{t("Each frame is a layer. The layer in hand becomes the first frame; the layers that are not frames stay under (or over) every frame, like a background.")}</p>
          <button type="button" disabled={!canEdit} onClick={onStart} className="flex min-h-8 items-center gap-1.5 rounded-lg bg-glow/25 px-3 font-semibold text-glow disabled:opacity-40">
            <Film className="size-3.5" />
            {t("start an animation")}
          </button>
        </div>
      </Panel>
    );
  }
  const at = anim.frames.findIndex((f) => f.layer === current);
  const frame = anim.frames[at];
  const name = (id: string) => layers.find((l) => l.id === id)?.name ?? "";
  const set = (patch: Partial<AnimationState>) => onChange({ ...anim, ...patch });

  return (
    <Panel title={t("animation")} onClose={onClose} className="bottom-2 left-2 w-[28rem] max-w-[95%]">
      <div className="flex h-full min-h-0 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-1">
          <button type="button" onClick={onPlay} className="flex min-h-8 items-center gap-1 rounded-lg bg-glow/25 px-2.5 text-[11px] font-semibold text-glow" aria-label={playing ? t("pause") : t("play")}>
            {playing ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
            {playing ? t("pause") : t("play")}
          </button>
          <span className="px-1 text-[10px] text-muted tabular-nums">
            {playing ? <Watched value={playFrame} format={(v) => `${v + 1}`} /> : at + 1} / {anim.frames.length}
          </span>
          <span className="mx-0.5 h-5 w-px bg-white/10" />
          <Tool label={t("new frame after this one")} onClick={onAdd} disabled={!canEdit || anim.frames.length >= MAX_FRAMES}>
            <Plus />
          </Tool>
          <Tool label={t("copy this frame")} onClick={onDuplicate} disabled={!canEdit || anim.frames.length >= MAX_FRAMES}>
            <Copy />
          </Tool>
          <Tool label={t("move it earlier")} onClick={() => onMove(-1)} disabled={!canEdit || at <= 0}>
            <ChevronLeft />
          </Tool>
          <Tool label={t("move it later")} onClick={() => onMove(1)} disabled={!canEdit || at >= anim.frames.length - 1}>
            <ChevronRight />
          </Tool>
          <Tool label={t("delete this frame")} onClick={onDelete} disabled={!canEdit || anim.frames.length <= 1} danger>
            <Trash2 />
          </Tool>
          <Tool label={t("loop")} onClick={() => set({ loop: !anim.loop })} active={anim.loop}>
            <Repeat />
          </Tool>
          <span className="flex-1" />
          <button type="button" disabled={busy} onClick={onGif} className="min-h-7 rounded-md bg-white/8 px-2 text-[10px] text-chalk hover:bg-white/12 disabled:opacity-40">{t("save as a GIF")}</button>
        </div>

        {/* The frames */}
        <div className="no-scrollbar flex min-h-16 shrink-0 gap-1 overflow-x-auto pb-1">
          {anim.frames.map((f, i) => (
            <button
              key={f.layer}
              type="button"
              onClick={() => onSelect(f.layer)}
              title={t(name(f.layer))}
              className={clsx("relative flex w-14 shrink-0 flex-col items-center gap-0.5 rounded-lg p-1", f.layer === current ? "bg-glow/20 ring-1 ring-glow/60" : "bg-white/5 hover:bg-white/9")}
            >
              <span className="grid size-12 place-items-center overflow-hidden rounded bg-[#f4f1ea]">
                <FrameThumb studio={studio} bus={bus} layer={f.layer} />
              </span>
              <span className="text-[9px] text-muted tabular-nums">
                {i + 1}
                {(f.hold ?? 1) > 1 ? ` ×${f.hold}` : ""}
              </span>
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
          <Range label={t("frames a second")} value={anim.fps} min={1} max={30} onChange={(fps) => set({ fps })} />
          {frame && (
            <Range
              label={t("this frame holds")}
              value={frame.hold ?? 1}
              min={1}
              max={12}
              onChange={(hold) => set({ frames: anim.frames.map((f, i) => (i === at ? { ...f, hold } : f)) })}
              format={(v) => `×${v}`}
            />
          )}
          <Range label={t("onion: frames before")} value={anim.onion.before} min={0} max={3} onChange={(before) => set({ onion: { ...anim.onion, before } })} />
          <Range label={t("onion: frames after")} value={anim.onion.after} min={0} max={3} onChange={(after) => set({ onion: { ...anim.onion, after } })} />
          <Range label={t("onion: strength")} value={Math.round(anim.onion.opacity * 100)} min={5} max={80} onChange={(v) => set({ onion: { ...anim.onion, opacity: v / 100 } })} format={(v) => `${v}%`} />
        </div>
        <button type="button" disabled={!canEdit} onClick={onStop} className="self-start text-[10px] text-muted underline decoration-dotted hover:text-chalk disabled:opacity-40">
          {t("stop animating (the layers stay)")}
        </button>
      </div>
    </Panel>
  );
}

function Tool({ label, onClick, disabled, active, danger, children }: { label: string; onClick: () => void; disabled?: boolean; active?: boolean; danger?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={clsx(
        "grid size-8 place-items-center rounded-lg transition disabled:opacity-30 [&_svg]:size-4",
        active ? "bg-glow/25 text-glow" : danger ? "text-muted hover:bg-red-500/15 hover:text-red-300" : "text-muted hover:bg-white/10 hover:text-chalk",
      )}
    >
      {children}
    </button>
  );
}
