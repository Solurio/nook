import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FOOT,
  GROUP_OF,
  HEAD,
  R,
  TABLE,
  emptyPool,
  fits,
  judge,
  lowest,
  nextChair,
  place,
  playable,
  play,
  rack,
  sideOf,
  sight,
  spotFor,
  type Ball,
  type PoolState,
  type Shot,
} from "../src/lib/pool.ts";
import { localPoint } from "../src/lib/pointer.ts";

const at = (n: number, x: number, y: number): Ball => ({ n, x, y, vx: 0, vy: 0, wx: 0, wy: 0, wz: 0 });

const shot = (over: Partial<Shot> = {}): Shot => ({
  id: "s",
  angle: 0,
  power: 0.5,
  side: 0,
  top: 0,
  cue: { x: HEAD, y: TABLE.h / 2 },
  ...over,
});

const find = (balls: Ball[], n: number) => balls.find((b) => b.n === n) as Ball;

// ---------------------------------------------------------------------------
// The table
// ---------------------------------------------------------------------------

test("a rack is a triangle of balls that are not inside one another", () => {
  const balls = rack("eight");
  assert.equal(balls.length, 16);
  assert.equal(find(balls, 0).x, HEAD, "the cue ball sits on the head spot");
  assert.equal(find(balls, 1).x, FOOT, "the front ball is on the foot spot");
  for (let i = 0; i < balls.length; i += 1) {
    for (let j = i + 1; j < balls.length; j += 1) {
      const d = Math.hypot(balls[i].x - balls[j].x, balls[i].y - balls[j].y);
      assert.ok(d >= R * 2 - 0.001, `${balls[i].n} and ${balls[j].n} overlap`);
      assert.ok(balls[i].x > 0 && balls[i].x < TABLE.w && balls[i].y > 0 && balls[i].y < TABLE.h);
    }
  }
  // Nine-ball is a diamond of nine, with the nine in the middle of it.
  const nine = rack("nine");
  assert.equal(nine.length, 10);
  assert.equal(find(nine, 9).y, TABLE.h / 2);
  assert.equal(GROUP_OF(3), "solids");
  assert.equal(GROUP_OF(12), "stripes");
  assert.equal(GROUP_OF(8), null);
});

// ---------------------------------------------------------------------------
// The cloth
// ---------------------------------------------------------------------------

test("a ball struck on its own runs out of speed and stays on the table", () => {
  const balls = [at(0, 40, TABLE.h / 2)];
  const { result, frames } = play(balls, shot({ power: 0.35, angle: 0 }));
  const cue = find(result.balls, 0);
  assert.equal(cue.vx, 0);
  assert.ok(cue.x > 60, "it travelled");
  assert.ok(cue.x <= TABLE.w - R + 0.001 && cue.x >= R - 0.001);
  assert.ok(frames.length > 20, "there are frames to watch");
  assert.equal(frames[0].length, 2, "a frame is an x and a y for each ball");
});

test("the same shot on the same table gives the same table back", () => {
  const balls = rack("eight");
  const a = play(balls, shot({ power: 0.9, angle: 0.02, side: 0.2, top: 0.1 }));
  const b = play(balls, shot({ power: 0.9, angle: 0.02, side: 0.2, top: 0.1 }));
  assert.deepEqual(a.result.balls, b.result.balls);
  assert.deepEqual(a.result.potted, b.result.potted);
  assert.equal(a.frames.length, b.frames.length);
});

test("a cushion sends a ball back with less of it", () => {
  const balls = [at(0, TABLE.w - 40, TABLE.h / 2)];
  const { result } = play(balls, shot({ power: 0.5, angle: 0, cue: { x: TABLE.w - 40, y: TABLE.h / 2 } }));
  const cue = find(result.balls, 0);
  assert.ok(cue.x < TABLE.w - 40, "it came back off the cushion");
  assert.ok(result.railsAfter === 0, "rails only count once a ball has been hit");
});

test("a stun shot stops, a follow carries on, a screw shot comes back", () => {
  // Measured just after the two balls touch, before any cushion has a say.
  const line = (top: number) => {
    const balls = [at(0, 60, TABLE.h / 2), at(1, 120, TABLE.h / 2)];
    const { frames, result } = play(balls, shot({ power: 0.45, angle: 0, top, cue: { x: 60, y: TABLE.h / 2 } }));
    const touch = frames.findIndex((f) => f[2] > 120.5);
    const after = frames[Math.min(touch + 24, frames.length - 1)];
    return { hit: result.firstHit, at: after[0], object: after[2], objectY: after[3], contact: frames[touch][0] };
  };
  const stun = line(0);
  const follow = line(0.45);
  const screw = line(-0.45);
  assert.equal(stun.hit, 1);
  assert.ok(stun.object > 150, "the object ball was sent off down the table");
  assert.ok(follow.at > stun.at + 5, "with top on it, the cue ball follows through");
  assert.ok(screw.at < screw.contact, "with screw on it, the cue ball comes back");
  assert.ok(Math.abs(stun.objectY - TABLE.h / 2) < 1, "a straight shot sends it straight");
});

test("a ball rolled at a pocket goes down and stays down", () => {
  const balls = [at(0, 228, 30), at(1, 243, 12)];
  const angle = Math.atan2(12 - 30, 243 - 228);
  const { result } = play(balls, shot({ power: 0.3, angle, cue: { x: 228, y: 30 } }));
  assert.equal(result.firstHit, 1, "the cue ball found the object ball");
  assert.ok(result.potted.includes(1), "and it went down the corner");
  assert.equal(find(result.balls, 1).out, true);
  assert.equal(result.scratch, false);
});

// ---------------------------------------------------------------------------
// The rules
// ---------------------------------------------------------------------------

const game = (over: Partial<PoolState> = {}): PoolState => ({ ...emptyPool("eight"), ...over });

test("missing everything is a foul, and the other side gets the ball in hand", () => {
  const state = game({ balls: [at(0, 60, 60), at(1, 200, 20)] });
  const next = judge(state, shot(), { balls: state.balls, potted: [], firstHit: null, railsAfter: 0, scratch: false });
  assert.equal(next.turn, "p1");
  assert.equal(next.ballInHand, true);
  assert.match(next.say ?? "", /foul/);
});

test("potting one of yours fairly keeps you at the table, and settles whose is whose", () => {
  const state = game({ balls: rack("eight") });
  const next = judge(state, shot(), { balls: state.balls, potted: [3], firstHit: 3, railsAfter: 0, scratch: false });
  assert.equal(next.turn, "p0", "the shooter carries on");
  assert.equal(next.groups?.p0, "solids");
  assert.equal(next.groups?.p1, "stripes");
  const missed = judge(next, shot(), { balls: next.balls, potted: [], firstHit: 2, railsAfter: 1, scratch: false });
  assert.equal(missed.turn, "p1", "a fair miss hands the table over");
  assert.equal(missed.ballInHand, false);
});

test("the eight settles it: cleared first is a win, early is a loss", () => {
  const cleared = game({
    groups: { p0: "solids", p1: "stripes" },
    balls: [at(0, 60, 60), { ...at(8, 200, 60) }],
  });
  const won = judge(cleared, shot(), { balls: [at(0, 60, 60), { ...at(8, 200, 60), out: true }], potted: [8], firstHit: 8, railsAfter: 0, scratch: false });
  assert.equal(won.winner, "p0");

  const early = game({ groups: { p0: "solids", p1: "stripes" }, balls: [at(0, 60, 60), at(3, 100, 60), at(8, 200, 60)] });
  const lost = judge(early, shot(), { balls: early.balls, potted: [8], firstHit: 3, railsAfter: 0, scratch: false });
  assert.equal(lost.winner, "p1");
});

test("nine-ball asks for the lowest ball first, and the nine ends it", () => {
  const state = game({ kind: "nine", balls: [at(0, 60, 60), at(2, 120, 60), at(9, 200, 60)] });
  assert.equal(lowest(state.balls), 2);
  const wrong = judge(state, shot(), { balls: state.balls, potted: [], firstHit: 9, railsAfter: 1, scratch: false });
  assert.match(wrong.say ?? "", /had to be hit first/);
  assert.equal(wrong.turn, "p1");
  const won = judge(state, shot(), { balls: state.balls, potted: [9], firstHit: 2, railsAfter: 0, scratch: false });
  assert.equal(won.winner, "p0");
});

test("free play has no fouls, and the cue ball comes back when it goes down", () => {
  const state = game({ kind: "free", balls: [at(0, 60, 60), at(1, 120, 60)] });
  const potted = [{ ...at(0, 0, 0), out: true }, at(1, 120, 60)];
  const next = judge(state, shot(), { balls: potted, potted: [0], firstHit: 1, railsAfter: 0, scratch: true });
  assert.equal(next.winner, undefined);
  assert.equal(find(next.balls, 0).out, false, "it is put back on the table");
  assert.equal(next.turn, "p1", "and the go passes on");
});

test("teams put alternate chairs on the same side", () => {
  const state = game({ seatCount: 4, teams: 2 });
  assert.equal(sideOf(state, "p0"), "t0");
  assert.equal(sideOf(state, "p2"), "t0");
  assert.equal(sideOf(state, "p1"), "t1");
  assert.equal(sideOf(game({ seatCount: 4, teams: 0 }), "p2"), "p2");
});

test("a ball put down by hand lands on the table, clear of the others", () => {
  const balls = [at(0, 60, 60), at(1, 120, 60)];
  const put = place(balls, 0, -40, 500);
  assert.equal(find(put, 0).x, R);
  assert.equal(find(put, 0).y, TABLE.h - R);
  const behind = place(balls, 0, 200, 60, true);
  assert.ok(find(behind, 0).x <= HEAD, "behind the line means behind the line");
  assert.equal(fits(balls, 0, 120, 60), false);
  assert.equal(fits(balls, 0, 180, 60), true);
  assert.ok(spotFor(balls, 120, 60).x > 120, "a ball coming back goes where there is room");
});

test("sighting along the cue finds the first ball, or the cushion behind it", () => {
  const balls = [at(0, 60, 60), at(4, 140, 60), at(5, 200, 60)];
  const straight = sight(balls, { x: 60, y: 60 }, 0);
  assert.equal(straight.hit?.n, 4);
  assert.ok(Math.abs(straight.x - (140 - R * 2)) < 0.01, "the ghost ball sits where it would touch");
  const past = sight(balls, { x: 60, y: 60 }, -Math.PI / 2);
  assert.equal(past.hit, null);
  assert.ok(Math.abs(past.y - R) < 0.01, "and runs on to the cushion");
});

test("a pointer on a tilted, zoomed item is read in the item's own pixels", () => {
  // An item 200 by 100, turned five degrees and shown at half size: the box it
  // takes up on screen is wider than the item, and the middle of the box is
  // the middle of the item.
  const turn = (5 * Math.PI) / 180;
  const zoom = 0.5;
  const w = 200;
  const h = 100;
  const spread = w * Math.cos(turn) + h * Math.sin(turn);
  const tall = w * Math.sin(turn) + h * Math.cos(turn);
  const box = { left: 40, top: 20, width: spread * zoom, height: tall * zoom };
  const middle = localPoint(box, w, h, 5, box.left + box.width / 2, box.top + box.height / 2);
  assert.ok(Math.abs(middle.x - w / 2) < 1e-9 && Math.abs(middle.y - h / 2) < 1e-9);

  // A corner of the item, worked out the long way round, comes back as a corner.
  const cx = box.left + box.width / 2;
  const cy = box.top + box.height / 2;
  const corner = (lx: number, ly: number) => {
    const dx = (lx - w / 2) * zoom;
    const dy = (ly - h / 2) * zoom;
    return [cx + dx * Math.cos(turn) - dy * Math.sin(turn), cy + dx * Math.sin(turn) + dy * Math.cos(turn)];
  };
  for (const [lx, ly] of [[0, 0], [w, 0], [w, h], [37, 61]]) {
    const [sx, sy] = corner(lx, ly);
    const back = localPoint(box, w, h, 5, sx, sy);
    assert.ok(Math.abs(back.x - lx) < 1e-6 && Math.abs(back.y - ly) < 1e-6, `${lx},${ly} came back as ${back.x},${back.y}`);
  }
});

test("turns go round the people who are actually playing", () => {
  const empty = game({ seatCount: 4 });
  assert.equal(nextChair(empty, "p0"), "p1", "an empty table passes one chair at a time");
  const two = game({ seatCount: 4, seats: { p0: "ana", p2: "bo" } });
  assert.equal(nextChair(two, "p0"), "p2", "chairs nobody is in are skipped");
  assert.equal(nextChair(two, "p2"), "p0");
  assert.equal(playable(two), "p0");
  assert.equal(playable(game({ seatCount: 4, seats: { p2: "bo" }, turn: "p1" })), "p2", "a go left in an empty chair is handed to somebody");
});
