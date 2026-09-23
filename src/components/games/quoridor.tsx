"use client";

import { useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { BookOpen, RotateCcw, RotateCw } from "lucide-react";
import { useRoom } from "@/realtime/room-provider";
import { useRoomStore } from "@/state/room-store";
import { chairOf, claimChair } from "@/lib/seats";
import {
  POINTS,
  SIDE_TURN,
  SIZE,
  again,
  chairsFor,
  distanceHome,
  emptyQuoridor,
  newGame,
  movePawn,
  pawnMoves,
  placeWall,
  sideOf,
  wallProblem,
  type Cell,
  type Orientation,
  type QuoridorState,
  type Side,
  type Wall,
} from "@/lib/quoridor";
import type { Item } from "@/lib/types";
import RulesSheet from "./rules-sheet";
import { t as tx } from "@/lib/i18n";

/** A square, and the groove after it, in board units. */
const CELL = 40;
const GAP = 12;
const STEP = CELL + GAP;
const BOARD = SIZE * CELL + (SIZE - 1) * GAP;
const MARGIN = 16;

const TINT: Record<string, string> = { s0: "#e8675d", s1: "#63a8e6", s2: "#f0c04a", s3: "#79c97a" };
const COLOR_NAME: Record<string, string> = { s0: "red", s1: "blue", s2: "yellow", s3: "green" };

const cellCenter = (c: Cell) => ({ x: c.x * STEP + CELL / 2, y: c.y * STEP + CELL / 2 });
const sameWall = (a: Wall | null, b: Wall | null) => Boolean(a && b && a.x === b.x && a.y === b.y && a.o === b.o);
const clamp = (n: number) => Math.max(0, Math.min(POINTS - 1, n));

/** The wall a point on the board is asking for: the nearest crossing, lying along the nearer groove. */
function wallAt(x: number, y: number, anywhere: boolean, lean: Orientation): Wall | null {
  const col = Math.floor(x / STEP);
  const row = Math.floor(y / STEP);
  const inColumnGroove = x - col * STEP > CELL && col < SIZE - 1;
  const inRowGroove = y - row * STEP > CELL && row < SIZE - 1;
  let o: Orientation | null = null;
  if (inColumnGroove && !inRowGroove) o = "v";
  else if (inRowGroove && !inColumnGroove) o = "h";
  else if (inColumnGroove && inRowGroove) o = lean;
  else if (anywhere) {
    const toColumn = Math.abs(((x - CELL - GAP / 2) % STEP + STEP) % STEP - STEP / 2);
    const toRow = Math.abs(((y - CELL - GAP / 2) % STEP + STEP) % STEP - STEP / 2);
    o = STEP / 2 - toColumn < STEP / 2 - toRow ? "v" : "h";
  }
  if (!o) return null;
  return { x: clamp(Math.round((x - CELL - GAP / 2) / STEP)), y: clamp(Math.round((y - CELL - GAP / 2) / STEP)), o };
}

/** The square under a point, if it is on one and not in a groove. */
function cellAt(x: number, y: number): Cell | null {
  const col = Math.floor(x / STEP);
  const row = Math.floor(y / STEP);
  if (col < 0 || row < 0 || col >= SIZE || row >= SIZE) return null;
  if (x - col * STEP > CELL || y - row * STEP > CELL) return null;
  return { x: col, y: row };
}

function wallRect(w: Wall) {
  return w.o === "h"
    ? { x: w.x * STEP, y: w.y * STEP + CELL + 1, width: CELL * 2 + GAP, height: GAP - 2 }
    : { x: w.x * STEP + CELL + 1, y: w.y * STEP, width: GAP - 2, height: CELL * 2 + GAP };
}

/** The strip along the edge a side is heading for. */
function goalStrip(side: Side) {
  const long = BOARD;
  const t = 5;
  if (side === "bottom") return { x: 0, y: -MARGIN + 4, width: long, height: t };
  if (side === "top") return { x: 0, y: BOARD + MARGIN - 4 - t, width: long, height: t };
  if (side === "left") return { x: BOARD + MARGIN - 4 - t, y: 0, width: t, height: long };
  return { x: -MARGIN + 4, y: 0, width: t, height: long };
}

/**
 * Quoridor, or Bloqueio: get your pawn across before anyone else does, and
 * spend your walls making everybody else's way longer. The board turns so your
 * pawn starts at the bottom.
 */
export default function Quoridor({ item, state: raw }: { item: Item<"game">; state: unknown }) {
  const { updateData, canEdit } = useRoom();
  const me = useRoomStore((s) => s.me);
  const state = useMemo<QuoridorState>(() => ({ ...emptyQuoridor(), ...(raw as Partial<QuoridorState>) }) as QuoridorState, [raw]);

  const [mode, setMode] = useState<"move" | "wall">("move");
  const [preview, setPreview] = useState<Wall | null>(null);
  const [lean, setLean] = useState<Orientation>("h");
  const [manual, setManual] = useState(false);
  const board = useRef<SVGGElement>(null);

  const chairs = chairsFor(state.players);
  const holders = state.holders ?? {};
  const myChair = chairOf(state.seats, holders, me);
  const plays = (chair: string) => canEdit && (holders[chair] ? holders[chair] === me?.userId : true);
  const myTurn = state.phase === "play" && plays(state.turn);
  const label = (chair: string) => state.seats[chair] ?? COLOR_NAME[chair];
  const viewer = myChair && chairs.includes(myChair) ? myChair : "s0";
  const angle = SIDE_TURN[sideOf(state.players, viewer)];

  const write = (next: QuoridorState) => updateData(item.id, { game: "quoridor", state: next } as never);
  const latest = (): QuoridorState => {
    const data = useRoomStore.getState().items[item.id]?.data as { state?: QuoridorState } | undefined;
    return { ...emptyQuoridor(), ...(data?.state ?? state) };
  };

  const moves = myTurn ? pawnMoves(state, state.turn) : [];
  const wallsLeft = state.left[state.turn] ?? 0;
  const problem = preview ? wallProblem(state, state.turn, preview) : null;

  /** A pointer, in the board's own units, whichever way it has been turned. */
  const toBoard = (event: React.PointerEvent | React.MouseEvent) => {
    const g = board.current;
    const svg = g?.ownerSVGElement;
    const matrix = g?.getScreenCTM();
    if (!g || !svg || !matrix) return null;
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    return point.matrixTransform(matrix.inverse());
  };

  const hover = (event: React.PointerEvent) => {
    if (event.pointerType !== "mouse" || !myTurn || wallsLeft <= 0) return;
    const p = toBoard(event);
    if (!p) return;
    const wall = wallAt(p.x, p.y, mode === "wall", lean);
    if (!sameWall(wall, preview)) setPreview(wall);
  };

  const tap = (event: React.MouseEvent) => {
    if (!myTurn) return;
    const p = toBoard(event);
    if (!p) return;
    if (mode === "move") {
      const cell = cellAt(p.x, p.y);
      const target = cell && moves.find((m) => m.x === cell.x && m.y === cell.y);
      if (target) {
        setPreview(null);
        void write(movePawn(latest(), target));
        return;
      }
    }
    if (wallsLeft <= 0) return;
    const wall = wallAt(p.x, p.y, mode === "wall", lean);
    if (!wall) return;
    // A second tap on the same wall puts it down; with a mouse, the hover was the first.
    if (sameWall(wall, preview) && !wallProblem(state, state.turn, wall)) {
      putDown(wall);
      return;
    }
    setLean(wall.o);
    setPreview(wall);
  };

  const putDown = (wall: Wall) => {
    const now = latest();
    const next = placeWall(now, wall);
    if (next === now) return;
    setPreview(null);
    setMode("move");
    void write(next);
  };

  const status = (): string => {
    if (state.phase === "over" && state.winner) return `${label(state.winner)} made it across`;
    if (myTurn) {
      if (preview) return problem ?? (mode === "wall" ? "tap it again to put it down" : "click to put it down");
      return mode === "wall" ? "tap where the wall goes" : `step, or put down a wall (${wallsLeft} left)`;
    }
    return `${label(state.turn)} to play`;
  };

  return (
    <div className="surface grain relative flex size-full flex-col gap-2 overflow-hidden rounded-2xl p-2.5">
      <div className="flex flex-wrap items-center gap-1 text-[10px] text-muted/70">
        <span className="flex rounded-lg bg-white/5 p-0.5">
          {([2, 4] as const).map((n) => (
            <button
              key={n}
              type="button"
              disabled={!canEdit || (state.moves > 0 && state.phase === "play") || state.players === n}
              onClick={() => void write(newGame(n, state))}
              className={clsx("min-h-7 rounded-md px-2 tabular-nums", state.players === n ? "bg-white/12 text-chalk" : "text-muted disabled:opacity-40")}
            >
              {n}{" "}{tx("players")}</button>
          ))}
        </span>
        {chairs.map((chair) => {
          const side = sideOf(state.players, chair);
          const home = distanceHome(state.walls, state.pawns[chair], side);
          return (
            <button
              key={chair}
              type="button"
              disabled={!canEdit || !me}
              onClick={() => me && void write({ ...state, ...claimChair(state.seats, holders, chair, me) })}
              className={clsx(
                "flex min-h-7 items-center gap-1 rounded-lg px-1.5 disabled:cursor-default",
                state.turn === chair && state.phase === "play" ? "bg-white/12 ring-1 ring-warm/60" : "bg-white/5",
              )}
              title={tx(`${home} steps from home`)}
            >
              <span className="size-2.5 rounded-full" style={{ background: TINT[chair] }} />
              <span className={clsx("max-w-20 truncate", chair === myChair ? "text-chalk" : "text-muted")}>
                {state.seats[chair] ?? <span className="text-muted/50">{COLOR_NAME[chair]}</span>}
              </span>
              <span className="flex gap-px" aria-label={tx(`${state.left[chair] ?? 0} walls left`)}>
                {Array.from({ length: state.left[chair] ?? 0 }, (_, i) => (
                  <span key={i} className="h-2.5 w-[3px] rounded-[1px] bg-[#d9a86c]" />
                ))}
              </span>
              {(state.wins[chair] ?? 0) > 0 && <span className="text-warm">{state.wins[chair]}</span>}
            </button>
          );
        })}
        <button type="button" onClick={() => setManual(true)} className="ml-auto flex min-h-7 items-center gap-1 rounded-lg px-1.5 hover:bg-white/8 hover:text-chalk">
          <BookOpen className="size-3" />{" "}{tx("rules")}</button>
      </div>

      <div className="grid min-h-0 flex-1 place-items-center">
        <svg
          viewBox={`${-MARGIN} ${-MARGIN} ${BOARD + MARGIN * 2} ${BOARD + MARGIN * 2}`}
          className="aspect-square max-h-full max-w-full touch-manipulation"
          role="img"
          aria-label={tx("the board")}
        >
          <g ref={board} transform={`rotate(${angle} ${BOARD / 2} ${BOARD / 2})`}>
            <rect x={-MARGIN} y={-MARGIN} width={BOARD + MARGIN * 2} height={BOARD + MARGIN * 2} rx={14} fill="#241a15" />
            {chairs.map((chair) => (
              <rect key={chair} {...goalStrip(sideOf(state.players, chair))} rx={2} fill={TINT[chair]} opacity={0.75} />
            ))}
            {Array.from({ length: SIZE * SIZE }, (_, i) => {
              const x = i % SIZE;
              const y = Math.floor(i / SIZE);
              return <rect key={i} x={x * STEP} y={y * STEP} width={CELL} height={CELL} rx={5} fill="#4a372b" />;
            })}

            {/* Where the pawn can go */}
            {moves.map((m) => {
              const c = cellCenter(m);
              return <circle key={`${m.x},${m.y}`} cx={c.x} cy={c.y} r={7} fill={TINT[state.turn]} opacity={0.55} />;
            })}

            {/* Walls down, the last one lit */}
            {state.walls.map((w) => {
              const last = sameWall(state.last?.wall ?? null, w);
              return (
                <rect
                  key={`${w.x},${w.y},${w.o}`}
                  {...wallRect(w)}
                  rx={3}
                  fill="#e2b178"
                  stroke={last ? TINT[w.by ?? "s0"] : "#9c7040"}
                  strokeWidth={last ? 2.5 : 1}
                  className="animate-wall-down"
                />
              );
            })}
            {preview && myTurn && (
              <rect {...wallRect(preview)} rx={3} fill={problem ? "#e0655c" : "#e2b178"} opacity={0.55} pointerEvents="none" />
            )}

            {/* Pawns */}
            {chairs.map((chair) => {
              const c = cellCenter(state.pawns[chair]);
              const turn = state.turn === chair && state.phase === "play";
              return (
                <g key={chair} style={{ transform: `translate(${c.x}px, ${c.y}px)`, transition: "transform 260ms ease" }} pointerEvents="none">
                  {turn && <circle r={19} fill="none" stroke={TINT[chair]} strokeWidth={2} opacity={0.6} className="animate-pulse" />}
                  <circle r={14} fill={TINT[chair]} stroke="rgba(0,0,0,0.35)" strokeWidth={2} />
                  <circle r={6} cx={-4} cy={-4} fill="white" opacity={0.25} />
                  {state.winner === chair && <circle r={23} fill="none" stroke="#f6c177" strokeWidth={3} />}
                </g>
              );
            })}

            {/* Everything above takes no clicks; this does, for squares and grooves alike. */}
            <rect
              x={-4}
              y={-4}
              width={BOARD + 8}
              height={BOARD + 8}
              fill="transparent"
              style={{ cursor: myTurn ? "pointer" : "default" }}
              onPointerMove={hover}
              onPointerLeave={(event) => event.pointerType === "mouse" && setPreview(null)}
              onClick={tap}
            />
          </g>
        </svg>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
        <span className={clsx("min-w-0 flex-1 truncate", problem && preview ? "text-[#f2a4b8]" : "text-muted")}>
          <span className="mr-1 inline-block size-2 rounded-full" style={{ background: TINT[state.winner ?? state.turn] }} />
          {status()}
        </span>
        {myTurn && (
          <span className="flex rounded-lg bg-white/5 p-0.5">
            <button
              type="button"
              onClick={() => {
                setMode("move");
                setPreview(null);
              }}
              className={clsx("min-h-8 rounded-md px-2.5", mode === "move" ? "bg-white/12 text-chalk" : "text-muted")}
            >{tx("step")}</button>
            <button
              type="button"
              disabled={wallsLeft <= 0}
              onClick={() => {
                setMode("wall");
                setPreview(null);
              }}
              className={clsx("min-h-8 rounded-md px-2.5 disabled:opacity-35", mode === "wall" ? "bg-[#d9a86c]/25 text-[#f0cf9c]" : "text-muted")}
            >{tx("wall")}</button>
          </span>
        )}
        {myTurn && preview && (
          <>
            <button
              type="button"
              onClick={() => {
                const o: Orientation = preview.o === "h" ? "v" : "h";
                setLean(o);
                setPreview({ ...preview, o });
              }}
              aria-label={tx("turn the wall")}
              className="grid size-8 place-items-center rounded-lg bg-white/8 text-chalk"
            >
              <RotateCw className="size-3.5" />
            </button>
            <button
              type="button"
              disabled={Boolean(problem)}
              onClick={() => putDown(preview)}
              className="min-h-8 rounded-lg bg-chalk px-3 font-semibold text-ink-950 disabled:opacity-35"
            >{tx("put it here")}</button>
          </>
        )}
        <button
          type="button"
          disabled={!canEdit || state.moves === 0}
          onClick={() => {
            setPreview(null);
            void write(state.phase === "over" ? again(state) : newGame(state.players, state, state.opener));
          }}
          aria-label={tx("new game")}
          title={tx("new game")}
          className="grid size-8 place-items-center rounded-lg text-muted hover:bg-white/8 hover:text-chalk disabled:opacity-35"
        >
          <RotateCcw className="size-3.5" />
        </button>
      </div>

      {manual && (
        <RulesSheet title={tx("Quoridor (Bloqueio)")} onClose={() => setManual(false)}>
          <p>{tx("Get your pawn to the far side of the board -- the edge marked in your colour -- before anyone else. Two players have ten walls each; four have five.")}</p>
          <p>{tx("On your turn, either")}{" "}<b>{tx("step")}</b>{" "}{tx("one square (not diagonally), or")}{" "}<b>{tx("put down a wall")}</b>. A wall covers two squares and
            sits in the grooves between them. Walls cannot overlap or cross, and you can never shut anybody off from their goal
            completely -- there always has to be a way round.
          </p>
          <p>{tx("Pawns face to face can")}{" "}<b>{tx("jump")}</b>{" "}{tx("each other. If there is a wall or the edge behind the pawn you are jumping -- or, with four, another pawn -- you go past it diagonally instead.")}</p>
          <p>{tx("With a mouse, run along a groove and click. On a phone, tap")}{" "}<b>{tx("wall")}</b>{tx(", tap where it goes, and tap again (or turn it first).")}</p>
        </RulesSheet>
      )}
    </div>
  );
}
