"use client";

import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { Minus, Plus } from "lucide-react";
import { useRoom } from "@/realtime/room-provider";
import { useRoomStore } from "@/state/room-store";
import { chairOf, claimChair } from "@/lib/seats";
import { allCommitted } from "@/lib/resistance";
import {
  MAX_SEATS,
  MIN_SEATS,
  SHAPES,
  chairsFor,
  emptyRps,
  readThrows,
  scoreRound,
  startMatch,
  throwSlot,
  type RpsState,
  type Shape,
} from "@/lib/rps";
import type { Item } from "@/lib/types";
import { HAND_NAME, RpsIcon } from "./rps-icons";

const TINT: Record<Shape, string> = { R: "#f6c177", P: "#8bc7e8", S: "#f2a4b8" };

/**
 * Rock paper scissors. Everyone throws in secret and the throws turn over
 * together, so there is no waiting to see what the other person did -- and no
 * browser that knows before the rest.
 */
export default function Rps({ item, state: raw }: { item: Item<"game">; state: unknown }) {
  const { updateData, pile, canEdit } = useRoom();
  const me = useRoomStore((s) => s.me);
  const state = useMemo(() => ({ ...emptyRps(), ...(raw as Partial<RpsState>) }) as RpsState, [raw]);
  const [busy, setBusy] = useState(false);
  // What this device threw this round, to show it back while the others decide.
  const [threw, setThrew] = useState<{ round: number; shape: Shape } | null>(null);

  const chairs = chairsFor(state.seatCount);
  const holders = useMemo(() => state.holders ?? {}, [state.holders]);
  const myChair = chairOf(state.seats, holders, me);
  const label = (chair: string) => state.seats[chair] ?? `seat ${chairs.indexOf(chair) + 1}`;
  const seated = chairs.filter((c) => holders[c]);

  const inMatch = state.playing.length >= 2 && !state.winner && state.round > 0;
  const slots = state.playing.map((c) => throwSlot(state.round, c));
  const thrown = (chair: string) => (state.piles?.[throwSlot(state.round, chair)]?.size ?? 0) > 0;
  const allIn = inMatch && allCommitted(state.piles, slots);
  const imPlaying = myChair !== null && state.playing.includes(myChair);
  const last = state.history[0];
  // A round already over when you arrive is just shown; one that finishes
  // while you watch is counted in: rock, paper, scissors...
  const [arrivedAfter] = useState(() => state.history[0]?.round ?? null);
  const fresh = Boolean(last && last.round !== arrivedAfter);

  const strip = (s: RpsState): RpsState => {
    const out = { ...s } as RpsState & Record<string, unknown>;
    delete out.piles;
    delete out.revealed;
    return out;
  };
  const write = (s: RpsState) => updateData(item.id, { game: "rps", state: strip(s) } as never);
  const latest = (): RpsState => {
    const data = useRoomStore.getState().items[item.id]?.data as { state?: RpsState } | undefined;
    return { ...emptyRps(), ...(data?.state ?? state) };
  };

  const begin = async () => {
    if (!canEdit || busy || seated.length < 2) return;
    setBusy(true);
    try {
      // Clears the last match's throws out of the database as well.
      await pile("pile_setup", { p_item: item.id, p_piles: [], p_public: { game: "rps", state: strip(startMatch(state, seated)) } });
    } finally {
      setBusy(false);
    }
  };

  const throwIt = async (shape: Shape) => {
    if (!me || !myChair || !imPlaying || thrown(myChair) || busy) return;
    setBusy(true);
    try {
      const done = await pile("pile_put", {
        p_item: item.id,
        p_to: throwSlot(state.round, myChair),
        p_cards: [shape],
        p_to_owner: me.userId,
        p_seal: slots,
      });
      if (!done.error) setThrew({ round: state.round, shape });
    } finally {
      setBusy(false);
    }
  };

  // Once the last throw is in, turn them all over and score it. Every player's
  // phone tries; the database lets the first one through, and scoring is the
  // same sum whoever does it.
  // Turned over but not yet scored counts too, in case the phone that turned
  // them over went quiet before it could.
  const turned = inMatch && readThrows(state.revealed, state.round, state.playing) !== null;
  const settleKey = (allIn || turned) && imPlaying ? `${state.round}` : "";
  useEffect(() => {
    if (!settleKey) return;
    const round = Number(settleKey);
    const t = window.setTimeout(async () => {
      let now = latest();
      if (now.round !== round) return;
      if (!readThrows(now.revealed, round, now.playing)) {
        await pile("pile_reveal", { p_item: item.id, p_slots: now.playing.map((c) => throwSlot(round, c)) }, { quiet: true });
        for (let i = 0; i < 20 && !readThrows(latest().revealed, round, latest().playing); i += 1) {
          await new Promise((r) => window.setTimeout(r, 150));
        }
        now = latest();
      }
      const throws = readThrows(now.revealed, round, now.playing);
      if (throws && now.round === round) void write(scoreRound(now, throws));
    }, 200 + state.playing.indexOf(myChair ?? "") * 300);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settleKey]);

  const mine = threw && threw.round === state.round ? threw.shape : null;

  return (
    <div className="surface grain relative flex size-full flex-col gap-2 overflow-hidden rounded-2xl p-2.5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-muted/70">
        <span className="flex items-center gap-0.5">
          <button type="button" disabled={!canEdit || inMatch || state.seatCount <= MIN_SEATS} onClick={() => void write({ ...state, seatCount: state.seatCount - 1 })} aria-label="one chair fewer" className="grid size-7 place-items-center rounded hover:bg-white/10 disabled:opacity-30">
            <Minus className="size-3" strokeWidth={2.6} />
          </button>
          <span className="tabular-nums text-chalk">{state.seatCount}</span> chairs
          <button type="button" disabled={!canEdit || inMatch || state.seatCount >= MAX_SEATS} onClick={() => void write({ ...state, seatCount: state.seatCount + 1 })} aria-label="one chair more" className="grid size-7 place-items-center rounded hover:bg-white/10 disabled:opacity-30">
            <Plus className="size-3" strokeWidth={2.6} />
          </button>
        </span>
        <span className="ml-auto flex items-center gap-1">
          first to
          {[1, 3, 5, 0].map((n) => (
            <button
              key={n}
              type="button"
              disabled={!canEdit || inMatch}
              onClick={() => void write({ ...state, firstTo: n })}
              className={clsx("min-h-7 min-w-7 rounded-md px-1 tabular-nums disabled:opacity-60", state.firstTo === n ? "bg-white/12 text-chalk" : "hover:bg-white/8")}
            >
              {n === 0 ? "for ever" : n}
            </button>
          ))}
        </span>
      </div>

      {/* The players, and where each of them has got to */}
      <div className="flex flex-wrap gap-1.5">
        {chairs.map((chair, index) => {
          const playing = state.playing.includes(chair) && inMatch;
          const shown = last?.throws[chair];
          return (
            <button
              key={chair}
              type="button"
              disabled={!canEdit || !me || inMatch}
              onClick={() => me && void write({ ...state, ...claimChair(state.seats, holders, chair, me) })}
              className={clsx(
                "flex min-h-11 min-w-0 flex-1 basis-24 items-center gap-1.5 rounded-xl px-2 py-1 text-left transition disabled:cursor-default",
                last?.winners.includes(chair) ? "bg-warm/15 ring-1 ring-warm/40" : "bg-white/5",
              )}
            >
              <span className="min-w-0 flex-1">
                <span className={clsx("block truncate text-[11px]", chair === myChair ? "text-chalk" : "text-muted")}>
                  {state.seats[chair] ?? <span className="text-muted/50">seat {index + 1}</span>}
                </span>
                {state.playing.includes(chair) && (
                  <span className="block text-[10px] text-muted/70 tabular-nums">
                    {state.scores[chair] ?? 0} {state.firstTo > 0 ? `of ${state.firstTo}` : ""}
                  </span>
                )}
              </span>
              {playing && (
                <span className={clsx("text-[9px] font-semibold uppercase", thrown(chair) ? "text-[#a6d189]" : "text-muted/50")}>
                  {thrown(chair) ? "ready" : "thinking"}
                </span>
              )}
              {!playing && shown && (
                <span className="grid size-7 place-items-center rounded-full" style={{ background: TINT[shown] }}>
                  <RpsIcon shape={shown} className="size-5" />
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* The last throws, turning over together */}
      <div className="relative flex min-h-0 flex-1 items-center justify-center gap-3 overflow-hidden rounded-xl bg-ink-950/30 p-2 inset-ring inset-ring-white/6">
        {last ? (
          <div key={last.round} className="flex flex-wrap items-center justify-center gap-3">
            {Object.entries(last.throws).map(([chair, shape], i) => (
              <div key={chair} className="flex flex-col items-center gap-1">
                <span className="relative grid size-16 place-items-center">
                  {fresh && (
                    <span className="animate-rps-pump absolute inset-0 grid place-items-center rounded-full bg-white/10" style={{ animationDelay: `${i * 30}ms` }}>
                      <RpsIcon shape="R" className="size-10" ink="#f4efe6" />
                    </span>
                  )}
                  <span className={clsx("absolute inset-0 grid place-items-center rounded-full", fresh && "animate-rps-show")} style={{ background: TINT[shape] }}>
                    <RpsIcon shape={shape} className="size-11" />
                  </span>
                </span>
                <span className={clsx("max-w-20 truncate text-[10px]", last.winners.includes(chair) ? "font-semibold text-warm" : "text-muted")}>
                  {label(chair)}
                </span>
              </div>
            ))}
            <p className={clsx("w-full text-center text-[12px] text-chalk", fresh && "animate-rps-show")}>
              {last.winners.length === 0
                ? "a draw -- again"
                : `${last.winners.map(label).join(" and ")} ${last.winners.length > 1 ? "take" : "takes"} it`}
            </p>
          </div>
        ) : (
          <p className="text-center text-[11px] text-muted/60">{inMatch ? "everyone throws, then they turn over together" : "sit down, two or more, then start"}</p>
        )}
      </div>

      {/* Your hand */}
      {state.winner ? (
        <div className="flex items-center gap-2">
          <p className="min-w-0 flex-1 text-[12px] font-semibold text-warm">{label(state.winner)} wins the match</p>
          <button type="button" disabled={!canEdit || busy || seated.length < 2} onClick={() => void begin()} className="min-h-10 rounded-xl bg-chalk px-4 text-[12px] font-semibold text-ink-950 disabled:opacity-40">
            again
          </button>
        </div>
      ) : inMatch && imPlaying ? (
        <div className="grid grid-cols-3 gap-2">
          {SHAPES.map((shape) => {
            const picked = mine === shape;
            const locked = thrown(myChair as string);
            return (
              <button
                key={shape}
                type="button"
                disabled={busy || locked}
                onClick={() => void throwIt(shape)}
                className={clsx(
                  "flex min-h-16 flex-col items-center justify-center gap-0.5 rounded-2xl transition active:scale-95",
                  picked ? "ring-2 ring-chalk" : locked ? "opacity-35" : "hover:brightness-110",
                )}
                style={{ background: TINT[shape] }}
                aria-label={HAND_NAME[shape]}
              >
                <RpsIcon shape={shape} className="size-8" />
                <span className="text-[10px] font-semibold text-ink-950">{HAND_NAME[shape]}</span>
              </button>
            );
          })}
        </div>
      ) : inMatch ? (
        <p className="text-center text-[11px] text-muted/60">{state.playing.map(label).join(" vs ")}</p>
      ) : (
        <button
          type="button"
          disabled={!canEdit || busy || seated.length < 2}
          onClick={() => void begin()}
          className="min-h-10 rounded-xl bg-chalk text-[12px] font-semibold text-ink-950 disabled:opacity-40"
        >
          {seated.length < 2 ? "two people need to sit down" : "start"}
        </button>
      )}
    </div>
  );
}
