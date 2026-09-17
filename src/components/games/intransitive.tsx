"use client";

import { useMemo, useState } from "react";
import clsx from "clsx";
import { useRoom } from "@/realtime/room-provider";
import { useRoomStore } from "@/state/room-store";
import { canPlay, takeSeat, turnHint } from "@/lib/seats";
import {
  BASE,
  SIZE,
  applyMove,
  initialBoard,
  legalMoves,
  outcome,
  SHAPE_NAME,
  type Board,
  type Shape,
  type Side,
} from "@/lib/intransitive";
import GameTable from "./table";
import type { IntransitiveState, Item } from "@/lib/types";

const SIDES = ["blue", "red"] as const;
const TINT: Record<Side, string> = { blue: "#6aa9e0", red: "#e0655c" };
const GLYPH: Record<Shape, string> = { R: "●", P: "■", S: "▲" };

export default function Intransitive({
  item,
  state,
}: {
  item: Item<"game">;
  state: IntransitiveState;
}) {
  const { updateData, canEdit } = useRoom();
  const me = useRoomStore((s) => s.me);
  const name = me?.name ?? "someone";
  const [pick, setPick] = useState<number | null>(null);

  const write = (next: IntransitiveState) =>
    void updateData(item.id, { game: "intransitive", state: next });

  const board = state.board as Board;
  const result = useMemo(() => outcome(board, state.turn), [board, state.turn]);
  const over = result.kind === "won";

  const mySeat = state.seats.blue === name ? "blue" : state.seats.red === name ? "red" : null;
  const myTurn = canPlay(state.seats, state.turn, name);

  // Red sits across the table, so the board turns round for them.
  const flipped = mySeat === "red";
  const squares = useMemo(() => {
    const order = Array.from({ length: SIZE * SIZE }, (_, i) => i);
    return flipped ? order.reverse() : order;
  }, [flipped]);

  const targets = pick !== null ? legalMoves(board, pick) : [];

  const onSquare = (i: number) => {
    if (!canEdit || over || !myTurn) return;
    const piece = board[i];

    if (pick === null) {
      if (piece && piece.side === state.turn) setPick(i);
      return;
    }
    if (i === pick) {
      setPick(null);
      return;
    }
    if (piece && piece.side === state.turn) {
      setPick(i);
      return;
    }
    if (!targets.includes(i)) return;

    const { board: next } = applyMove(board, pick, i);
    const turn: Side = state.turn === "blue" ? "red" : "blue";
    const after = outcome(next, turn);
    const wins =
      after.kind === "won"
        ? { ...state.wins, [after.winner]: state.wins[after.winner] + 1 }
        : state.wins;

    write({ ...state, board: next, turn, wins });
    setPick(null);
  };

  const status = over
    ? `${result.winner} wins · ${
        result.reason === "reached"
          ? "walked it home"
          : result.reason === "swept"
            ? "nothing left to move"
            : "boxed in"
      }`
    : turnHint(state.seats, state.turn, name, (s) => s);

  return (
    <GameTable
      seats={state.seats}
      turn={state.turn}
      me={name}
      order={SIDES}
      label={(s) => s}
      tint={(s) => TINT[s]}
      onSit={(seat) => {
        if (!canEdit) return;
        write({ ...state, seats: takeSeat(state.seats, seat, name) });
      }}
      status={status}
      score={`${state.wins.blue} / ${state.wins.red}`}
      onRestart={() => {
        setPick(null);
        write({ ...state, board: initialBoard(), turn: "blue" });
      }}
      canEdit={canEdit}
      over={over}
    >
      <div
        className="grid aspect-square w-full max-w-full overflow-hidden rounded-lg ring-1 ring-black/25"
        style={{ gridTemplateColumns: `repeat(${SIZE}, minmax(0, 1fr))` }}
      >
        {squares.map((i) => {
          const cell = board[i];
          const light = (Math.floor(i / SIZE) + (i % SIZE)) % 2 === 0;
          const selected = pick === i;
          const target = targets.includes(i);
          const isBlueBase = i === BASE.blue;
          const isRedBase = i === BASE.red;

          return (
            <button
              key={i}
              type="button"
              onClick={() => onSquare(i)}
              disabled={!canEdit || over}
              aria-label={
                (cell ? `${cell.side} ${SHAPE_NAME[cell.shape]} on ` : "") +
                `${String.fromCharCode(97 + (i % SIZE))}${SIZE - Math.floor(i / SIZE)}`
              }
              className={clsx(
                "relative grid touch-manipulation place-items-center transition",
                light ? "bg-[#2b2540]" : "bg-[#241f36]",
                isBlueBase && "bg-[#6aa9e0]/30",
                isRedBase && "bg-[#e0655c]/30",
                selected && "ring-2 ring-glow ring-inset",
              )}
              style={{ aspectRatio: "1" }}
            >
              {cell && (
                <span
                  className="grid size-[78%] place-items-center rounded-full text-[clamp(7px,1.9vw,13px)] font-bold shadow-sm"
                  style={{
                    background: TINT[cell.side],
                    color: "#1a1420",
                  }}
                  title={SHAPE_NAME[cell.shape]}
                >
                  {GLYPH[cell.shape]}
                </span>
              )}

              {target && (
                <span
                  className={clsx(
                    "pointer-events-none absolute rounded-full",
                    cell ? "inset-0.5 ring-2 ring-glow/80" : "size-1.5 bg-glow/70",
                  )}
                />
              )}
            </button>
          );
        })}
      </div>
    </GameTable>
  );
}
