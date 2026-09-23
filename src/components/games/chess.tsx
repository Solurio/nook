"use client";

import { useMemo, useState } from "react";
import clsx from "clsx";
import { useRoom } from "@/realtime/room-provider";
import { useRoomStore } from "@/state/room-store";
import {
  applyMove,
  castlingFromBoard,
  findKing,
  GLYPHS,
  initialBoard,
  initialCastling,
  legalMoves,
  outcome,
} from "@/lib/chess";
import type { Board, Castling } from "@/lib/chess";
import { canPlay, seatOf, takeSeat, turnHint } from "@/lib/seats";
import GameTable from "./table";
import type { ChessState, Item } from "@/lib/types";

const FILES = "abcdefgh";
const SIDES = ["w", "b"] as const;
const TINT = { w: "#f4efe6", b: "#2b2438" } as const;

export default function Chess({ item, state }: { item: Item<"game">; state: ChessState }) {
  const { updateData, canEdit } = useRoom();
  const me = useRoomStore((s) => s.me);
  const name = me?.name ?? "someone";
  const [pick, setPick] = useState<number | null>(null);

  const write = (next: ChessState) => void updateData(item.id, { game: "chess", state: next });

  const board = state.board as Board;
  // Games saved before castling existed carry no rights; infer them from where
  // the kings and rooks are actually standing.
  const castling: Castling = state.castling ?? castlingFromBoard(board);
  const ep = state.ep ?? null;

  const result = useMemo(
    () => outcome(board, state.turn, { castling, ep }),
    [board, state.turn, castling, ep],
  );
  const over = result.kind === "checkmate" || result.kind === "stalemate" || result.kind === "dead";

  const mySeat = seatOf(state.seats, name);

  // Black sits on the other side of the table, so the board turns around.
  const flipped = mySeat === "b";
  const squares = useMemo(() => {
    const order = Array.from({ length: 64 }, (_, i) => i);
    return flipped ? order.reverse() : order;
  }, [flipped]);

  const targets = pick !== null ? legalMoves(board, pick, { castling, ep }) : [];
  const checkedKing = result.kind === "playing" && result.check ? findKing(board, state.turn) : -1;

  const onSquare = (i: number) => {
    if (!canEdit || over) return;
    if (!canPlay(state.seats, state.turn, name)) return;

    const piece = board[i];

    if (pick === null) {
      if (piece && piece.color === state.turn) setPick(i);
      return;
    }
    if (i === pick) {
      setPick(null);
      return;
    }
    if (piece && piece.color === state.turn) {
      setPick(i);
      return;
    }
    if (!targets.includes(i)) return;

    const move = applyMove(board, pick, i, { castling, ep });
    const turn = state.turn === "w" ? "b" : "w";
    const after = outcome(move.board, turn, { castling: move.castling, ep: move.ep });

    const wins =
      after.kind === "checkmate"
        ? { ...state.wins, [after.winner]: state.wins[after.winner] + 1 }
        : after.kind === "stalemate"
          ? { ...state.wins, draw: state.wins.draw + 1 }
          : state.wins;

    write({
      ...state,
      board: move.board,
      turn,
      castling: move.castling,
      ep: move.ep,
      wins,
    });
    setPick(null);
  };

  const newGame = () => {
    setPick(null);
    write({
      ...state,
      board: initialBoard(),
      turn: "w",
      castling: initialCastling(),
      ep: null,
    });
  };

  const side = (c: "w" | "b") => (c === "w" ? "white" : "black");
  const status =
    result.kind === "checkmate"
      ? `checkmate, ${side(result.winner)} wins`
      : result.kind === "stalemate"
        ? "stalemate, nobody wins"
        : result.kind === "dead"
          ? "game over"
          : result.check
            ? `${side(state.turn)} is in check`
            : turnHint(state.seats, state.turn, name, side);

  return (
    <GameTable
      seats={state.seats}
      turn={state.turn}
      me={name}
      order={SIDES}
      label={side}
      tint={(c) => TINT[c]}
      onSit={(seat) => {
        if (!canEdit) return;
        write({ ...state, seats: takeSeat(state.seats, seat, name) });
      }}
      status={status}
      score={`${state.wins.w} / ${state.wins.b}`}
      onRestart={newGame}
      canEdit={canEdit}
      over={over}
    >
      <div className="grid size-[min(100cqw,100cqh)] grid-cols-8 overflow-hidden rounded-lg">
        {squares.map((i) => {
          const cell = board[i];
          const light = (Math.floor(i / 8) + (i % 8)) % 2 === 0;
          const selected = pick === i;
          const target = targets.includes(i);
          const inDanger = i === checkedKing;
          return (
            <button
              key={i}
              type="button"
              onClick={() => onSquare(i)}
              disabled={!canEdit || over}
              aria-label={`${FILES[i % 8]}${8 - Math.floor(i / 8)}`}
              className={clsx(
                "relative grid touch-manipulation place-items-center text-[min(8.5cqw,8.5cqh)] leading-none transition",
                light ? "bg-[#e9dcc4]" : "bg-[#9a7b57]",
                selected && "ring-2 ring-glow ring-inset",
                inDanger && "bg-red-500/70",
              )}
            >
              {cell && (
                <span
                  className={
                    cell.color === "w"
                      ? "text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.5)]"
                      : "text-ink-950"
                  }
                >
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
    </GameTable>
  );
}
