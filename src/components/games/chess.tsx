"use client";

import { useState } from "react";
import clsx from "clsx";
import { RotateCcw } from "lucide-react";
import { useRoom } from "@/realtime/room-provider";
import { useRoomStore } from "@/state/room-store";
import { applyMove, GLYPHS, initialBoard, kingCaptured, legalMoves } from "@/lib/chess";
import type { ChessState, Item } from "@/lib/types";

export default function Chess({ item, state }: { item: Item<"game">; state: ChessState }) {
  const { updateData, canEdit } = useRoom();
  const me = useRoomStore((s) => s.me);
  const name = me?.name ?? "someone";
  const [pick, setPick] = useState<number | null>(null);

  const write = (next: ChessState) => void updateData(item.id, { game: "chess", state: next });

  const won = kingCaptured(state.board);
  const over = Boolean(won);
  const mySeat: "w" | "b" | null =
    state.seats.w === name ? "w" : state.seats.b === name ? "b" : null;
  const seatless = !state.seats.w && !state.seats.b;

  const takeSeat = (seat: "w" | "b") => {
    if (!canEdit) return;
    const occupant = state.seats[seat];
    if (occupant === name) {
      write({ ...state, seats: { ...state.seats, [seat]: null } });
      return;
    }
    if (occupant) return;
    const other = seat === "w" ? "b" : "w";
    write({
      ...state,
      seats: {
        ...state.seats,
        [seat]: name,
        [other]: state.seats[other] === name ? null : state.seats[other],
      },
    });
  };

  const targets = pick !== null ? legalMoves(state.board, pick) : [];

  const onSquare = (i: number) => {
    if (!canEdit || over) return;
    if (!seatless && mySeat !== state.turn) return;

    const piece = state.board[i];

    if (pick === null) {
      if (piece && piece.color === state.turn) setPick(i);
      return;
    }
    if (i === pick) {
      setPick(null);
      return;
    }
    if (piece && piece.color === state.turn) {
      setPick(i); // reselect own piece
      return;
    }
    if (!targets.includes(i)) return;

    const { board, captured } = applyMove(state.board, pick, i);
    const result = kingCaptured(board);
    const wins = result
      ? { ...state.wins, [result]: state.wins[result] + 1 }
      : state.wins;
    void captured;
    write({ ...state, board, turn: state.turn === "w" ? "b" : "w", wins });
    setPick(null);
  };

  const status = won
    ? `${won === "w" ? "white" : "black"} wins`
    : `${state.turn === "w" ? "white" : "black"} to move`;

  return (
    <div className="surface grain flex size-full flex-col overflow-hidden rounded-2xl p-3">
      <div className="mb-2.5 flex items-center gap-1.5">
        <Seat mark="white" who={state.seats.w} active={state.turn === "w" && !over} mine={mySeat === "w"} onClick={() => takeSeat("w")} />
        <Seat mark="black" who={state.seats.b} active={state.turn === "b" && !over} mine={mySeat === "b"} onClick={() => takeSeat("b")} />
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-8 overflow-hidden rounded-lg">
        {state.board.map((cell, i) => {
          const light = (Math.floor(i / 8) + (i % 8)) % 2 === 0;
          const selected = pick === i;
          const target = targets.includes(i);
          return (
            <button
              key={i}
              type="button"
              onClick={() => onSquare(i)}
              disabled={!canEdit || over}
              className={clsx(
                "relative grid place-items-center text-[clamp(14px,4.2vw,30px)] leading-none transition",
                light ? "bg-[#e9dcc4]" : "bg-[#9a7b57]",
                selected && "ring-2 ring-glow ring-inset",
              )}
              style={{ aspectRatio: "1" }}
            >
              {cell && (
                <span className={cell.color === "w" ? "text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.5)]" : "text-ink-950"}>
                  {GLYPHS[cell.color][cell.type]}
                </span>
              )}
              {target && (
                <span
                  className={clsx(
                    "pointer-events-none absolute rounded-full",
                    cell ? "inset-0.5 ring-2 ring-glow/80" : "size-2 bg-glow/70",
                  )}
                />
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-2.5 flex items-center justify-between gap-2">
        <p className="truncate text-xs font-medium text-muted">{status}</p>
        <div className="flex items-center gap-2">
          <span className="text-[10px] tabular-nums text-muted/70">
            {state.wins.w} / {state.wins.b}
          </span>
          <button
            type="button"
            disabled={!canEdit}
            onClick={() => {
              setPick(null);
              write({ ...state, board: initialBoard(), turn: "w" });
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
  mark,
  who,
  active,
  mine,
  onClick,
}: {
  mark: string;
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
      <span
        className={clsx(
          "size-3 shrink-0 rounded-full ring-1 ring-white/25",
          mark === "white" ? "bg-white" : "bg-ink-950",
        )}
      />
      <span className="min-w-0 flex-1 truncate text-[11px] text-muted">{who ?? "open seat"}</span>
      {mine && <span className="shrink-0 text-[10px] text-glow">you</span>}
    </button>
  );
}
