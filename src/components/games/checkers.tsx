"use client";

import { useState } from "react";
import clsx from "clsx";
import { RotateCcw } from "lucide-react";
import { useRoom } from "@/realtime/room-provider";
import { useRoomStore } from "@/state/room-store";
import { applyMove, initialBoard, movesForPiece, winner } from "@/lib/checkers";
import type { CheckersState, Item } from "@/lib/types";

const DISC = {
  r: "bg-[#e0655c] shadow-[inset_0_-2px_5px_rgba(0,0,0,0.3)]",
  b: "bg-[#3a3448] shadow-[inset_0_-2px_5px_rgba(0,0,0,0.35)]",
} as const;

export default function Checkers({ item, state }: { item: Item<"game">; state: CheckersState }) {
  const { updateData, canEdit } = useRoom();
  const me = useRoomStore((s) => s.me);
  const name = me?.name ?? "someone";
  const [pick, setPick] = useState<number | null>(state.chain);

  const write = (next: CheckersState) => void updateData(item.id, { game: "checkers", state: next });

  const won = winner(state.board, state.turn);
  const over = Boolean(won);
  const mySeat: "r" | "b" | null =
    state.seats.r === name ? "r" : state.seats.b === name ? "b" : null;
  const seatless = !state.seats.r && !state.seats.b;

  const takeSeat = (seat: "r" | "b") => {
    if (!canEdit) return;
    const occupant = state.seats[seat];
    if (occupant === name) {
      write({ ...state, seats: { ...state.seats, [seat]: null } });
      return;
    }
    if (occupant) return;
    const other = seat === "r" ? "b" : "r";
    write({
      ...state,
      seats: {
        ...state.seats,
        [seat]: name,
        [other]: state.seats[other] === name ? null : state.seats[other],
      },
    });
  };

  const active = state.chain ?? pick;
  const moves = active !== null ? movesForPiece(state.board, active) : [];

  const onSquare = (i: number) => {
    if (!canEdit || over) return;
    if (!seatless && mySeat !== state.turn) return;

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
    ? `${won === "r" ? "red" : "black"} wins`
    : `${state.turn === "r" ? "red" : "black"} to move`;

  return (
    <div className="surface grain flex size-full flex-col overflow-hidden rounded-2xl p-3">
      <div className="mb-2.5 flex items-center gap-1.5">
        <Seat disc="r" who={state.seats.r} active={state.turn === "r" && !over} mine={mySeat === "r"} onClick={() => takeSeat("r")} />
        <Seat disc="b" who={state.seats.b} active={state.turn === "b" && !over} mine={mySeat === "b"} onClick={() => takeSeat("b")} />
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-8 overflow-hidden rounded-lg">
        {state.board.map((cell, i) => {
          const dark = (Math.floor(i / 8) + (i % 8)) % 2 === 1;
          const selected = active === i;
          const target = moves.some((m) => m.to === i);
          return (
            <button
              key={i}
              type="button"
              onClick={() => onSquare(i)}
              disabled={!canEdit || over || !dark}
              className={clsx(
                "relative grid place-items-center p-[10%] transition",
                dark ? "bg-[#7c5a3c]" : "bg-[#e9dcc4]",
                selected && "ring-2 ring-glow ring-inset",
              )}
              style={{ aspectRatio: "1" }}
            >
              {cell && (
                <span
                  className={clsx(
                    "grid size-full place-items-center rounded-full ring-1 ring-black/20",
                    DISC[cell.side],
                  )}
                >
                  {cell.king && <span className="text-[clamp(8px,2.4vw,16px)] text-warm">♛</span>}
                </span>
              )}
              {target && !cell && (
                <span className="pointer-events-none absolute size-2 rounded-full bg-glow/70" />
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-2.5 flex items-center justify-between gap-2">
        <p className="truncate text-xs font-medium text-muted">
          {status}
          {state.chain !== null && " (continue jumping)"}
        </p>
        <div className="flex items-center gap-2">
          <span className="text-[10px] tabular-nums text-muted/70">
            {state.wins.r} / {state.wins.b}
          </span>
          <button
            type="button"
            disabled={!canEdit}
            onClick={() => {
              setPick(null);
              write({ ...state, board: initialBoard(), turn: "r", chain: null });
            }}
            aria-label="new game"
            className="grid size-6 place-items-center rounded-lg text-muted transition hover:bg-white/8 hover:text-chalk disabled:opacity-40"
          >
            <RotateCcw className="size-3.5" strokeWidth={2.2} />
          </button>
        </div>
      </div>
    </div>
  );
}

function Seat({
  disc,
  who,
  active,
  mine,
  onClick,
}: {
  disc: "r" | "b";
  who: string | null;
  active: boolean;
  mine: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "flex min-w-0 flex-1 items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-left transition",
        active ? "bg-white/12 ring-1 ring-glow/45" : "bg-white/5 hover:bg-white/9",
      )}
    >
      <span className={clsx("size-3 shrink-0 rounded-full", DISC[disc])} />
      <span className="min-w-0 flex-1 truncate text-[11px] text-muted">{who ?? "open seat"}</span>
      {mine && <span className="shrink-0 text-[10px] text-glow">you</span>}
    </button>
  );
}
