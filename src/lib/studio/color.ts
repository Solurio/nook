// Colours for the paint studio: hex, RGB and HSV, and the wheel between them.

export interface RGB {
  r: number;
  g: number;
  b: number;
}

export interface HSV {
  /** 0..360 */
  h: number;
  /** 0..1 */
  s: number;
  /** 0..1 */
  v: number;
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

export function hexToRgb(hex: string): RGB {
  let h = hex.trim().replace("#", "");
  if (h.length === 3 || h.length === 4) h = h.slice(0, 3).split("").map((c) => c + c).join("");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return { r: Number.isFinite(r) ? r : 0, g: Number.isFinite(g) ? g : 0, b: Number.isFinite(b) ? b : 0 };
}

export function rgbToHex({ r, g, b }: RGB): string {
  const part = (n: number) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, "0");
  return `#${part(r)}${part(g)}${part(b)}`;
}

export function rgbToHsv({ r, g, b }: RGB): HSV {
  const R = r / 255;
  const G = g / 255;
  const B = b / 255;
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  const d = max - min;
  let h = 0;
  if (d) {
    if (max === R) h = ((G - B) / d) % 6;
    else if (max === G) h = (B - R) / d + 2;
    else h = (R - G) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max ? d / max : 0, v: max };
}

export function hsvToRgb({ h, s, v }: HSV): RGB {
  const hh = (((h % 360) + 360) % 360) / 60;
  const c = v * s;
  const x = c * (1 - Math.abs((hh % 2) - 1));
  const m = v - c;
  const [r, g, b] = hh < 1 ? [c, x, 0] : hh < 2 ? [x, c, 0] : hh < 3 ? [0, c, x] : hh < 4 ? [0, x, c] : hh < 5 ? [x, 0, c] : [c, 0, x];
  return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 };
}

export const hexToHsv = (hex: string) => rgbToHsv(hexToRgb(hex));
export const hsvToHex = (hsv: HSV) => rgbToHex(hsvToRgb(hsv));

export function rgba(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r},${g},${b},${clamp(alpha, 0, 1)})`;
}

/** A tidy #rrggbb, or null when the text is not a colour. */
export function parseHex(text: string): string | null {
  const t = text.trim().replace(/^#?/, "#");
  return /^#[0-9a-f]{3}$|^#[0-9a-f]{6}$/i.test(t) ? rgbToHex(hexToRgb(t)) : null;
}

/** A named set of colours to paint from. */
export interface Palette {
  id: string;
  name: string;
  colors: string[];
}

export const BUILT_IN_PALETTES: Palette[] = [
  { id: "basic", name: "basic", colors: ["#000000", "#ffffff", "#7f7f7f", "#e0303a", "#f08a24", "#f4d35e", "#4fae4a", "#2f8fd8", "#6b4bd8", "#d84ba8", "#8a5a33", "#1d6b5f"] },
  { id: "nook", name: "nook", colors: ["#f4efe6", "#1a1420", "#f2a4b8", "#e0655c", "#f6c177", "#f4d35e", "#a6d189", "#4f9d69", "#8bc7e8", "#4f77c4", "#c4a7f0", "#9b5de5"] },
  { id: "skin", name: "skin", colors: ["#ffe0c8", "#f6c9a8", "#e8b08a", "#d69a6e", "#c07f55", "#a0663f", "#80502f", "#5e3a22", "#3f2716"] },
  { id: "pastel", name: "pastel", colors: ["#ffd1dc", "#ffe5b4", "#fff5ba", "#d4f0c0", "#c1e7e3", "#c6dbf0", "#d9ccf5", "#f5d0f0"] },
  { id: "earth", name: "earth", colors: ["#3b2f2f", "#6b4f3a", "#8c6d46", "#a68a64", "#c2b280", "#6b8e23", "#556b2f", "#2f4f4f", "#708090"] },
];

// ---------------------------------------------------------------------------
// The triangle picker: pure hue at one corner, white and black at the other
// two, turning with the hue round the ring. A colour is a blend of the three
// corners, and in HSV terms that blend is simply
//   hue share = s * v, white share = (1 - s) * v, black share = 1 - v.
// ---------------------------------------------------------------------------

export type Point = [number, number];

/** The triangle's corners, pure hue first, for a hue in degrees (0 at the top, going clockwise). */
export function triangleCorners(h: number, cx: number, cy: number, r: number): [Point, Point, Point] {
  const at = (deg: number): Point => {
    const a = (deg * Math.PI) / 180;
    return [cx + r * Math.sin(a), cy - r * Math.cos(a)];
  };
  return [at(h), at(h + 120), at(h + 240)];
}

/** Where a saturation and value sit in the triangle. */
export function svToTriangle(s: number, v: number, [hue, white, black]: [Point, Point, Point]): Point {
  const a = s * v;
  const b = (1 - s) * v;
  const c = 1 - v;
  return [a * hue[0] + b * white[0] + c * black[0], a * hue[1] + b * white[1] + c * black[1]];
}

/** The blend of the three corners at a point, each share at least 0; a point outside lands on the nearest edge. */
export function triangleWeights(x: number, y: number, [p1, p2, p3]: [Point, Point, Point]): [number, number, number] {
  const det = (p2[1] - p3[1]) * (p1[0] - p3[0]) + (p3[0] - p2[0]) * (p1[1] - p3[1]);
  let a = ((p2[1] - p3[1]) * (x - p3[0]) + (p3[0] - p2[0]) * (y - p3[1])) / det;
  let b = ((p3[1] - p1[1]) * (x - p3[0]) + (p1[0] - p3[0]) * (y - p3[1])) / det;
  let c = 1 - a - b;
  if (a >= 0 && b >= 0 && c >= 0) return [a, b, c];
  // Outside: the closest point on whichever edge is nearest.
  const onEdge = (u: Point, w: Point): { d: number; t: number } => {
    const dx = w[0] - u[0];
    const dy = w[1] - u[1];
    const t = clamp(((x - u[0]) * dx + (y - u[1]) * dy) / (dx * dx + dy * dy || 1), 0, 1);
    return { d: Math.hypot(u[0] + t * dx - x, u[1] + t * dy - y), t };
  };
  const e12 = onEdge(p1, p2);
  const e23 = onEdge(p2, p3);
  const e31 = onEdge(p3, p1);
  if (e12.d <= e23.d && e12.d <= e31.d) [a, b, c] = [1 - e12.t, e12.t, 0];
  else if (e23.d <= e31.d) [a, b, c] = [0, 1 - e23.t, e23.t];
  else [a, b, c] = [e31.t, 0, 1 - e31.t];
  return [a, b, c];
}

/** The saturation and value a point in the triangle stands for. */
export function triangleToSv(x: number, y: number, corners: [Point, Point, Point]): { s: number; v: number } {
  const [a, b] = triangleWeights(x, y, corners);
  const v = clamp(a + b, 0, 1);
  return { s: v > 0.0001 ? clamp(a / v, 0, 1) : 0, v };
}

/** Colours that sit well with this one, by where they are round the wheel. */
export function harmonies(hsv: HSV): Array<{ name: string; colors: string[] }> {
  const turn = (deg: number) => hsvToHex({ ...hsv, h: (hsv.h + deg + 360) % 360 });
  return [
    { name: "opposite", colors: [turn(180)] },
    { name: "either side", colors: [turn(-30), turn(30)] },
    { name: "three ways", colors: [turn(120), turn(240)] },
    { name: "split opposite", colors: [turn(150), turn(210)] },
    { name: "four ways", colors: [turn(90), turn(180), turn(270)] },
  ];
}
