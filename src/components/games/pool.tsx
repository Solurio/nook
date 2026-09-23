"use client";

import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { Hand, Move, RotateCcw, Settings2, Users } from "lucide-react";
import { useRoom } from "@/realtime/room-provider";
import { useRoomStore } from "@/state/room-store";
import { chairOf, claimChair } from "@/lib/seats";
import { newId } from "@/lib/slug";
import { pointIn } from "@/lib/pointer";
import {
  HEAD,
  POCKETS,
  R,
  TABLE,
  chairsFor,
  fits,
  judge,
  left,
  lowest,
  place,
  play,
  playable,
  rack,
  sideOf,
  sight,
  upgradePool,
  type Ball,
  type Kind,
  type PoolState,
  type Shot,
} from "@/lib/pool";
import type { Item } from "@/lib/types";
import { t } from "@/lib/i18n";

const RAIL = 9.5;
const TEAM_TINT = ["#6aa9e0", "#e0655c", "#a6d189", "#f6c177"];

const BALL_COLOR: Record<number, string> = {
  0: "#f7f5ef",
  1: "#f2c200",
  2: "#1b57c2",
  3: "#d0271a",
  4: "#6c2a9c",
  5: "#f07d15",
  6: "#0f7a3d",
  7: "#7a1f24",
  8: "#17171c",
  9: "#f2c200",
  10: "#1b57c2",
  11: "#d0271a",
  12: "#6c2a9c",
  13: "#f07d15",
  14: "#0f7a3d",
  15: "#7a1f24",
};

const KINDS: Array<{ id: Kind; name: string; hint: string }> = [
  { id: "eight", name: "8 ball", hint: "take a half each, then the black" },
  { id: "nine", name: "9 ball", hint: "lowest first, the nine wins it" },
  { id: "free", name: "free table", hint: "no rules, knock them about" },
];

interface View {
  scale: number;
  ox: number;
  oy: number;
  /**
   * Drawn a quarter turn round, head string at the top, because the box is
   * taller than it is wide -- a phone held upright. Then the table's long
   * side runs down the screen instead of being squeezed across it.
   */
  turned?: boolean;
  /** How wide the box is, which the quarter turn needs to undo itself. */
  across?: number;
}

/** A ball, drawn the way it is painted: solid, striped, numbered. */
function paintBall(ctx: CanvasRenderingContext2D, n: number, x: number, y: number, r: number) {
  const color = BALL_COLOR[n] ?? "#cccccc";
  const striped = n >= 9;
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.closePath();
  ctx.fillStyle = striped ? "#f7f5ef" : color;
  ctx.fill();
  if (striped) {
    ctx.save();
    ctx.clip();
    ctx.fillStyle = color;
    ctx.fillRect(x - r, y - r * 0.55, r * 2, r * 1.1);
    ctx.restore();
  }
  // A little light on the top left, so they read as spheres.
  const shine = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.05, x, y, r);
  shine.addColorStop(0, "rgba(255,255,255,0.55)");
  shine.addColorStop(0.45, "rgba(255,255,255,0.05)");
  shine.addColorStop(1, "rgba(0,0,0,0.35)");
  ctx.fillStyle = shine;
  ctx.fill();
  ctx.lineWidth = Math.max(0.5, r * 0.06);
  ctx.strokeStyle = "rgba(0,0,0,0.35)";
  ctx.stroke();
  if (n > 0 && r > 7) {
    ctx.beginPath();
    ctx.arc(x, y, r * 0.46, 0, Math.PI * 2);
    ctx.fillStyle = "#faf8f2";
    ctx.fill();
    ctx.fillStyle = "#1b1a22";
    ctx.font = `${Math.round(r * 0.62)}px ui-sans-serif, system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    // Upright on screen whichever way the table is turned.
    const m = ctx.getTransform();
    ctx.translate(x, y);
    ctx.rotate(-Math.atan2(m.b, m.a));
    ctx.fillText(String(n), 0, r * 0.03);
  }
  ctx.restore();
}

function paintTable(ctx: CanvasRenderingContext2D, view: View) {
  const { scale: k, ox, oy } = view;
  const at = (x: number, y: number): [number, number] => [ox + x * k, oy + y * k];

  // The frame.
  ctx.save();
  const frame = ctx.createLinearGradient(0, oy - RAIL * k, 0, oy + (TABLE.h + RAIL) * k);
  frame.addColorStop(0, "#6b4a2c");
  frame.addColorStop(0.5, "#54371f");
  frame.addColorStop(1, "#3d2716");
  ctx.fillStyle = frame;
  ctx.beginPath();
  ctx.roundRect(ox - RAIL * k, oy - RAIL * k, (TABLE.w + RAIL * 2) * k, (TABLE.h + RAIL * 2) * k, 4 * k);
  ctx.fill();

  // The cloth.
  const cloth = ctx.createRadialGradient(...at(TABLE.w / 2, TABLE.h / 2), 8, ...at(TABLE.w / 2, TABLE.h / 2), TABLE.w * k * 0.7);
  cloth.addColorStop(0, "#2f7f56");
  cloth.addColorStop(1, "#1d5a3c");
  ctx.fillStyle = cloth;
  ctx.fillRect(ox, oy, TABLE.w * k, TABLE.h * k);

  // Diamonds along the rails.
  ctx.fillStyle = "rgba(245,240,225,0.65)";
  for (let i = 1; i <= 7; i += 1) {
    if (i === 4) continue;
    const x = (TABLE.w / 8) * i;
    for (const y of [-RAIL / 2, TABLE.h + RAIL / 2]) {
      ctx.beginPath();
      ctx.arc(...at(x, y), Math.max(1, 0.9 * k), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  for (let i = 1; i <= 3; i += 1) {
    const y = (TABLE.h / 4) * i;
    for (const x of [-RAIL / 2, TABLE.w + RAIL / 2]) {
      ctx.beginPath();
      ctx.arc(...at(x, y), Math.max(1, 0.9 * k), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // The head string and the foot spot, as they are marked on a table.
  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.lineWidth = Math.max(1, 0.4 * k);
  ctx.beginPath();
  ctx.moveTo(...at(HEAD, 0));
  ctx.lineTo(...at(HEAD, TABLE.h));
  ctx.stroke();

  // Pockets.
  for (const p of POCKETS) {
    const x = Math.max(0, Math.min(TABLE.w, p.x));
    const y = Math.max(0, Math.min(TABLE.h, p.y));
    ctx.beginPath();
    ctx.arc(...at(x, y), p.r * k, 0, Math.PI * 2);
    ctx.fillStyle = "#120f14";
    ctx.fill();
    ctx.lineWidth = Math.max(1, 0.8 * k);
    ctx.strokeStyle = "rgba(0,0,0,0.5)";
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Pool, on a nine-foot table. Eight ball and nine ball with the rules kept --
 * fouls, ball in hand, halves picked up as they fall -- or a free table with
 * none of it, which is also where you set the balls out by hand.
 *
 * A shot is an angle, a weight and where the tip struck. Everybody's screen
 * plays it out from the same numbers, so what everyone watches is the same
 * table; whoever took the shot writes down where it left the balls.
 */
export default function Pool({ item, state }: { item: Item<"game">; state: PoolState }) {
  const { updateDataIf, canEdit, setNotice } = useRoom();
  const me = useRoomStore((s) => s.me);

  const pool = upgradePool(state);
  const chairs = chairsFor(pool.seatCount);
  const holders = pool.holders ?? {};
  const myChair = chairOf(pool.seats, holders, me);
  const open = chairs.every((c) => !pool.seats[c]);
  const mySide = myChair ? sideOf(pool, myChair) : null;
  const turnSide = sideOf(pool, pool.turn);
  const myTurn = pool.kind === "free" || open || (myChair !== null && sideOf(pool, myChair) === turnSide && myChair === pool.turn);
  const over = Boolean(pool.winner);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [spin, setSpin] = useState({ side: 0, top: 0 });
  const [power, setPower] = useState(0);
  const [aiming, setAiming] = useState(false);

  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewRef = useRef<View>({ scale: 1, ox: 0, oy: 0 });
  const drawRef = useRef<() => void>(() => {});
  const queued = useRef(false);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const aimRef = useRef<{ pointerId: number; angle: number; power: number } | null>(null);
  const dragRef = useRef<{ pointerId: number; n: number; x: number; y: number } | null>(null);
  const animRef = useRef<{
    id: string;
    frames: number[][];
    before: PoolState;
    shot: Shot;
    result: ReturnType<typeof play>["result"];
    /** When the first frame was drawn, and which frame is showing now. */
    start: number;
    at: number;
  } | null>(null);
  const seen = useRef<string | null>(pool.shot?.id ?? null);

  const requestDraw = () => {
    if (queued.current) return;
    queued.current = true;
    const run = () => {
      queued.current = false;
      drawRef.current();
    };
    if (document.hidden) window.setTimeout(run, 16);
    else requestAnimationFrame(run);
  };

  // ---------------------------------------------------------------------------
  // Saving
  // ---------------------------------------------------------------------------

  const live = (): { pool: PoolState; since: string } | null => {
    const row = useRoomStore.getState().items[item.id];
    if (!row) return null;
    return { pool: upgradePool((row.data as { state?: unknown }).state), since: row.updated_at };
  };

  const run = async (make: (fresh: PoolState) => PoolState | null) => {
    if (!canEdit) return;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const now = live();
      if (!now) return;
      const next = make(now.pool);
      if (!next) return;
      if (await updateDataIf(item.id, { game: "pool", state: next }, now.since)) return;
      await new Promise((resolve) => window.setTimeout(resolve, 50 + attempt * 70));
    }
    setNotice("the table moved under that shot. try it again.");
  };

  const save = (make: (fresh: PoolState) => PoolState | null) => {
    queue.current = queue.current.then(() => run(make)).catch(() => {});
    return queue.current;
  };

  // ---------------------------------------------------------------------------
  // Watching a shot
  // ---------------------------------------------------------------------------

  const settle = (anim: NonNullable<typeof animRef.current>) => {
    const outcome = judge(anim.before, anim.shot, anim.result);
    void save((fresh) => {
      if (fresh.shot?.id !== anim.id || fresh.settled === anim.id) return null;
      return { ...outcome, settled: anim.id };
    });
  };

  useEffect(() => {
    const shot = pool.shot;
    if (!shot || seen.current === shot.id) return;
    seen.current = shot.id;
    if (pool.settled === shot.id) {
      requestDraw();
      return;
    }
    const { frames, result } = play(pool.balls, shot);
    const anim = { id: shot.id, frames, before: pool, shot, result, start: 0, at: 0 };
    animRef.current = anim;
    const mine = shot.by && me?.userId === shot.by;
    // The clock starts with the first frame the screen actually draws.
    const tick = (now: number) => {
      const running = animRef.current;
      if (!running || running.id !== anim.id) return;
      if (!running.start) running.start = now;
      const at = Math.floor((now - running.start) / (1000 / 60));
      running.at = at;
      if (at >= running.frames.length) {
        animRef.current = null;
        requestDraw();
        // Whoever took the shot writes down where it left the balls; if they
        // have wandered off, whoever is still here does it a moment later.
        window.setTimeout(() => settle(anim), mine ? 0 : 2200);
        return;
      }
      requestDraw();
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    // Only when a new shot turns up.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pool.shot?.id, pool.settled]);

  // ---------------------------------------------------------------------------
  // Drawing
  // ---------------------------------------------------------------------------

  useEffect(() => {
    drawRef.current = () => {
      const canvas = canvasRef.current;
      const box = boxRef.current;
      if (!canvas || !box || !box.clientWidth) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // Sharp at whatever zoom the room is at.
      const density = Math.min(4, Math.min(window.devicePixelRatio || 1, 2) * (box.getBoundingClientRect().width / box.clientWidth || 1));
      const w = Math.max(1, Math.round(box.clientWidth * density));
      const h = Math.max(1, Math.round(box.clientHeight * density));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      const turned = box.clientHeight > box.clientWidth * 1.1;
      // The table's own width and height, as the drawing sees them.
      const long = turned ? box.clientHeight : box.clientWidth;
      const short = turned ? box.clientWidth : box.clientHeight;
      const scale = Math.min(long / (TABLE.w + RAIL * 2), short / (TABLE.h + RAIL * 2));
      const view: View = {
        scale,
        ox: (long - TABLE.w * scale) / 2,
        oy: (short - TABLE.h * scale) / 2,
        turned,
        across: box.clientWidth,
      };
      viewRef.current = view;
      const k = view.scale;
      const at = (x: number, y: number): [number, number] => [view.ox + x * k, view.oy + y * k];

      ctx.setTransform(density, 0, 0, density, 0, 0);
      ctx.clearRect(0, 0, box.clientWidth, box.clientHeight);
      if (turned) {
        ctx.translate(box.clientWidth, 0);
        ctx.rotate(Math.PI / 2);
      }
      paintTable(ctx, view);

      const anim = animRef.current;
      const frame = anim ? anim.frames[Math.min(anim.frames.length - 1, anim.at)] : null;
      const balls: Ball[] = anim
        ? anim.before.balls.map((b, i) => ({ ...b, x: frame ? frame[i * 2] : b.x, y: frame ? frame[i * 2 + 1] : b.y, out: frame ? frame[i * 2] < 0 : b.out }))
        : pool.balls;

      const carried = dragRef.current;
      for (const b of balls) {
        if (b.out) continue;
        const x = carried && carried.n === b.n ? carried.x : b.x;
        const y = carried && carried.n === b.n ? carried.y : b.y;
        paintBall(ctx, b.n, ...at(x, y), R * k);
      }

      const cue = balls.find((b) => b.n === 0);
      const aim = aimRef.current;
      if (cue && !cue.out && !anim && aim && myTurn && !over) {
        const from = { x: cue.x, y: cue.y };
        const seenTo = sight(balls, from, aim.angle);
        ctx.save();
        ctx.setLineDash([5, 5]);
        ctx.lineWidth = Math.max(1, 0.5 * k);
        ctx.strokeStyle = "rgba(255,255,255,0.8)";
        ctx.beginPath();
        ctx.moveTo(...at(from.x, from.y));
        ctx.lineTo(...at(seenTo.x, seenTo.y));
        ctx.stroke();
        ctx.setLineDash([]);
        // The ghost ball, and which way the object ball would go from it.
        ctx.beginPath();
        ctx.arc(...at(seenTo.x, seenTo.y), R * k, 0, Math.PI * 2);
        ctx.stroke();
        if (seenTo.hit) {
          const dx = seenTo.hit.x - seenTo.x;
          const dy = seenTo.hit.y - seenTo.y;
          const d = Math.hypot(dx, dy) || 1;
          ctx.strokeStyle = "rgba(246,193,119,0.85)";
          ctx.beginPath();
          ctx.moveTo(...at(seenTo.hit.x, seenTo.hit.y));
          ctx.lineTo(...at(seenTo.hit.x + (dx / d) * 30, seenTo.hit.y + (dy / d) * 30));
          ctx.stroke();
        }
        // The cue itself, pulled back by however hard the shot is.
        const back = (R + 2 + aim.power * 26) * k;
        const bx = view.ox + from.x * k - Math.cos(aim.angle) * back;
        const by = view.oy + from.y * k - Math.sin(aim.angle) * back;
        const cueGrad = ctx.createLinearGradient(bx, by, bx - Math.cos(aim.angle) * 60 * k, by - Math.sin(aim.angle) * 60 * k);
        cueGrad.addColorStop(0, "#f2e2c4");
        cueGrad.addColorStop(0.15, "#c89a5a");
        cueGrad.addColorStop(1, "#5a3a1c");
        ctx.strokeStyle = cueGrad;
        ctx.lineWidth = Math.max(2, 1.4 * k);
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.lineTo(bx - Math.cos(aim.angle) * 60 * k, by - Math.sin(aim.angle) * 60 * k);
        ctx.stroke();
        ctx.restore();
      }

      if (pool.ballInHand && myTurn && !anim && !over && cue && !cue.out) {
        ctx.save();
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = "rgba(196,167,240,0.9)";
        ctx.lineWidth = Math.max(1, 0.6 * k);
        ctx.beginPath();
        ctx.arc(...at(carried?.n === 0 ? carried.x : cue.x, carried?.n === 0 ? carried.y : cue.y), R * k * 1.7, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    };
  });

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const observe = new ResizeObserver(() => requestDraw());
    observe.observe(box);
    requestDraw();
    return () => observe.disconnect();
  }, []);

  useEffect(() => requestDraw());

  // ---------------------------------------------------------------------------
  // The cue
  // ---------------------------------------------------------------------------

  const table = (event: React.PointerEvent): { x: number; y: number } => {
    const canvas = canvasRef.current;
    const view = viewRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const on = pointIn(canvas, event.nativeEvent, item.rotation);
    // Undo the quarter turn the drawing took, if it took one.
    const at = view.turned ? { x: on.y, y: (view.across ?? 0) - on.x } : on;
    return { x: (at.x - view.ox) / view.scale, y: (at.y - view.oy) / view.scale };
  };

  const ballAt = (p: { x: number; y: number }): Ball | undefined =>
    pool.balls.find((b) => !b.out && Math.hypot(b.x - p.x, b.y - p.y) < R * 1.8);

  const onPointerDown = (event: React.PointerEvent) => {
    event.stopPropagation();
    if (!canEdit || animRef.current || over) return;
    const p = table(event);
    try {
      canvasRef.current?.setPointerCapture(event.pointerId);
    } catch {
      // A pointer already let go of; it still works without holding on to it.
    }

    if (pool.arranging) {
      const ball = ballAt(p);
      if (ball) dragRef.current = { pointerId: event.pointerId, n: ball.n, x: p.x, y: p.y };
      requestDraw();
      return;
    }

    const cue = pool.balls.find((b) => b.n === 0);
    if (!cue) return;
    if (pool.ballInHand && myTurn && Math.hypot(cue.x - p.x, cue.y - p.y) < R * 2.5) {
      dragRef.current = { pointerId: event.pointerId, n: 0, x: p.x, y: p.y };
      requestDraw();
      return;
    }
    if (!myTurn) {
      setNotice(open ? "" : "it is not your shot yet.");
      return;
    }
    // Pull the cue back from the ball: the way you drag is the way it goes.
    aimRef.current = { pointerId: event.pointerId, angle: Math.atan2(cue.y - p.y, cue.x - p.x), power: 0 };
    setAiming(true);
    requestDraw();
  };

  const onPointerMove = (event: React.PointerEvent) => {
    const carried = dragRef.current;
    const aim = aimRef.current;
    const p = table(event);
    if (carried && carried.pointerId === event.pointerId) {
      carried.x = p.x;
      carried.y = p.y;
      requestDraw();
      return;
    }
    if (!aim || aim.pointerId !== event.pointerId) return;
    const cue = pool.balls.find((b) => b.n === 0);
    if (!cue) return;
    const pull = Math.hypot(cue.x - p.x, cue.y - p.y);
    aim.angle = Math.atan2(cue.y - p.y, cue.x - p.x);
    aim.power = Math.max(0, Math.min(1, (pull - 6) / 80));
    setPower(aim.power);
    requestDraw();
  };

  const onPointerUp = (event: React.PointerEvent) => {
    const carried = dragRef.current;
    if (carried && carried.pointerId === event.pointerId) {
      dragRef.current = null;
      const { n, x, y } = carried;
      void save((fresh) => {
        const put = place(fresh.balls, n, x, y, Boolean(fresh.behindLine) && n === 0 && !fresh.arranging);
        const landed = put.find((b) => b.n === n) as Ball;
        if (!fits(fresh.balls, n, landed.x, landed.y)) return null;
        return { ...fresh, balls: put, ballInHand: fresh.arranging ? fresh.ballInHand : false };
      });
      requestDraw();
      return;
    }
    const aim = aimRef.current;
    if (!aim || aim.pointerId !== event.pointerId) return;
    aimRef.current = null;
    setAiming(false);
    setPower(0);
    if (aim.power < 0.04) {
      requestDraw();
      return;
    }
    const cue = pool.balls.find((b) => b.n === 0);
    if (!cue) return;
    const shot: Shot = {
      id: newId(),
      angle: aim.angle,
      power: aim.power,
      side: spin.side,
      top: spin.top,
      cue: { x: cue.x, y: cue.y },
      by: me?.userId,
    };
    setSpin({ side: 0, top: 0 });
    void save((fresh) => {
      if (fresh.shot && fresh.settled !== fresh.shot.id) return null;
      return { ...fresh, shot, settled: undefined, say: "", ballInHand: false, behindLine: false };
    });
  };

  // ---------------------------------------------------------------------------
  // The table around the table
  // ---------------------------------------------------------------------------

  const sit = (chair: string) => {
    if (!me) return;
    void save((fresh) => {
      const seated = { ...fresh, ...claimChair(fresh.seats, fresh.holders ?? {}, chair, me) };
      // If the go belonged to a chair nobody is in, it passes to somebody real.
      return { ...seated, turn: playable(seated) };
    });
  };

  const newGame = (kind: Kind = pool.kind) => {
    void save((fresh) => ({
      ...fresh,
      kind,
      balls: rack(kind),
      turn: fresh.turn,
      shot: undefined,
      settled: undefined,
      groups: undefined,
      winner: null,
      broken: false,
      ballInHand: true,
      behindLine: kind !== "free",
      arranging: false,
      say: kind === "free" ? "knock them about" : "break them",
    }));
  };

  const addBall = (n: number) => {
    void save((fresh) => {
      const spot = { x: HEAD, y: TABLE.h / 2 + (n % 2 ? -10 : 10) };
      const has = fresh.balls.some((b) => b.n === n);
      const balls = has
        ? fresh.balls.map((b) => (b.n === n ? { ...b, out: false, ...spot } : b))
        : [...fresh.balls, { n, ...spot, vx: 0, vy: 0, wx: 0, wy: 0, wz: 0 }];
      return { ...fresh, balls };
    });
  };

  const missing = Array.from({ length: 16 }, (_, i) => i).filter((n) => !pool.balls.some((b) => b.n === n && !b.out));

  const groupOf = (side: string) => pool.groups?.[side];
  const whose = (chair: string) => pool.seats[chair] ?? t(`player ${chairs.indexOf(chair) + 1}`);
  const status = over
    ? `${pool.winner === mySide ? "you win" : `${pool.winner === turnSide ? whose(pool.turn) : "the other side"} wins`}`
    : pool.say
      ? pool.say
      : pool.kind === "nine"
        ? `${whose(pool.turn)} on the ${lowest(pool.balls) ?? 9}`
        : groupOf(turnSide)
          ? `${whose(pool.turn)} on ${groupOf(turnSide)} (${left(pool.balls, groupOf(turnSide))} left)`
          : `${whose(pool.turn)} to play`;

  return (
    <div className="surface grain flex size-full flex-col gap-1.5 overflow-hidden rounded-2xl p-2">
      {/* Who is playing */}
      <div className="flex items-center gap-1 overflow-x-auto pb-0.5">
        {chairs.map((chair, index) => {
          const side = sideOf(pool, chair);
          const group = groupOf(side);
          const isMine = chair === myChair;
          return (
            <button
              key={chair}
              type="button"
              disabled={!canEdit || !me}
              onClick={() => sit(chair)}
              title={pool.seats[chair] ? (isMine ? t("stand up") : pool.seats[chair] ?? "") : t("play here")}
              className={clsx(
                "flex min-h-8 shrink-0 items-center gap-1.5 rounded-xl px-2 text-[11px] transition disabled:opacity-60",
                chair === pool.turn && !over ? "bg-glow/18 ring-1 ring-glow/45" : "bg-white/5 hover:bg-white/9",
              )}
            >
              {pool.teams >= 2 && (
                <span className="size-2 rounded-full" style={{ background: TEAM_TINT[index % pool.teams] }} />
              )}
              <span className={clsx("max-w-24 truncate", pool.seats[chair] ? "text-chalk" : "text-muted/50")}>{whose(chair)}</span>
              {group && (
                <span className="text-[10px] text-muted">
                  {group === "solids" ? t("solids") : t("stripes")} {left(pool.balls, group)}
                </span>
              )}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setSettingsOpen((v) => !v)}
          disabled={!canEdit}
          aria-label={t("game and players")}
          title={t("game and players")}
          className="ml-auto grid size-8 shrink-0 place-items-center rounded-xl text-muted transition hover:bg-white/8 hover:text-chalk disabled:opacity-40"
        >
          <Settings2 className="size-4" strokeWidth={2.2} />
        </button>
      </div>

      {/* The table */}
      <div ref={boxRef} className="relative min-h-0 flex-1">
        <canvas
          ref={canvasRef}
          className={clsx("absolute inset-0 size-full touch-none", pool.arranging ? "cursor-move" : myTurn && !over ? "cursor-crosshair" : "cursor-default")}
          style={{ width: "100%", height: "100%" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onContextMenu={(event) => event.preventDefault()}
        />

        {settingsOpen && (
          <div className="surface-raised absolute top-1 right-1 z-20 w-56 rounded-xl p-2 shadow-2xl" onPointerDown={(event) => event.stopPropagation()}>
            <p className="mb-1 text-[9px] tracking-wide text-muted/60 uppercase">{t("game")}</p>
            <div className="mb-2 grid gap-1">
              {KINDS.map((k) => (
                <button
                  key={k.id}
                  type="button"
                  onClick={() => {
                    newGame(k.id);
                    setSettingsOpen(false);
                  }}
                  className={clsx("rounded-lg px-2 py-1 text-left text-[11px]", pool.kind === k.id ? "bg-glow/25 text-glow" : "bg-white/5 text-muted hover:text-chalk")}
                >
                  {t(k.name)}
                  <span className="block text-[9px] text-muted/70">{t(k.hint)}</span>
                </button>
              ))}
            </div>
            <p className="mb-1 text-[9px] tracking-wide text-muted/60 uppercase">{t("players")}</p>
            <div className="mb-2 flex items-center gap-1">
              {[2, 3, 4, 6, 8].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => void save((fresh) => ({ ...fresh, seatCount: n, teams: fresh.teams > n ? 0 : fresh.teams }))}
                  className={clsx("min-h-7 flex-1 rounded-md text-[11px]", pool.seatCount === n ? "bg-chalk text-ink-950" : "bg-white/6 text-muted hover:text-chalk")}
                >
                  {n}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => void save((fresh) => ({ ...fresh, teams: fresh.teams >= 2 ? 0 : 2 }))}
              className={clsx("flex min-h-8 w-full items-center gap-1.5 rounded-lg px-2 text-[11px]", pool.teams >= 2 ? "bg-glow/25 text-glow" : "bg-white/6 text-muted hover:text-chalk")}
            >
              <Users className="size-3.5" /> {pool.teams >= 2 ? t("two sides, alternate chairs") : t("everyone for themselves")}
            </button>
          </div>
        )}

        {pool.arranging && canEdit && (
          <div className="absolute inset-x-1 bottom-1 z-10 flex flex-wrap items-center gap-1 rounded-xl bg-ink-950/70 p-1" onPointerDown={(event) => event.stopPropagation()}>
            <span className="px-1 text-[10px] text-muted">{t("drag the balls about")}</span>
            {missing.slice(0, 8).map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => addBall(n)}
                className="grid size-6 place-items-center rounded-full text-[9px] font-semibold text-ink-950 ring-1 ring-white/40"
                style={{ background: BALL_COLOR[n] ?? "#ccc", color: n === 8 || n === 2 || n === 4 ? "#fff" : "#1b1a22" }}
                title={n === 0 ? t("the cue ball") : t(`ball ${n}`)}
              >
                {n === 0 ? t("cue") : n}
              </button>
            ))}
            <button type="button" onClick={() => void save((fresh) => ({ ...fresh, balls: fresh.balls.filter((b) => b.n === 0), ballInHand: true }))} className="ml-auto rounded-lg px-2 text-[10px] text-muted hover:text-red-300">{t("clear the table")}</button>
          </div>
        )}
      </div>

      {/* The cue, the spin, and what is going on */}
      <div className="flex items-center gap-2">
        <SpinDial spin={spin} onSpin={setSpin} disabled={!myTurn || over || Boolean(pool.arranging)} rotation={item.rotation} />
        <div className="min-w-0 flex-1">
          <p className={clsx("truncate text-[11px]", over ? "text-glow" : "text-chalk")}>{t(status)}</p>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/8">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#a6d189] via-[#f6c177] to-[#e0655c] transition-[width] duration-75"
              style={{ width: `${Math.round((aiming ? power : 0) * 100)}%` }}
            />
          </div>
          <p className="mt-0.5 truncate text-[9px] text-muted/70">
            {pool.arranging
              ? t("setting the table out by hand")
              : pool.ballInHand && myTurn
                ? t("ball in hand: drag the cue ball, then pull back to shoot")
                : myTurn
                  ? t("pull back from the cue ball and let go")
                  : t(`waiting for ${whose(pool.turn)}`)}
          </p>
        </div>
        {canEdit && (
          <>
            <button
              type="button"
              onClick={() => void save((fresh) => ({ ...fresh, arranging: !fresh.arranging }))}
              title={t("set the table out by hand")}
              aria-label={t("arrange the table")}
              className={clsx("grid size-9 shrink-0 place-items-center rounded-xl", pool.arranging ? "bg-glow/25 text-glow" : "text-muted hover:bg-white/8 hover:text-chalk")}
            >
              <Move className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => void save((fresh) => ({ ...fresh, ballInHand: true, behindLine: false }))}
              title={t("ball in hand")}
              aria-label={t("ball in hand")}
              className="grid size-9 shrink-0 place-items-center rounded-xl text-muted hover:bg-white/8 hover:text-chalk"
            >
              <Hand className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => newGame()}
              title={t("rack them up again")}
              aria-label={t("rack them up")}
              className="grid size-9 shrink-0 place-items-center rounded-xl text-muted hover:bg-white/8 hover:text-chalk"
            >
              <RotateCcw className="size-4" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/** Where the tip strikes the ball: the little cue ball you push a dot around. */
function SpinDial({
  spin,
  onSpin,
  disabled,
  rotation,
}: {
  spin: { side: number; top: number };
  onSpin: (next: { side: number; top: number }) => void;
  disabled: boolean;
  /** The tilt of the item it sits in, so a drag on it reads true. */
  rotation: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  const setFrom = (event: React.PointerEvent) => {
    const node = ref.current;
    if (!node || disabled) return;
    const at = pointIn(node, event.nativeEvent, rotation);
    const r = node.clientWidth / 2;
    let side = (at.x - r) / r;
    let top = -(at.y - r) / r;
    const away = Math.hypot(side, top);
    if (away > 1) {
      side /= away;
      top /= away;
    }
    onSpin({ side: side * 0.5, top: top * 0.5 });
  };

  return (
    <div
      ref={ref}
      onPointerDown={(event) => {
        event.stopPropagation();
        try {
          (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
        } catch {
          // Without capture it still follows while the pointer is over it.
        }
        setFrom(event);
      }}
      onPointerMove={(event) => event.buttons && setFrom(event)}
      onDoubleClick={() => onSpin({ side: 0, top: 0 })}
      title={t("where the tip strikes: top and bottom for follow and screw, the sides for English")}
      className={clsx(
        "relative size-11 shrink-0 touch-none rounded-full bg-[#f7f5ef] shadow-inner ring-1 ring-white/30",
        disabled && "opacity-40",
      )}
    >
      <span className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_35%_30%,rgba(255,255,255,0.9),rgba(0,0,0,0.25))]" />
      <span
        className="absolute size-3 -translate-1/2 rounded-full bg-[#1b1a22] ring-2 ring-white/70"
        style={{ left: `${50 + spin.side * 100}%`, top: `${50 - spin.top * 100}%` }}
      />
    </div>
  );
}
