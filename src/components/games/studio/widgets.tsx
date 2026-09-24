"use client";

import { useSyncExternalStore } from "react";
import clsx from "clsx";
import { X } from "lucide-react";
import { t } from "@/lib/i18n";
import { PanelFrame, usePanelHost } from "./workspace";

export function IconButton({
  children,
  label,
  onClick,
  active,
  disabled,
  danger,
  className,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  danger?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={t(label)}
      title={t(label)}
      className={clsx(
        "grid size-8 shrink-0 place-items-center rounded-lg transition select-none disabled:opacity-30 [&_svg]:size-4",
        active ? "bg-glow/25 text-glow" : danger ? "text-muted hover:bg-red-500/15 hover:text-red-300" : "text-muted hover:bg-white/10 hover:text-chalk",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Range({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  format,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
}) {
  return (
    <label className="flex min-w-0 items-center gap-2 text-[10px] text-muted">
      <span className="w-20 shrink-0 truncate">{t(label)}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        onPointerDown={(event) => event.stopPropagation()}
        className="h-1 min-w-0 flex-1 cursor-pointer accent-[#c4a7f0]"
      />
      <span className="w-10 shrink-0 text-right text-chalk tabular-nums">{format ? format(value) : value}</span>
    </label>
  );
}

/** A tall slider down the side of the canvas, for size and opacity, the way drawing apps put them. */
export function RailSlider({ label, value, min, max, onChange, display }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void; display: string }) {
  return (
    <div className="flex flex-col items-center gap-1" title={t(label)}>
      <span className="text-[9px] text-muted tabular-nums">{display}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={1}
        value={value}
        aria-label={t(label)}
        onChange={(event) => onChange(Number(event.target.value))}
        onPointerDown={(event) => event.stopPropagation()}
        className="h-28 w-5 cursor-pointer accent-[#c4a7f0] [writing-mode:vertical-lr] [direction:rtl]"
      />
      <span className="text-[8px] tracking-wide text-muted/60 uppercase">{t(label)}</span>
    </div>
  );
}

export function Panel({ title, onClose, children, className }: { title: string; onClose: () => void; children: React.ReactNode; className?: string }) {
  // In the workspace, the place the panel is in draws its frame.
  const host = usePanelHost();
  if (host) return <PanelFrame title={t(title)} onClose={onClose}>{children}</PanelFrame>;
  return (
    <div
      className={clsx("surface-raised absolute z-20 flex max-h-[92%] flex-col overflow-hidden rounded-xl shadow-2xl", className)}
      onPointerDown={(event) => event.stopPropagation()}
      onWheel={(event) => event.stopPropagation()}
    >
      <div className="flex shrink-0 items-center justify-between border-b border-white/8 px-2.5 py-1.5">
        <span className="text-[11px] font-semibold text-chalk">{t(title)}</span>
        <button type="button" onClick={onClose} aria-label={t("close")} className="grid size-6 place-items-center rounded text-muted hover:bg-white/8 hover:text-chalk">
          <X className="size-3.5" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">{children}</div>
    </div>
  );
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: Array<{ id: T; name: string }>; onChange: (v: T) => void }) {
  return (
    <span className="flex flex-wrap rounded-lg bg-white/6 p-0.5">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          className={clsx("min-h-7 rounded-md px-2 text-[10px]", value === o.id ? "bg-chalk text-ink-950" : "text-muted hover:text-chalk")}
        >
          {t(o.name)}
        </button>
      ))}
    </span>
  );
}

/** A value the board changes often -- the zoom, while pinching -- that only its readout watches. */
export interface WatchedValue<T> {
  get: () => T;
  set: (v: T) => void;
  subscribe: (listener: () => void) => () => void;
}

export function watched<T>(initial: T): WatchedValue<T> {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set: (v) => {
      if (Object.is(v, value)) return;
      value = v;
      listeners.forEach((l) => l());
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** Shows a watched value, drawing only itself again when it changes. */
export function Watched<T>({ value, format }: { value: WatchedValue<T>; format?: (v: T) => string }) {
  const v = useSyncExternalStore(value.subscribe, value.get, value.get);
  return <>{format ? format(v) : String(v)}</>;
}
