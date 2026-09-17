// A small GIF89a encoder, enough to turn a stack of RGBA frames into an
// animated file. Written here rather than pulled in as a dependency: the whole
// app is a static export with no build-time workers, and all this needs is a
// palette, LZW and the container bytes.

export interface GifFrame {
  /** RGBA, width * height * 4. */
  data: Uint8ClampedArray;
  /** How long this frame is shown, in milliseconds. */
  delayMs: number;
}

interface Box {
  colors: number[][];
}

/**
 * Median cut, down to at most `max` colours. Repeatedly splits whichever box
 * covers the widest channel, which keeps detail where the picture has range
 * instead of spending the palette evenly.
 */
function medianCut(pixels: number[][], max: number): number[][] {
  if (pixels.length === 0) return [[0, 0, 0]];
  let boxes: Box[] = [{ colors: pixels }];

  while (boxes.length < max) {
    let target = -1;
    let widest = -1;
    let channel = 0;

    boxes.forEach((box, i) => {
      if (box.colors.length < 2) return;
      for (let c = 0; c < 3; c += 1) {
        let lo = 255;
        let hi = 0;
        for (const colour of box.colors) {
          if (colour[c] < lo) lo = colour[c];
          if (colour[c] > hi) hi = colour[c];
        }
        if (hi - lo > widest) {
          widest = hi - lo;
          target = i;
          channel = c;
        }
      }
    });

    if (target < 0 || widest <= 0) break;

    const box = boxes[target];
    const sorted = box.colors.slice().sort((a, b) => a[channel] - b[channel]);
    const mid = Math.floor(sorted.length / 2);
    boxes = [
      ...boxes.slice(0, target),
      { colors: sorted.slice(0, mid) },
      { colors: sorted.slice(mid) },
      ...boxes.slice(target + 1),
    ];
  }

  return boxes.map((box) => {
    const total = [0, 0, 0];
    for (const colour of box.colors) {
      total[0] += colour[0];
      total[1] += colour[1];
      total[2] += colour[2];
    }
    const n = Math.max(1, box.colors.length);
    return [Math.round(total[0] / n), Math.round(total[1] / n), Math.round(total[2] / n)];
  });
}

/** Builds one palette for every frame, leaving index 0 for transparency. */
export function buildPalette(frames: GifFrame[], max = 255): number[][] {
  const seen = new Map<number, number[]>();
  for (const frame of frames) {
    const { data } = frame;
    // Sampling keeps this quick on big canvases; line art repeats colours a lot.
    const step = Math.max(4, Math.floor(data.length / 4 / 20000) * 4);
    for (let i = 0; i < data.length; i += step) {
      if (data[i + 3] < 128) continue;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const key = (r << 16) | (g << 8) | b;
      if (!seen.has(key)) seen.set(key, [r, g, b]);
    }
  }
  const colours = [...seen.values()];
  return colours.length <= max ? colours : medianCut(colours, max);
}

function nearest(palette: number[][], r: number, g: number, b: number): number {
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < palette.length; i += 1) {
    const dr = palette[i][0] - r;
    const dg = palette[i][1] - g;
    const db = palette[i][2] - b;
    const dist = dr * dr + dg * dg + db * db;
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  }
  return best;
}

/** Writes GIF's LSB-first packed codes as a stream of sub-blocks. */
class BitWriter {
  private bytes: number[] = [];
  private current = 0;
  private bits = 0;

  write(code: number, size: number) {
    this.current |= code << this.bits;
    this.bits += size;
    while (this.bits >= 8) {
      this.bytes.push(this.current & 0xff);
      this.current >>= 8;
      this.bits -= 8;
    }
  }

  finish(): number[] {
    if (this.bits > 0) this.bytes.push(this.current & 0xff);
    return this.bytes;
  }
}

/** GIF-flavoured LZW: variable code width, clear and end codes. */
export function lzwEncode(indices: Uint8Array, minCodeSize: number): number[] {
  const clearCode = 1 << minCodeSize;
  const endCode = clearCode + 1;

  let codeSize = minCodeSize + 1;
  let next = endCode + 1;
  let dict = new Map<string, number>();

  const writer = new BitWriter();
  writer.write(clearCode, codeSize);

  let prefix = indices.length > 0 ? String(indices[0]) : "";

  for (let i = 1; i < indices.length; i += 1) {
    const char = String(indices[i]);
    const combined = `${prefix},${char}`;
    if (dict.has(combined)) {
      prefix = combined;
      continue;
    }

    writer.write(dict.get(prefix) ?? Number(prefix), codeSize);
    dict.set(combined, next);
    next += 1;

    if (next > (1 << codeSize) && codeSize < 12) {
      codeSize += 1;
    } else if (next > 4095) {
      writer.write(clearCode, codeSize);
      dict = new Map();
      next = endCode + 1;
      codeSize = minCodeSize + 1;
    }
    prefix = char;
  }

  if (prefix !== "") writer.write(dict.get(prefix) ?? Number(prefix), codeSize);
  writer.write(endCode, codeSize);
  return writer.finish();
}

function pushSubBlocks(out: number[], bytes: number[]) {
  for (let i = 0; i < bytes.length; i += 255) {
    const chunk = bytes.slice(i, i + 255);
    out.push(chunk.length, ...chunk);
  }
  out.push(0);
}

function pushShort(out: number[], value: number) {
  out.push(value & 0xff, (value >> 8) & 0xff);
}

/**
 * Encodes frames into an animated GIF that loops forever. Index 0 of the
 * palette is reserved as the transparent colour, so anything the drawing has
 * not covered shows through instead of turning black.
 */
export function encodeGif(frames: GifFrame[], width: number, height: number): Uint8Array {
  const palette = buildPalette(frames);
  // Slot 0 is transparency; the real colours follow it.
  const table = [[0, 0, 0], ...palette];

  let bits = 1;
  while (1 << bits < table.length) bits += 1;
  bits = Math.min(8, Math.max(1, bits));
  const tableSize = 1 << bits;

  const out: number[] = [];
  for (const ch of "GIF89a") out.push(ch.charCodeAt(0));

  pushShort(out, width);
  pushShort(out, height);
  out.push(0x80 | ((bits - 1) & 0x07)); // global table, its size
  out.push(0, 0); // background index, pixel aspect

  for (let i = 0; i < tableSize; i += 1) {
    const colour = table[i] ?? [0, 0, 0];
    out.push(colour[0], colour[1], colour[2]);
  }

  // Loop forever.
  out.push(0x21, 0xff, 0x0b);
  for (const ch of "NETSCAPE2.0") out.push(ch.charCodeAt(0));
  out.push(0x03, 0x01);
  pushShort(out, 0);
  out.push(0);

  const minCodeSize = Math.max(2, bits);

  // Matching every pixel against the palette one by one is far too slow on a
  // full canvas. Drawings reuse the same few colours, so remembering the answer
  // per exact colour turns almost all of that work into a map lookup.
  const cache = new Map<number, number>();
  const indexFor = (r: number, g: number, b: number) => {
    const key = (r << 16) | (g << 8) | b;
    const hit = cache.get(key);
    if (hit !== undefined) return hit;
    const found = 1 + nearest(palette, r, g, b);
    cache.set(key, found);
    return found;
  };

  for (const frame of frames) {
    const indices = new Uint8Array(width * height);
    for (let p = 0; p < width * height; p += 1) {
      const o = p * 4;
      if (frame.data[o + 3] < 128) {
        indices[p] = 0;
      } else {
        indices[p] = indexFor(frame.data[o], frame.data[o + 1], frame.data[o + 2]);
      }
    }

    // Graphic control: keep each frame on screen, index 0 is see-through.
    out.push(0x21, 0xf9, 0x04, 0x01);
    pushShort(out, Math.max(2, Math.round(frame.delayMs / 10)));
    out.push(0, 0);

    out.push(0x2c);
    pushShort(out, 0);
    pushShort(out, 0);
    pushShort(out, width);
    pushShort(out, height);
    out.push(0);

    out.push(minCodeSize);
    pushSubBlocks(out, lzwEncode(indices, minCodeSize));
  }

  out.push(0x3b);
  return Uint8Array.from(out);
}
