"use client";

import { useMemo } from "react";
import clsx from "clsx";
import { useRoom } from "@/realtime/room-provider";
import { useRoomStore } from "@/state/room-store";
import { canPlay, takeSeat, turnHint } from "@/lib/seats";
import { SIZE, count, emptyReversi, movesFor, play, restart, type ReversiState } from "@/lib/reversi";
import type { Item } from "@/lib/types";
import GameTable from "./table";
import { t } from "@/lib/i18n";

const SIDES = ["b", "w"] as const;
const NAME = { b: "black", w: "white" } as const;
const TINT = { b: "#2a2530", w: "#efeae1" } as const;

/** Reversi on a green baize: legal moves are marked, and everything a move closes off flips over. */
export default function Reversi({ item, state: raw }: { item: Item<"game">; state: unknown }) {
  const { updateData, canEdit } = useRoom();
  const me = useRoomStore((s) => s.me);
  const name = me?.name ?? "someone";
  const state = useMemo<ReversiState>(() => ({ ...emptyReversi(), ...(raw as Partial<ReversiState>) }), [raw]);

  const write = (next: ReversiState) => void updateData(item.id, { game: "reversi", state: next } as never);
  const mine = canEdit && !state.over && canPlay(state.seats, state.turn, name);
  const moves = mine ? movesFor(state.board, state.turn) : [];
  const score = count(state.board);
  const flipped = new Set(state.last?.flipped ?? []);

  const status = state.over
    ? score.b === score.w
      ? `a draw, ${score.b} each`
      : `${NAME[score.b > score.w ? "b" : "w"]} wins, ${Math.max(score.b, score.w)} to ${Math.min(score.b, score.w)}`
    : `${state.last?.passed ? `${NAME[state.turn === "b" ? "w" : "b"]} cannot move -- ` : ""}${turnHint(state.seats, state.turn, name, (s) => NAME[s])}`;

  return (
    <GameTable
      seats={state.seats}
      turn={state.turn}
      me={name}
      order={SIDES}
      label={(s) => `${NAME[s]} ${score[s]}`}
      tint={(s) => TINT[s]}
      onSit={(s) => write({ ...state, seats: takeSeat(state.seats, s, name) })}
      status={status}
      score={`${state.wins.b}-${state.wins.w}${state.wins.draw ? `-${state.wins.draw}` : ""}`}
      onRestart={() => write(restart(state))}
      canEdit={canEdit}
      over={state.over}
    >
      <div
        className="grid aspect-square h-full max-h-full max-w-full gap-[2px] rounded-lg bg-[#1d4d2f] p-1.5 shadow-inner"
        style={{ gridTemplateColumns: `repeat(${SIZE}, minmax(0, 1fr))` }}
      >
        {state.board.map((cell, i) => {
          const legal = moves.includes(i);
          return (
            <button
              key={i}
              type="button"
              disabled={!legal}
              onClick={() => write(play(state, i))}
              aria-label={cell ? t(`${NAME[cell]} disc`) : legal ? t("put a disc here") : t("empty")}
              className={clsx("relative grid place-items-center rounded-[3px] bg-[#2f7a4a] disabled:cursor-default", legal && "hover:bg-[#3a8d57]")}
            >
              {cell && (
                <span
                  key={`${cell}:${flipped.has(i) || state.last?.at === i ? state.last?.n : 0}`}
                  className={clsx(
                    "block size-[82%] rounded-full shadow-[inset_0_-3px_6px_rgba(0,0,0,0.35),0_2px_3px_rgba(0,0,0,0.35)]",
                    flipped.has(i) && "animate-disc-flip",
                    state.last?.at === i && "animate-disc-drop",
                  )}
                  style={{ background: TINT[cell] }}
                />
              )}
              {legal && <span className="block size-[26%] rounded-full opacity-45" style={{ background: TINT[state.turn] }} />}
            </button>
          );
        })}
      </div>
    </GameTable>
  );
}
