"use client";

import { useState } from "react";
import clsx from "clsx";
import { RotateCcw } from "lucide-react";
import { useRoom } from "@/realtime/room-provider";
import { useRoomStore } from "@/state/room-store";
import { C4_COLUMNS, C4_ROWS, dropDisc, evaluateConnectFour, resetConnectFour } from "@/lib/games";
import type { ConnectFourState, Item } from "@/lib/types";

const DISC_COLOR = {
  r: "bg-[#f0736a] shadow-[inset_0_-3px_8px_rgb(0_0_0/0.28)]",
  y: "bg-[#f2c14e] shadow-[inset_0_-3px_8px_rgb(0_0_0/0.28)]",
} as const;

export default function ConnectFour({
  item,
  state,
}: {
  item: Item<"game">;
  state: ConnectFourState;
}) {
  const { updateData, canEdit } = useRoom();
  const me = useRoomStore((s) => s.me);
  const name = me?.name ?? "someone";
  const [hover, setHover] = useState<number | null>(null);

  const outcome = evaluateConnectFour(state.columns);
  const over = Boolean(outcome.winner) || outcome.draw;

  const mySeat: "r" | "y" | null =
    state.seats.r === name ? "r" : state.seats.y === name ? "y" : null;

  const write = (next: ConnectFourState) => {
    void updateData(item.id, { game: "connectfour", state: next });
  };

  const takeSeat = (seat: "r" | "y") => {
    if (!canEdit) return;

    const occupant = state.seats[seat];
    if (occupant === name) {
      write({ ...state, seats: { ...state.seats, [seat]: null } });
      return;
    }
    if (occupant) return;

    // Claiming one side releases the other, so nobody plays themselves.
    const other = seat === "r" ? "y" : "r";
    write({
      ...state,
      seats: {
        ...state.seats,
        [seat]: name,
        [other]: state.seats[other] === name ? null : state.seats[other],
      },
    });
  };

  const play = (col: number) => {
    if (!canEdit || over) return;

    const seatless = !state.seats.r && !state.seats.y;
    if (!seatless && mySeat !== state.turn) return;

    const columns = dropDisc(state.columns, col, state.turn);
    if (!columns) return;

    const result = evaluateConnectFour(columns);

    const wins = result.winner
      ? { ...state.wins, [result.winner]: state.wins[result.winner] + 1 }
      : result.draw
        ? { ...state.wins, draw: state.wins.draw + 1 }
        : state.wins;

    write({ ...state, columns, turn: state.turn === "r" ? "y" : "r", wins });
  };

  const winningCells = new Set(
    (outcome.cells ?? []).map(([col, row]) => `${col}:${row}`),
  );

  const status = outcome.winner
    ? `${outcome.winner === "r" ? "red" : "yellow"} connects four`
    : outcome.draw
      ? "the board is full"
      : `${state.turn === "r" ? "red" : "yellow"} to drop`;

  return (
    <div className="surface grain flex size-full flex-col overflow-hidden rounded-2xl p-3">
      <div className="mb-2.5 flex items-center gap-1.5">
        <Seat
          disc="r"
          who={state.seats.r}
          active={state.turn === "r" && !over}
          mine={mySeat === "r"}
          onClick={() => takeSeat("r")}
        />
        <Seat
          disc="y"
          who={state.seats.y}
          active={state.turn === "y" && !over}
          mine={mySeat === "y"}
          onClick={() => takeSeat("y")}
        />
      </div>

      <div
        className="grid min-h-0 flex-1 gap-1 rounded-xl bg-ink-950/45 p-1.5"
        style={{ gridTemplateColumns: `repeat(${C4_COLUMNS}, minmax(0, 1fr))` }}
        onPointerLeave={() => setHover(null)}
      >
        {Array.from({ length: C4_COLUMNS }, (_, col) => {
          const full = state.columns[col].length >= C4_ROWS;
          return (
            <button
              key={col}
              type="button"
              disabled={!canEdit || over || full}
              onPointerEnter={() => setHover(col)}
              onClick={() => play(col)}
              aria-label={`drop in column ${col + 1}`}
              className={clsx(
                "flex flex-col-reverse gap-1 rounded-lg transition",
                hover === col && !over && !full && "bg-white/8",
              )}
            >
              {Array.from({ length: C4_ROWS }, (_, row) => {
                const disc = state.columns[col][row] as "r" | "y" | undefined;
                const winner = winningCells.has(`${col}:${row}`);
                return (
                  <span
                    key={row}
                    className={clsx(
                      "aspect-square w-full rounded-full transition",
                      disc ? DISC_COLOR[disc] : "bg-ink-900/80 inset-ring inset-ring-white/6",
                      winner && "ring-2 ring-chalk",
                    )}
                  />
                );
              })}
            </button>
          );
        })}
      </div>

      <div className="mt-2.5 flex items-center justify-between gap-2">
        <p className="truncate text-xs font-medium text-muted">{status}</p>
        <div className="flex items-center gap-2">
          <span className="text-[10px] tabular-nums text-muted/70">
            {state.wins.r} / {state.wins.draw} / {state.wins.y}
          </span>
          <button
            type="button"
            disabled={!canEdit}
            onClick={() => write(resetConnectFour(state, outcome.winner === "r" ? "y" : "r"))}
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
  disc,
  who,
  active,
  mine,
  onClick,
}: {
  disc: "r" | "y";
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
      <span className={clsx("size-3 shrink-0 rounded-full", DISC_COLOR[disc])} />
      <span className="min-w-0 flex-1 truncate text-[11px] text-muted">{who ?? "open seat"}</span>
      {mine && <span className="shrink-0 text-[10px] text-glow">you</span>}
    </button>
  );
}
