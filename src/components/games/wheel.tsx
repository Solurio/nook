"use client";

import { useMemo, useState } from "react";
import clsx from "clsx";
import { Minus, Pencil, Plus, RotateCcw, X } from "lucide-react";
import { useRoom } from "@/realtime/room-provider";
import { useRoomStore } from "@/state/room-store";
import { newId } from "@/lib/slug";
import {
  LABEL_MAX,
  MAX_SLICES,
  MAX_WEIGHT,
  PALETTE,
  SPIN_MS,
  addSlice,
  arcs,
  chance,
  editSlice,
  emptyWheel,
  inPlay,
  putBack,
  removeSlice,
  settle,
  spin,
  type WheelState,
} from "@/lib/wheel";
import type { Item } from "@/lib/types";

const R = 100;

/** A point on the wheel's edge, `deg` clockwise from the top. */
function edge(deg: number, radius = R): [number, number] {
  const rad = ((deg - 90) * Math.PI) / 180;
  return [R + radius * Math.cos(rad), R + radius * Math.sin(rad)];
}

function slicePath(start: number, end: number): string {
  if (end - start >= 359.999) return `M ${R} 0 A ${R} ${R} 0 1 1 ${R - 0.01} 0 Z`;
  const [x1, y1] = edge(start);
  const [x2, y2] = edge(end);
  const large = end - start > 180 ? 1 : 0;
  return `M ${R} ${R} L ${x1} ${y1} A ${R} ${R} 0 ${large} 1 ${x2} ${y2} Z`;
}

/**
 * A wheel to spin, with weights. Each slice is as wide as its chance, and the
 * wheel turns the same way on every screen, stopping where it was always
 * going to.
 */
export default function Wheel({ item, state: raw }: { item: Item<"game">; state: unknown }) {
  const { updateData, canEdit } = useRoom();
  const me = useRoomStore((s) => s.me);
  const state = useMemo(() => ({ ...emptyWheel(), ...(raw as Partial<WheelState>) }) as WheelState, [raw]);
  const [editing, setEditing] = useState(false);
  const [landed, setLanded] = useState<string | null>(() => state.spin?.id ?? null);
  const [adding, setAdding] = useState("");

  const write = (next: WheelState) => updateData(item.id, { game: "wheel", state: next } as never);
  const live = () => {
    const current = useRoomStore.getState().items[item.id];
    const data = current?.data as { state?: WheelState } | undefined;
    return data?.state ? ({ ...emptyWheel(), ...data.state } as WheelState) : state;
  };

  const turning = state.spin !== null && landed !== state.spin.id;
  const shown = arcs(state.slices);

  const spinNow = () => {
    if (!canEdit || turning || shown.length === 0) return;
    const id = newId();
    void write(spin(state, me?.name ?? "someone", id, Date.now()));
    // Winners leave the wheel once it has stopped, not before -- it would
    // be odd to watch the slice you are about to land on vanish.
    if (state.removeWinners) {
      window.setTimeout(() => {
        const now = live();
        if (now.spin?.id === id) void write(settle(now));
      }, SPIN_MS + 150);
    }
  };

  const label = (text: string) => (text.length > 14 ? `${text.slice(0, 13)}...` : text) || "?";
  const fontSize = shown.length > 16 ? 6 : shown.length > 10 ? 7.5 : 9;
  const winner = state.spin && !turning ? state.slices.find((s) => s.id === state.spin?.slice) : null;

  return (
    <div className="surface grain relative flex size-full flex-col items-center gap-2 overflow-hidden rounded-2xl p-3">
      <div className="flex w-full items-center gap-1">
        <p className="min-w-0 flex-1 truncate text-[12px] font-semibold text-chalk">{state.title || "spin the wheel"}</p>
        <button
          type="button"
          onClick={() => setEditing(true)}
          disabled={!canEdit}
          className="flex min-h-9 items-center gap-1 rounded-lg px-2 text-[11px] text-muted transition hover:bg-white/8 hover:text-chalk disabled:opacity-30"
        >
          <Pencil className="size-3" /> slices
        </button>
      </div>

      <div className="relative grid min-h-0 w-full flex-1 place-items-center">
        <div className="relative aspect-square h-full max-h-full max-w-full">
          {/* The pointer */}
          <svg viewBox="0 0 20 22" className="absolute top-[-4px] left-1/2 z-10 w-5 -translate-x-1/2 drop-shadow-[0_2px_2px_rgba(0,0,0,0.5)]" aria-hidden>
            <path d="M2 2 H18 L10 20 Z" fill="#f4efe6" stroke="#100d16" strokeWidth={1.5} strokeLinejoin="round" />
          </svg>
          <button
            type="button"
            onClick={spinNow}
            disabled={!canEdit || turning || shown.length === 0}
            aria-label="spin"
            className="size-full rounded-full outline-none focus-visible:ring-2 focus-visible:ring-glow disabled:cursor-default"
          >
            <svg
              viewBox="-4 -4 208 208"
              className="size-full drop-shadow-[0_4px_10px_rgba(0,0,0,0.45)]"
              style={{
                transform: `rotate(${state.angle}deg)`,
                transition: `transform ${SPIN_MS}ms cubic-bezier(0.15, 0.75, 0.12, 1)`,
              }}
              onTransitionEnd={() => state.spin && setLanded(state.spin.id)}
            >
              <circle cx={R} cy={R} r={R + 3} fill="#100d16" />
              {shown.map(({ slice, start, end }) => {
                const mid = (start + end) / 2;
                const [tx, ty] = edge(mid, R * 0.6);
                return (
                  <g key={slice.id}>
                    <path d={slicePath(start, end)} fill={slice.color} stroke="#100d16" strokeWidth={0.8} />
                    {end - start > 7 && (
                      <text
                        x={tx}
                        y={ty}
                        fontSize={fontSize}
                        fontWeight={700}
                        fill="#100d16"
                        textAnchor="middle"
                        dominantBaseline="middle"
                        transform={`rotate(${mid - 90 + (mid > 180 ? 180 : 0)} ${tx} ${ty})`}
                      >
                        {label(slice.label)}
                      </text>
                    )}
                  </g>
                );
              })}
              <circle cx={R} cy={R} r={11} fill="#f4efe6" stroke="#100d16" strokeWidth={2} />
              <circle cx={R} cy={R} r={3} fill="#100d16" />
            </svg>
          </button>
        </div>
      </div>

      <div className="flex min-h-11 w-full flex-col items-center text-center">
        {winner ? (
          <>
            <p className="animate-drift-in max-w-full truncate text-[18px] leading-tight font-bold" style={{ color: winner.color }}>
              {winner.label || "?"}
            </p>
            <p className="text-[10px] text-muted">{state.spin?.by} spun it</p>
          </>
        ) : (
          <p className="text-[11px] text-muted/60">{turning ? "..." : shown.length ? "tap the wheel" : "add a slice to spin"}</p>
        )}
      </div>

      {editing && (
        <div className="absolute inset-0 z-20 flex flex-col gap-2 rounded-2xl bg-ink-950/95 p-3 backdrop-blur-sm">
          <div className="flex items-center justify-between gap-2">
            <input
              defaultValue={state.title}
              placeholder="what is it for?"
              maxLength={40}
              onBlur={(event) => void write({ ...live(), title: event.target.value.trim() })}
              onKeyDown={(event) => event.key === "Enter" && (event.target as HTMLInputElement).blur()}
              className="h-9 min-w-0 flex-1 rounded-lg bg-white/8 px-2 text-[12px] text-chalk outline-none placeholder:text-muted/50"
            />
            <button type="button" onClick={() => setEditing(false)} aria-label="close" className="grid size-9 shrink-0 place-items-center rounded-lg text-muted hover:bg-white/8 hover:text-chalk">
              <X className="size-4" />
            </button>
          </div>

          <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto">
            {state.slices.map((slice) => {
              const odds = chance(state.slices, slice.id);
              return (
                <li key={slice.id} className={clsx("flex items-center gap-1.5 rounded-lg bg-white/4 p-1", slice.out && "opacity-45")}>
                  <button
                    type="button"
                    aria-label="change colour"
                    onClick={() => {
                      const next = PALETTE[(PALETTE.indexOf(slice.color) + 1) % PALETTE.length];
                      void write(editSlice(live(), slice.id, { color: next }));
                    }}
                    className="size-8 shrink-0 rounded-md ring-1 ring-white/20"
                    style={{ background: slice.color }}
                  />
                  <input
                    defaultValue={slice.label}
                    maxLength={LABEL_MAX}
                    onBlur={(event) => event.target.value !== slice.label && void write(editSlice(live(), slice.id, { label: event.target.value }))}
                    onKeyDown={(event) => event.key === "Enter" && (event.target as HTMLInputElement).blur()}
                    className="h-8 min-w-0 flex-1 rounded-md bg-white/6 px-2 text-[12px] text-chalk outline-none"
                  />
                  <span className="flex shrink-0 items-center">
                    <button type="button" aria-label="less likely" disabled={slice.weight <= 1} onClick={() => void write(editSlice(live(), slice.id, { weight: slice.weight - 1 }))} className="grid size-8 place-items-center rounded-md text-muted hover:text-chalk disabled:opacity-30">
                      <Minus className="size-3" />
                    </button>
                    <span className="w-5 text-center text-[12px] tabular-nums text-chalk" title="weight">
                      {slice.weight}
                    </span>
                    <button type="button" aria-label="more likely" disabled={slice.weight >= MAX_WEIGHT} onClick={() => void write(editSlice(live(), slice.id, { weight: slice.weight + 1 }))} className="grid size-8 place-items-center rounded-md text-muted hover:text-chalk disabled:opacity-30">
                      <Plus className="size-3" />
                    </button>
                  </span>
                  <span className="w-9 shrink-0 text-right text-[10px] tabular-nums text-muted">{slice.out ? "out" : `${Math.round(odds * 100)}%`}</span>
                  <button type="button" aria-label="remove" disabled={state.slices.length <= 1} onClick={() => void write(removeSlice(live(), slice.id))} className="grid size-8 shrink-0 place-items-center rounded-md text-muted hover:text-chalk disabled:opacity-30">
                    <X className="size-3.5" />
                  </button>
                </li>
              );
            })}
          </ul>

          <form
            className="flex gap-1.5"
            onSubmit={(event) => {
              event.preventDefault();
              if (state.slices.length >= MAX_SLICES) return;
              void write(addSlice(live(), newId(), adding.trim()));
              setAdding("");
            }}
          >
            <input
              value={adding}
              onChange={(event) => setAdding(event.target.value)}
              maxLength={LABEL_MAX}
              placeholder={state.slices.length >= MAX_SLICES ? "the wheel is full" : "another slice..."}
              disabled={state.slices.length >= MAX_SLICES}
              className="h-9 min-w-0 flex-1 rounded-lg bg-white/8 px-2 text-[12px] text-chalk outline-none placeholder:text-muted/50"
            />
            <button type="submit" disabled={state.slices.length >= MAX_SLICES} className="h-9 rounded-lg bg-chalk px-3 text-[11px] font-semibold text-ink-950 disabled:opacity-40">
              add
            </button>
          </form>

          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => void write({ ...live(), removeWinners: !state.removeWinners })}
              className={clsx("flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-[11px]", state.removeWinners ? "bg-glow/15 text-glow" : "bg-white/5 text-muted")}
            >
              <span className={clsx("size-3.5 rounded border", state.removeWinners ? "border-glow bg-glow" : "border-white/30")} />
              winners sit out
            </button>
            {state.slices.some((s) => s.out) && (
              <button type="button" onClick={() => void write(putBack(live()))} className="flex min-h-9 items-center gap-1 rounded-lg px-2 text-[11px] text-muted hover:bg-white/8 hover:text-chalk">
                <RotateCcw className="size-3" /> put them back ({state.slices.length - inPlay(state.slices).length})
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
