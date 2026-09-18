"use client";

import { useMemo, useState } from "react";
import clsx from "clsx";
import { Bookmark, Eraser, History, X } from "lucide-react";
import { useRoom } from "@/realtime/room-provider";
import { useRoomStore } from "@/state/room-store";
import { newId } from "@/lib/slug";
import {
  DiceError,
  MAX_COMBOS,
  averageDie,
  emptyDice,
  expected,
  isBottom,
  isTop,
  parse,
  range,
  rollInto,
  type DiceRoll,
  type DiceState,
} from "@/lib/dice";
import type { Item } from "@/lib/types";
import DieFace from "./die-face";

const TRAY: Array<{ sides: number; name: string }> = [
  { sides: 4, name: "d4" },
  { sides: 6, name: "d6" },
  { sides: 8, name: "d8" },
  { sides: 10, name: "d10" },
  { sides: 12, name: "d12" },
  { sides: 20, name: "d20" },
  { sides: 100, name: "d%" },
];

/**
 * Adds one more die of this size to what is typed: "2d6" and a d6 makes "3d6",
 * a d8 on the end makes "2d6+1d8". Anything more elaborate is left alone and
 * the die goes on the end.
 */
function withDie(expr: string, sides: number): string {
  const name = sides === 100 ? "%" : String(sides);
  const text = expr.trim();
  if (!text) return `1d${name}`;
  const pattern = new RegExp(`(^|\\+)(\\d*)d${name === "%" ? "%" : name}(?![\\d!khld])`, "i");
  const found = pattern.exec(text);
  if (found) {
    const count = Number(found[2] || 1) + 1;
    return text.slice(0, found.index) + `${found[1]}${count}d${name}` + text.slice(found.index + found[0].length);
  }
  return `${text}+1d${name}`;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * The dice tray. Tap dice in, or type any notation; everybody sees the roll
 * land, die by die, with the total and how it compares to the average.
 */
export default function Dice({ item, state: raw }: { item: Item<"game">; state: unknown }) {
  const { updateData, canEdit } = useRoom();
  const me = useRoomStore((s) => s.me);
  const state = useMemo(() => ({ ...emptyDice(), ...(raw as Partial<DiceState>) }) as DiceState, [raw]);
  const [expr, setExpr] = useState(state.expr);
  const [error, setError] = useState<string | null>(null);
  const [naming, setNaming] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const latest = state.history[0] ?? null;
  // Only a roll made while this tray is open tumbles; one already lying there
  // when you arrive just lies there.
  const [arrivedAfter] = useState(() => latest?.id ?? null);

  const parsed = useMemo(() => parse(expr), [expr]);
  const odds = useMemo(() => {
    if (!parsed.ok) return null;
    const [lo, hi] = range(parsed.node);
    return { lo, hi, mean: expected(parsed.node) };
  }, [parsed]);

  const write = (next: DiceState) => updateData(item.id, { game: "dice", state: next } as never);

  const rollNow = (text: string, label?: string) => {
    if (!canEdit) return;
    try {
      const next = rollInto(state, text, { name: me?.name ?? "someone", tint: me?.tint }, newId(), Date.now(), label);
      setError(null);
      void write(next);
    } catch (problem) {
      if (problem instanceof DiceError) setError(problem.message);
      else throw problem;
    }
  };

  const saveCombo = (name: string) => {
    const clean = name.trim().slice(0, 18);
    if (!clean || !parsed.ok) return;
    const combos = [...state.combos.filter((c) => c.name !== clean), { name: clean, expr: expr.trim() }].slice(-MAX_COMBOS);
    void write({ ...state, combos });
    setNaming(null);
  };

  return (
    <div className="surface grain relative flex size-full flex-col gap-2 overflow-hidden rounded-2xl p-2.5">
      {/* The tray the dice land in */}
      <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center gap-2 overflow-hidden rounded-xl bg-[radial-gradient(ellipse_at_center,#2f2440_0%,#1a1524_75%)] p-2 inset-ring inset-ring-white/8">
        {latest ? (
          <Landed roll={latest} tumble={latest.id !== arrivedAfter} />
        ) : (
          <p className="text-center text-[11px] text-muted/60">tap a die below, or type something like 4d6kh3</p>
        )}
      </div>

      {/* The dice to pick up */}
      <div className="flex items-center justify-between gap-0.5">
        {TRAY.map((die) => (
          <button
            key={die.sides}
            type="button"
            disabled={!canEdit}
            onClick={() => setExpr((now) => withDie(now, die.sides))}
            className="flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-lg py-1 transition hover:bg-white/8 active:scale-95 disabled:opacity-40"
            aria-label={`add a ${die.name}`}
          >
            <DieFace sides={die.sides} value={die.sides === 100 ? 100 : die.sides} size={28} tint="#c4a7f0" />
            <span className="text-[9px] text-muted">{die.name}</span>
          </button>
        ))}
      </div>

      {/* What to roll */}
      <form
        className="flex items-center gap-1.5"
        onSubmit={(event) => {
          event.preventDefault();
          rollNow(expr);
        }}
      >
        <div className="relative min-w-0 flex-1">
          <input
            value={expr}
            onChange={(event) => {
              setExpr(event.target.value);
              setError(null);
            }}
            disabled={!canEdit}
            inputMode="text"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            aria-label="what to roll"
            placeholder="2d6+3"
            className={clsx(
              "h-10 w-full rounded-xl bg-white/6 pr-8 pl-3 font-mono text-[13px] text-chalk outline-none placeholder:text-muted/40 focus:bg-white/10",
              !parsed.ok && expr.trim() && "ring-1 ring-[#e0655c]/50",
            )}
          />
          {expr && (
            <button
              type="button"
              onClick={() => setExpr("")}
              aria-label="clear"
              className="absolute top-1/2 right-1 grid size-8 -translate-y-1/2 place-items-center rounded-lg text-muted hover:text-chalk"
            >
              <Eraser className="size-3.5" />
            </button>
          )}
        </div>
        <button
          type="submit"
          disabled={!canEdit || !parsed.ok}
          className="h-10 shrink-0 rounded-xl bg-chalk px-4 text-[12px] font-semibold text-ink-950 transition active:scale-95 disabled:opacity-40"
        >
          roll
        </button>
      </form>

      <p className="-mt-1 min-h-4 truncate px-1 text-[10px] text-muted/70">
        {error ?? (parsed.ok && odds
          ? `${odds.lo === -Infinity ? "?" : odds.lo} to ${odds.hi === Infinity ? "no ceiling" : odds.hi} · averages ${round1(odds.mean)}`
          : expr.trim()
            ? (parsed as { error: string }).error
            : "")}
      </p>

      {/* Saved rolls */}
      <div className="flex flex-wrap items-center gap-1">
        {state.combos.map((combo) => (
          <span key={combo.name} className="group flex items-center rounded-lg bg-white/6">
            <button
              type="button"
              disabled={!canEdit}
              onClick={() => {
                setExpr(combo.expr);
                rollNow(combo.expr, combo.name);
              }}
              title={combo.expr}
              className="min-h-8 rounded-lg px-2 text-[11px] text-chalk transition hover:bg-white/8 disabled:opacity-40"
            >
              {combo.name}
            </button>
            {canEdit && (
              <button
                type="button"
                onClick={() => void write({ ...state, combos: state.combos.filter((c) => c !== combo) })}
                aria-label={`forget ${combo.name}`}
                className="grid h-8 w-6 place-items-center text-muted/50 hover:text-chalk sm:hidden sm:group-hover:grid"
              >
                <X className="size-3" />
              </button>
            )}
          </span>
        ))}
        {canEdit && parsed.ok && naming === null && (
          <button
            type="button"
            onClick={() => setNaming("")}
            className="flex min-h-8 items-center gap-1 rounded-lg px-2 text-[11px] text-muted hover:bg-white/8 hover:text-chalk"
          >
            <Bookmark className="size-3" /> save this roll
          </button>
        )}
        {naming !== null && (
          <form
            className="flex items-center gap-1"
            onSubmit={(event) => {
              event.preventDefault();
              saveCombo(naming);
            }}
          >
            <input
              autoFocus
              value={naming}
              onChange={(event) => setNaming(event.target.value)}
              onBlur={() => !naming.trim() && setNaming(null)}
              placeholder="call it..."
              maxLength={18}
              className="h-8 w-28 rounded-lg bg-white/8 px-2 text-[11px] text-chalk outline-none"
            />
            <button type="submit" className="h-8 rounded-lg bg-white/10 px-2 text-[11px] text-chalk">
              save
            </button>
          </form>
        )}
        {state.history.length > 1 && (
          <button
            type="button"
            onClick={() => setShowHistory(true)}
            className="ml-auto flex min-h-8 items-center gap-1 rounded-lg px-2 text-[11px] text-muted hover:bg-white/8 hover:text-chalk"
          >
            <History className="size-3" /> {state.history.length}
          </button>
        )}
      </div>

      {showHistory && (
        <div className="absolute inset-0 z-20 flex flex-col rounded-2xl bg-ink-950/95 p-3 backdrop-blur-sm">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-[12px] font-semibold text-chalk">every roll so far</h3>
            <button type="button" onClick={() => setShowHistory(false)} aria-label="close" className="grid size-9 place-items-center rounded-lg text-muted hover:bg-white/8 hover:text-chalk">
              <X className="size-4" />
            </button>
          </div>
          <ol className="min-h-0 flex-1 space-y-1 overflow-y-auto">
            {state.history.map((entry) => (
              <li key={entry.id} className="flex items-center gap-2 rounded-lg bg-white/4 px-2 py-1.5">
                <span className="w-9 shrink-0 text-right text-[15px] font-bold tabular-nums text-chalk">{entry.total}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-mono text-[10px] text-muted">
                    {entry.label ? `${entry.label} · ` : ""}
                    {entry.expr}
                  </span>
                  <span className="block truncate text-[10px] text-muted/60">
                    {entry.groups.map((g) => `[${g.dice.map((d) => (d.kept ? d.value : `~${d.value}~`)).join(" ")}]`).join(" ")}
                  </span>
                </span>
                <span className="shrink-0 truncate text-[10px]" style={{ color: entry.tint ?? undefined }}>
                  {entry.by}
                </span>
              </li>
            ))}
          </ol>
          {canEdit && (
            <button
              type="button"
              onClick={() => {
                void write({ ...state, history: [] });
                setShowHistory(false);
              }}
              className="mt-2 min-h-9 rounded-lg text-[11px] text-muted hover:bg-white/8 hover:text-chalk"
            >
              clear the history
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** The dice of one roll where they fell, and what they came to. */
function Landed({ roll, tumble }: { roll: DiceRoll; tumble: boolean }) {
  const dice = roll.groups.flatMap((group) => group.dice.map((die) => ({ die, sides: group.sides })));
  // Past a couple of dozen they get smaller rather than spilling out of the tray.
  const size = dice.length > 24 ? 26 : dice.length > 10 ? 34 : 44;
  const shown = dice.slice(0, 60);
  // An average die only means something when the dice are all the same kind.
  const alike = new Set(roll.groups.map((g) => g.sides)).size === 1;
  const average = alike ? averageDie(roll.groups) : null;

  return (
    <>
      <div className="flex max-h-[60%] flex-wrap content-center items-center justify-center gap-1.5 overflow-hidden">
        {shown.map(({ die, sides }, i) => (
          <DieFace
            key={`${roll.id}:${i}`}
            sides={sides}
            value={die.value}
            kept={die.kept}
            best={isTop(sides, die.chain?.[0] ?? die.value)}
            worst={isBottom(sides, die.value)}
            exploded={Boolean(die.chain)}
            tint={roll.tint ?? "#f4efe6"}
            size={size}
            tumble={tumble}
            delay={Math.min(i * 40, 400)}
          />
        ))}
        {dice.length > shown.length && <span className="text-[10px] text-muted">+{dice.length - shown.length}</span>}
      </div>
      <div key={roll.id} className={clsx("text-center", tumble && "animate-drift-in [animation-delay:650ms]")}>
        <p className="text-[34px] leading-none font-bold tabular-nums text-chalk">{roll.total}</p>
        <p className="mt-1 text-[10px] text-muted">
          <span style={{ color: roll.tint }}>{roll.by}</span> · <span className="font-mono">{roll.label ?? roll.expr}</span>
          {average !== null && dice.length > 1 && <> · {round1(average)} a die</>}
        </p>
      </div>
    </>
  );
}
