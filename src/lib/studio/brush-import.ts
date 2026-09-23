"use client";

// Bringing brushes in from the painter's own computer: a whole FireAlpaca
// settings folder (or its BrushNew.xml and pictures), or a single picture made
// into a stamp. The pictures are uploaded, the brushes are kept on this device
// with the others someone brought in, and strokes made with them carry them
// everywhere else, as every stroke carries its brush.

import { tidyBrush, type BrushSpec } from "./brush";
import { brushFromFa, inkOf, isColourful, parseBrushes, readMdp, shrink, tipPictures, usesPicture, type Raster } from "./firealpaca";

const KEY = "nook.studio.imported.v1";
export const MAX_IMPORTED = 400;

export function readImported(): BrushSpec[] {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) ?? "[]") as unknown;
    return Array.isArray(list) ? list.map((b) => tidyBrush(b as BrushSpec)) : [];
  } catch {
    return [];
  }
}

export function writeImported(list: BrushSpec[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX_IMPORTED)));
  } catch {
    // Too much for this browser's storage; they stay for this visit.
  }
}

async function pictureOf(file: File): Promise<{ layers: Raster[]; w: number; h: number }> {
  if (file.name.toLowerCase().endsWith(".mdp")) {
    const mdp = await readMdp(new Uint8Array(await file.arrayBuffer()));
    return { layers: mdp.layers.filter((l) => l.visible), w: mdp.w, h: mdp.h };
  }
  const bitmap = await createImageBitmap(file);
  const c = document.createElement("canvas");
  c.width = bitmap.width;
  c.height = bitmap.height;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("the picture could not be read");
  ctx.drawImage(bitmap, 0, 0);
  const r = { w: c.width, h: c.height, data: ctx.getImageData(0, 0, c.width, c.height).data };
  return { layers: [r], w: r.w, h: r.h };
}

async function pngOf(r: Raster, name: string): Promise<File> {
  const c = document.createElement("canvas");
  c.width = r.w;
  c.height = r.h;
  c.getContext("2d")?.putImageData(new ImageData(new Uint8ClampedArray(r.data), r.w, r.h), 0, 0);
  const blob = await new Promise<Blob | null>((resolve) => c.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("the picture could not be made");
  return new File([blob], name, { type: "image/png" });
}

export type Upload = (file: File) => Promise<string | null>;

/**
 * FireAlpaca brushes from the files someone picked: BrushNew.xml, and the
 * pictures from brush_bitmap. Returns the brushes made, and how many had to
 * be left as round ones because their picture was missing or unreadable.
 */
export async function importFireAlpaca(files: File[], upload: Upload, progress: (done: number, total: number) => void): Promise<{ brushes: BrushSpec[]; missing: number }> {
  const lists = files.filter((f) => f.name === "BrushNew.xml");
  // With both FireAlpaca SE and SE3 folders, the newer one.
  const xml = lists.find((f) => /SE3/i.test(f.webkitRelativePath)) ?? lists[0];
  if (!xml) throw new Error("there is no BrushNew.xml among those files");
  const pictures = new Map<string, File>();
  for (const f of files) if (/\.(png|mdp|jpe?g|webp|bmp)$/i.test(f.name)) pictures.set(f.name, f);
  const brushes = parseBrushes(await xml.text());
  const made = new Map<string, { urls: string[]; colourful: boolean }>();
  const out: BrushSpec[] = [];
  const seen = new Set<string>();
  const stamp = Date.now().toString(36);
  let missing = 0;
  let done = 0;
  for (const brush of brushes) {
    done += 1;
    progress(done, brushes.length);
    const sameness = JSON.stringify({ ...brush.attrs, curR: undefined });
    if (seen.has(sameness)) continue;
    seen.add(sameness);
    let urls: string[] = [];
    let colourful = false;
    if (usesPicture(brush)) {
      const key = `${brush.attrs.file}|${brush.type}|${brush.attrs.option0}|${brush.attrs.option8}`;
      try {
        if (!made.has(key)) {
          const file = pictures.get(brush.attrs.file);
          if (!file) throw new Error("missing");
          const { layers, w, h } = await pictureOf(file);
          const tips = tipPictures(brush, layers, w, h);
          const sent: string[] = [];
          for (const [i, picture] of tips.pictures.entries()) {
            const url = await upload(await pngOf(picture, `brush-${i}.png`));
            if (url) sent.push(url);
          }
          made.set(key, { urls: sent, colourful: tips.colourful });
        }
        ({ urls, colourful } = made.get(key) as { urls: string[]; colourful: boolean });
      } catch {
        missing += 1;
      }
    }
    out.push({ ...brushFromFa(brush, `imp-${stamp}-${out.length}`, urls, colourful), source: "imported" });
  }
  return { brushes: out, missing };
}

/** A stamp brush from one picture: its dark parts paint, or its colours, when it has them. */
export async function brushFromPicture(file: File, upload: Upload): Promise<BrushSpec> {
  const { layers } = await pictureOf(file);
  const raw = layers[0];
  // A picture with see-through parts is a shape already; a flat one is read as ink on paper.
  const shaped = raw.data.some((v, i) => i % 4 === 3 && v < 250);
  const colourful = isColourful(raw);
  const picture = shrink(colourful && shaped ? raw : inkOf(raw), 256);
  const url = await upload(await pngOf(picture, "brush.png"));
  if (!url) throw new Error("the picture could not be uploaded");
  return tidyBrush({
    id: `imp-${Date.now().toString(36)}`,
    name: file.name.replace(/\.[^.]+$/, "").slice(0, 40) || "stamp",
    source: "imported",
    tip: "image",
    images: [url],
    colorful: colourful && shaped,
    size: 60,
    spacing: 0.35,
    hardness: 1,
  });
}
