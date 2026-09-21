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
