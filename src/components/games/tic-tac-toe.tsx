"use client";

import clsx from "clsx";
import { RotateCcw } from "lucide-react";
import { useRoom } from "@/realtime/room-provider";
import { useRoomStore } from "@/state/room-store";
import { evaluateTicTacToe, resetTicTacToe } from "@/lib/games";
import type { Item, TicTacToeState } from "@/lib/types";

export default function TicTacToe({
  item,
  state,
}: {
  item: Item<"game">;
  state: TicTacToeState;
}) {
  const { updateData, canEdit } = useRoom();
  const me = useRoomStore((s) => s.me);
  const name = me?.name ?? "someone";

  const outcome = evaluateTicTacToe(state.board);
  const over = Boolean(outcome.winner) || outcome.draw;

  const mySeat: "x" | "o" | null =
    state.seats.x === name ? "x" : state.seats.o === name ? "o" : null;

  const write = (next: TicTacToeState) => {
    void updateData(item.id, { game: "tictactoe", state: next });
  };

  const takeSeat = (seat: "x" | "o") => {
    if (!canEdit) return;

    // Tapping your own seat again gives it up.
    const occupant = state.seats[seat];
    if (occupant === name) {
      write({ ...state, seats: { ...state.seats, [seat]: null } });
      return;
    }
    if (occupant) return;

    // Claiming one side releases the other, so nobody plays themselves.
    const other = seat === "x" ? "o" : "x";
    write({
      ...state,
      seats: {
        ...state.seats,
        [seat]: name,
        [other]: state.seats[other] === name ? null : state.seats[other],
      },
    });
  };

  const play = (index: number) => {
    if (!canEdit || over || state.board[index]) return;

    // An empty seat means nobody claimed sides; let anyone move.
    const seatless = !state.seats.x && !state.seats.o;
    if (!seatless && mySeat !== state.turn) return;

    const board = state.board.map((cell, at) => (at === index ? state.turn : cell));
    const result = evaluateTicTacToe(board);

    const wins = result.winner
      ? { ...state.wins, [result.winner]: state.wins[result.winner] + 1 }
      : result.draw
        ? { ...state.wins, draw: state.wins.draw + 1 }
        : state.wins;

    write({ ...state, board, turn: state.turn === "x" ? "o" : "x", wins });
  };

  const status = outcome.winner
    ? `${outcome.winner.toUpperCase()} takes it`
    : outcome.draw
      ? "nobody wins"
      : `${state.turn.toUpperCase()} to play`;

  return (
    <div className="surface grain flex size-full flex-col overflow-hidden rounded-2xl p-3">
      <div className="mb-2.5 flex items-center gap-1.5">
        <Seat
          mark="x"
          who={state.seats.x}
          active={state.turn === "x" && !over}
          mine={mySeat === "x"}
          onClick={() => takeSeat("x")}
        />
        <Seat
          mark="o"
          who={state.seats.o}
          active={state.turn === "o" && !over}
          mine={mySeat === "o"}
          onClick={() => takeSeat("o")}
        />
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-3 grid-rows-3 gap-1.5">
        {state.board.map((cell, index) => {
          const winning = outcome.line?.includes(index) ?? false;
          return (
            <button
              key={index}
              type="button"
              onClick={() => play(index)}
              disabled={!canEdit || over || Boolean(cell)}
              className={clsx(
                "grid place-items-center rounded-xl text-2xl font-semibold transition",
                winning
                  ? "bg-glow/30 text-chalk ring-1 ring-glow/60"
                  : "bg-white/6 hover:bg-white/11 disabled:hover:bg-white/6",
                cell === "x" && "text-warm",
                cell === "o" && "text-glow",
              )}
            >
              {cell?.toUpperCase() ?? ""}
            </button>
          );
        })}
      </div>

      <div className="mt-2.5 flex items-center justify-between gap-2">
        <p className="truncate text-xs font-medium text-muted">{status}</p>
        <div className="flex items-center gap-2">
          <span className="text-[10px] tabular-nums text-muted/70">
            {state.wins.x} / {state.wins.draw} / {state.wins.o}
          </span>
          <button
            type="button"
            disabled={!canEdit}
            onClick={() => write(resetTicTacToe(state, outcome.winner === "x" ? "o" : "x"))}
            aria-label="new round"
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
  mark: "x" | "o";
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
          "text-sm font-bold",
          mark === "x" ? "text-warm" : "text-glow",
        )}
      >
        {mark.toUpperCase()}
      </span>
      <span className="min-w-0 flex-1 truncate text-[11px] text-muted">
        {who ?? "open seat"}
      </span>
      {mine && <span className="shrink-0 text-[10px] text-glow">you</span>}
    </button>
  );
}
