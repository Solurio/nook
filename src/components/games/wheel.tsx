"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { Bookmark, Check, Minus, Pencil, Plus, RotateCcw, Trash2, X } from "lucide-react";
import { useRoom } from "@/realtime/room-provider";
import { useRoomStore } from "@/state/room-store";
import { newId } from "@/lib/slug";
import {
  LABEL_MAX,
  MAX_SLICES,
  MAX_WEIGHT,
  PALETTE,
  SPIN_MS,
  addMany,
  arcs,
  chance,
  editSlice,
  emptyWheel,
  inPlay,
  putBack,
  removeSlice,
  settle,
  spin,
  winnerOf,
  type Arc,
  type WheelState,
  forgetWheel,
  loadWheel,
  saveWheel,
} from "@/lib/wheel";
import type { Item } from "@/lib/types";
import { t } from "@/lib/i18n";

/** `arcs()` only gives start/end; the geometry below is convenient for drawing the label. */
type PlacedArc = Arc & { mid: number; span: number };
const withGeometry = (arc: Arc): PlacedArc => ({ ...arc, mid: (arc.start + arc.end) / 2, span: arc.end - arc.start });

const R = 100;
/** The text lives between the hub and the rim. */
const TEXT_IN = 26;
const TEXT_OUT = R - 7;

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

// ---------------------------------------------------------------------------
// Fitting the words into the slice
// ---------------------------------------------------------------------------

/** Two lines, split as evenly as the words allow. */
function breakInTwo(text: string): string[] | null {
  const words = text.split(" ").filter(Boolean);
  if (words.length < 2) return null;
  let best: string[] | null = null;
  let gap = Infinity;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(" ");
    const b = words.slice(i).join(" ");
    const d = Math.abs(a.length - b.length);
    if (d < gap) {
      gap = d;
      best = [a, b];
    }
  }
  return best;
}

/**
 * How big the words can be written, lying along the slice from the rim in.
 *
 * A slice gives the text two different rooms: how long it is (the radius) and
 * how tall it is (the wedge, which pinches towards the middle). Whichever runs
 * out first sets the size, and a long label is broken in two before it is
 * shrunk any further. Only a label that still will not go gets cut short.
 */
function fitLabel(text: string, span: number): { lines: string[]; size: number } {
  const label = text || "?";
  const room = TEXT_OUT - TEXT_IN;
  // The wedge is at its thinnest at the inner end of the text.
  const thin = (2 * Math.PI * TEXT_IN * span) / 360;
  const wide = 0.56; // average glyph width, in ems, for the bold face

  const sizeFor = (chars: number, lines: number) =>
    Math.min(13, room / (wide * Math.max(1, chars)), (thin * 0.82) / (lines === 2 ? 2.1 : 1));

  let lines = [label];
  let size = sizeFor(label.length, 1);

  if (size < 7.5) {
    const split = breakInTwo(label);
    if (split) {
      const two = sizeFor(Math.max(split[0].length, split[1].length), 2);
      if (two > size) {
        lines = split;
        size = two;
      }
    }
  }

  if (size >= 4.4) return { lines, size: Math.max(4.4, size) };

  // Still too much. Keep the biggest readable size and cut what is left.
  const floor = 4.4;
  const fits = Math.max(3, Math.floor(room / (wide * floor)));
  const one = label.length > fits ? `${label.slice(0, fits - 1).trimEnd()}...` : label;
  return { lines: [one], size: floor };
}

function SliceText({ arc }: { arc: PlacedArc }) {
  const { mid, span, slice } = arc;
  const { lines, size } = useMemo(() => fitLabel(slice.label, span), [slice.label, span]);
  // On the left half the words would hang upside down, so that half is read
  // from the rim inwards instead.
  const flip = mid > 180;
  const rot = flip ? mid + 90 : mid - 90;
  return (
    <g transform={`rotate(${rot} ${R} ${R})`}>
      {lines.map((line, i) => (
        <text
          key={i}
          x={flip ? R - TEXT_OUT : R + TEXT_OUT}
          y={R + (i - (lines.length - 1) / 2) * size * 1.04}
          textAnchor={flip ? "start" : "end"}
          dominantBaseline="middle"
          fontSize={size}
          fontWeight={700}
          letterSpacing={size < 6 ? -0.15 : 0}
          fill="#100d16"
          fillOpacity={0.88}
        >
          {t(line)}
        </text>
      ))}
    </g>
  );
}

// ---------------------------------------------------------------------------
// The wheel
// ---------------------------------------------------------------------------

/**
 * A wheel to spin, with weights. Each slice is as wide as its chance, the
 * wheel turns the same way on every screen, and everything that can come up
 * is listed beside it -- including the ones too long to print on a slice.
 */
export default function Wheel({ item, state: raw }: { item: Item<"game">; state: unknown }) {
  const { updateData, canEdit } = useRoom();
  const me = useRoomStore((s) => s.me);
  const state = useMemo(() => ({ ...emptyWheel(), ...(raw as Partial<WheelState>) }) as WheelState, [raw]);

  const [editing, setEditing] = useState(false);
  const [shelf, setShelf] = useState(false);
  const [landed, setLanded] = useState<string | null>(() => state.spin?.id ?? null);
  const [adding, setAdding] = useState("");
  const [picking, setPicking] = useState<string | null>(null);

  const box = useRef<HTMLDivElement>(null);
  const [wide, setWide] = useState(true);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const watch = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      // The list goes beside the wheel when there is room for both.
      setWide(width >= 430 && width > height * 0.92);
    });
    watch.observe(el);
    return () => watch.disconnect();
  }, []);

  const write = (next: WheelState) => updateData(item.id, { game: "wheel", state: next } as never);
  const live = () => {
    const current = useRoomStore.getState().items[item.id];
    const data = current?.data as { state?: WheelState } | undefined;
    return data?.state ? ({ ...emptyWheel(), ...data.state } as WheelState) : state;
  };

  const turning = state.spin !== null && landed !== state.spin.id;
  const shown = arcs(state.slices).map(withGeometry);
  const winner = turning ? null : winnerOf(state);
  const resting = state.slices.length - inPlay(state.slices).length;

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

  const submitAdd = () => {
    const lines = adding.split("\n").filter((l) => l.trim());
    if (!lines.length) return;
    void write(addMany(live(), lines, newId));
    setAdding("");
  };

  // Bring the winner into view in the list.
  const wonRef = useRef<HTMLLIElement>(null);
  useEffect(() => {
    if (winner) wonRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [winner]);

  const list = (
    <SliceList
      state={state}
      winner={winner?.id ?? null}
      canEdit={canEdit}
      wonRef={wonRef}
      onRemove={(id) => void write(removeSlice(live(), id))}
      onColor={(id, color) => void write(editSlice(live(), id, { color }))}
      picking={picking}
      setPicking={setPicking}
      adding={adding}
      setAdding={setAdding}
      onAdd={submitAdd}
    />
  );

  return (
    <div ref={box} className="surface grain relative flex size-full flex-col gap-2 overflow-hidden rounded-2xl p-3">
      <div className="flex w-full items-center gap-1">
        <p className="min-w-0 flex-1 truncate text-[12px] font-semibold text-chalk">{state.title || t("spin the wheel")}</p>
        <span className="shrink-0 text-[10px] text-muted/60">
          {shown.length}{" "}{t("in")}{resting > 0 ? t(`, ${resting} out`) : ""}
        </span>
        <button
          type="button"
          onClick={() => setShelf(true)}
          className="flex min-h-9 items-center gap-1 rounded-lg px-2 text-[11px] text-muted transition hover:bg-white/8 hover:text-chalk"
        >
          <Bookmark className="size-3" />{" "}{t("saved")}{state.saved?.length ? ` ${state.saved.length}` : ""}
        </button>
        <button
          type="button"
          onClick={() => setEditing(true)}
          disabled={!canEdit}
          className="flex min-h-9 items-center gap-1 rounded-lg px-2 text-[11px] text-muted transition hover:bg-white/8 hover:text-chalk disabled:opacity-30"
        >
          <Pencil className="size-3" />{" "}{t("slices")}</button>
      </div>

      <div className={clsx("flex min-h-0 w-full flex-1 gap-3", wide ? "flex-row" : "flex-col")}>
        <div className="relative grid min-h-0 min-w-0 flex-1 place-items-center">
          <div className="relative aspect-square h-full max-h-full max-w-full">
            {/* The pointer */}
            <svg
              viewBox="0 0 20 22"
              className="absolute top-[-4px] left-1/2 z-10 w-5 -translate-x-1/2 drop-shadow-[0_2px_2px_rgba(0,0,0,0.5)]"
              aria-hidden
            >
              <path d="M2 2 H18 L10 20 Z" fill="#f4efe6" stroke="#100d16" strokeWidth={1.5} strokeLinejoin="round" />
            </svg>
            <button
              type="button"
              onClick={spinNow}
              disabled={!canEdit || turning || shown.length === 0}
              aria-label={t("spin")}
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
                {shown.map((arc) => (
                  <g key={arc.slice.id}>
                    <path d={slicePath(arc.start, arc.end)} fill={arc.slice.color} stroke="#100d16" strokeWidth={0.7} />
                    {arc.span > 3.2 && <SliceText arc={arc} />}
                  </g>
                ))}
                <circle cx={R} cy={R} r={11} fill="#f4efe6" stroke="#100d16" strokeWidth={2} />
                <circle cx={R} cy={R} r={3} fill="#100d16" />
              </svg>
            </button>
          </div>
        </div>

        {/* Everything that can come up */}
        <div className={clsx("flex min-h-0 flex-col", wide ? "w-[42%] max-w-64 min-w-40" : "max-h-[38%] w-full")}>{list}</div>
      </div>

      <div className="flex min-h-11 w-full flex-col items-center text-center">
        {winner ? (
          <>
            <p
              className="animate-drift-in line-clamp-2 max-w-full text-[17px] leading-tight font-bold break-words"
              style={{ color: winner.color }}
            >
              {winner.label || "?"}
            </p>
            <p className="text-[10px] text-muted">{state.spin?.by}{" "}{t("spun it")}</p>
          </>
        ) : (
          <p className="text-[11px] text-muted/60">
            {turning ? "..." : shown.length ? t("tap the wheel") : resting ? t("everyone has had a go") : t("add a slice to spin")}
          </p>
        )}
      </div>

      {shelf && (
        <Shelf
          state={state}
          canEdit={canEdit}
          onSave={(title) => void write(saveWheel(live(), newId(), Date.now(), title))}
          onLoad={(id) => {
            void write(loadWheel(live(), id));
            setShelf(false);
          }}
          onForget={(id) => void write(forgetWheel(live(), id))}
          onClose={() => setShelf(false)}
        />
      )}

      {editing && (
        <Editor
          state={state}
          live={live}
          write={write}
          adding={adding}
          setAdding={setAdding}
          onAdd={submitAdd}
          onClose={() => setEditing(false)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The list beside the wheel
// ---------------------------------------------------------------------------

function SliceList({
  state,
  winner,
  canEdit,
  wonRef,
  onRemove,
  onColor,
  picking,
  setPicking,
  adding,
  setAdding,
  onAdd,
}: {
  state: WheelState;
  winner: string | null;
  canEdit: boolean;
  wonRef: React.RefObject<HTMLLIElement | null>;
  onRemove: (id: string) => void;
  onColor: (id: string, color: string) => void;
  picking: string | null;
  setPicking: (id: string | null) => void;
  adding: string;
  setAdding: (value: string) => void;
  onAdd: () => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1.5 rounded-xl bg-black/20 p-1.5 inset-ring inset-ring-white/6">
      <ul className="min-h-0 flex-1 space-y-0.5 overflow-y-auto pr-0.5">
        {state.slices.map((slice) => {
          const odds = chance(state.slices, slice.id);
          const won = winner === slice.id;
          return (
            <li
              key={slice.id}
              ref={won ? wonRef : undefined}
              className={clsx(
                "relative flex items-start gap-1.5 rounded-lg px-1 py-1 transition",
                won && "bg-white/10",
                slice.out && "opacity-40",
              )}
              style={won ? { boxShadow: `inset 0 0 0 1px ${slice.color}` } : undefined}
            >
              <button
                type="button"
                disabled={!canEdit}
                onClick={() => setPicking(picking === slice.id ? null : slice.id)}
                aria-label={t("change colour")}
                className="mt-0.5 size-3.5 shrink-0 rounded-full ring-1 ring-white/25 disabled:cursor-default"
                style={{ background: slice.color }}
              />
              <span className="min-w-0 flex-1 text-[11px] leading-snug break-words text-chalk">
                {slice.label || <span className="text-muted/50">{t("unnamed")}</span>}
                {slice.weight > 1 && <span className="ml-1 text-muted/70">×{slice.weight}</span>}
              </span>
              <span className="mt-px shrink-0 text-right text-[10px] tabular-nums text-muted">
                {slice.out ? t("out") : `${Math.round(odds * 100)}%`}
              </span>
              {canEdit && state.slices.length > 1 && (
                <button
                  type="button"
                  onClick={() => onRemove(slice.id)}
                  aria-label={`remove ${slice.label}`}
                  className="shrink-0 text-muted/40 transition hover:text-chalk focus-visible:text-chalk"
                >
                  <X className="size-3" />
                </button>
              )}
              {picking === slice.id && (
                <Palette
                  active={slice.color}
                  onPick={(color) => {
                    onColor(slice.id, color);
                    setPicking(null);
                  }}
                  onClose={() => setPicking(null)}
                />
              )}
            </li>
          );
        })}
      </ul>
      {canEdit && (
        <form
          className="flex shrink-0 gap-1"
          onSubmit={(event) => {
            event.preventDefault();
            onAdd();
          }}
        >
          <input
            value={adding}
            onChange={(event) => setAdding(event.target.value)}
            maxLength={LABEL_MAX}
            placeholder={state.slices.length >= MAX_SLICES ? t("the wheel is full") : t("add...")}
            disabled={state.slices.length >= MAX_SLICES}
            className="h-8 min-w-0 flex-1 rounded-lg bg-white/8 px-2 text-[11px] text-chalk outline-none placeholder:text-muted/50"
          />
          <button
            type="submit"
            disabled={state.slices.length >= MAX_SLICES || !adding.trim()}
            aria-label={t("add it")}
            className="grid size-8 shrink-0 place-items-center rounded-lg bg-white/10 text-chalk disabled:opacity-35"
          >
            <Plus className="size-3.5" />
          </button>
        </form>
      )}
    </div>
  );
}

/** Every colour on the wheel, and one of your own. */
function Palette({ active, onPick, onClose }: { active: string; onPick: (color: string) => void; onClose: () => void }) {
  return (
    <>
      <button type="button" aria-label={t("close")} className="fixed inset-0 z-20 cursor-default" onClick={onClose} />
      <div className="absolute top-6 left-0 z-30 w-52 rounded-xl bg-ink-950/95 p-2 shadow-lg ring-1 ring-white/12 backdrop-blur-sm">
        <div className="grid grid-cols-8 gap-1">
          {PALETTE.map((color) => (
            <button
              key={color}
              type="button"
              onClick={() => onPick(color)}
              aria-label={t(`colour ${color}`)}
              className={clsx(
                "grid aspect-square place-items-center rounded-md transition hover:scale-110",
                active === color && "ring-2 ring-chalk",
              )}
              style={{ background: color }}
            >
              {active === color && <Check className="size-3 text-ink-950" strokeWidth={3} />}
            </button>
          ))}
        </div>
        <label className="mt-1.5 flex cursor-pointer items-center gap-2 rounded-lg bg-white/6 px-2 py-1 text-[10px] text-muted">
          <input
            type="color"
            value={active}
            onChange={(event) => onPick(event.target.value)}
            className="size-5 cursor-pointer rounded border-0 bg-transparent p-0"
          />{t("a colour of your own")}</label>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// The whole thing, opened up
// ---------------------------------------------------------------------------

function Editor({
  state,
  live,
  write,
  adding,
  setAdding,
  onAdd,
  onClose,
}: {
  state: WheelState;
  live: () => WheelState;
  write: (next: WheelState) => void;
  adding: string;
  setAdding: (value: string) => void;
  onAdd: () => void;
  onClose: () => void;
}) {
  const [picking, setPicking] = useState<string | null>(null);
  return (
    <div className="absolute inset-0 z-20 flex flex-col gap-2 rounded-2xl bg-ink-950/95 p-3 backdrop-blur-sm">
      <div className="flex items-center justify-between gap-2">
        <input
          defaultValue={state.title}
          placeholder={t("what is it for?")}
          maxLength={40}
          onBlur={(event) => void write({ ...live(), title: event.target.value.trim() })}
          onKeyDown={(event) => event.key === "Enter" && (event.target as HTMLInputElement).blur()}
          className="h-9 min-w-0 flex-1 rounded-lg bg-white/8 px-2 text-[12px] text-chalk outline-none placeholder:text-muted/50"
        />
        <button
          type="button"
          onClick={onClose}
          aria-label={t("close")}
          className="grid size-9 shrink-0 place-items-center rounded-lg text-muted hover:bg-white/8 hover:text-chalk"
        >
          <X className="size-4" />
        </button>
      </div>

      <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto">
        {state.slices.map((slice) => (
          <li
            key={slice.id}
            className={clsx("relative flex items-center gap-1.5 rounded-lg bg-white/4 p-1", slice.out && "opacity-45")}
          >
            <button
              type="button"
              aria-label={t("change colour")}
              onClick={() => setPicking(picking === slice.id ? null : slice.id)}
              className="size-8 shrink-0 rounded-md ring-1 ring-white/20"
              style={{ background: slice.color }}
            />
            {picking === slice.id && (
              <Palette
                active={slice.color}
                onPick={(color) => {
                  void write(editSlice(live(), slice.id, { color }));
                  setPicking(null);
                }}
                onClose={() => setPicking(null)}
              />
            )}
            <input
              defaultValue={slice.label}
              maxLength={LABEL_MAX}
              onBlur={(event) =>
                event.target.value !== slice.label && void write(editSlice(live(), slice.id, { label: event.target.value }))
              }
              onKeyDown={(event) => event.key === "Enter" && (event.target as HTMLInputElement).blur()}
              className="h-8 min-w-0 flex-1 rounded-md bg-white/6 px-2 text-[12px] text-chalk outline-none"
            />
            <span className="flex shrink-0 items-center">
              <button
                type="button"
                aria-label={t("less likely")}
                disabled={slice.weight <= 1}
                onClick={() => void write(editSlice(live(), slice.id, { weight: slice.weight - 1 }))}
                className="grid size-8 place-items-center rounded-md text-muted hover:text-chalk disabled:opacity-30"
              >
                <Minus className="size-3" />
              </button>
              <span className="w-5 text-center text-[12px] tabular-nums text-chalk" title={t("weight")}>
                {slice.weight}
              </span>
              <button
                type="button"
                aria-label={t("more likely")}
                disabled={slice.weight >= MAX_WEIGHT}
                onClick={() => void write(editSlice(live(), slice.id, { weight: slice.weight + 1 }))}
                className="grid size-8 place-items-center rounded-md text-muted hover:text-chalk disabled:opacity-30"
              >
                <Plus className="size-3" />
              </button>
            </span>
            <span className="w-9 shrink-0 text-right text-[10px] tabular-nums text-muted">
              {slice.out ? t("out") : `${Math.round(chance(state.slices, slice.id) * 100)}%`}
            </span>
            <button
              type="button"
              aria-label="remove"
              disabled={state.slices.length <= 1}
              onClick={() => void write(removeSlice(live(), slice.id))}
              className="grid size-8 shrink-0 place-items-center rounded-md text-muted hover:text-chalk disabled:opacity-30"
            >
              <Trash2 className="size-3.5" />
            </button>
          </li>
        ))}
      </ul>

      <form
        className="flex gap-1.5"
        onSubmit={(event) => {
          event.preventDefault();
          onAdd();
        }}
      >
        <input
          value={adding}
          onChange={(event) => setAdding(event.target.value)}
          maxLength={LABEL_MAX}
          placeholder={state.slices.length >= MAX_SLICES ? t("the wheel is full") : t("another slice...")}
          disabled={state.slices.length >= MAX_SLICES}
          className="h-9 min-w-0 flex-1 rounded-lg bg-white/8 px-2 text-[12px] text-chalk outline-none placeholder:text-muted/50"
        />
        <button
          type="submit"
          disabled={state.slices.length >= MAX_SLICES}
          className="h-9 rounded-lg bg-chalk px-3 text-[11px] font-semibold text-ink-950 disabled:opacity-40"
        >{t("add")}</button>
      </form>

      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => void write({ ...live(), removeWinners: !state.removeWinners })}
          className={clsx(
            "flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-[11px]",
            state.removeWinners ? "bg-glow/15 text-glow" : "bg-white/5 text-muted",
          )}
        >
          <span className={clsx("size-3.5 rounded border", state.removeWinners ? "border-glow bg-glow" : "border-white/30")} />{t("winners sit out")}</button>
        {state.slices.some((s) => s.out) && (
          <button
            type="button"
            onClick={() => void write(putBack(live()))}
            className="flex min-h-9 items-center gap-1 rounded-lg px-2 text-[11px] text-muted hover:bg-white/8 hover:text-chalk"
          >
            <RotateCcw className="size-3" />{" "}{t("put them back (")}{state.slices.length - inPlay(state.slices).length})
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            const text = window.prompt("one to a line");
            if (text) void write(addMany(live(), text.split("\n"), newId));
          }}
          className="ml-auto flex min-h-9 items-center gap-1 rounded-lg px-2 text-[11px] text-muted hover:bg-white/8 hover:text-chalk"
        >{t("paste a list")}</button>
      </div>
    </div>
  );
}
// ---------------------------------------------------------------------------
// Wheels kept in this one
// ---------------------------------------------------------------------------

function Shelf({
  state,
  canEdit,
  onSave,
  onLoad,
  onForget,
  onClose,
}: {
  state: WheelState;
  canEdit: boolean;
  onSave: (title: string) => void;
  onLoad: (id: string) => void;
  onForget: (id: string) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(state.title);
  const saved = state.saved ?? [];
  return (
    <div className="absolute inset-0 z-20 flex flex-col gap-2 rounded-2xl bg-ink-950/95 p-3 backdrop-blur-sm">
      <div className="flex items-center justify-between">
        <h3 className="text-[12px] font-semibold text-chalk">{t("saved wheels")}</h3>
        <button type="button" onClick={onClose} aria-label={t("close")} className="grid size-9 place-items-center rounded-lg text-muted hover:bg-white/8 hover:text-chalk">
          <X className="size-4" />
        </button>
      </div>
      <form
        className="flex gap-1"
        onSubmit={(event) => {
          event.preventDefault();
          onSave(name);
        }}
      >
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={t("a name for this wheel")}
          maxLength={40}
          disabled={!canEdit}
          className="h-9 min-w-0 flex-1 rounded-lg bg-white/7 px-2 text-[12px] text-chalk outline-none ring-1 ring-white/10 focus:ring-glow/45"
        />
        <button type="submit" disabled={!canEdit} className="min-h-9 rounded-lg bg-chalk px-3 text-[12px] font-semibold text-ink-950 disabled:opacity-40">{t("save this one")}</button>
      </form>
      <p className="text-[10px] text-muted/70">{t("Saving under a name that is already there writes over it. Putting one back keeps the spins so far.")}</p>
      <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto">
        {saved.length === 0 && <li className="text-[11px] text-muted/60">{t("nothing kept yet")}</li>}
        {saved.map((w) => (
          <li key={w.id} className="flex items-center gap-2 rounded-lg bg-white/5 p-1.5">
            <span className="flex -space-x-1">
              {w.slices.slice(0, 6).map((s) => (
                <span key={s.id} className="size-3 rounded-full ring-1 ring-ink-950" style={{ background: s.color }} />
              ))}
            </span>
            <button type="button" disabled={!canEdit} onClick={() => onLoad(w.id)} className="min-w-0 flex-1 truncate text-left text-[12px] text-chalk hover:underline disabled:cursor-default">
              {w.title}
              <span className="ml-1.5 text-[10px] text-muted">{w.slices.length}{" "}{t("slices")}</span>
            </button>
            <button type="button" disabled={!canEdit} onClick={() => onForget(w.id)} aria-label={t(`forget ${w.title}`)} className="grid size-8 place-items-center rounded-lg text-muted hover:bg-white/8 hover:text-[#f2a4b8] disabled:opacity-30">
              <Trash2 className="size-3.5" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
