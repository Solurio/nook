// A grid laid on the table -- squares or hexes, over a map or bare -- and the
// pieces that sit on it. A piece let go over a grid settles into the middle of
// the cell it landed in, the way a mini finds its square.
//
// Hexes are pointy-topped, in rows that shift half a cell each row. `cell` is
// the width of a hex across its flat sides; the corner-to-centre distance is
// cell / sqrt(3).

export type GridShape = "square" | "hex";

export interface GridData {
  shape: GridShape;
  /** Across one cell, in room pixels. */
  cell: number;
  color: string;
  opacity: number;
  /** A map underneath, if there is one. */
  image?: string;
  /** Letters across, numbers down, for calling out "C4". */
  labels?: boolean;
}

export type TokenShape = "round" | "square";

export interface TokenData {
  label: string;
  color: string;
  shape: TokenShape;
  image?: string;
}

export const MIN_CELL = 16;
export const MAX_CELL = 240;
export const TOKEN_COLORS = ["#e0655c", "#6aa9e0", "#a6d189", "#f6c177", "#c4a7f0", "#f2a4b8", "#8fd3c8", "#f4efe6", "#3a3149"];

export function emptyGrid(): GridData {
  return { shape: "square", cell: 48, color: "#f4efe6", opacity: 0.3, labels: false };
}

export function emptyToken(): TokenData {
  return { label: "", color: TOKEN_COLORS[Math.floor(Math.random() * 5)], shape: "round" };
}

const SQRT3 = Math.sqrt(3);

/** The middle of the square cell a point falls in, relative to the grid's corner. */
export function snapSquare(x: number, y: number, cell: number): { x: number; y: number } {
  return {
    x: (Math.floor(x / cell) + 0.5) * cell,
    y: (Math.floor(y / cell) + 0.5) * cell,
  };
}

/** The centre of hex (q, r), relative to the grid's corner. */
export function hexCenter(q: number, r: number, cell: number): { x: number; y: number } {
  const size = cell / SQRT3;
  return { x: cell / 2 + cell * (q + r / 2), y: size + 1.5 * size * r };
}

/** The hex a point falls in, as axial coordinates. */
export function hexAt(x: number, y: number, cell: number): { q: number; r: number } {
  const size = cell / SQRT3;
  const px = x - cell / 2;
  const py = y - size;
  const qf = ((SQRT3 / 3) * px - (1 / 3) * py) / size;
  const rf = ((2 / 3) * py) / size;
  // Round in cube coordinates, fixing whichever axis drifted furthest.
  const sf = -qf - rf;
  let q = Math.round(qf);
  let r = Math.round(rf);
  const s = Math.round(sf);
  const dq = Math.abs(q - qf);
  const dr = Math.abs(r - rf);
  const ds = Math.abs(s - sf);
  if (dq > dr && dq > ds) q = -r - s;
  else if (dr > ds) r = -q - s;
  return { q: q + 0, r: r + 0 };
}

export function snapHex(x: number, y: number, cell: number): { x: number; y: number } {
  const { q, r } = hexAt(x, y, cell);
  return hexCenter(q, r, cell);
}

export function snap(shape: GridShape, x: number, y: number, cell: number): { x: number; y: number } {
  return shape === "hex" ? snapHex(x, y, cell) : snapSquare(x, y, cell);
}

/** The six corners of a hex around its centre. */
export function hexCorners(cx: number, cy: number, cell: number): Array<[number, number]> {
  const size = cell / SQRT3;
  return Array.from({ length: 6 }, (_, i) => {
    const angle = (Math.PI / 180) * (60 * i - 30);
    return [cx + size * Math.cos(angle), cy + size * Math.sin(angle)] as [number, number];
  });
}

/** Column letters the way a spreadsheet does them: A..Z, AA, AB... */
export function columnName(n: number): string {
  let out = "";
  let i = n;
  do {
    out = String.fromCharCode(65 + (i % 26)) + out;
    i = Math.floor(i / 26) - 1;
  } while (i >= 0);
  return out;
}

// ---------------------------------------------------------------------------
// Things tied together
// ---------------------------------------------------------------------------

/**
 * Linking `a` to `b`: they end up in one group. If either was already in a
 * group, everything in both groups joins the one kept -- linking a piece to a
 * map it is already tied to changes nothing.
 */
export function linkGroups(
  groups: Record<string, string | undefined>,
  a: string,
  b: string,
  fresh: string,
): Record<string, string> {
  const keep = groups[a] ?? groups[b] ?? fresh;
  const merge = new Set([groups[a], groups[b]].filter((g): g is string => Boolean(g)));
  const out: Record<string, string> = {};
  for (const [id, group] of Object.entries(groups)) {
    if (id === a || id === b || (group && merge.has(group))) out[id] = keep;
  }
  out[a] = keep;
  out[b] = keep;
  return out;
}

/**
 * Taking one thing out of its group. If that leaves a group of one, the last
 * one is let go as well: a group of one is just a thing.
 */
export function unlink(groups: Record<string, string | undefined>, id: string): string[] {
  const group = groups[id];
  if (!group) return [];
  const rest = Object.keys(groups).filter((other) => other !== id && groups[other] === group);
  return rest.length === 1 ? [id, rest[0]] : [id];
}
