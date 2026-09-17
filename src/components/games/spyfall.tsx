"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import { Eye, Languages, MapPin, Minus, Pause, Play, Plus, RotateCcw } from "lucide-react";
import { useRoom } from "@/realtime/room-provider";
import { useRoomStore } from "@/state/room-store";
import { seatIds } from "@/lib/cards";
import { seatOf, takeSeat } from "@/lib/seats";
import {
  DEFAULT_SECONDS,
  MAX_SEATS,
  MIN_SEATS,
  PLACES,
  clock,
  deal,
  remaining,
} from "@/lib/spyfall";
import type { Item, SpyfallState } from "@/lib/types";

/**
 * Spyfall. Everybody is somewhere together and knows what they do there --
 * everybody but one, who was told nothing and has to keep up from the questions
 * alone while working out where they are.
 *
 * The list of places stays on show throughout, which is the whole point of it:
 * it is what the spy bluffs from and what everyone else narrows down.
 */
export default function Spyfall({ item, state }: { item: Item<"game">; state: SpyfallState }) {
  const { updateData, canEdit } = useRoom();
  const me = useRoomStore((s) => s.me);
  const name = me?.name ?? "someone";
  const [peek, setPeek] = useState<string | null>(null);
  const [places, setPlaces] = useState(false);

  const write = (next: SpyfallState) => {
    setPeek(null);
    void updateData(item.id, { game: "spyfall", state: next });
  };

  const chairs = seatIds(state.seatCount);
  const mySeat = seatOf(state.seats, name);
  const dealt = state.location !== null;
  const pack = PLACES[state.pack];

  // The clock is a shared start time rather than a shared countdown, so nobody
  // has to keep writing the seconds to the database for everyone else to read.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (state.startedAt === null) return;
    const tick = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(tick);
  }, [state.startedAt]);
  const left = remaining(state.startedAt, state.seconds, now);
  const expired = state.startedAt !== null && left === 0;

  const newRound = () => {
    const round = deal(chairs, state.pack);
    write({
      ...state,
      location: round.location,
      spy: round.spy,
      roles: round.roles,
      startedAt: null,
      seconds: DEFAULT_SECONDS,
      revealed: false,
    });
  };

  const resize = (by: number) => {
    const count = Math.max(MIN_SEATS, Math.min(MAX_SEATS, state.seatCount + by));
    if (count === state.seatCount) return;
    // Dropping a chair drops whoever was in it, and the deal no longer matches.
    const seats = Object.fromEntries(
      seatIds(count).map((chair) => [chair, state.seats[chair] ?? null]),
    );
    write({
      ...state,
      seatCount: count,
      seats,
      location: null,
      spy: null,
      roles: {},
      startedAt: null,
      seconds: DEFAULT_SECONDS,
      revealed: false,
    });
  };

  /** Call it: everything turns over and the score goes up. */
  const callIt = (caught: boolean) =>
    write({
      ...state,
      revealed: true,
      startedAt: null,
      wins: caught
        ? { ...state.wins, table: state.wins.table + 1 }
        : { ...state.wins, spy: state.wins.spy + 1 },
    });

  const label = (chair: string) => state.seats[chair] ?? `seat ${chairs.indexOf(chair) + 1}`;

  /** What this chair was told. Only ever shown to whoever asked to see it. */
  const briefing = (chair: string) =>
    chair === state.spy
      ? { title: "you are the spy", body: "you have no idea where this is. Find out." }
      : {
          title: state.location !== null ? pack[state.location].name : "",
          body: `you are the ${state.roles[chair] ?? "..."}`,
        };

  return (
    <div className="surface grain relative flex size-full flex-col gap-2 overflow-hidden rounded-2xl p-2.5">
      {/* Table size, the pack, and the clock */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-muted/70">
        <span className="flex items-center gap-0.5">
          <button
            type="button"
            disabled={!canEdit || state.seatCount <= MIN_SEATS}
            onClick={() => resize(-1)}
            aria-label="one chair fewer"
            className="grid size-5 place-items-center rounded transition hover:bg-white/10 hover:text-chalk disabled:opacity-30"
          >
            <Minus className="size-3" strokeWidth={2.6} />
          </button>
          <span className="tabular-nums text-chalk">{state.seatCount}</span>
          <span>chairs</span>
          <button
            type="button"
            disabled={!canEdit || state.seatCount >= MAX_SEATS}
            onClick={() => resize(1)}
            aria-label="one chair more"
            className="grid size-5 place-items-center rounded transition hover:bg-white/10 hover:text-chalk disabled:opacity-30"
          >
            <Plus className="size-3" strokeWidth={2.6} />
          </button>
        </span>

        <button
          type="button"
          disabled={!canEdit}
          onClick={() =>
            write({
              ...state,
              pack: state.pack === "en" ? "pt" : "en",
              location: null,
              spy: null,
              roles: {},
              startedAt: null,
              seconds: DEFAULT_SECONDS,
              revealed: false,
            })
          }
          title="switch the list of places"
          className="flex items-center gap-1 rounded-lg px-1.5 py-1 transition hover:bg-white/8 hover:text-chalk disabled:opacity-40"
        >
          <Languages className="size-3" strokeWidth={2.2} />
          {state.pack === "en" ? "english" : "portugues"}
        </button>

        <span className="ml-auto flex items-center gap-1.5">
          <span className="text-muted/50">
            spy {state.wins.spy} · table {state.wins.table}
          </span>
          <span
            className={clsx(
              "tabular-nums",
              expired ? "font-semibold text-warm" : "text-chalk",
            )}
          >
            {clock(left)}
          </span>
          <button
            type="button"
            disabled={!canEdit || !dealt || state.revealed}
            onClick={() =>
              write({
                ...state,
                // Stopping banks what is left rather than throwing it away.
                startedAt: state.startedAt === null ? Date.now() : null,
                seconds: state.startedAt === null ? state.seconds : left,
              })
            }
            aria-label={state.startedAt === null ? "start the clock" : "stop the clock"}
            className="grid size-6 place-items-center rounded-lg transition hover:bg-white/10 hover:text-chalk disabled:opacity-30"
          >
            {state.startedAt === null ? (
              <Play className="size-3" strokeWidth={2.4} />
            ) : (
              <Pause className="size-3" strokeWidth={2.4} />
            )}
          </button>
        </span>
      </div>

      {/* Everyone at the table */}
      <div className="flex flex-wrap gap-1.5">
        {chairs.map((chair, index) => {
          const who = state.seats[chair];
          const mine = who === name;
          const free = !who;
          const caught = state.revealed && chair === state.spy;
          return (
            <button
              key={chair}
              type="button"
              disabled={!canEdit}
              onClick={() => write({ ...state, seats: takeSeat(state.seats, chair, name) })}
              title={who ? (mine ? "stand up" : who) : "sit here"}
              className={clsx(
                "flex min-h-9 min-w-0 flex-1 basis-24 items-center gap-1.5 rounded-xl px-2 py-1.5 text-left transition disabled:opacity-50",
                caught ? "bg-warm/20 ring-1 ring-warm/50" : "bg-white/5 hover:bg-white/9",
              )}
            >
              <span className="min-w-0 flex-1 truncate text-[11px]">
                {who ? (
                  <span className={mine ? "text-chalk" : "text-muted"}>{who}</span>
                ) : (
                  <span className="text-muted/55">seat {index + 1}</span>
                )}
              </span>
              {state.revealed && dealt && (
                <span className="shrink-0 truncate text-[9px] text-muted/70">
                  {chair === state.spy ? "the spy" : state.roles[chair]}
                </span>
              )}
              {free && <span className="shrink-0 text-[9px] text-muted/35">open</span>}
            </button>
          );
        })}
      </div>

      {/* What you were told */}
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto rounded-xl bg-ink-950/25 p-2 inset-ring inset-ring-white/6">
        {!dealt ? (
          <p className="my-auto text-center text-[11px] text-muted/50">
            take a chair, then deal to send everyone somewhere
          </p>
        ) : state.revealed ? (
          <div className="my-auto text-center">
            <p className="text-[11px] text-muted/60">everyone was at the</p>
            <p className="text-sm font-semibold text-chalk">
              {state.location !== null ? pack[state.location].name : ""}
            </p>
            <p className="mt-1 text-[11px] text-warm">
              {state.spy ? label(state.spy) : "somebody"} was the spy
            </p>
          </div>
        ) : (
          <>
            <p className="text-[10px] text-muted/60">
              {expired
                ? "time is up -- last chance to accuse"
                : "ask each other questions. Nothing written down."}
            </p>

            {/* Your own briefing, or an empty chair's, on a device being passed
                round. It shows only while it is asked for. */}
            <div className="flex flex-wrap gap-1">
              {chairs
                .filter((chair) => (mySeat ? chair === mySeat : !state.seats[chair]))
                .map((chair) => (
                  <button
                    key={chair}
                    type="button"
                    onClick={() => setPeek(peek === chair ? null : chair)}
                    className={clsx(
                      "flex min-h-7 items-center gap-1.5 rounded-lg px-2 py-1 text-[10px] transition",
                      peek === chair
                        ? "bg-glow/20 text-glow"
                        : "bg-white/6 text-muted hover:bg-white/10 hover:text-chalk",
                    )}
                  >
                    <Eye className="size-3" strokeWidth={2.2} />
                    {mySeat ? "your card" : label(chair)}
                  </button>
                ))}
            </div>

            {peek && (
              <div className="rounded-xl bg-ink-950/60 p-3 text-center inset-ring inset-ring-white/8">
                <p className="text-sm font-semibold text-chalk">{briefing(peek).title}</p>
                <p className="mt-0.5 text-[11px] text-muted">{briefing(peek).body}</p>
              </div>
            )}

            {canEdit && (
              <div className="mt-auto flex flex-wrap gap-1 pt-1">
                <button
                  type="button"
                  onClick={() => callIt(true)}
                  className="min-h-8 rounded-lg bg-white/8 px-2.5 py-1.5 text-[11px] text-chalk transition hover:bg-white/12"
                >
                  we caught the spy
                </button>
                <button
                  type="button"
                  onClick={() => callIt(false)}
                  className="min-h-8 rounded-lg bg-warm/15 px-2.5 py-1.5 text-[11px] text-warm transition hover:bg-warm/25"
                >
                  the spy got away
                </button>
              </div>
            )}
          </>
        )}
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setPlaces(true)}
          className="flex min-w-0 flex-1 items-center gap-1.5 truncate rounded-lg px-1.5 py-1 text-left text-[10px] text-muted transition hover:bg-white/8 hover:text-chalk"
        >
          <MapPin className="size-3 shrink-0" strokeWidth={2.2} />
          <span className="truncate">all {pack.length} places</span>
        </button>
        <button
          type="button"
          disabled={!canEdit}
          onClick={newRound}
          aria-label="deal a new round"
          title="deal a new round"
          className="grid size-8 shrink-0 place-items-center rounded-lg text-muted transition hover:bg-white/8 hover:text-chalk disabled:opacity-40 sm:size-7"
        >
          <RotateCcw className="size-3.5" strokeWidth={2.2} />
        </button>
      </div>

      {places && (
        <div className="absolute inset-0 z-10 flex flex-col rounded-2xl bg-ink-950/94 p-2.5 backdrop-blur-sm">
          <div className="mb-2 flex shrink-0 items-center justify-between">
            <h3 className="text-[11px] font-semibold text-chalk">where it might be</h3>
            <button
              type="button"
              onClick={() => setPlaces(false)}
              className="rounded-lg px-2 py-1 text-[10px] text-muted transition hover:bg-white/8 hover:text-chalk"
            >
              close
            </button>
          </div>
          <div className="grid min-h-0 flex-1 grid-cols-2 gap-x-2 gap-y-0.5 overflow-y-auto text-[11px] text-muted">
            {pack.map((place) => (
              <p key={place.name} className="truncate">
                {place.name}
              </p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
