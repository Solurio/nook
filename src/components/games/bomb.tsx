"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { Bomb as BombIcon, Heart, Minus, Plus } from "lucide-react";
import { useRoom } from "@/realtime/room-provider";
import { useRoomStore } from "@/state/room-store";
import { chairOf, claimChair } from "@/lib/seats";
import { randomBelow } from "@/lib/dice";
import {
  FUSE_MIN,
  FUSE_SPREAD,
  LANGUAGE_NAME,
  MAX_SEATS,
  MIN_SEATS,
  accept,
  chairsFor,
  clock,
  emptyBomb,
  explode,
  judge,
  start,
  type BombState,
  type Language,
} from "@/lib/bomb";
import type { Item } from "@/lib/types";

/**
 * Bomb Party. The bomb goes round with a few letters on it; the one holding
 * it types a word with those letters before it goes off.
 */
export default function Bomb({ item, state: raw }: { item: Item<"game">; state: unknown }) {
  const { updateData, canEdit } = useRoom();
  const me = useRoomStore((s) => s.me);
  const state = useMemo(() => ({ ...emptyBomb(), ...(raw as Partial<BombState>) }) as BombState, [raw]);
  // What is being typed, for one turn: a new bomb starts with an empty line.
  const [draft, setDraft] = useState({ tick: -1, text: "" });
  const [complaint, setComplaint] = useState<{ tick: number; text: string } | null>(null);
  const [now, setNow] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  const chairs = chairsFor(state.seatCount);
  const holders = useMemo(() => state.holders ?? {}, [state.holders]);
  const myChair = chairOf(state.seats, holders, me);
  const label = (chair: string) => state.seats[chair] ?? `seat ${chairs.indexOf(chair) + 1}`;
  const playing = state.phase === "play";
  /** This device plays for its own chair, and for any nobody is sitting in. */
  const mine = (chair: string) => canEdit && (holders[chair] ? holders[chair] === me?.userId : true);
  const holding = playing && mine(state.turn);
  const word = draft.tick === state.tick ? draft.text : "";
  const setWord = (text: string) => setDraft({ tick: state.tick, text });
  const why = complaint && complaint.tick === state.tick ? complaint.text : null;
  const setWhy = (text: string | null) => setComplaint(text ? { tick: state.tick, text } : null);

  const write = (next: BombState) => updateData(item.id, { game: "bomb", state: next } as never);
  const latest = (): BombState => {
    const data = useRoomStore.getState().items[item.id]?.data as { state?: BombState } | undefined;
    return { ...emptyBomb(), ...(data?.state ?? state) };
  };

  // A clock for the fuse to burn down by.
  useEffect(() => {
    if (!playing) return;
    const t = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(t);
  }, [playing]);

  // The bomb goes off on the phone holding it; if that phone has gone quiet,
  // on anyone's, a little later.
  const fuseKey = playing ? `${state.tick}:${state.fuseEnds}:${holding}` : "";
  useEffect(() => {
    if (!fuseKey) return;
    const tick = state.tick;
    const wait = Math.max(0, state.fuseEnds - Date.now()) + (holding ? 0 : 2500);
    const t = window.setTimeout(() => {
      const live = latest();
      if (live.phase !== "play" || live.tick !== tick) return;
      void write(explode(live, Date.now(), randomBelow));
    }, wait);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fuseKey]);

  // The turn comes to you: straight into typing.
  useEffect(() => {
    if (holding) input.current?.focus();
  }, [holding, state.tick]);

  const send = () => {
    const live = latest();
    if (!mine(live.turn) || live.phase !== "play") return;
    const verdict = judge(live, word);
    if (!verdict.ok) {
      setWhy(verdict.why);
      return;
    }
    setWhy(null);
    setWord("");
    void write(accept(live, verdict.word, Date.now(), randomBelow));
  };

  const begin = () => {
    const seated = chairs.filter((c) => holders[c]);
    const players = seated.length >= 2 ? seated : chairs;
    void write(start(state, players, clock(), randomBelow));
  };

  const total = (FUSE_MIN + FUSE_SPREAD) * 1000;
  const left = Math.max(0, state.fuseEnds - (now || state.fuseEnds - total));
  const burn = playing ? Math.min(1, left / total) : 1;
  const boom = state.lastBang && state.lastBang.tick === state.tick - 1;

  return (
    <div className="surface grain relative flex size-full flex-col gap-2 overflow-hidden rounded-2xl p-2.5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-muted/70">
        <span className="flex items-center gap-0.5">
          <button type="button" disabled={!canEdit || playing || state.seatCount <= MIN_SEATS} onClick={() => void write({ ...state, seatCount: state.seatCount - 1 })} aria-label="one chair fewer" className="grid size-7 place-items-center rounded hover:bg-white/10 disabled:opacity-30">
            <Minus className="size-3" strokeWidth={2.6} />
          </button>
          <span className="tabular-nums text-chalk">{state.seatCount}</span> chairs
          <button type="button" disabled={!canEdit || playing || state.seatCount >= MAX_SEATS} onClick={() => void write({ ...state, seatCount: state.seatCount + 1 })} aria-label="one chair more" className="grid size-7 place-items-center rounded hover:bg-white/10 disabled:opacity-30">
            <Plus className="size-3" strokeWidth={2.6} />
          </button>
        </span>
        <span className="flex items-center gap-0.5">
          {[1, 2, 3].map((n) => (
            <button key={n} type="button" disabled={!canEdit || playing} onClick={() => void write({ ...state, startLives: n })} className={clsx("min-h-7 rounded-md px-1.5 disabled:opacity-60", state.startLives === n ? "bg-white/12 text-chalk" : "hover:bg-white/8")}>
              {n} {n === 1 ? "life" : "lives"}
            </button>
          ))}
        </span>
        <span className="ml-auto flex items-center gap-0.5">
          {(Object.keys(LANGUAGE_NAME) as Language[]).map((lang) => (
            <button key={lang} type="button" disabled={!canEdit || playing} onClick={() => void write({ ...state, language: lang })} className={clsx("min-h-7 rounded-md px-1.5 uppercase disabled:opacity-60", state.language === lang ? "bg-white/12 text-chalk" : "hover:bg-white/8")} title={LANGUAGE_NAME[lang]}>
              {lang}
            </button>
          ))}
        </span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {chairs.map((chair, index) => {
          const lives = state.lives[chair];
          const inGame = state.order.includes(chair) && playing;
          const out = inGame && (lives ?? 0) <= 0;
          return (
            <button
              key={chair}
              type="button"
              disabled={!canEdit || !me || playing}
              onClick={() => me && void write({ ...state, ...claimChair(state.seats, holders, chair, me) })}
              className={clsx(
                "flex min-h-10 min-w-0 flex-1 basis-24 items-center gap-1.5 rounded-xl px-2 py-1 text-left transition disabled:cursor-default",
                out ? "bg-white/3 opacity-40" : playing && state.turn === chair ? "bg-[#e0655c]/15 ring-1 ring-[#e0655c]/50" : "bg-white/5",
              )}
            >
              {playing && state.turn === chair && <BombIcon className="size-4 shrink-0 text-[#e0655c]" />}
              <span className={clsx("min-w-0 flex-1 truncate text-[11px]", chair === myChair ? "text-chalk" : "text-muted")}>
                {state.seats[chair] ?? <span className="text-muted/50">seat {index + 1}</span>}
                {(state.wins[chair] ?? 0) > 0 && <span className="ml-1 text-warm">{state.wins[chair]}</span>}
              </span>
              {inGame && (
                <span className="flex shrink-0">
                  {Array.from({ length: state.startLives }, (_, i) => (
                    <Heart key={i} className={clsx("size-3", i < (lives ?? 0) ? "fill-[#e0655c] text-[#e0655c]" : "text-white/15")} />
                  ))}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* The bomb */}
      <div className="relative grid min-h-0 flex-1 place-items-center overflow-hidden rounded-xl bg-[radial-gradient(ellipse_at_center,#2c2433_0%,#17121d_85%)] p-2 inset-ring inset-ring-white/6">
        {playing ? (
          <div key={state.tick} className={clsx("flex flex-col items-center gap-2", boom && "animate-bang")}>
            <div className="relative">
              <svg viewBox="0 0 120 120" className="w-[min(9rem,40vw)] drop-shadow-[0_6px_12px_rgba(0,0,0,0.6)]" aria-hidden>
                <circle cx="56" cy="66" r="44" fill="#1e1a24" stroke="#3a3149" strokeWidth="3" />
                <ellipse cx="42" cy="50" rx="12" ry="7" fill="white" opacity="0.08" transform="rotate(-30 42 50)" />
                <rect x="78" y="18" width="16" height="14" rx="3" fill="#3a3149" transform="rotate(35 86 25)" />
                {/* The fuse, burning down */}
                <path d={`M92 18 q ${8 + 16 * burn} ${-6 - 10 * burn} ${14 * burn} ${-16 * burn}`} fill="none" stroke="#c9b28a" strokeWidth="3" strokeLinecap="round" />
                <circle cx={92 + 14 * burn} cy={18 - 16 * burn} r="4" fill="#f6c177" className="animate-pulse" />
              </svg>
              <span className="absolute inset-x-0 top-[48%] -translate-y-1/2 text-center font-mono text-[22px] font-bold tracking-wider text-chalk uppercase">
                {state.prompt}
              </span>
            </div>
            <p className="text-[11px] text-muted">
              {label(state.turn)}&apos;s bomb
              {state.last && (
                <>
                  {" "}
                  · {label(state.last.chair)} said <b className="text-chalk">{state.last.word}</b>
                </>
              )}
            </p>
            {boom && state.lastBang && <p className="text-[12px] font-bold text-[#f2a4b8]">BOOM -- {label(state.lastBang.chair)} loses a life</p>}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 text-center">
            {state.winner && <p className="text-sm font-semibold text-warm">{label(state.winner)} is the last one standing</p>}
            <p className="max-w-64 text-[11px] text-muted/70">
              type a word with the letters on the bomb before it goes off. Everyone who sits down plays; with nobody sitting, every
              chair plays from this screen.
            </p>
            <button type="button" disabled={!canEdit} onClick={() => begin()} className="min-h-10 rounded-xl bg-chalk px-4 text-[12px] font-semibold text-ink-950 disabled:opacity-40">
              {state.winner ? "again" : "light it"}
            </button>
          </div>
        )}
      </div>

      {playing && (
        <form
          className="flex items-center gap-1.5"
          onSubmit={(event) => {
            event.preventDefault();
            send();
          }}
        >
          <input
            ref={input}
            value={word}
            onChange={(event) => {
              setWord(event.target.value);
              setWhy(null);
            }}
            onKeyDown={(event) => {
              // Sent on Enter directly, rather than trusting every keyboard
              // -- phone ones especially -- to submit the form.
              if (event.key === "Enter") {
                event.preventDefault();
                send();
              }
            }}
            disabled={!holding}
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="send"
            placeholder={holding ? `a word with ${state.prompt.toUpperCase()}...` : `${label(state.turn)} is thinking`}
            className={clsx(
              "h-11 min-w-0 flex-1 rounded-xl bg-white/6 px-3 text-[14px] text-chalk outline-none placeholder:text-muted/50 focus:bg-white/10 disabled:opacity-50",
              why && "ring-1 ring-[#e0655c]/60",
            )}
          />
          <button type="submit" disabled={!holding || !word.trim()} className="h-11 rounded-xl bg-chalk px-4 text-[12px] font-semibold text-ink-950 disabled:opacity-40">
            go
          </button>
        </form>
      )}
      {why && <p className="-mt-1 text-[10px] text-[#f2a4b8]">{why}</p>}
    </div>
  );
}
