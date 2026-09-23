// Turns a FireAlpaca settings folder into a brush set for the paint studio:
// the pictures its brushes stamp, as PNGs ready for the storage bucket, and a
// list of the brushes for src/lib/studio/firealpaca-pack.ts.
//
//   node --import ./tests/register.mjs scripts/firealpaca-pack.mjs "<FireAlpaca SE3 folder>" <out folder>
//
// then upload the pictures with scripts/upload-folder.mjs <out folder> brushes/firealpaca.
//
// The pictures are FireAlpaca's (and whoever made the brushes someone
// installed), so they go to the bucket, never into this repository; only the
// settings list does, the way the radio lists its songs.

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { brushFromFa, parseBrushes, readMdp, tipPictures, usesPicture } from "../src/lib/studio/firealpaca.ts";

const [folder, out] = process.argv.slice(2);
if (!folder || !out) {
  console.error('usage: node --import ./tests/register.mjs scripts/firealpaca-pack.mjs "<FireAlpaca folder>" <out folder>');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// PNG, just enough of it
// ---------------------------------------------------------------------------

function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error("not a png");
  let at = 8;
  let w = 0;
  let h = 0;
  let depth = 8;
  let type = 6;
  let interlace = 0;
  let palette = null;
  let trns = null;
  const idat = [];
  while (at < buf.length) {
    const len = buf.readUInt32BE(at);
    const tag = buf.toString("latin1", at + 4, at + 8);
    const data = buf.subarray(at + 8, at + 8 + len);
    if (tag === "IHDR") {
      w = data.readUInt32BE(0);
      h = data.readUInt32BE(4);
      depth = data[8];
      type = data[9];
      interlace = data[12];
    } else if (tag === "PLTE") palette = data;
    else if (tag === "tRNS") trns = data;
    else if (tag === "IDAT") idat.push(data);
    at += 12 + len;
  }
  if (interlace || depth !== 8) throw new Error(`png not supported (depth ${depth}, interlace ${interlace})`);
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[type];
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * channels;
  const px = new Uint8ClampedArray(w * h * 4);
  let prev = new Uint8Array(stride);
  for (let y = 0; y < h; y += 1) {
    const filter = raw[y * (stride + 1)];
    const line = new Uint8Array(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    for (let x = 0; x < stride; x += 1) {
      const a = x >= channels ? line[x - channels] : 0;
      const b = prev[x];
      const c = x >= channels ? prev[x - channels] : 0;
      if (filter === 1) line[x] += a;
      else if (filter === 2) line[x] += b;
      else if (filter === 3) line[x] += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        line[x] += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
    }
    for (let x = 0; x < w; x += 1) {
      const o = (y * w + x) * 4;
      const i = x * channels;
      if (type === 6) px.set(line.subarray(i, i + 4), o);
      else if (type === 2) px.set([line[i], line[i + 1], line[i + 2], 255], o);
      else if (type === 0) px.set([line[i], line[i], line[i], 255], o);
      else if (type === 4) px.set([line[i], line[i], line[i], line[i + 1]], o);
      else if (type === 3) {
        const k = line[i];
        px.set([palette[k * 3], palette[k * 3 + 1], palette[k * 3 + 2], trns && k < trns.length ? trns[k] : 255], o);
      }
    }
    prev = line;
  }
  return { w, h, data: px };
}

const CRC = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
const crc = (buf) => {
  let c = -1;
  for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
};
function chunk(tag, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(tag, 4, "latin1");
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(crc(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, tail]);
}
function encodePng({ w, h, data }) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.alloc(h * (w * 4 + 1));
  for (let y = 0; y < h; y += 1) Buffer.from(data.buffer, data.byteOffset + y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

// ---------------------------------------------------------------------------
// The set
// ---------------------------------------------------------------------------

const inflate = async (data) => new Uint8Array(zlib.inflateSync(data));
const brushes = parseBrushes(fs.readFileSync(path.join(folder, "BrushNew.xml"), "utf8"));
fs.mkdirSync(out, { recursive: true });

/** Pictures already made, by the file they came from and whether they were wanted in colour. */
const made = new Map();
const seen = new Set();
const list = [];
let count = 0;

for (const brush of brushes) {
  // The same brush installed twice is listed once.
  const sameness = JSON.stringify({ ...brush.attrs, curR: undefined });
  if (seen.has(sameness)) continue;
  seen.add(sameness);
  let images = [];
  let colourful = false;
  if (usesPicture(brush)) {
    const file = path.join(folder, "brush_bitmap", brush.attrs.file);
    const key = `${brush.attrs.file}|${brush.type}|${brush.attrs.option0}|${brush.attrs.option8}`;
    try {
      if (!made.has(key)) {
        const bytes = fs.readFileSync(file);
        let layers;
        let w;
        let h;
        if (file.toLowerCase().endsWith(".mdp")) {
          const mdp = await readMdp(new Uint8Array(bytes), inflate);
          layers = mdp.layers.filter((l) => l.visible);
          w = mdp.w;
          h = mdp.h;
        } else {
          const png = decodePng(bytes);
          layers = [png];
          w = png.w;
          h = png.h;
        }
        const tips = tipPictures(brush, layers, w, h);
        const names = tips.pictures.map((picture, i) => {
          const name = `t${String(made.size + 1).padStart(3, "0")}${tips.pictures.length > 1 ? `-${i}` : ""}.png`;
          fs.writeFileSync(path.join(out, name), encodePng(picture));
          return name;
        });
        made.set(key, { names, colourful: tips.colourful });
      }
      ({ names: images, colourful } = made.get(key));
    } catch (error) {
      console.warn(`${brush.name}: ${error.message} -- left as a round brush`);
    }
  }
  count += 1;
  list.push({ ...brushFromFa(brush, `fa-${count}`, images.map((n) => `/${n}`), colourful), images: images.length ? images : undefined });
}

fs.writeFileSync(path.join(out, "brushes.json"), JSON.stringify(list, null, 1));

/// The list for the studio: only what differs from a plain brush, one to a line.
const plain = { tip: "round", mode: "paint", size: 12, opacity: 1, flow: 1, hardness: 0.9, spacing: 0.12, jitterSize: 0, jitterOpacity: 0, scatter: 0, angle: 0, jitterAngle: 0, roundness: 1, follow: false, taperIn: 0, taperOut: 0, grain: 0, pressureSize: true, pressureOpacity: false, strength: 0.5 };
const round = (v) => (typeof v === "number" ? Math.round(v * 1000) / 1000 : v);
const lines = list.map((b) => {
  const kept = {};
  for (const [k, v] of Object.entries(b)) {
    if (k === "id" || k === "source" || (k in plain && plain[k] === v)) continue;
    kept[k] = Array.isArray(v) ? v : round(v);
  }
  return "  " + JSON.stringify(kept) + ",";
});
const tick = String.fromCharCode(96);
const source = [
  "// FireAlpaca's brushes, as set up in FireAlpaca on the machine this was",
  "// made from, converted by scripts/firealpaca-pack.mjs. Only the settings are",
  "// here; the pictures the picture brushes stamp are FireAlpaca's (and their",
  "// makers'), so they live in the storage bucket under brushes/firealpaca/,",
  "// the way the radio's songs do. On a site without them those brushes fall",
  "// back to a round tip.",
  "",
  'import { tidyBrush, type BrushSpec } from "./brush";',
  "",
  "const SET: Array<Partial<BrushSpec>> = [",
  ...lines,
  "];",
  "",
  "/** The set, with its pictures fetched from the bucket at " + tick + "base" + tick + " (the Supabase project's address). */",
  "export function firealpacaBrushes(base: string | undefined): BrushSpec[] {",
  "  const root = base ? " + tick + '${base.replace(/\\/$/, "")}/storage/v1/object/public/decorations/brushes/firealpaca/' + tick + " : null;",
  "  return SET.map((b, i) =>",
  "    tidyBrush({",
  "      ...b,",
  "      id: " + tick + "fa-${i + 1}" + tick + ",",
  '      source: "FireAlpaca",',
  "      images: root && b.images ? b.images.map((name) => root + name) : undefined,",
  "    }),",
  "  );",
  "}",
  "",
].join("\n");
fs.writeFileSync(path.join(out, "firealpaca-pack.ts"), source);
console.log(`${list.length} brushes, ${[...made.values()].reduce((n, m) => n + m.names.length, 0)} pictures, and firealpaca-pack.ts for src/lib/studio, in ${out}`);
