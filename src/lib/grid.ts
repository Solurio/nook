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
  /** How much ground one cell stands for: 5 feet, 1.5 metres... */
  unit?: Unit;
  /** Areas laid on the map -- a fireball, a cone of cold, a wall -- for everyone to see. */
  areas?: Area[];
}

export interface Unit {
  size: number;
  name: "ft" | "m";
}

export type AreaKind = "circle" | "cone" | "square" | "line";

export interface Area {
  id: string;
  kind: AreaKind;
  /** Where it starts, in the grid's own pixels. */
  x: number;
  y: number;
  /** Where it was dragged to: the direction, and how far. */
  tx: number;
  ty: number;
  color: string;
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

// ---------------------------------------------------------------------------
// Measuring, and areas of effect
// ---------------------------------------------------------------------------

export const UNIT_PRESETS: Unit[] = [
  { size: 5, name: "ft" },
  { size: 10, name: "ft" },
  { size: 1.5, name: "m" },
  { size: 1, name: "m" },
  { size: 2, name: "m" },
];
export const DEFAULT_UNIT: Unit = { size: 5, name: "ft" };
export const MAX_AREAS = 40;
export const AREA_COLORS = ["#f08f6a", "#8bc7e8", "#a6d189", "#c4a7f0"];

/** The next of the usual scales, for a button that cycles through them. */
export function nextUnit(unit: Unit | undefined): Unit {
  const at = UNIT_PRESETS.findIndex((u) => u.size === unit?.size && u.name === unit?.name);
  return UNIT_PRESETS[(at + 1) % UNIT_PRESETS.length];
}

export const unitText = (unit: Unit | undefined) => `${(unit ?? DEFAULT_UNIT).size} ${(unit ?? DEFAULT_UNIT).name}`;

/**
 * Cells from one point to another the way tabletop games count them: on
 * squares a diagonal step is one step, on hexes it is hex steps.
 */
export function cellsBetween(shape: GridShape, cell: number, ax: number, ay: number, bx: number, by: number): number {
  if (shape === "hex") {
    const a = hexAt(ax, ay, cell);
    const b = hexAt(bx, by, cell);
    const dq = a.q - b.q;
    const dr = a.r - b.r;
    return Math.max(Math.abs(dq), Math.abs(dr), Math.abs(dq + dr));
  }
  const dx = Math.floor(ax / cell) - Math.floor(bx / cell);
  const dy = Math.floor(ay / cell) - Math.floor(by / cell);
  return Math.max(Math.abs(dx), Math.abs(dy));
}

/** A distance in cells, said in the grid's units. */
export function distanceText(cells: number, unit: Unit | undefined): string {
  const u = unit ?? DEFAULT_UNIT;
  const amount = Math.round(cells * u.size * 10) / 10;
  return `${amount} ${u.name} · ${cells} ${cells === 1 ? "square" : "squares"}`;
}

/** Where an area starts: on a corner for squares, the middle of a hex for hexes. */
export function areaAnchor(shape: GridShape, cell: number, x: number, y: number): { x: number; y: number } {
  if (shape === "hex") return snapHex(x, y, cell);
  return { x: Math.round(x / cell) * cell, y: Math.round(y / cell) * cell };
}

/**
 * How big an area is, in whole cells -- never less than one. A cube goes by
 * its longer side, so dragging corner to corner makes the cube you drew.
 */
export function areaCells(area: Area, cell: number): number {
  const dx = Math.abs(area.tx - area.x);
  const dy = Math.abs(area.ty - area.y);
  const reach = area.kind === "square" ? Math.max(dx, dy) : Math.hypot(dx, dy);
  return Math.max(1, Math.round(reach / cell));
}

/** The outline of an area in the grid's pixels. A circle comes back as a centre and a radius. */
export function areaShape(
  area: Area,
  cell: number,
): { circle: { cx: number; cy: number; r: number } } | { points: Array<[number, number]> } {
  const length = areaCells(area, cell) * cell;
  const dx = area.tx - area.x;
  const dy = area.ty - area.y;
  const d = Math.hypot(dx, dy) || 1;
  const ux = dx / d;
  const uy = dy / d;
  // At right angles to the drag.
  const px = -uy;
  const py = ux;
  switch (area.kind) {
    case "circle":
      return { circle: { cx: area.x, cy: area.y, r: length } };
    case "cone": {
      // As wide at its end as it is long, the way the rulebooks draw one.
      const endX = area.x + ux * length;
      const endY = area.y + uy * length;
      return {
        points: [
          [area.x, area.y],
          [endX + (px * length) / 2, endY + (py * length) / 2],
          [endX - (px * length) / 2, endY - (py * length) / 2],
        ],
      };
    }
    case "line": {
      // One cell wide, as long as it was dragged.
      const half = cell / 2;
      const endX = area.x + ux * length;
      const endY = area.y + uy * length;
      return {
        points: [
          [area.x + px * half, area.y + py * half],
          [endX + px * half, endY + py * half],
          [endX - px * half, endY - py * half],
          [area.x - px * half, area.y - py * half],
        ],
      };
    }
    case "square": {
      // A cube from the corner it starts on, out the way it was dragged.
      const sx = dx < 0 ? -1 : 1;
      const sy = dy < 0 ? -1 : 1;
      return {
        points: [
          [area.x, area.y],
          [area.x + sx * length, area.y],
          [area.x + sx * length, area.y + sy * length],
          [area.x, area.y + sy * length],
        ],
      };
    }
  }
}

export function areaText(area: Area, cell: number, unit: Unit | undefined): string {
  const u = unit ?? DEFAULT_UNIT;
  const size = Math.round(areaCells(area, cell) * u.size * 10) / 10;
  const word = { circle: "radius", cone: "cone", square: "cube", line: "line" }[area.kind];
  return `${size} ${u.name} ${word}`;
}
