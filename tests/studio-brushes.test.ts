import { test } from "node:test";
import assert from "node:assert/strict";
import zlib from "node:zlib";
import { BUILT_IN_BRUSHES, dabsAlong, taperLength, tidyBrush } from "../src/lib/studio/brush.ts";
import { brushFromFa, inkOf, isColourful, parseBrushes, readMdp, shrink, tipPictures } from "../src/lib/studio/firealpaca.ts";
import { firealpacaBrushes } from "../src/lib/studio/firealpaca-pack.ts";
import { applyFilter, FILTERS, filterSettings } from "../src/lib/studio/filters.ts";
import { shownLayers, tidyAnimation } from "../src/lib/studio/animation.ts";

test("a stroke drawn live comes out the same as the finished one, dab for dab, but for its thin end", () => {
  const spec = tidyBrush({ ...BUILT_IN_BRUSHES[0], size: 10, spacing: 0.3, jitterSize: 0.5, scatter: 0.4, jitterAngle: 90, taperIn: 0.2, taperOut: 0.2, count: 3 });
  const points: number[] = [];
  for (let i = 0; i < 60; i += 1) points.push(i * 4, Math.sin(i / 5) * 30);
  const finished = dabsAlong(points, undefined, spec, "s");
  // Drawn so far: the first 40 points, live.
  const partway = dabsAlong(points.slice(0, 80), undefined, spec, "s", true);
  const whole = dabsAlong(points, undefined, spec, "s", true);
  // Everything drawn partway is still there, unchanged, once the stroke has grown.
  assert.deepEqual(whole.slice(0, partway.length), partway);
  // Only the end, which live drawing leaves thick, differs from the finished stroke.
  const endsAt = finished.length - 1;
  assert.deepEqual(finished.slice(0, 10), whole.slice(0, 10));
  assert.ok(finished[endsAt].size < whole[endsAt].size || finished[endsAt].size <= spec.size * 0.3);
  // Three particles a step.
  assert.equal(finished.length % 3, 0);
});

test("thin ends are brush widths long, shared out on a short stroke", () => {
  assert.equal(taperLength(0.5, 10), 60);
  const spec = tidyBrush({ ...BUILT_IN_BRUSHES[0], size: 10, spacing: 0.1, taperIn: 0.5, taperOut: 0.5 });
  const short = dabsAlong([0, 0, 20, 0], undefined, spec, "s");
  // A 20px stroke cannot have two 60px ends: it thins in and out within its length.
  const mid = short[Math.floor(short.length / 2)];
  assert.ok(mid.size > short[0].size && mid.size > short.at(-1)!.size);
});

test("a picture brush's settings are kept; one without its picture draws round", () => {
  const b = tidyBrush({ tip: "image", images: ["https://x.test/a.png", "javascript:alert(1)"], colorful: true, blend: "add", count: 5, mix: 0.3, pressureMin: 0.4 });
  assert.equal(b.tip, "image");
  assert.deepEqual(b.images, ["https://x.test/a.png"]);
  assert.equal(b.colorful, true);
  assert.equal(b.blend, "add");
  assert.equal(b.count, 5);
  const bare = tidyBrush({ tip: "roller" });
  assert.equal(bare.tip, "round");
  assert.equal(bare.images, undefined);
  // An old brush gains nothing it did not have.
  assert.deepEqual(Object.keys(tidyBrush(BUILT_IN_BRUSHES[0])).sort(), Object.keys(tidyBrush({ ...BUILT_IN_BRUSHES[0] })).sort());
  assert.equal("blend" in tidyBrush(BUILT_IN_BRUSHES[0]), false);
});

test("FireAlpaca's brush list is read, entities and all", () => {
  const xml = `<?xml version="1.0"?><Root><Brushes>
    <Brush type="pen" name="Ink &amp; wash" R="12" minR="0.3" alpha="0.8" pressWidth="true" pressTrans="false" iriNuki="true" ppFadeInLen="0.4" ppFadeOutLen="0.2" />
    <Brush type="bitmap" name="Paws" R="80" alpha="1" pressWidth="true" pressTrans="false" file="paw.png" option0="100" option1="1" option2="75" option3="50" option8="0" />
    <Brush type="scatter" name="Glitter" blend="add" R="100" alpha="1" pressWidth="false" pressTrans="false" file="g.mdp" option0="20" option1="100" option2="40" option3="1" option4="50" option8="14" />
    <Brush type="roller" name="Tape" R="150" alpha="1" pressWidth="true" pressTrans="false" file="t.mdp" option0="0" />
    <Brush type="program" name="Dots" R="10" alpha="1" pressWidth="true" pressTrans="true" file="mizutama.bs" />
  </Brushes></Root>`;
  const list = parseBrushes(xml);
  assert.equal(list.length, 5);
  assert.equal(list[0].name, "Ink & wash");
  const pen = brushFromFa(list[0], "a");
  assert.equal(pen.size, 12);
  assert.equal(pen.opacity, 0.8);
  assert.equal(pen.pressureMin, 0.3);
  assert.equal(pen.pressureOpacity, false);
  assert.ok(pen.taperIn > pen.taperOut);
  const paws = brushFromFa(list[1], "b", ["https://x.test/p.png"]);
  assert.equal(paws.tip, "image");
  assert.equal(paws.spacing, 1);
  assert.equal(paws.follow, true);
  assert.equal(paws.angle, 90);
  assert.equal(paws.jitterAngle, 90);
  const glitter = brushFromFa(list[2], "c", ["https://x.test/g.png"]);
  assert.equal(glitter.blend, "add");
  assert.equal(glitter.count, 3);
  assert.equal(glitter.jitterAngle, 180);
  assert.equal(brushFromFa(list[3], "d", ["https://x.test/t.png"], true).tip, "roller");
  // Without its picture, a picture brush still draws.
  assert.equal(brushFromFa(list[1], "e").tip, "round");
  assert.equal(brushFromFa(list[4], "f").spacing, 2);
});

/** A tiny .mdp: one 8-bit ink layer and one full-colour layer, in 128-pixel tiles. */
function makeMdp(): Uint8Array {
  const w = 130;
  const h = 4;
  const tile = (bytes: Uint8Array) => zlib.deflateSync(bytes);
  const layerChunk = (tiles: Array<{ col: number; row: number; data: Buffer }>) => {
    const parts: Buffer[] = [];
    const head = Buffer.alloc(8);
    head.writeUInt32LE(tiles.length, 0);
    head.writeUInt32LE(128, 4);
    parts.push(head);
    for (const t of tiles) {
      const th = Buffer.alloc(16);
      th.writeUInt32LE(t.col, 0);
      th.writeUInt32LE(t.row, 4);
      th.writeUInt32LE(t.data.length, 12);
      parts.push(th, t.data, Buffer.alloc((4 - (t.data.length % 4)) % 4));
    }
    return Buffer.concat(parts);
  };
  // Layer 0: ink, solid at x=0 and at x=129 (the second tile).
  const ink0 = new Uint8Array(128 * 128);
  ink0[0] = 255;
  const ink1 = new Uint8Array(128 * 128);
  ink1[1] = 200;
  // Layer 1: one red pixel at (2, 1), stored BGRA.
  const colour = new Uint8Array(128 * 128 * 4);
  colour.set([0, 0, 255, 255], (1 * 128 + 2) * 4);
  const chunks = [
    { name: "layer0img", data: layerChunk([{ col: 0, row: 0, data: tile(ink0) }, { col: 1, row: 0, data: tile(ink1) }]) },
    { name: "layer1img", data: layerChunk([{ col: 0, row: 0, data: tile(colour) }]) },
  ];
  const xml = Buffer.from(
    `<?xml version="1.0" encoding="UTF-8" ?><Mdiapp width="${w}" height="${h}"><Layers><Layer name="top" width="${w}" height="${h}" binType="2" bin="layer1img" type="32bpp" /><Layer name="ink" width="${w}" height="${h}" color="FF000000" binType="2" bin="layer0img" type="8bpp" /></Layers></Mdiapp>`,
  );
  const pacs = chunks.map(({ name, data }) => {
    const head = Buffer.alloc(132);
    head.write("PAC ", 0, "latin1");
    head.writeUInt32LE(132 + data.length, 4);
    head.writeUInt32LE(0, 8);
    head.writeUInt32LE(data.length, 12);
    head.writeUInt32LE(data.length, 16);
    head.write(name, 68, "latin1");
    return Buffer.concat([head, data]);
  });
  const header = Buffer.alloc(20);
  header.write("mdipack", 0, "latin1");
  header.writeUInt32LE(xml.length, 12);
  header.writeUInt32LE(pacs.reduce((n, p) => n + p.length, 0), 16);
  return new Uint8Array(Buffer.concat([header, xml, ...pacs]));
}

test("an .mdp's layers come out in their tiles, bottom layer first", async () => {
  const mdp = await readMdp(makeMdp(), async (d) => new Uint8Array(zlib.inflateSync(d)));
  assert.equal(mdp.w, 130);
  assert.equal(mdp.layers.length, 2);
  const [ink, top] = mdp.layers;
  assert.equal(ink.name, "ink");
  assert.equal(ink.data[3], 255, "the first tile's first pixel is ink");
  assert.equal(ink.data[(129) * 4 + 3], 200, "the second tile lands 128 pixels along");
  assert.deepEqual([...top.data.subarray((1 * 130 + 2) * 4, (1 * 130 + 2) * 4 + 4)], [255, 0, 0, 255]);
  // One picture made of both, in colour; or the two as variants for a scatter brush.
  const bitmap = tipPictures({ type: "bitmap", name: "x", attrs: { option8: "0" } }, mdp.layers, mdp.w, mdp.h);
  assert.equal(bitmap.pictures.length, 1);
  const scatter = tipPictures({ type: "scatter", name: "x", attrs: {} }, mdp.layers, mdp.w, mdp.h);
  assert.equal(scatter.pictures.length, 2);
});

test("a picture is read as ink the way FireAlpaca reads it, and shrunk by averaging", () => {
  const px = new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255, 128, 128, 128, 255, 0, 0, 0, 0]);
  const ink = inkOf({ w: 4, h: 1, data: px });
  assert.deepEqual([ink.data[3], ink.data[7], ink.data[15]], [255, 0, 0]);
  assert.ok(ink.data[11] > 100 && ink.data[11] < 140);
  assert.equal(isColourful({ w: 4, h: 1, data: px }), false);
  assert.equal(isColourful({ w: 1, h: 1, data: new Uint8ClampedArray([255, 0, 0, 255]) }), true);
  const big = { w: 512, h: 256, data: new Uint8ClampedArray(512 * 256 * 4).fill(255) };
  const small = shrink(big, 128);
  assert.deepEqual([small.w, small.h], [128, 64]);
  assert.equal(small.data[3], 255);
});

test("the FireAlpaca set points its pictures at the bucket, and draws round without it", () => {
  const set = firealpacaBrushes("https://p.supabase.co/");
  assert.ok(set.length > 100);
  const pictured = set.find((b) => b.images);
  assert.ok(pictured?.images?.[0].startsWith("https://p.supabase.co/storage/v1/object/public/decorations/brushes/firealpaca/"));
  assert.equal(new Set(set.map((b) => b.id)).size, set.length);
  assert.ok(firealpacaBrushes(undefined).every((b) => b.tip !== "image" && b.tip !== "roller"));
});

test("colour adjustments: brightness, levels, hue and saturation, a gradient map", () => {
  const grey = () => new Uint8ClampedArray([100, 100, 100, 255]);
  const b = grey();
  applyFilter(b, 1, 1, "brightness", 50, null);
  assert.ok(b[0] > 150);
  const l = grey();
  applyFilter(l, 1, 1, "levels", 100, null, "x", { white: 200, gamma: 100 });
  assert.equal(l[0], 0);
  const red = new Uint8ClampedArray([200, 50, 50, 255]);
  applyFilter(red, 1, 1, "hsl", 120, null, "x", { saturation: 0, lightness: 0 });
  assert.ok(red[1] > red[0], "red turned a third of the way round is green");
  const map = new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255]);
  applyFilter(map, 2, 1, "gradientmap", 100, null, "x", { from: "#102030", mid: "#808080", to: "#f0e0d0" });
  assert.deepEqual([...map.subarray(0, 3)], [16, 32, 48]);
  assert.deepEqual([...map.subarray(4, 7)], [240, 224, 208]);
  // Every filter runs on a small picture without falling over.
  for (const f of FILTERS) {
    const px = new Uint8ClampedArray(8 * 8 * 4).map((_, i) => (i * 37) % 256);
    const s = filterSettings(f.kind, NaN, undefined);
    applyFilter(px, 8, 8, f.kind, Number(s.amount ?? 0), null, "x", s);
    assert.equal(px.length, 256, f.kind);
  }
});

test("an animation shows one frame, the ones next to it faint, and the rest of the layers as they are", () => {
  const layers = ["bg", "f1", "f2", "f3", "fg"].map((id) => ({ id, name: id, visible: true, opacity: 1 }));
  const anim = tidyAnimation({ frames: [{ layer: "f1" }, { layer: "f2", hold: 2 }, { layer: "f3" }, { layer: "gone" }], fps: 12, onion: { before: 1, after: 1, opacity: 0.4 }, loop: true }, layers);
  assert.equal(anim?.frames.length, 3, "a frame whose layer went is dropped");
  const drawing = shownLayers(layers, anim, "f2", true);
  assert.deepEqual(
    drawing.map((l) => [l.id, l.visible, l.opacity]),
    [
      ["bg", true, 1],
      ["f1", true, 0.4],
      ["f2", true, 1],
      ["f3", true, 0.4],
      ["fg", true, 1],
    ],
  );
  const playing = shownLayers(layers, anim, "f2", false);
  assert.deepEqual(playing.filter((l) => l.visible).map((l) => l.id), ["bg", "f2", "fg"]);
  assert.equal(tidyAnimation({ frames: [] }, layers), null);
});
