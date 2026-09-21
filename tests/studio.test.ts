import { test } from "node:test";
import assert from "node:assert/strict";
import { hexToHsv, hexToRgb, hsvToHex, parseHex, rgbToHex } from "../src/lib/studio/color.ts";
import { seeded } from "../src/lib/studio/rng.ts";
import {
  combine,
  decodeMask,
  ellipseMask,
  encodeMask,
  invertMask,
  maskBounds,
  maskEdges,
  polygonMask,
  rectMask,
  transformMask,
  wandMask,
} from "../src/lib/studio/mask.ts";
import { applyFilter, pushPixels } from "../src/lib/studio/filters.ts";
import { BUILT_IN_BRUSHES, dabsAlong, mirrored, stabilize, tidyBrush } from "../src/lib/studio/brush.ts";
import { legacyToDoc, trimPoints } from "../src/lib/studio/ops.ts";
import { applyMat, fit, invert, multiply, NO_WARP, pin, rotateAt, scaleTo, toDoc, viewMatrix, warpCorners, warpMatrix, zoomAt } from "../src/lib/studio/view.ts";

const count = (data: Uint8Array) => data.reduce((n, v) => n + (v ? 1 : 0), 0);

test("colours go round the wheel and back", () => {
  for (const hex of ["#ff0000", "#00ff00", "#0000ff", "#f2a4b8", "#123456", "#ffffff", "#000000"]) {
    assert.equal(hsvToHex(hexToHsv(hex)), hex);
  }
  assert.deepEqual(hexToRgb("#abc"), { r: 170, g: 187, b: 204 });
  assert.equal(rgbToHex({ r: 300, g: -4, b: 16.4 }), "#ff0010");
  assert.equal(parseHex("F2A4B8"), "#f2a4b8");
  assert.equal(parseHex("nope"), null);
  assert.equal(Math.round(hexToHsv("#00ff00").h), 120);
});

test("the seeded stream is the same every time for the same seed", () => {
  const a = seeded("stroke-1");
  const b = seeded("stroke-1");
  const c = seeded("stroke-2");
  const first = [a(), a(), a()];
  assert.deepEqual(first, [b(), b(), b()]);
  assert.notDeepEqual(first, [c(), c(), c()]);
  assert.ok(first.every((v) => v >= 0 && v < 1));
});

test("selections: rectangles, ellipses, lassos, combined and inverted", () => {
  const r = rectMask(20, 10, 2, 2, 7, 5);
  assert.equal(count(r.data), 5 * 3);
  assert.deepEqual(maskBounds(r), { x: 2, y: 2, w: 5, h: 3 });
  const e = ellipseMask(40, 40, 0, 0, 40, 40);
  assert.ok(Math.abs(count(e.data) - Math.PI * 400) < 60, `ellipse ${count(e.data)}`);
  const tri = polygonMask(20, 20, [0, 0, 20, 0, 0, 20]);
  assert.ok(Math.abs(count(tri.data) - 200) < 25, `triangle ${count(tri.data)}`);
  const both = combine(r, rectMask(20, 10, 10, 0, 12, 10), "add");
  assert.equal(count(both.data), 15 + 20);
  const cut = combine(both, rectMask(20, 10, 0, 0, 5, 10), "subtract");
  assert.equal(count(cut.data), 15 + 20 - 3 * 3);
  assert.equal(count(invertMask(r).data), 200 - 15);
  assert.equal(maskBounds(rectMask(5, 5, 0, 0, 0, 0)), null);
});

test("the magic wand takes what is joined and close in colour", () => {
  const w = 6;
  const h = 3;
  const px = new Uint8ClampedArray(w * h * 4);
  // Red on the left, a wall of black down the middle, red again on the right.
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = (y * w + x) * 4;
      const wall = x === 3;
      px[i] = wall ? 0 : 250;
      px[i + 3] = 255;
    }
  }
  assert.equal(count(wandMask(px, w, h, 0, 0, 20, true).data), 9, "stops at the wall");
  assert.equal(count(wandMask(px, w, h, 0, 0, 20, false).data), 15, "every red, joined or not");
});

test("a selection written down comes back exactly, small", () => {
  const m = ellipseMask(300, 200, 20, 30, 260, 170);
  const text = encodeMask(m);
  assert.ok(text.length < 3000, `${text.length} characters`);
  assert.deepEqual(decodeMask(text, 300, 200).data, m.data);
});

test("a moved selection lands where it was moved", () => {
  const m = rectMask(20, 20, 0, 0, 4, 4);
  const moved = transformMask(m, [1, 0, 0, 1, 10, 5]);
  assert.deepEqual(maskBounds(moved), { x: 10, y: 5, w: 4, h: 4 });
  const flipped = transformMask(m, [-1, 0, 0, 1, 20, 0]);
  assert.deepEqual(maskBounds(flipped), { x: 16, y: 0, w: 4, h: 4 });
});

test("filters change only what is selected", () => {
  const w = 8;
  const h = 1;
  const px = new Uint8ClampedArray(w * 4);
  for (let x = 0; x < w; x += 1) px.set([x * 30, 100, 200, 255], x * 4);
  const mask = new Uint8Array(w);
  mask.fill(255, 0, 4);
  applyFilter(px, w, h, "invert", 0, mask);
  assert.equal(px[0], 255, "inverted inside");
  assert.equal(px[4 * 4], 120, "left alone outside");
  const flat = new Uint8ClampedArray(16 * 4);
  for (let i = 0; i < 16; i += 1) flat.set([i % 2 ? 255 : 0, 0, 0, 255], i * 4);
  applyFilter(flat, 16, 1, "blur", 6, null);
  assert.ok(flat[8 * 4] > 60 && flat[8 * 4] < 200, "stripes blurred together");
  const noise = new Uint8ClampedArray(16 * 4).fill(128);
  const again = new Uint8ClampedArray(16 * 4).fill(128);
  applyFilter(noise, 4, 4, "noise", 40, null, "seed");
  applyFilter(again, 4, 4, "noise", 40, null, "seed");
  assert.deepEqual(noise, again, "the same noise from the same seed");
});

test("liquify pushes pixels the way the brush moves", () => {
  const w = 20;
  const h = 1;
  const px = new Uint8ClampedArray(w * 4);
  for (let x = 2; x <= 7; x += 1) px.set([255, 255, 255, 255], x * 4);
  pushPixels(px, w, h, 7, 0, 6, 3, 0, 1);
  const lit = [...Array(w).keys()].filter((x) => px[x * 4 + 3] > 100);
  assert.ok(lit.some((x) => x > 7), `nothing moved right: ${lit}`);
});

test("dabs: evenly spaced, thinned by pressure and taper, wandering the same way every time", () => {
  const pen = tidyBrush({ ...BUILT_IN_BRUSHES[0], size: 10, spacing: 0.5 });
  const dabs = dabsAlong([0, 0, 100, 0], undefined, pen, "s");
  assert.equal(dabs.length, 21, "one every 5 pixels over 100, and the start");
  assert.ok(dabs.every((d, i) => i === 0 || Math.abs(d.x - dabs[i - 1].x - 5) < 1e-6));
  const light = dabsAlong([0, 0, 100, 0], [0.2, 0.2], pen, "s");
  assert.ok(light[5].size < 3, "light pressure, thin line");
  const tapered = dabsAlong([0, 0, 100, 0], undefined, tidyBrush({ ...pen, taperIn: 0.3, taperOut: 0.3 }), "s");
  assert.ok(tapered[0].size < tapered[10].size && tapered.at(-1)!.size < tapered[10].size);
  const jitter = tidyBrush({ ...pen, jitterSize: 0.8, scatter: 1 });
  assert.deepEqual(dabsAlong([0, 0, 50, 50], undefined, jitter, "x"), dabsAlong([0, 0, 50, 50], undefined, jitter, "x"));
  // Spacing carries over from one segment to the next.
  const bent = dabsAlong([0, 0, 7, 0, 7, 7], undefined, pen, "s");
  assert.equal(bent.length, 3, `${bent.map((d) => `${d.x},${d.y}`)}`);
});

test("symmetry, the stabiliser, and brushes kept in range", () => {
  assert.deepEqual(mirrored([10, 20], "vertical", 100, 100), [[10, 20], [90, 20]]);
  assert.equal(mirrored([10, 20], "radial6", 100, 100).length, 6);
  assert.deepEqual(stabilize([0, 0], [10, 0], 0), [10, 0]);
  assert.ok(stabilize([0, 0], [10, 0], 5)[0] < 3);
  const wild = tidyBrush({ size: 9999, spacing: -1, tip: "nonsense" as never });
  assert.equal(wild.size, 500);
  assert.equal(wild.spacing, 0.02);
  assert.equal(wild.tip, "round");
  assert.equal(new Set(BUILT_IN_BRUSHES.map((b) => b.id)).size, BUILT_IN_BRUSHES.length);
});

test("old strokes move into canvas pixels", () => {
  const old = { id: "a", points: [0.5, 0.25], color: "#000", size: 44 };
  const now = legacyToDoc(old, 1600, 1000);
  assert.deepEqual(now.points, [800, 250]);
  assert.equal(now.size, 160);
  assert.equal(legacyToDoc(now, 1600, 1000), now);
  assert.deepEqual(trimPoints([1.13, 2.9]), [1.25, 3]);
});

test("a selection's outline runs round its edge, joined up", () => {
  const edges = maskEdges(rectMask(10, 10, 2, 3, 6, 8));
  // A box is four straight runs.
  assert.equal(edges.length, 16);
  const lengths = [];
  for (let i = 0; i < edges.length; i += 4) lengths.push(Math.hypot(edges[i + 2] - edges[i], edges[i + 3] - edges[i + 1]));
  assert.deepEqual(lengths.sort((a, b) => a - b), [4, 4, 5, 5]);
  assert.deepEqual(maskEdges(rectMask(4, 4, 0, 0, 0, 0)), []);
});

test("the view: fit centres the picture, zoom and turn keep the point under the cursor", () => {
  const v = fit({ w: 1600, h: 1200 }, 800, 600);
  const [cx, cy] = applyMat(viewMatrix(v), 800, 600);
  assert.ok(Math.abs(cx - 400) < 1e-6 && Math.abs(cy - 300) < 1e-6);
  const before = toDoc(v, 123, 456);
  const zoomed = zoomAt(v, 2.5, 123, 456);
  const after = toDoc(zoomed, 123, 456);
  assert.ok(Math.abs(before[0] - after[0]) < 1e-6 && Math.abs(before[1] - after[1]) < 1e-6);
  const turned = rotateAt({ ...v, flip: true }, 0.7, 50, 60);
  const t = toDoc(turned, 50, 60);
  const f = toDoc({ ...v, flip: true }, 50, 60);
  assert.ok(Math.abs(t[0] - f[0]) < 1e-6 && Math.abs(t[1] - f[1]) < 1e-6);
  const pinned = pin(v, 10, 20, 300, 200);
  const p = applyMat(viewMatrix(pinned), 10, 20);
  assert.ok(Math.abs(p[0] - 300) < 1e-6 && Math.abs(p[1] - 200) < 1e-6);
  const m = viewMatrix({ x: 5, y: 7, zoom: 3, rot: 1, flip: true });
  const id = multiply(m, invert(m));
  [1, 0, 0, 1, 0, 0].forEach((v2, i) => assert.ok(Math.abs(id[i] - v2) < 1e-9));
});

test("the free transform: a dragged corner follows the pointer, the middle stays", () => {
  const box = { x: 100, y: 100, w: 200, h: 100 };
  assert.deepEqual(warpMatrix(box, NO_WARP).map((v) => Math.round(v * 1e9) / 1e9 + 0), [1, 0, 0, 1, 0, 0]);
  const warp = scaleTo(box, NO_WARP, 400, 250, [1, 1], false);
  const corners = warpCorners(box, warp);
  assert.ok(Math.abs(corners[2][0] - 400) < 1e-6 && Math.abs(corners[2][1] - 250) < 1e-6);
  // The opposite corner mirrors it about the middle.
  assert.ok(Math.abs(corners[0][0] - 0) < 1e-6 && Math.abs(corners[0][1] - 50) < 1e-6);
  const even = scaleTo(box, NO_WARP, 400, 160, [1, 1], true);
  assert.equal(even.sx, even.sy);
  const turned = warpCorners(box, { ...NO_WARP, rot: Math.PI });
  assert.ok(Math.abs(turned[0][0] - 300) < 1e-6 && Math.abs(turned[0][1] - 200) < 1e-6);
});
