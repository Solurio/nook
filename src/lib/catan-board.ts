// The shape of a Catan board: nineteen hexes, the fifty-four corners where
// settlements go, the seventy-two edges where roads go, and the thirty edges
// round the coast where harbours can sit. Worked out once from hex geometry,
// so every screen numbers them the same way.
//
// Hexes stand point up. Positions are in units of one hex's side; a screen
// scales them however it likes.

export interface Point {
  x: number;
  y: number;
}

export interface HexInfo {
  q: number;
  r: number;
  center: Point;
  /** Its six corners, clockwise from the top right. */
  corners: number[];
  /** Its six sides. */
  edges: number[];
}

export interface VertexInfo extends Point {
  hexes: number[];
  edges: number[];
  /** Corners one road away. */
  neighbors: number[];
}

export interface EdgeInfo {
  a: number;
  b: number;
  hexes: number[];
  mid: Point;
}

const SQRT3 = Math.sqrt(3);

function centerOf(q: number, r: number): Point {
  return { x: SQRT3 * (q + r / 2), y: 1.5 * r };
}

function cornerOf(c: Point, k: number): Point {
  const angle = ((60 * k - 30) * Math.PI) / 180;
  return { x: c.x + Math.cos(angle), y: c.y + Math.sin(angle) };
}

const key = (p: Point) => `${Math.round(p.x * 1000)},${Math.round(p.y * 1000)}`;

function build() {
  const axial: Array<[number, number]> = [];
  for (let r = -2; r <= 2; r += 1) {
    for (let q = Math.max(-2, -r - 2); q <= Math.min(2, -r + 2); q += 1) axial.push([q, r]);
  }

  // Corners, found by position and numbered top to bottom, left to right.
  const found = new Map<string, Point>();
  for (const [q, r] of axial) {
    const c = centerOf(q, r);
    for (let k = 0; k < 6; k += 1) {
      const p = cornerOf(c, k);
      found.set(key(p), p);
    }
  }
  const points = [...found.values()].sort((a, b) => (Math.abs(a.y - b.y) > 1e-6 ? a.y - b.y : a.x - b.x));
  const index = new Map(points.map((p, i) => [key(p), i]));

  const vertices: VertexInfo[] = points.map((p) => ({ x: p.x, y: p.y, hexes: [], edges: [], neighbors: [] }));
  const edgeIndex = new Map<string, number>();
  const edges: EdgeInfo[] = [];
  const hexes: HexInfo[] = axial.map(([q, r], h) => {
    const center = centerOf(q, r);
    const corners = Array.from({ length: 6 }, (_, k) => index.get(key(cornerOf(center, k))) as number);
    const sides: number[] = [];
    for (let k = 0; k < 6; k += 1) {
      const a = Math.min(corners[k], corners[(k + 1) % 6]);
      const b = Math.max(corners[k], corners[(k + 1) % 6]);
      const id = `${a}-${b}`;
      let e = edgeIndex.get(id);
      if (e === undefined) {
        e = edges.length;
        edgeIndex.set(id, e);
        edges.push({ a, b, hexes: [], mid: { x: (vertices[a].x + vertices[b].x) / 2, y: (vertices[a].y + vertices[b].y) / 2 } });
      }
      edges[e].hexes.push(h);
      sides.push(e);
    }
    for (const v of corners) vertices[v].hexes.push(h);
    return { q, r, center, corners, edges: sides };
  });
  edges.forEach((e, i) => {
    vertices[e.a].edges.push(i);
    vertices[e.b].edges.push(i);
    vertices[e.a].neighbors.push(e.b);
    vertices[e.b].neighbors.push(e.a);
  });
  return { hexes, vertices, edges };
}

const BOARD = build();

export const HEXES: readonly HexInfo[] = BOARD.hexes;
export const VERTICES: readonly VertexInfo[] = BOARD.vertices;
export const EDGES: readonly EdgeInfo[] = BOARD.edges;

/** The edges round the coast, going round the island. */
export const COAST: readonly number[] = EDGES.map((e, i) => ({ e, i }))
  .filter(({ e }) => e.hexes.length === 1)
  .sort((a, b) => Math.atan2(a.e.mid.y, a.e.mid.x) - Math.atan2(b.e.mid.y, b.e.mid.x))
  .map(({ i }) => i);

/** Where the nine harbours go: spread round the coast, never two sharing a corner. */
export const HARBOUR_EDGES: readonly number[] = [0, 3, 7, 10, 13, 17, 20, 23, 27].map((i) => COAST[i]);

/** The edge between two corners, if they are next to each other. */
export function edgeBetween(a: number, b: number): number | null {
  const found = VERTICES[a].edges.find((e) => EDGES[e].a === b || EDGES[e].b === b);
  return found ?? null;
}

/** Which hexes neighbour which: the dice-number rule keeps 6s and 8s apart. */
export const HEX_NEIGHBORS: readonly number[][] = HEXES.map((h, i) =>
  HEXES.map((o, j) => ({ o, j }))
    .filter(({ o, j }) => j !== i && Math.hypot(o.center.x - h.center.x, o.center.y - h.center.y) < SQRT3 + 0.01)
    .map(({ j }) => j),
);
