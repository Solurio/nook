"use client";

import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { ArrowDown, ArrowUp, Copy, Eraser, Eye, EyeOff, Lock, LockOpen, Merge, Plus, Sparkles, Trash2 } from "lucide-react";
import { BLENDS, type Blend, type LayerEffects, type Studio, type StudioLayer } from "@/lib/studio/render";
import { Panel, Range } from "./widgets";
import { t } from "@/lib/i18n";

/** A layer's picture, small, drawn again each time the studio catches up. */
function Thumb({ studio, bus, id, paper }: { studio: Studio; bus: EventTarget; id: string; paper: string | null }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const draw = () => {
      const c = ref.current;
      if (!c) return;
      const src = studio.canvasOf(id);
      const k = Math.min(c.width / src.width, c.height / src.height);
      const ctx = c.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, c.width, c.height);
      const w = src.width * k;
      const h = src.height * k;
      if (paper) {
        ctx.fillStyle = paper;
        ctx.fillRect((c.width - w) / 2, (c.height - h) / 2, w, h);
      }
      ctx.drawImage(src, (c.width - w) / 2, (c.height - h) / 2, w, h);
    };
    draw();
    bus.addEventListener("synced", draw);
    return () => bus.removeEventListener("synced", draw);
  }, [bus, id, paper, studio]);
  return <canvas ref={ref} width={56} height={42} className="checker h-[42px] w-[56px] shrink-0 rounded bg-white/5 ring-1 ring-white/10" />;
}

const EFFECTS: Array<{ key: keyof LayerEffects; name: string; min: number; max: number; start: number; unit: string }> = [
  { key: "blur", name: "blur", min: 0, max: 40, start: 0, unit: "px" },
  { key: "brightness", name: "brightness", min: 0, max: 200, start: 100, unit: "%" },
  { key: "contrast", name: "contrast", min: 0, max: 200, start: 100, unit: "%" },
  { key: "saturate", name: "saturation", min: 0, max: 300, start: 100, unit: "%" },
  { key: "hue", name: "hue", min: -180, max: 180, start: 0, unit: "deg" },
  { key: "invert", name: "invert", min: 0, max: 100, start: 0, unit: "%" },
  { key: "grayscale", name: "greyscale", min: 0, max: 100, start: 0, unit: "%" },
  { key: "sepia", name: "sepia", min: 0, max: 100, start: 0, unit: "%" },
];

export const MAX_LAYERS = 32;

/**
 * The layers, top one first as drawing apps list them. Each shows its picture,
 * whether it shows, whether it is locked; the one being drawn on opens up for
 * its blend, opacity, clipping, alpha lock and effects.
 */
export default function LayersPanel({
  studio,
  bus,
  layers,
  active,
  paper,
  canEdit,
  opCounts,
  onSelect,
  onChange,
  onAdd,
  onDuplicate,
  onMergeDown,
  onDelete,
  onClear,
  onClose,
}: {
  studio: Studio;
  bus: EventTarget;
  layers: StudioLayer[];
  active: string;
  paper: string | null;
  canEdit: boolean;
  opCounts: Record<string, number>;
  onSelect: (id: string) => void;
  onChange: (next: StudioLayer[]) => void;
  onAdd: () => void;
  onDuplicate: (id: string) => void;
  onMergeDown: (id: string) => void;
  onDelete: (id: string) => void;
  onClear: (id: string) => void;
  onClose: () => void;
}) {
  const [showEffects, setShowEffects] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);

  const patch = (id: string, change: Partial<StudioLayer>) => onChange(layers.map((l) => (l.id === id ? { ...l, ...change } : l)));
  const move = (id: string, by: number) => {
    const i = layers.findIndex((l) => l.id === id);
    const j = i + by;
    if (i < 0 || j < 0 || j >= layers.length) return;
    const next = layers.slice();
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  const current = layers.find((l) => l.id === active) ?? layers[layers.length - 1];
  const index = layers.findIndex((l) => l.id === current.id);
  const effects = current.effects ?? {};
  const effectsOn = EFFECTS.some((e) => (effects[e.key] ?? e.start) !== e.start) || Boolean(current.hue);

  return (
    <Panel title={t(`layers (${layers.length})`)} onClose={onClose} className="top-2 right-2 w-72">
      <div className="mb-2 flex flex-wrap items-center gap-1">
        <button
          type="button"
          onClick={onAdd}
          disabled={!canEdit || layers.length >= MAX_LAYERS}
          className="flex min-h-7 items-center gap-1 rounded-md bg-white/8 px-2 text-[10px] text-chalk hover:bg-white/12 disabled:opacity-30"
        >
          <Plus className="size-3" />{" "}{t("new layer")}</button>
        <button type="button" onClick={() => onDuplicate(current.id)} disabled={!canEdit || layers.length >= MAX_LAYERS} title={t("duplicate")} aria-label={t("duplicate")} className="grid size-7 place-items-center rounded-md text-muted hover:bg-white/8 hover:text-chalk disabled:opacity-30">
          <Copy className="size-3.5" />
        </button>
        <button type="button" onClick={() => onMergeDown(current.id)} disabled={!canEdit || index <= 0} title={t("merge into the layer below")} aria-label={t("merge down")} className="grid size-7 place-items-center rounded-md text-muted hover:bg-white/8 hover:text-chalk disabled:opacity-30">
          <Merge className="size-3.5" />
        </button>
        <button type="button" onClick={() => move(current.id, 1)} disabled={!canEdit || index >= layers.length - 1} title={t("move up")} aria-label={t("move up")} className="grid size-7 place-items-center rounded-md text-muted hover:bg-white/8 hover:text-chalk disabled:opacity-30">
          <ArrowUp className="size-3.5" />
        </button>
        <button type="button" onClick={() => move(current.id, -1)} disabled={!canEdit || index <= 0} title={t("move down")} aria-label={t("move down")} className="grid size-7 place-items-center rounded-md text-muted hover:bg-white/8 hover:text-chalk disabled:opacity-30">
          <ArrowDown className="size-3.5" />
        </button>
        <button type="button" onClick={() => onClear(current.id)} disabled={!canEdit || current.locked} title={t("clear the layer (or what is selected on it)")} aria-label={t("clear layer")} className="grid size-7 place-items-center rounded-md text-muted hover:bg-white/8 hover:text-chalk disabled:opacity-30">
          <Eraser className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={() => {
            if (confirming !== current.id) {
              setConfirming(current.id);
              return;
            }
            setConfirming(null);
            onDelete(current.id);
          }}
          disabled={!canEdit || layers.length <= 1}
          title={t("delete the layer")}
          aria-label={t("delete layer")}
          className={clsx(
            "flex h-7 items-center gap-1 rounded-md px-1.5 text-[10px] disabled:opacity-30",
            confirming === current.id ? "bg-red-500/25 text-red-200" : "text-muted hover:bg-red-500/15 hover:text-red-300",
          )}
        >
          <Trash2 className="size-3.5" />
          {confirming === current.id && t("sure?")}
        </button>
      </div>

      <div className="space-y-1">
        {[...layers].reverse().map((layer) => {
          const on = layer.id === current.id;
          return (
            <div
              key={layer.id}
              onClick={() => onSelect(layer.id)}
              className={clsx("flex cursor-pointer items-center gap-1.5 rounded-lg p-1", on ? "bg-glow/18 ring-1 ring-glow/40" : "hover:bg-white/5", layer.clip && "ml-4")}
            >
              <Thumb studio={studio} bus={bus} id={layer.id} paper={layers[0].id === layer.id ? paper : null} />
              <div className="min-w-0 flex-1">
                {renaming === layer.id ? (
                  <input
                    autoFocus
                    defaultValue={layer.name}
                    onClick={(event) => event.stopPropagation()}
                    onBlur={(event) => {
                      patch(layer.id, { name: event.target.value.slice(0, 32) || layer.name });
                      setRenaming(null);
                    }}
                    onKeyDown={(event) => event.key === "Enter" && (event.target as HTMLInputElement).blur()}
                    className="h-6 w-full rounded bg-white/8 px-1 text-[11px] text-chalk outline-none"
                  />
                ) : (
                  <p onDoubleClick={() => canEdit && setRenaming(layer.id)} className="truncate text-[11px] text-chalk" title={t("double-click to rename")}>
                    {layer.name}
                  </p>
                )}
                <p className="truncate text-[9px] text-muted">
                  {BLENDS.find((b) => b.id === (layer.blend ?? "source-over"))?.name} · {Math.round(layer.opacity * 100)}%
                  {layer.clip ? t(" · clipped") : ""}
                  {layer.alphaLock ? t(" · alpha lock") : ""} · {opCounts[layer.id] ?? 0}{" "}{t("ops")}</p>
              </div>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  patch(layer.id, { locked: !layer.locked });
                }}
                disabled={!canEdit}
                aria-label={layer.locked ? t("unlock") : t("lock")}
                title={layer.locked ? t("locked: tap to unlock") : t("lock")}
                className={clsx("grid size-6 shrink-0 place-items-center rounded", layer.locked ? "text-amber-300" : "text-muted/50 hover:text-chalk")}
              >
                {layer.locked ? <Lock className="size-3" /> : <LockOpen className="size-3" />}
              </button>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  patch(layer.id, { visible: !layer.visible });
                }}
                disabled={!canEdit}
                aria-label={layer.visible ? t("hide") : t("show")}
                className="grid size-6 shrink-0 place-items-center rounded text-muted hover:text-chalk"
              >
                {layer.visible ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
              </button>
            </div>
          );
        })}
      </div>

      {canEdit && (
        <div className="mt-2 space-y-1.5 border-t border-white/8 pt-2">
          <label className="flex items-center gap-2 text-[10px] text-muted">
            <span className="w-20 shrink-0">{t("blend")}</span>
            <select
              value={current.blend ?? "source-over"}
              onChange={(event) => patch(current.id, { blend: event.target.value as Blend })}
              className="h-7 min-w-0 flex-1 rounded-md bg-white/7 px-1.5 text-[11px] text-chalk outline-none"
            >
              {BLENDS.map((b) => (
                <option key={b.id} value={b.id}>
                  {t(b.name)}
                </option>
              ))}
            </select>
          </label>
          <Range label={t("opacity")} value={Math.round(current.opacity * 100)} min={0} max={100} onChange={(v) => patch(current.id, { opacity: v / 100 })} format={(v) => `${v}%`} />
          <div className="flex flex-wrap gap-1">
            <Toggle on={Boolean(current.clip)} disabled={index === 0} onClick={() => patch(current.id, { clip: !current.clip })} title={t("paint only shows where the layer below has paint")}>{t("clipping")}</Toggle>
            <Toggle on={Boolean(current.alphaLock)} onClick={() => patch(current.id, { alphaLock: !current.alphaLock })} title={t("new paint only goes where this layer already has paint")}>{t("alpha lock")}</Toggle>
            <Toggle on={showEffects || effectsOn} onClick={() => setShowEffects((v) => !v)} title={t("effects that change how the layer looks, not its pixels")}>
              <Sparkles className="size-3" />{" "}{t("effects")}</Toggle>
          </div>
          {showEffects && (
            <div className="space-y-1 rounded-lg bg-white/4 p-1.5">
              {EFFECTS.map((e) => (
                <Range
                  key={e.key}
                  label={t(e.name)}
                  value={e.key === "hue" ? (effects.hue ?? 0) + (current.hue ?? 0) : (effects[e.key] ?? e.start)}
                  min={e.min}
                  max={e.max}
                  onChange={(v) => patch(current.id, { hue: 0, effects: { ...effects, [e.key]: v } })}
                  format={(v) => `${v}${e.unit === "deg" ? "°" : e.unit}`}
                />
              ))}
              <button type="button" onClick={() => patch(current.id, { hue: 0, effects: {} })} className="min-h-6 rounded-md px-2 text-[10px] text-muted hover:bg-white/8 hover:text-chalk">{t("reset effects")}</button>
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}

function Toggle({ on, onClick, children, title, disabled }: { on: boolean; onClick: () => void; children: React.ReactNode; title: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      disabled={disabled}
      className={clsx("flex min-h-7 items-center gap-1 rounded-md px-2 text-[10px] disabled:opacity-30", on ? "bg-glow/25 text-glow" : "bg-white/6 text-muted hover:text-chalk")}
    >
      {children}
    </button>
  );
}
