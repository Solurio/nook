"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import {
  ArrowLeft,
  ArrowRight,
  Eye,
  Hand,
  Layers,
  Minus,
  Plus,
  RotateCcw,
  Users,
} from "lucide-react";
import { useRoom } from "@/realtime/room-provider";
import { usePiles } from "@/realtime/use-piles";
import { useRoomStore } from "@/state/room-store";
import { chairOf, claimChair } from "@/lib/seats";
import { seatIds, teamOf } from "@/lib/cards";
import { sizeOf } from "@/lib/piles";
import {
  BONEYARD,
  afterPlay,
  dealTargets,
  fullSet,
  handPips,
  handSlot,
  hasMove,
  isDouble,
  openEnds,
  orientFor,
  pickLead,
  playableSides,
  publicOnly,
  roundStatus,
  tally,
  type Line,
  type Side,
  type Tile,
} from "@/lib/dominoes";
import type { DominoesState, Item } from "@/lib/types";

const TEAM_TINT = ["#6aa9e0", "#e0655c", "#a6d189", "#f6c177"];

/**
 * Dominoes on a double-six set. Two to four round the table, on their own or in
 * pairs sitting across from each other, which is the arrangement where one
 * partner going out wins it for both.
 *
 * Nobody's tiles are in the table's state. Each hand is a secret pile only its
 * owner can read, and the boneyard is one nobody can: the database deals, and
 * a tile only becomes public by being played. What everyone sees of the other
 * players is what you would across a real table -- the backs of their tiles.
 */
export default function Dominoes({
  item,
  state,
}: {
  item: Item<"game">;
  state: DominoesState;
}) {
  const { updateData, pile, canEdit } = useRoom();
  const me = useRoomStore((s) => s.me);
  const [picked, setPicked] = useState<number | null>(null);
  // On a phone passed round the table, the hand in play stays face down until
  // whoever is holding it asks to see it.
  const [lookingAt, setLookingAt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const chairs = seatIds(state.seatCount);
  const holders = useMemo(() => state.holders ?? {}, [state.holders]);
  const myChair = chairOf(state.seats, holders, me);
  const piles = state.piles;
  const mine = usePiles(item.id, piles);

  const line = state.line as Line;
  const ends = openEnds(line);
  const round = state.round ?? 0;
  const results = useMemo(() => state.results ?? {}, [state.results]);
  const wins = tally(results);
  const status = roundStatus(chairs, piles, state.passes, state.revealed);
  const playing = status.kind === "playing";

  // The hand this device may play: the one whose turn it is, if it is ours.
  const turnSlot = handSlot(state.turn);
  const actingHand = (mine[turnSlot] as Tile[] | undefined) ?? null;
  const myTurn = playing && actingHand !== null;
  // More than one hand here means an empty table played on one phone.
  const passedRound = Object.keys(mine).filter((slot) => slot.startsWith("hand:")).length > 1;

  // Which hand to draw at the bottom: your own chair's, if you have one; the
  // one in play, on a phone passed round.
  const shownSlot = myChair ? handSlot(myChair) : myTurn ? turnSlot : null;
  const shownHand = shownSlot ? ((mine[shownSlot] as Tile[] | undefined) ?? []) : [];
  const gated = passedRound && !myChair && lookingAt !== state.turn;

  const stuck = myTurn && !hasMove(line, actingHand ?? []);
  const boneyardLeft = sizeOf(piles, BONEYARD);

  /** The public state with anything the database owns taken out. */
  const base = () => publicOnly(state);

  const write = (next: DominoesState) =>
    void updateData(item.id, { game: "dominoes", state: next });

  const nextSeat = (from: string) => chairs[(chairs.indexOf(from) + 1) % chairs.length];

  const run = async (work: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    try {
      await work();
    } finally {
      setBusy(false);
      setPicked(null);
    }
  };

  const deal = () =>
    run(async () => {
      if (!me) return;
      const lastWinner = round > 0 ? results[String(round)] : null;
      const lead = pickLead(chairs, lastWinner);
      const next = base();
      delete next.revealed;
      const setup = await pile("pile_setup", {
        p_item: item.id,
        p_piles: [{ slot: BONEYARD, cards: fullSet(), shuffle: true }],
        p_public: {
          game: "dominoes",
          state: { ...next, line: [], passes: 0, turn: lead, round: round + 1 },
        },
      });
      if (setup.error) return;
      await pile("pile_deal", {
        p_item: item.id,
        p_from: BONEYARD,
        p_targets: dealTargets(chairs, holders, me.userId),
      });
    });

  const playTile = (tile: Tile, side: Side) =>
    run(async () => {
      if (!actingHand) return;
      const next = afterPlay(state, chairs, tile, side, actingHand.length);
      if (!next) return;
      await pile("pile_take", {
        p_item: item.id,
        p_from: turnSlot,
        p_cards: [tile],
        p_public: { game: "dominoes", state: { ...base(), ...next } },
      });
    });

  const draw = () =>
    run(() => pile("pile_draw", { p_item: item.id, p_from: BONEYARD, p_to: turnSlot }));

  const pass = () => write({ ...base(), passes: state.passes + 1, turn: nextSeat(state.turn) });

  // ---------------------------------------------------------------------------
  // A blocked round: everyone turns their own hand over, then it is counted.
  // ---------------------------------------------------------------------------

  const revealing = useRef("");
  // Only my own hands: the database would refuse anyone else's, and asking is
  // how a client would find that out the hard way.
  const toReveal =
    status.kind === "counting"
      ? status.waitingOn.map(handSlot).filter((slot) => slot in mine)
      : [];
  const revealKey = toReveal.length > 0 ? `${round}:${toReveal.join(",")}` : "";
  useEffect(() => {
    if (!revealKey || revealing.current === revealKey) return;
    revealing.current = revealKey;
    const slots = revealKey.slice(revealKey.indexOf(":") + 1).split(",");
    void pile("pile_reveal", { p_item: item.id, p_slots: slots, p_keep: true });
  }, [revealKey, item.id, pile]);

  // Whoever sees the count first writes it down. Everyone would write the same
  // thing, so it does not matter who gets there.
  const blockedSeat = status.kind === "blocked" ? status.seat : undefined;
  useEffect(() => {
    if (blockedSeat === undefined || String(round) in results || !canEdit) return;
    const clean = publicOnly(state);
    void updateData(item.id, {
      game: "dominoes",
      state: { ...clean, results: { ...results, [String(round)]: blockedSeat } },
    });
  }, [blockedSeat, round, results, canEdit, state, item.id, updateData]);

  // ---------------------------------------------------------------------------
  // What to say
  // ---------------------------------------------------------------------------

  const label = (chair: string) => state.seats[chair] ?? `seat ${chairs.indexOf(chair) + 1}`;

  const headline = (() => {
    if (status.kind === "idle") return "sit down, then deal";
    if (status.kind === "out") {
      const team = teamOf(chairs.indexOf(status.seat), state.teams);
      return team === null
        ? `${label(status.seat)} is out`
        : `${label(status.seat)} is out, team ${team + 1} takes it`;
    }
    if (status.kind === "counting") return "blocked -- turning the hands over";
    if (status.kind === "blocked") {
      return status.seat
        ? `blocked · ${label(status.seat)} has the lightest hand`
        : "blocked, and dead even";
    }
    if (myTurn && passedRound && !myChair) return `${label(state.turn)} to play`;
    if (myTurn) return "your go";
    return `${label(state.turn)} is thinking`;
  })();

  const resize = (by: number) => {
    const count = Math.max(2, Math.min(4, state.seatCount + by));
    if (count === state.seatCount) return;
    const keep = seatIds(count);
    write({
      ...base(),
      seatCount: count,
      teams: count === 4 ? state.teams : 0,
      seats: Object.fromEntries(keep.map((c) => [c, state.seats[c] ?? null])),
      holders: Object.fromEntries(keep.map((c) => [c, holders[c] ?? null])),
    });
  };

  return (
    <div className="surface grain flex size-full flex-col gap-2 overflow-hidden rounded-2xl p-2.5">
      {/* The table's shape */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-muted/70">
        <span className="flex items-center gap-0.5">
          <button
            type="button"
            disabled={!canEdit || state.seatCount <= 2}
            onClick={() => resize(-1)}
            aria-label="one chair fewer"
            className="grid size-6 place-items-center rounded transition hover:bg-white/10 hover:text-chalk disabled:opacity-30"
          >
            <Minus className="size-3" strokeWidth={2.6} />
          </button>
          <span className="tabular-nums text-chalk">{state.seatCount}</span>
          <span>chairs</span>
          <button
            type="button"
            disabled={!canEdit || state.seatCount >= 4}
            onClick={() => resize(1)}
            aria-label="one chair more"
            className="grid size-6 place-items-center rounded transition hover:bg-white/10 hover:text-chalk disabled:opacity-30"
          >
            <Plus className="size-3" strokeWidth={2.6} />
          </button>
        </span>
        {state.seatCount === 4 && (
          <button
            type="button"
            disabled={!canEdit}
            onClick={() => write({ ...base(), teams: state.teams >= 2 ? 0 : 2 })}
            className="flex items-center gap-1 rounded-lg px-1.5 py-1 transition hover:bg-white/8 hover:text-chalk disabled:opacity-40"
          >
            <Users className="size-3" strokeWidth={2.2} />
            {state.teams >= 2 ? "in pairs" : "each for themselves"}
          </button>
        )}
        <span className="ml-auto flex items-center gap-1" title="tiles left in the boneyard">
          <Layers className="size-3" strokeWidth={2.2} />
          <span className="tabular-nums text-chalk">{boneyardLeft}</span> in the boneyard
        </span>
      </div>

      {/* Chairs, and the backs of everyone's tiles */}
      <div className="grid grid-cols-2 gap-1.5">
        {chairs.map((chair, index) => {
          const team = teamOf(index, state.teams);
          const who = state.seats[chair];
          const isMine = chair === myChair;
          const count = sizeOf(piles, handSlot(chair));
          const shown = state.revealed?.[handSlot(chair)] as Tile[] | undefined;
          return (
            <button
              key={chair}
              type="button"
              disabled={!canEdit || !me}
              onClick={() =>
                me && write({ ...base(), ...claimChair(state.seats, holders, chair, me) })
              }
              title={who ? (isMine ? "stand up" : who) : "sit here"}
              className={clsx(
                "flex min-h-11 min-w-0 flex-col gap-1 rounded-xl px-2 py-1.5 text-left transition disabled:opacity-60",
                state.turn === chair && playing
                  ? "bg-white/12 ring-1 ring-glow/45"
                  : "bg-white/5 hover:bg-white/9",
              )}
            >
              <span className="flex min-w-0 items-center gap-1.5">
                <span
                  className="size-2.5 shrink-0 rounded-full ring-1 ring-white/25"
                  style={{
                    background: team === null ? "#8a809c" : TEAM_TINT[team % TEAM_TINT.length],
                  }}
                />
                <span className="min-w-0 flex-1 truncate text-[11px]">
                  {who ? (
                    <span className={isMine ? "text-chalk" : "text-muted"}>{who}</span>
                  ) : (
                    <span className="text-muted/55">seat {index + 1}</span>
                  )}
                </span>
                {(wins[chair] ?? 0) > 0 && (
                  <span className="shrink-0 text-[10px] tabular-nums text-warm">
                    {wins[chair]}
                  </span>
                )}
              </span>
              {shown ? (
                <span className="flex flex-wrap gap-0.5">
                  {shown.map((tile, i) => (
                    <Domino key={i} tile={tile} />
                  ))}
                </span>
              ) : (
                count > 0 && <TileBacks count={count} />
              )}
            </button>
          );
        })}
      </div>

      {/* The line, on a baize of its own */}
      <div className="flex min-h-0 flex-1 items-center gap-0.5 overflow-x-auto rounded-xl bg-[#1d3b2c]/70 p-2 inset-ring inset-ring-black/30">
        {line.length === 0 ? (
          <p className="w-full text-center text-[11px] text-chalk/45">the line is empty</p>
        ) : (
          line.map((tile, i) => (
            <Domino key={i} tile={tile as Tile} upright={isDouble(tile as Tile)} />
          ))
        )}
      </div>

      {/* Your hand, and only yours */}
      <div>
        <div className="mb-1 flex items-center gap-1.5">
          <span className="text-[10px] tracking-wide text-muted/70 uppercase">
            {myChair ? "your hand" : passedRound ? `${label(state.turn)}'s hand` : "take a seat"}
          </span>
          {ends && (
            <span className="text-[10px] text-muted/50">
              ends {ends.left} and {ends.right}
            </span>
          )}
          <div className="flex-1" />
          {shownHand.length > 0 && !gated && (
            <span className="text-[10px] text-muted/50">{handPips(shownHand)} pips</span>
          )}
        </div>

        <div className="flex min-h-14 flex-wrap items-center gap-1">
          {gated && shownHand.length > 0 ? (
            <button
              type="button"
              onClick={() => setLookingAt(state.turn)}
              className="flex min-h-11 items-center gap-2 rounded-xl bg-white/8 px-3 text-[12px] text-chalk transition active:bg-white/14"
            >
              <Eye className="size-4" strokeWidth={2.2} />
              pass the phone to {label(state.turn)}, then tap to look
            </button>
          ) : shownHand.length > 0 ? (
            shownHand.map((tile, i) => {
              const sides = playableSides(line, tile);
              const playable = myTurn && shownSlot === turnSlot && sides.length > 0 && !busy;
              return (
                <Domino
                  key={`${tile[0]}-${tile[1]}-${i}`}
                  tile={tile}
                  upright
                  big
                  dim={!playable}
                  selected={picked === i}
                  onClick={
                    canEdit && playable
                      ? () => {
                          if (sides.length === 1) void playTile(tile, sides[0]);
                          else setPicked(picked === i ? null : i);
                        }
                      : undefined
                  }
                />
              );
            })
          ) : (
            <p className="text-[11px] text-muted/50">
              {status.kind === "idle"
                ? "everyone sits down before the deal -- a chair taken later is dealt nothing"
                : myChair
                  ? "no tiles left"
                  : "you are watching"}
            </p>
          )}
        </div>

        {/* A tile that reaches both ends reaches them turned different ways
            round. Rather than name the ends, show it lying as it would land. */}
        {picked !== null && shownHand[picked] && (
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <span className="text-[10px] text-muted/70">lay it down</span>
            {(["left", "right"] as const).map((side) => {
              const laid = orientFor(line, shownHand[picked], side);
              if (!laid) return null;
              return (
                <span key={side} className="flex items-center gap-1">
                  {side === "left" && (
                    <ArrowLeft className="size-3.5 text-muted/60" strokeWidth={2.2} />
                  )}
                  <Domino
                    tile={laid}
                    upright={isDouble(laid)}
                    big
                    label={`${side} end, ${laid[0]} against ${laid[1]}`}
                    onClick={() => void playTile(shownHand[picked], side)}
                  />
                  {side === "right" && (
                    <ArrowRight className="size-3.5 text-muted/60" strokeWidth={2.2} />
                  )}
                </span>
              );
            })}
            <button
              type="button"
              onClick={() => setPicked(null)}
              className="min-h-9 rounded-lg px-2 text-[11px] text-muted"
            >
              cancel
            </button>
          </div>
        )}
      </div>

      {/* State of play */}
      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 truncate text-xs font-medium text-muted">{headline}</p>

        {myTurn && stuck && boneyardLeft > 0 && !gated && (
          <button
            type="button"
            disabled={!canEdit || busy}
            onClick={() => void draw()}
            className="flex min-h-9 shrink-0 items-center gap-1 rounded-lg bg-white/8 px-2.5 text-[11px] text-chalk transition hover:bg-white/12 disabled:opacity-40"
          >
            <Layers className="size-3.5" strokeWidth={2.2} />
            draw
          </button>
        )}

        {myTurn && stuck && boneyardLeft === 0 && !gated && (
          <button
            type="button"
            disabled={!canEdit || busy}
            onClick={pass}
            className="flex min-h-9 shrink-0 items-center gap-1 rounded-lg bg-white/8 px-2.5 text-[11px] text-chalk transition hover:bg-white/12 disabled:opacity-40"
          >
            <Hand className="size-3.5" strokeWidth={2.2} />
            pass
          </button>
        )}

        <button
          type="button"
          disabled={!canEdit || busy}
          onClick={() => void deal()}
          aria-label="shuffle and deal"
          title="shuffle and deal"
          className="grid size-9 shrink-0 place-items-center rounded-lg text-muted transition hover:bg-white/8 hover:text-chalk disabled:opacity-40 sm:size-8"
        >
          <RotateCcw className="size-3.5" strokeWidth={2.2} />
        </button>
      </div>
    </div>
  );
}

/** How many tiles someone holds, shown the way you would see it across a table. */
function TileBacks({ count }: { count: number }) {
  return (
    <span className="flex items-center gap-[2px]" aria-label={`${count} tiles`}>
      {Array.from({ length: Math.min(count, 12) }, (_, i) => (
        <span
          key={i}
          className="h-5 w-2.5 rounded-[3px] bg-gradient-to-b from-[#2a2238] to-[#1a1424] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.12)]"
        />
      ))}
      {count > 12 && <span className="ml-0.5 text-[9px] text-muted/70">+{count - 12}</span>}
    </span>
  );
}

/**
 * Pip layouts on a three by three grid, the way they are printed on a real
 * tile. Six splits into two columns rather than filling the middle row.
 */
const PIPS: Record<number, number[]> = {
  0: [],
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

/** Half a tile: one number, drawn as dots. */
function Half({ value, big }: { value: number; big?: boolean }) {
  const on = PIPS[value] ?? [];
  return (
    <span
      className={clsx(
        "grid flex-1 grid-cols-3 grid-rows-3 place-items-center",
        big ? "gap-px p-1" : "gap-px p-0.5",
      )}
    >
      {Array.from({ length: 9 }, (_, i) => (
        <span
          key={i}
          className={clsx(
            "rounded-full",
            big ? "size-[3.5px]" : "size-[2.5px]",
            on.includes(i) ? "bg-[#1a1420]" : "bg-transparent",
          )}
        />
      ))}
    </span>
  );
}

/**
 * One domino. Tiles in the line lie along it, left half first, except doubles,
 * which sit across it the way they do on a table. Tiles in your hand stand up,
 * because that is how you hold them. Only a tile you can do something with is
 * a button; the rest are just tiles.
 */
function Domino({
  tile,
  upright,
  big,
  dim,
  selected,
  onClick,
  label,
}: {
  tile: Tile;
  upright?: boolean;
  big?: boolean;
  dim?: boolean;
  selected?: boolean;
  onClick?: () => void;
  label?: string;
}) {
  const size = big
    ? upright
      ? "h-14 w-7"
      : "h-7 w-14"
    : upright
      ? "h-10 w-5"
      : "h-5 w-10";

  const className = clsx(
    "flex shrink-0 overflow-hidden rounded-md bg-[#f6f2e8] shadow-[0_2px_0_rgba(0,0,0,0.35)] ring-1 ring-black/25 transition",
    upright ? "flex-col" : "flex-row",
    size,
    onClick && "hover:-translate-y-0.5 hover:ring-2 hover:ring-glow/70",
    selected && "-translate-y-1 ring-2 ring-glow",
    dim && "opacity-45",
  );
  const face = (
    <>
      <Half value={tile[0]} big={big} />
      <span className={clsx("bg-[#1a1420]/25", upright ? "h-px w-full" : "h-full w-px")} />
      <Half value={tile[1]} big={big} />
    </>
  );

  if (!onClick) {
    return (
      <span className={className} aria-label={label ?? `${tile[0]} and ${tile[1]}`}>
        {face}
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label ?? `${tile[0]} and ${tile[1]}`}
      title={label ?? `${tile[0]} | ${tile[1]}`}
      className={className}
    >
      {face}
    </button>
  );
}
