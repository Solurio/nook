import test from "node:test";
import assert from "node:assert/strict";

import { encodeGif, lzwEncode, buildPalette, type GifFrame } from "../src/lib/gif.ts";

/** The decoder side of GIF's LZW, so the encoder can be checked against it. */
function lzwDecode(bytes: number[], minCodeSize: number): number[] {
  const clearCode = 1 << minCodeSize;
  const endCode = clearCode + 1;

  let codeSize = minCodeSize + 1;
  let dict: number[][] = [];
  const reset = () => {
    dict = [];
    for (let i = 0; i < clearCode; i += 1) dict.push([i]);
    dict.push([], []); // clear and end occupy their slots
    codeSize = minCodeSize + 1;
  };
  reset();

  const out: number[] = [];
  let bitPos = 0;
  let previous: number[] | null = null;

  const readCode = (): number | null => {
    let code = 0;
    for (let i = 0; i < codeSize; i += 1) {
      const byte = bytes[bitPos >> 3];
      if (byte === undefined) return null;
      code |= ((byte >> (bitPos & 7)) & 1) << i;
      bitPos += 1;
    }
    return code;
  };

  for (;;) {
    const code = readCode();
    if (code === null || code === endCode) break;
    if (code === clearCode) {
      reset();
      previous = null;
      continue;
    }

    let entry: number[];
    if (code < dict.length && dict[code].length > 0) {
      entry = dict[code];
    } else if (previous) {
      entry = [...previous, previous[0]];
    } else {
      break;
    }

    out.push(...entry);
    if (previous) {
      dict.push([...previous, entry[0]]);
      // The decoder learns each entry one code later than the encoder made it,
      // so it runs one behind and has to widen a step sooner to stay in step.
      if (dict.length >= 1 << codeSize && codeSize < 12) codeSize += 1;
    }
    previous = entry;
  }

  return out;
}

test("lzw round trips the pixel indices it was given", () => {
  const indices = new Uint8Array([1, 1, 1, 2, 2, 3, 1, 1, 1, 1, 2, 3, 3, 3, 1, 2]);
  const encoded = lzwEncode(indices, 2);
  assert.deepEqual(lzwDecode(encoded, 2), [...indices]);
});

test("lzw survives a long run and a repeating pattern", () => {
  const indices = new Uint8Array(4000);
  for (let i = 0; i < indices.length; i += 1) indices[i] = i < 2000 ? 1 : (i % 5) + 1;
  const encoded = lzwEncode(indices, 4);
  assert.deepEqual(lzwDecode(encoded, 4), [...indices]);
});

/** A solid w*h block of one colour. */
function solid(w: number, h: number, rgb: [number, number, number]): GifFrame {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i += 1) {
    data[i * 4] = rgb[0];
    data[i * 4 + 1] = rgb[1];
    data[i * 4 + 2] = rgb[2];
    data[i * 4 + 3] = 255;
  }
  return { data, delayMs: 100 };
}

test("the palette keeps exact colours while there is room for them", () => {
  const palette = buildPalette([solid(4, 4, [255, 0, 0]), solid(4, 4, [0, 128, 255])]);
  assert.equal(palette.length, 2);
  assert.ok(palette.some((c) => c[0] === 255 && c[1] === 0 && c[2] === 0));
  assert.ok(palette.some((c) => c[0] === 0 && c[1] === 128 && c[2] === 255));
});

test("an encoded gif has the header, a loop block and a trailer", () => {
  const bytes = encodeGif([solid(8, 4, [255, 0, 0]), solid(8, 4, [0, 0, 255])], 8, 4);

  assert.equal(String.fromCharCode(...bytes.slice(0, 6)), "GIF89a");
  assert.equal(bytes[6] | (bytes[7] << 8), 8, "width in the screen descriptor");
  assert.equal(bytes[8] | (bytes[9] << 8), 4, "height in the screen descriptor");
  assert.equal(bytes[bytes.length - 1], 0x3b, "trailer");

  const ascii = String.fromCharCode(...bytes);
  assert.ok(ascii.includes("NETSCAPE2.0"), "loops forever");

  // Two frames means two graphic control extensions.
  let controls = 0;
  for (let i = 0; i + 2 < bytes.length; i += 1) {
    if (bytes[i] === 0x21 && bytes[i + 1] === 0xf9 && bytes[i + 2] === 0x04) controls += 1;
  }
  assert.equal(controls, 2);
});
