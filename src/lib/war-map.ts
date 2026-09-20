/**
 * The board WAR is played on.
 *
 * The rules do not care what the world looks like: forty-two territories and
 * who borders whom live in `lib/war`. This file is only the drawing -- the
 * shape of each territory, where its armies stand, and what sits behind them.
 *
 * That split is what lets a room bring its own map. A custom map is the same
 * shape of data as the world one: a picture to lay down, and a spot (and, if
 * you like, an outline) for each of the forty-two. It travels inside the
 * item's own state, so it is saved and shared like everything else in a room,
 * with no new table and no migration.
 */

import { TERRITORIES, TERRITORY_IDS, type Territory } from "@/lib/war";

export const MAP_W = 1000;
export const MAP_H = 560;

/** Where a territory stands, and the ground it holds. */
export type Spot = {
  x: number;
  y: number;
  /** An outline, as SVG polygon points: "x,y x,y x,y". Absent means a marker. */
  shape?: string;
};

export type MapImage = {
  url: string;
  fit: "cover" | "contain" | "stretch";
  /** 0 to 1. */
  opacity: number;
};

export type WarMapData = {
  name: string;
  image: MapImage | null;
  /** A flat sea colour instead of the painted one. */
  sea: string | null;
  /** Draw the territory outlines, or only the army markers. */
  shapes: boolean;
  labels: boolean;
  /** The dashed lines between neighbours. */
  links: boolean;
  spots: Partial<Record<Territory, Spot>>;
};

export const emptyMap = (): WarMapData => ({
  name: "",
  image: null,
  sea: null,
  shapes: true,
  labels: true,
  links: true,
  spots: {},
});

// ---------------------------------------------------------------------------
// The world, drawn
// ---------------------------------------------------------------------------

/**
 * Forty-two outlines in a 1000x560 sea. Angular on purpose: the coastlines are
 * cut down to a handful of corners each so the whole world is a few kilobytes
 * and still reads as the world from across a room.
 */
const WORLD_SHAPE: Record<string, string> = {
  // North America
  alaska: "26,84 52,58 92,54 104,84 88,112 50,114",
  mackenzie: "92,54 150,44 216,58 214,98 170,120 112,118 88,112 104,84",
  greenland: "262,34 330,26 358,58 340,102 296,110 262,74",
  vancouver: "50,114 88,112 112,118 120,170 96,190 52,176 38,140",
  ottawa: "112,118 170,120 214,98 226,150 208,186 150,192 120,170",
  labrador: "214,98 266,80 298,112 300,152 268,186 208,186 226,150",
  california: "38,140 52,176 96,190 120,170 150,192 146,244 104,262 56,240 30,190",
  newyork: "150,192 208,186 268,186 272,236 230,258 146,244",
  mexico: "120,258 180,252 236,258 244,290 210,318 176,312 142,288",

  // South America
  colombia: "206,330 262,326 296,352 288,386 244,398 206,372",
  peru: "206,372 244,398 252,452 224,486 190,470 186,410",
  brazil: "288,386 296,352 340,364 356,420 330,470 282,478 252,452 244,398",
  argentina: "224,486 252,452 282,478 288,516 262,546 228,536 210,506",

  // Europe
  iceland: "396,74 424,66 440,84 428,102 400,98",
  england: "398,120 428,112 440,132 430,158 404,156 392,140",
  sweden: "452,40 492,32 516,54 508,92 470,100 448,76",
  germany: "448,120 490,110 520,124 518,158 486,172 452,164",
  poland: "452,164 486,172 524,166 536,196 512,220 464,214 444,190",
  france: "392,140 404,156 430,158 452,164 444,190 464,214 430,226 396,210 382,176",
  moscow: "508,92 516,54 560,44 600,64 604,132 570,172 536,196 524,166 518,158 520,124",

  // Africa
  algeria: "408,258 470,244 522,256 528,296 524,322 484,332 432,322 398,292",
  egypt: "528,296 522,256 568,250 590,278 576,316 534,326 524,322",
  sudan: "524,322 534,326 576,316 606,344 600,396 562,408 528,384 522,344",
  congo: "432,322 484,332 524,322 522,344 528,384 496,412 456,400 432,368",
  southafrica: "456,400 496,412 528,384 548,430 530,486 484,502 450,468 442,428",
  madagascar: "578,420 600,412 612,446 596,484 576,470 570,442",

  // Asia
  omsk: "604,132 600,64 648,52 678,76 674,142 636,162 610,170",
  dudinka: "678,76 648,52 702,38 750,50 754,100 716,124 674,142",
  siberia: "754,100 750,50 808,40 854,54 858,96 812,120 760,124",
  vladivostok: "858,96 854,54 902,44 946,62 958,120 938,168 900,172 868,150 862,120",
  chita: "716,124 754,100 760,124 812,120 858,122 868,150 816,166 772,186 724,170",
  mongolia: "772,186 816,166 868,150 900,172 892,214 840,230 788,222",
  japan: "918,196 946,188 964,214 952,254 926,248 912,218",
  aral: "636,162 674,142 716,124 724,170 720,214 676,222 640,200",
  china: "892,214 840,230 788,222 772,186 724,212 782,272 820,304 874,300 904,258",
  middleeast: "610,170 640,200 676,222 672,262 636,292 600,278 586,240 590,198",
  india: "676,222 720,214 782,272 760,318 712,322 672,290 672,262",
  vietnam: "782,272 820,304 814,338 778,342 760,318",

  // Oceania
  sumatra: "790,368 820,360 834,392 812,414 788,404",
  borneo: "846,372 884,364 898,396 876,418 848,404",
  newguinea: "912,362 958,352 978,380 954,404 916,396",
  australia: "856,436 920,424 968,444 970,502 930,538 872,528 844,486",
};

/** Where the armies stand, when the middle of the shape is the wrong place. */
const WORLD_ANCHOR: Record<string, [number, number]> = {
  greenland: [308, 66],
  california: [88, 210],
  moscow: [560, 116],
  vladivostok: [906, 108],
  australia: [908, 478],
  brazil: [306, 418],
};

/** Where each continent signs its name. */
export const CONTINENT_SPOT: Record<string, { x: number; y: number; anchor?: "end" }> = {
  na: { x: 16, y: 30 },
  sa: { x: 300, y: 545 },
  eu: { x: 430, y: 18 },
  af: { x: 380, y: 470 },
  as: { x: 640, y: 30 },
  oc: { x: 985, y: 548, anchor: "end" },
};

// ---------------------------------------------------------------------------
// Matching the drawing to whatever the territories are called
// ---------------------------------------------------------------------------

const plain = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

/** The same land under any of its names, in English or in Portuguese. */
const ALIAS: Record<string, string> = {
  alasca: "alaska",
  territoriosdonoroeste: "mackenzie",
  northwestterritory: "mackenzie",
  groenlandia: "greenland",
  alberta: "vancouver",
  ontario: "ottawa",
  quebec: "labrador",
  westernus: "california",
  westernunitedstates: "california",
  ny: "newyork",
  novayork: "newyork",
  easternus: "newyork",
  easternunitedstates: "newyork",
  centralamerica: "mexico",
  americacentral: "mexico",
  venezuela: "colombia",
  brasil: "brazil",
  islandia: "iceland",
  inglaterra: "england",
  greatbritain: "england",
  suecia: "sweden",
  scandinavia: "sweden",
  escandinavia: "sweden",
  alemanha: "germany",
  northerneurope: "germany",
  europadonorte: "germany",
  polonia: "poland",
  southerneurope: "poland",
  europadosul: "poland",
  franca: "france",
  westerneurope: "france",
  europaocidental: "france",
  moscou: "moscow",
  ukraine: "moscow",
  russia: "moscow",
  ural: "omsk",
  yakutsk: "siberia",
  kamchatka: "vladivostok",
  tchita: "chita",
  irkutsk: "chita",
  mongolia: "mongolia",
  japao: "japan",
  tquiu: "japan",
  afghanistan: "aral",
  afeganistao: "aral",
  orientemedio: "middleeast",
  mideast: "middleeast",
  siam: "vietnam",
  vietna: "vietnam",
  argelia: "algeria",
  northafrica: "algeria",
  africadonorte: "algeria",
  egito: "egypt",
  sudao: "sudan",
  eastafrica: "sudan",
  africaoriental: "sudan",
  centralafrica: "congo",
  africacentral: "congo",
  africadosul: "southafrica",
  indonesia: "sumatra",
  novaguine: "newguinea",
  novaguinea: "newguinea",
};

const canonical = (id: string, name: string): string | null => {
  for (const candidate of [plain(id), plain(name)]) {
    if (WORLD_SHAPE[candidate]) return candidate;
    const alias = ALIAS[candidate];
    if (alias && WORLD_SHAPE[alias]) return alias;
  }
  return null;
};

/** territory id -> the drawing it matched, worked out once. */
const KEY: Partial<Record<Territory, string>> = (() => {
  const out: Partial<Record<Territory, string>> = {};
  for (const id of TERRITORY_IDS) {
    const found = canonical(id, TERRITORIES[id]?.name ?? "");
    if (found) out[id] = found;
  }
  return out;
})();

/** The territories this drawing could not place -- empty when all forty-two matched. */
export const UNPLACED: Territory[] = TERRITORY_IDS.filter((t) => !KEY[t]);

// ---------------------------------------------------------------------------
// Reading a map
// ---------------------------------------------------------------------------

export const points = (shape: string): Array<[number, number]> =>
  shape
    .trim()
    .split(/\s+/)
    .map((pair) => pair.split(",").map(Number) as [number, number])
    .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));

/** The middle of a shape, by area, so the armies stand on the land. */
export function middle(shape: string): [number, number] {
  const ring = points(shape);
  if (ring.length < 3) return ring[0] ?? [MAP_W / 2, MAP_H / 2];
  let area = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % ring.length];
    const cross = x1 * y2 - x2 * y1;
    area += cross;
    cx += (x1 + x2) * cross;
    cy += (y1 + y2) * cross;
  }
  if (!area) return ring[0];
  return [cx / (3 * area), cy / (3 * area)];
}

const worldSpots: Partial<Record<Territory, Spot>> = (() => {
  const out: Partial<Record<Territory, Spot>> = {};
  for (const id of TERRITORY_IDS) {
    const key = KEY[id];
    if (!key) continue;
    const shape = WORLD_SHAPE[key];
    const fixed = WORLD_ANCHOR[key];
    const [x, y] = fixed ?? middle(shape);
    out[id] = { x, y, shape };
  }
  return out;
})();

/** The world map, as a map like any other. */
export const WORLD: WarMapData = { ...emptyMap(), name: "the world", spots: worldSpots };

/** A territory the drawing never heard of falls back to wherever the rules put it. */
const fallback = (t: Territory): Spot => ({
  x: TERRITORIES[t]?.x ?? MAP_W / 2,
  y: TERRITORIES[t]?.y ?? MAP_H / 2,
});

export const spotOf = (map: WarMapData, t: Territory): Spot => map.spots[t] ?? worldSpots[t] ?? fallback(t);

/** The outline to draw, or null for a plain marker. */
export const shapeOf = (map: WarMapData, t: Territory): string | null => {
  if (!map.shapes) return null;
  const own = map.spots[t];
  if (own) return own.shape ?? null;
  return worldSpots[t]?.shape ?? null;
};

/** True once a room has drawn or moved anything of its own. */
export const isCustom = (map: WarMapData): boolean => Boolean(map.image) || Object.keys(map.spots).length > 0;

// ---------------------------------------------------------------------------
// Carrying it in the game's own state
// ---------------------------------------------------------------------------

type WithMap = { map?: Partial<WarMapData> };

/** The map a game is being played on, with anything missing filled in. */
export function readMap(state: unknown): WarMapData {
  const stored = (state as WithMap | undefined)?.map;
  if (!stored) return WORLD;
  return { ...emptyMap(), ...stored, spots: stored.spots ?? {} };
}

/** Carry a room's map across a state the rules built from scratch, like a new deal. */
export function keepMap<T>(from: unknown, to: T): T {
  const map = (from as WithMap | undefined)?.map;
  return map ? { ...(to as T & WithMap), map } : to;
}

/** The same state, on a different map. Null puts the world back. */
export function withMap<T>(state: T, map: WarMapData | null): T {
  const next = { ...(state as T & WithMap) };
  if (map) next.map = map;
  else delete next.map;
  return next;
}

// ---------------------------------------------------------------------------
// Taking one to another room
// ---------------------------------------------------------------------------

export const exportMap = (map: WarMapData): string => JSON.stringify({ nookWarMap: 1, ...map }, null, 1);

export function importMap(text: string): WarMapData | null {
  try {
    const parsed = JSON.parse(text) as Partial<WarMapData> & { nookWarMap?: number };
    if (!parsed || typeof parsed !== "object" || !parsed.spots) return null;
    const spots: Partial<Record<Territory, Spot>> = {};
    for (const id of TERRITORY_IDS) {
      const spot = parsed.spots[id];
      if (!spot || !Number.isFinite(spot.x) || !Number.isFinite(spot.y)) continue;
      spots[id] = {
        x: Math.round(spot.x),
        y: Math.round(spot.y),
        shape: typeof spot.shape === "string" && points(spot.shape).length >= 3 ? spot.shape : undefined,
      };
    }
    return { ...emptyMap(), ...parsed, spots };
  } catch {
    return null;
  }
}