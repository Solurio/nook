"use client";

import { useMemo, useState } from "react";
import clsx from "clsx";
import { ArrowLeft, ArrowRight, Hand, Layers, RotateCcw, Users } from "lucide-react";
import { useRoom } from "@/realtime/room-provider";
import { useRoomStore } from "@/state/room-store";
import { seatOf, takeSeat } from "@/lib/seats";
import { seatIds, shuffle, teamOf } from "@/lib/cards";
import {
  fullSet,
  handPips,
  hasMove,
  openEnds,
  opener,
  place,
  playableSides,
  roundOutcome,
  type Line,
  type Side,
  type Tile,
} from "@/lib/dominoes";
import type { DominoesState, Item } from "@/lib/types";

const TEAM_TINT = ["#6aa9e0", "#e0655c", "#a6d189", "#f6c177"];
const DEAL_EACH = 7;

/**
 * Dominoes on a double-six set. Two to four round the table, on their own or in
 * pairs sitting across from each other, which is the arrangement where one
 * partner going out wins it for both.
 */
export default function Dominoes({
  item,
  state,
}: {
  item: Item<"game">;
  state: DominoesState;
}) {
  const { updateData, canEdit } = useRoom();
  const me = useRoomStore((s) => s.me);
  const name = me?.name ?? "someone";
  const [picked, setPicked] = useState<number | null>(null);

  const write = (next: DominoesState) =>
    void updateData(item.id, { game: "dominoes", state: next });

  const chairs = seatIds(state.seatCount);
  const mySeat = seatOf(state.seats, name);
  const openTable = chairs.every((chair) => !state.seats[chair]);
  // An open table is one device being passed round, so it plays every hand.
  const acting = mySeat ?? (openTable ? state.turn : null);
  const myTurn = acting === state.turn;

  const line = state.line as Line;
  const hand = (state.hands[state.turn] ?? []) as Tile[];
  const ends = openEnds(line);

  const standing = useMemo(
    () => ({
      seats: chairs,
      teams: state.teams,
      hands: state.hands as Record<string, Tile[]>,
    }),
    [chairs, state.teams, state.hands],
  );
  const result = useMemo(() => roundOutcome(line, standing), [line, standing]);
  const over = result.kind !== "playing";

  const dealt = Object.values(state.hands).some((h) => h.length > 0);
  const stuck = dealt && !hasMove(line, hand);

  const nextSeat = (from: string) => {
    const i = chairs.indexOf(from);
    return chairs[(i + 1) % chairs.length];
  };

  const newRound = () => {
    const tiles = shuffle(fullSet());
    const hands: Record<string, Tile[]> = {};
    chairs.forEach((chair, i) => {
      hands[chair] = tiles.slice(i * DEAL_EACH, (i + 1) * DEAL_EACH) as Tile[];
    });
    const boneyard = tiles.slice(chairs.length * DEAL_EACH) as Tile[];
    setPicked(null);
    write({
      ...state,
      line: [],
      hands,
      boneyard,
      turn: opener(hands, chairs) ?? chairs[0],
      passes: 0,
    });
  };

  const playTile = (index: number, side: Side) => {
    const tile = hand[index];
    if (!tile) return;
    const next = place(line, tile, side);
    if (!next) return;

    const rest = hand.filter((_, i) => i !== index);
    const hands = { ...state.hands, [state.turn]: rest };
    const done = rest.length === 0;

    const wins = done
      ? { ...state.wins, [state.turn]: (state.wins[state.turn] ?? 0) + 1 }
      : state.wins;

    setPicked(null);
    write({
      ...state,
      line: next,
      hands,
      wins,
      passes: 0,
      turn: done ? state.turn : nextSeat(state.turn),
    });
  };

  const drawTile = () => {
    if (state.boneyard.length === 0) return;
    const [top, ...rest] = state.boneyard as Tile[];
    write({
      ...state,
      boneyard: rest,
      hands: { ...state.hands, [state.turn]: [...hand, top] },
    });
  };

  const pass = () => {
    setPicked(null);
    write({ ...state, passes: state.passes + 1, turn: nextSeat(state.turn) });
  };

  const status = (() => {
    if (result.kind === "out") {
      const who = state.seats[result.seat] ?? `seat ${chairs.indexOf(result.seat) + 1}`;
      const team = teamOf(chairs.indexOf(result.seat), state.teams);
      return team === null ? `${who} is out` : `${who} is out, team ${team + 1} takes it`;
    }
    if (result.kind === "blocked") {
      if (!result.seat) return "blocked, and dead even";
      const who = state.seats[result.seat] ?? `seat ${chairs.indexOf(result.seat) + 1}`;
      return `blocked · ${who} has the lightest hand`;
    }
    if (!dealt) return "shuffle to start a round";
    const who = state.seats[state.turn] ?? `seat ${chairs.indexOf(state.turn) + 1}`;
    if (openTable) return `${who} to play · pass it over`;
    return myTurn ? "your go" : `${who} is thinking`;
  })();

  return (
    <div className="surface grain flex size-full flex-col gap-2 overflow-hidden rounded-2xl p-2.5">
      {/* Chairs */}
      <div className="flex flex-wrap gap-1.5">
        {chairs.map((chair, index) => {
          const team = teamOf(index, state.teams);
          const who = state.seats[chair];
          const mine = who === name;
          const count = (state.hands[chair] ?? []).length;
          return (
            <button
              key={chair}
              type="button"
              disabled={!canEdit}
              onClick={() => write({ ...state, seats: takeSeat(state.seats, chair, name) })}
              title={who ? (mine ? "stand up" : who) : "sit here"}
              className={clsx(
                "flex min-h-9 min-w-0 flex-1 basis-24 items-center gap-1.5 rounded-xl px-2 py-1.5 text-left transition disabled:opacity-50",
                state.turn === chair && !over
                  ? "bg-white/12 ring-1 ring-glow/45"
                  : "bg-white/5 hover:bg-white/9",
              )}
            >
              <span
                className="size-2.5 shrink-0 rounded-full ring-1 ring-white/25"
                style={{
                  background: team === null ? "#8a809c" : TEAM_TINT[team % TEAM_TINT.length],
                }}
              />
              <span className="min-w-0 flex-1 truncate text-[11px]">
                {who ? (
                  <span className={mine ? "text-chalk" : "text-muted"}>{who}</span>
                ) : (
                  <span className="text-muted/55">seat {index + 1}</span>
                )}
              </span>
              {count > 0 && (
                <span className="shrink-0 text-[10px] tabular-nums text-muted/70">{count}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* The line */}
      <div className="flex min-h-0 flex-1 items-center gap-1 overflow-x-auto rounded-xl bg-ink-950/25 p-2 inset-ring inset-ring-white/6">
        {line.length === 0 ? (
          <p className="w-full text-center text-[11px] text-muted/50">the line is empty</p>
        ) : (
          line.map((tile, i) => <Domino key={i} tile={tile as Tile} />)
        )}
      </div>

      {/* Hand */}
      <div>
        <div className="mb-1 flex items-center gap-1.5">
          <span className="text-[10px] tracking-wide text-muted/70 uppercase">
            {openTable ? "hand in play" : mySeat ? "your hand" : "take a seat"}
          </span>
          {ends && (
            <span className="text-[10px] text-muted/50">
              ends {ends.left} and {ends.right}
            </span>
          )}
          <div className="flex-1" />
          <span className="text-[10px] text-muted/50">{handPips(hand)} pips</span>
        </div>

        <div className="flex min-h-12 flex-wrap items-center gap-1">
          {dealt && (acting || openTable) ? (
            hand.map((tile, i) => {
              const sides = playableSides(line, tile as Tile);
              const playable = myTurn && sides.length > 0 && !over;
              return (
                <Domino
                  key={i}
                  tile={tile as Tile}
                  dim={!playable}
                  selected={picked === i}
                  onClick={
                    canEdit && playable
                      ? () => {
                          if (sides.length === 1) playTile(i, sides[0]);
                          else setPicked(picked === i ? null : i);
                        }
                      : undefined
                  }
                />
              );
            })
          ) : (
            <p className="text-[11px] text-muted/50">nothing dealt yet</p>
          )}
        </div>

        {/* Which end, when a tile fits both */}
        {picked !== null && (
          <div className="mt-1.5 flex items-center gap-1.5">
            <span className="text-[10px] text-muted/70">which end?</span>
            <button
              type="button"
              onClick={() => playTile(picked, "left")}
              className="flex items-center gap-1 rounded-lg bg-white/8 px-2.5 py-1.5 text-[11px] text-chalk transition hover:bg-white/12"
            >
              <ArrowLeft className="size-3.5" strokeWidth={2.2} />
              left
            </button>
            <button
              type="button"
              onClick={() => playTile(picked, "right")}
              className="flex items-center gap-1 rounded-lg bg-white/8 px-2.5 py-1.5 text-[11px] text-chalk transition hover:bg-white/12"
            >
              right
              <ArrowRight className="size-3.5" strokeWidth={2.2} />
            </button>
          </div>
        )}
      </div>

      {/* State of play */}
      <div className="flex items-center gap-2">
        <p className="flex min-w-0 flex-1 items-center gap-1.5 truncate text-xs font-medium text-muted">
          {openTable && !over && <Users className="size-3.5 shrink-0 text-muted/60" strokeWidth={2.2} />}
          <span className="truncate">{status}</span>
        </p>

        {dealt && !over && myTurn && state.boneyard.length > 0 && stuck && (
          <button
            type="button"
            disabled={!canEdit}
            onClick={drawTile}
            title="draw from the boneyard"
            className="flex shrink-0 items-center gap-1 rounded-lg bg-white/8 px-2 py-1.5 text-[11px] text-chalk transition hover:bg-white/12"
          >
            <Layers className="size-3.5" strokeWidth={2.2} />
            draw {state.boneyard.length}
          </button>
        )}

        {dealt && !over && myTurn && stuck && state.boneyard.length === 0 && (
          <button
            type="button"
            disabled={!canEdit}
            onClick={pass}
            className="flex shrink-0 items-center gap-1 rounded-lg bg-white/8 px-2 py-1.5 text-[11px] text-chalk transition hover:bg-white/12"
          >
            <Hand className="size-3.5" strokeWidth={2.2} />
            pass
          </button>
        )}

        <button
          type="button"
          disabled={!canEdit}
          onClick={newRound}
          aria-label="shuffle and deal"
          title="shuffle and deal"
          className="grid size-8 shrink-0 place-items-center rounded-lg text-muted transition hover:bg-white/8 hover:text-chalk disabled:opacity-40 sm:size-7"
        >
          <RotateCcw className="size-3.5" strokeWidth={2.2} />
        </button>
      </div>
    </div>
  );
}

/** One tile, lying along the line. */
function Domino({
  tile,
  dim,
  selected,
  onClick,
}: {
  tile: Tile;
  dim?: boolean;
  selected?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      aria-label={`${tile[0]} and ${tile[1]}`}
      title={`${tile[0]} | ${tile[1]}`}
      className={clsx(
        "flex h-11 w-7 shrink-0 flex-col overflow-hidden rounded-md bg-[#f6f2e8] text-[#1a1420] shadow-sm ring-1 ring-black/25 transition",
        onClick && "hover:-translate-y-0.5 hover:ring-2 hover:ring-glow/70",
        selected && "-translate-y-1 ring-2 ring-glow",
        dim && "opacity-45",
      )}
    >
      <span className="grid flex-1 place-items-center text-[12px] font-bold leading-none">
        {tile[0]}
      </span>
      <span className="h-px w-full bg-[#1a1420]/25" />
      <span className="grid flex-1 place-items-center text-[12px] font-bold leading-none">
        {tile[1]}
      </span>
    </button>
  );
}
