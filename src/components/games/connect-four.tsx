"use client";

import { useState } from "react";
import clsx from "clsx";
import { useRoom } from "@/realtime/room-provider";
import { useRoomStore } from "@/state/room-store";
import { C4_COLUMNS, C4_ROWS, dropDisc, evaluateConnectFour, resetConnectFour } from "@/lib/games";
import { canPlay, takeSeat, turnHint } from "@/lib/seats";
import GameTable from "./table";
import type { ConnectFourState, Item } from "@/lib/types";
import { t } from "@/lib/i18n";

const SIDES = ["r", "y"] as const;
const NAME = { r: "red", y: "yellow" } as const;
const TINT = { r: "#f0736a", y: "#f2c14e" } as const;

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

  const write = (next: ConnectFourState) => {
    void updateData(item.id, { game: "connectfour", state: next });
  };

  const play = (col: number) => {
    if (!canEdit || over) return;
    if (!canPlay(state.seats, state.turn, name)) return;

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

  const winningCells = new Set((outcome.cells ?? []).map(([col, row]) => `${col}:${row}`));

  const status = outcome.winner
    ? `${NAME[outcome.winner as "r" | "y"]} connects four`
    : outcome.draw
      ? "the board is full"
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
      status={status}
      score={`${state.wins.r} / ${state.wins.draw} / ${state.wins.y}`}
      onRestart={() => write(resetConnectFour(state, outcome.winner === "r" ? "y" : "r"))}
      canEdit={canEdit}
      over={over}
    >
      <div
        className="grid h-full w-full gap-1 rounded-xl bg-ink-950/45 p-1.5"
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
              aria-label={t(`drop in column ${col + 1}`)}
              className={clsx(
                "flex touch-manipulation flex-col-reverse gap-1 rounded-lg transition",
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
    </GameTable>
  );
}
