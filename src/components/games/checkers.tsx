"use client";

import { useMemo, useState } from "react";
import clsx from "clsx";
import { useRoom } from "@/realtime/room-provider";
import { useRoomStore } from "@/state/room-store";
import { applyMove, initialBoard, movesForPiece, winner } from "@/lib/checkers";
import { canPlay, seatOf, takeSeat, turnHint } from "@/lib/seats";
import GameTable from "./table";
import type { CheckersState, Item } from "@/lib/types";

const DISC = {
  r: "bg-[#e0655c] shadow-[inset_0_-2px_5px_rgba(0,0,0,0.3)]",
  b: "bg-[#3a3448] shadow-[inset_0_-2px_5px_rgba(0,0,0,0.35)]",
} as const;

const SIDES = ["r", "b"] as const;
const NAME = { r: "red", b: "black" } as const;
const TINT = { r: "#e0655c", b: "#3a3448" } as const;

export default function Checkers({ item, state }: { item: Item<"game">; state: CheckersState }) {
  const { updateData, canEdit } = useRoom();
  const me = useRoomStore((s) => s.me);
  const name = me?.name ?? "someone";
  const [pick, setPick] = useState<number | null>(state.chain);

  const write = (next: CheckersState) => void updateData(item.id, { game: "checkers", state: next });

  const won = winner(state.board, state.turn);
  const over = Boolean(won);
  const mySeat = seatOf(state.seats, name);

  const active = state.chain ?? pick;
  const moves = active !== null ? movesForPiece(state.board, active) : [];

  // Red starts along the bottom, so black is the side sitting opposite and gets
  // the board turned around rather than having to read it upside down.
  const flipped = mySeat === "b";
  const squares = useMemo(() => {
    const order = Array.from({ length: 64 }, (_, i) => i);
    return flipped ? order.reverse() : order;
  }, [flipped]);

  const onSquare = (i: number) => {
    if (!canEdit || over) return;
    if (!canPlay(state.seats, state.turn, name)) return;

    const piece = state.board[i];

    // During a forced chain only the chaining piece may act.
    if (state.chain !== null) {
      const move = movesForPiece(state.board, state.chain).find((m) => m.to === i);
      if (!move) return;
      apply(state.chain, i);
      return;
    }

    if (pick === null) {
      if (piece && piece.side === state.turn) setPick(i);
      return;
    }
    if (piece && piece.side === state.turn) {
      setPick(i);
      return;
    }
    const move = moves.find((m) => m.to === i);
    if (!move) return;
    apply(pick, i);
  };

  const apply = (from: number, to: number) => {
    const move = movesForPiece(state.board, from).find((m) => m.to === to);
    if (!move) return;

    const result = applyMove(state.board, move);
    if (result.continues) {
      // Same piece keeps going; keep the turn and lock onto it.
      write({ ...state, board: result.board, chain: to });
      setPick(to);
      return;
    }

    const nextTurn = state.turn === "r" ? "b" : "r";
    const w = winner(result.board, nextTurn);
    const wins = w ? { ...state.wins, [w]: state.wins[w] + 1 } : state.wins;
    write({ ...state, board: result.board, turn: nextTurn, chain: null, wins });
    setPick(null);
  };

  const status = won
    ? `${NAME[won as "r" | "b"]} wins`
    : turnHint(state.seats, state.turn, name, (s) => NAME[s]);

  return (
    <GameTable
      seats={state.seats}
      turn={state.turn}
      me={name}
      order={SIDES}
      label={(s) => NAME[s]}
      tint={(s) => TINT[s]}
      onSit={(seat) => {
        if (!canEdit) return;
        write({ ...state, seats: takeSeat(state.seats, seat, name) });
      }}
      status={status + (state.chain !== null ? " · keep jumping" : "")}
      score={`${state.wins.r} / ${state.wins.b}`}
      onRestart={() => {
        setPick(null);
        write({ ...state, board: initialBoard(), turn: "r", chain: null });
      }}
      canEdit={canEdit}
      over={over}
    >
      <div className="grid aspect-square h-full max-h-full w-full max-w-full grid-cols-8 overflow-hidden rounded-lg">
        {squares.map((i) => {
          const cell = state.board[i];
          const dark = (Math.floor(i / 8) + (i % 8)) % 2 === 1;
          const selected = active === i;
          const target = moves.some((m) => m.to === i);
          return (
            <button
              key={i}
              type="button"
              onClick={() => onSquare(i)}
              disabled={!canEdit || over || !dark}
              aria-label={`square ${i}`}
              className={clsx(
                "relative grid touch-manipulation place-items-center p-[10%] transition",
                dark ? "bg-[#7c5a3c]" : "bg-[#e9dcc4]",
                selected && "ring-2 ring-glow ring-inset",
              )}
            >
              {cell && (
                <span
                  className={clsx(
                    "grid size-full place-items-center rounded-full ring-1 ring-black/20",
                    DISC[cell.side],
                  )}
                >
                  {cell.king && (
                    <span className="text-[clamp(8px,2.4vw,16px)] text-warm">♛</span>
                  )}
                </span>
              )}
              {target && !cell && (
                <span className="pointer-events-none absolute size-2 rounded-full bg-glow/70" />
              )}
            </button>
          );
        })}
      </div>
    </GameTable>
  );
}
