"use client";

import { useMemo, useState } from "react";
import clsx from "clsx";
import { useRoom } from "@/realtime/room-provider";
import { useRoomStore } from "@/state/room-store";
import { canPlay, takeSeat, turnHint, type Seats } from "@/lib/seats";
import {
  CORNER_NAME,
  CORNER_TINT,
  HOLES,
  PLAYING,
  cornerOf,
  emptyChinese,
  hole,
  move,
  opposite,
  pass,
  place,
  reach,
  setUp,
  stuck,
  type ChineseState,
  type Corner,
  type Hole,
  type PlayerCount,
} from "@/lib/chinese";
import type { Item } from "@/lib/types";
import GameTable from "./table";
import { t } from "@/lib/i18n";

const COUNTS: PlayerCount[] = [2, 3, 4, 6];

// Where every hole sits, and the board's extent, worked out once.
const SPOTS = new Map(HOLES.map((h) => [h, place(h)] as const));
const XS = [...SPOTS.values()].map(([x]) => x);
const YS = [...SPOTS.values()].map(([, y]) => y);
const PAD = 0.9;
/** The two big triangles the star is made of, a little larger than the holes they hold. */
const STAR = [
  [
    [8, -4],
    [-4, 8],
    [-4, -4],
  ],
  [
    [-8, 4],
    [4, -8],
    [4, 4],
  ],
].map((tri) =>
  tri
    .map(([q, r]) => {
      const [x, y] = place(hole(q, r));
      const k = 1 + 1.35 / Math.hypot(x, y);
      return `${x * k},${y * k}`;
    })
    .join(" "),
);
const VIEW = { x: Math.min(...XS) - PAD, y: Math.min(...YS) - PAD, w: Math.max(...XS) - Math.min(...XS) + PAD * 2, h: Math.max(...YS) - Math.min(...YS) + PAD * 2 };

/**
 * Chinese checkers for two, three, four or six. Tap a marble of the colour
 * whose turn it is, then one of the holes it can reach; a chain of hops goes
 * in one move, and the way it went stays drawn until the next.
 */
export default function Chinese({ item, state: raw }: { item: Item<"game">; state: unknown }) {
  const { updateData, canEdit } = useRoom();
  const me = useRoomStore((s) => s.me);
  const name = me?.name ?? "someone";
  const state = useMemo<ChineseState>(() => ({ ...emptyChinese(), ...(raw as Partial<ChineseState>) }), [raw]);
  const [picked, setPicked] = useState<Hole | null>(null);

  const order = PLAYING[state.players];
  const seats = state.seats as Seats<Corner>;
  const write = (next: ChineseState) => void updateData(item.id, { game: "chinese", state: next } as never);
  const mine = canEdit && !state.winner && canPlay(seats, state.turn, name);
  const chosen = picked && state.board[picked] === state.turn && mine ? picked : null;
  const targets = useMemo(() => (chosen ? reach(state.board, chosen) : new Map<Hole, Hole[]>()), [chosen, state.board]);
  const started = state.last !== null;
  const blocked = mine && stuck(state);

  const status = state.winner
    ? t("{who} filled the far point first", { who: t(CORNER_NAME[state.winner]) })
    : blocked
      ? t("{who} has no move -- pass", { who: t(CORNER_NAME[state.turn]) })
      : turnHint(seats, state.turn, name, (c) => CORNER_NAME[c]);

  const tap = (h: Hole) => {
    if (!mine) return;
    if (chosen && targets.has(h)) {
      write(move(state, chosen, h));
      setPicked(null);
      return;
    }
    setPicked(state.board[h] === state.turn ? h : null);
  };

  const r = 0.36;
  const path = state.last ? [state.last.from, ...state.last.path] : [];

  return (
    <GameTable
      seats={seats}
      turn={state.turn}
      me={name}
      order={order}
      label={(c) => t(CORNER_NAME[c])}
      tint={(c) => CORNER_TINT[c]}
      onSit={(c) => write({ ...state, seats: takeSeat(seats, c, name) })}
      status={status}
      score={order.map((c) => state.wins[c] ?? 0).join("-")}
      onRestart={() => write(setUp(state.players, state))}
      canEdit={canEdit}
      over={Boolean(state.winner)}
    >
      <div className="relative flex size-[min(100cqw,100cqh)] flex-col items-center">
        {!started && (
          <div className="absolute top-0 left-0 z-10 flex gap-0.5 rounded-lg bg-ink-950/60 p-0.5 backdrop-blur-sm">
            {COUNTS.map((n) => (
              <button
                key={n}
                type="button"
                disabled={!canEdit}
                onClick={() => write(setUp(n, state))}
                className={clsx("min-h-7 min-w-8 rounded-md px-1.5 text-[11px] tabular-nums transition", state.players === n ? "bg-chalk font-semibold text-ink-950" : "text-muted hover:text-chalk")}
                aria-label={t("{n} players", { n })}
              >
                {n}
              </button>
            ))}
          </div>
        )}
        {blocked && (
          <button type="button" onClick={() => write(pass(state))} className="absolute top-0 right-0 z-10 min-h-8 rounded-lg bg-white/12 px-2.5 text-[11px] text-chalk">
            {t("pass")}
          </button>
        )}
        <svg viewBox={`${VIEW.x} ${VIEW.y} ${VIEW.w} ${VIEW.h}`} className="size-full" role="img" aria-label={t("the star board")}>
          {/* The star: a wooden board, the points tinted for who starts there and who is headed there. */}
          <g>
            {STAR.map((tri, i) => (
              <polygon key={i} points={tri} fill="#c99a61" stroke="#a87a44" strokeWidth={0.08} strokeLinejoin="round" />
            ))}
            {HOLES.map((h) => {
              const c = cornerOf(h);
              const owner = c && (order.includes(c) ? c : order.find((o) => opposite(o) === c));
              if (!owner) return null;
              const [x, y] = SPOTS.get(h)!;
              return <circle key={`t${h}`} cx={x} cy={y} r={0.5} fill={CORNER_TINT[owner]} fillOpacity={order.includes(c as Corner) ? 0.3 : 0.16} />;
            })}
          </g>

          {/* Where the last move went. */}
          {path.length > 1 && (
            <polyline
              points={path.map((h) => SPOTS.get(h)!.join(",")).join(" ")}
              fill="none"
              stroke="#fff"
              strokeOpacity={0.55}
              strokeWidth={0.09}
              strokeDasharray="0.18 0.14"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {HOLES.map((h) => {
            const [x, y] = SPOTS.get(h)!;
            const marble = state.board[h];
            const target = targets.has(h);
            return (
              <g key={h} onClick={() => tap(h)} style={{ cursor: mine && (target || marble === state.turn) ? "pointer" : "default" }}>
                <circle cx={x} cy={y} r={0.5} fill="transparent" />
                <circle cx={x} cy={y} r={0.2} fill="#5a3b1c" fillOpacity={0.55} />
                {marble && (
                  <g key={state.last?.path.at(-1) === h ? `m${state.last?.n}` : "still"} className={clsx(state.last?.path.at(-1) === h && "animate-disc-drop")} style={{ transformBox: "fill-box", transformOrigin: "center" }}>
                    <circle cx={x} cy={y + 0.05} r={r} fill="#000" fillOpacity={0.3} />
                    <circle cx={x} cy={y} r={r} fill={CORNER_TINT[marble]} />
                    <circle cx={x - r * 0.35} cy={y - r * 0.35} r={r * 0.32} fill="#fff" fillOpacity={0.5} />
                    {chosen === h && <circle cx={x} cy={y} r={r + 0.1} fill="none" stroke="#fff" strokeWidth={0.08} />}
                  </g>
                )}
                {target && <circle cx={x} cy={y} r={0.2} fill={CORNER_TINT[state.turn]} fillOpacity={0.85} stroke="#fff" strokeWidth={0.05} />}
              </g>
            );
          })}
        </svg>
      </div>
    </GameTable>
  );
}
