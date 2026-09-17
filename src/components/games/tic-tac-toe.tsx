"use client";

import clsx from "clsx";
import { useRoom } from "@/realtime/room-provider";
import { useRoomStore } from "@/state/room-store";
import { evaluateTicTacToe, resetTicTacToe } from "@/lib/games";
import { canPlay, takeSeat, turnHint } from "@/lib/seats";
import GameTable from "./table";
import type { Item, TicTacToeState } from "@/lib/types";

const SIDES = ["x", "o"] as const;
const TINT = { x: "#f6c177", o: "#8bc7e8" } as const;

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

  const write = (next: TicTacToeState) => {
    void updateData(item.id, { game: "tictactoe", state: next });
  };

  const play = (index: number) => {
    if (!canEdit || over || state.board[index]) return;
    if (!canPlay(state.seats, state.turn, name)) return;

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
      : turnHint(state.seats, state.turn, name, (s) => s.toUpperCase());

  return (
    <GameTable
      seats={state.seats}
      turn={state.turn}
      me={name}
      order={SIDES}
      label={(s) => s.toUpperCase()}
      tint={(s) => TINT[s]}
      onSit={(seat) => {
        if (!canEdit) return;
        write({ ...state, seats: takeSeat(state.seats, seat, name) });
      }}
      status={status}
      score={`${state.wins.x} / ${state.wins.draw} / ${state.wins.o}`}
      onRestart={() => write(resetTicTacToe(state, outcome.winner === "x" ? "o" : "x"))}
      canEdit={canEdit}
      over={over}
    >
      <div className="grid aspect-square h-full max-h-full w-full max-w-full grid-cols-3 grid-rows-3 gap-1.5">
        {state.board.map((cell, index) => {
          const winning = outcome.line?.includes(index) ?? false;
          return (
            <button
              key={index}
              type="button"
              onClick={() => play(index)}
              disabled={!canEdit || over || Boolean(cell)}
              aria-label={cell ? `${cell} on square ${index + 1}` : `square ${index + 1}`}
              className={clsx(
                "grid touch-manipulation place-items-center rounded-xl text-2xl font-semibold transition",
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
    </GameTable>
  );
}
