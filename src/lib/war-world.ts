// The world a game of WAR is played on, as data: continents, territories,
// borders, and how it is drawn. The rules read everything from here, so a
// room can play the classic board, ancient Greece, or the map of its own RPG
// campaign -- with continents and territories it made up, and objectives that
// name them.
//
// A game carries its world in its own state, so everyone plays the same one
// and it survives a reload. Worlds can also be saved for everyone to use (see
// war-maps.ts and 0008_war_maps.sql).

import {
  CONTINENTS as CLASSIC_CONTINENTS,
  CONTINENT_IDS as CLASSIC_CONTINENT_IDS,
  EDGES as CLASSIC_EDGES,
  TERRITORIES as CLASSIC_TERRITORIES,
  TERRITORY_IDS as CLASSIC_IDS,
} from "./war-classic";
import { WORLD as CLASSIC_DRAWING, middle, nameOf as legacyName, shapeOf as legacyShape, spotOf as legacySpot, type MapImage, type WarMapData } from "./war-map";

export const MAP_W = 1000;
export const MAP_H = 560;

export type Shape = "square" | "circle" | "triangle";
export const SHAPES: Shape[] = ["square", "circle", "triangle"];

export interface WarContinent {
  id: string;
  name: string;
  /** Armies for holding all of it. */
  bonus: number;
  tint: string;
  /** Where its name is written; worked out from its territories when absent. */
  label?: { x: number; y: number };
}

export interface WarTerritory {
  id: string;
  name: string;
  continent: string;
  x: number;
  y: number;
  /** An outline, as SVG polygon points. Absent means a marker. */
  shape?: string;
  /** The figure on its card; given out in turn when absent. */
  figure?: Shape;
}

/** What an objective card asks for, before it is dealt. */
export type ObjectiveSpec =
  | { kind: "continents"; need: string[]; plusOne?: boolean }
  | { kind: "territories"; count: number; armies: number }
  /** One card per colour at the table: destroy that colour. */
  | { kind: "destroy" };

export interface WarWorld {
  version: 1;
  name: string;
  continents: WarContinent[];
  territories: WarTerritory[];
  borders: Array<[string, string]>;
  image: MapImage | null;
  sea: string | null;
  /** Draw the outlines, or only the markers. */
  shapes: boolean;
  labels: boolean;
  /** Draw the borders as lines. */
  links: boolean;
  /** The objectives for this world; worked out from its continents when absent. */
  objectives?: ObjectiveSpec[];
}

// ---------------------------------------------------------------------------
// Rules a table can change
// ---------------------------------------------------------------------------

export interface WarRules {
  /** Reinforcements are your territories divided by this... */
  divisor: number;
  /** ...and never fewer than this. */
  minimum: number;
  /** What each trade of three cards is worth, in order, counted across the whole table. */
  trades: number[];
  /** After the list runs out, each trade is worth this much more than the one before. */
  tradeStep: number;
  /** Extra armies on each traded card's territory, if you hold it. */
  ownedCardBonus: number;
  /** With this many cards you have to trade. */
  mustTradeAt: number;
  attackDice: number;
  defendDice: number;
  /** A tie on the dice goes to the defence (the classic rule), or the attacker. */
  tiesToDefence: boolean;
  /** Secret objectives, or the last one standing wins. */
  goal: "objectives" | "conquest";
  /** Include a "destroy this colour" card for every colour at the table. */
  destroyObjectives: boolean;
  /** The first round is only placing armies. */
  placeFirstRound: boolean;
  /** Territory cards at all. */
  cards: boolean;
  jokers: number;
}

export const DEFAULT_RULES: WarRules = {
  divisor: 2,
  minimum: 3,
  trades: [4, 6, 8, 10, 12, 15],
  tradeStep: 5,
  ownedCardBonus: 2,
  mustTradeAt: 5,
  attackDice: 3,
  defendDice: 3,
  tiesToDefence: true,
  goal: "objectives",
  destroyObjectives: true,
  placeFirstRound: true,
  cards: true,
  jokers: 2,
};

const clampInt = (n: unknown, lo: number, hi: number, fallback: number) => {
  const v = Math.round(Number(n));
  return Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : fallback;
};

/** Rules as saved, with anything missing or out of range put right. */
export function tidyRules(raw: Partial<WarRules> | undefined): WarRules {
  const r = { ...DEFAULT_RULES, ...(raw ?? {}) };
  const trades = (Array.isArray(r.trades) ? r.trades : DEFAULT_RULES.trades)
    .map((n) => clampInt(n, 0, 999, 0))
    .filter((n) => n > 0)
    .slice(0, 20);
  return {
    divisor: clampInt(r.divisor, 1, 10, 2),
    minimum: clampInt(r.minimum, 0, 50, 3),
    trades: trades.length ? trades : DEFAULT_RULES.trades,
    tradeStep: clampInt(r.tradeStep, 0, 100, 5),
    ownedCardBonus: clampInt(r.ownedCardBonus, 0, 20, 2),
    mustTradeAt: clampInt(r.mustTradeAt, 3, 20, 5),
    attackDice: clampInt(r.attackDice, 1, 6, 3),
    defendDice: clampInt(r.defendDice, 1, 6, 3),
    tiesToDefence: r.tiesToDefence !== false,
    goal: r.goal === "conquest" ? "conquest" : "objectives",
    destroyObjectives: r.destroyObjectives !== false,
    placeFirstRound: r.placeFirstRound !== false,
    cards: r.cards !== false,
    jokers: clampInt(r.jokers, 0, 10, 2),
  };
}

/** Armies for the nth trade of the game, counted across every player. */
export function tradeValueFor(rules: WarRules, tradesSoFar: number): number {
  const table = rules.trades;
  if (tradesSoFar < table.length) return table[tradesSoFar];
  return table[table.length - 1] + rules.tradeStep * (tradesSoFar - table.length + 1);
}

// ---------------------------------------------------------------------------
// The worlds that come with the game
// ---------------------------------------------------------------------------

const blank = (): Omit<WarWorld, "name" | "continents" | "territories" | "borders"> => ({
  version: 1,
  image: null,
  sea: null,
  shapes: true,
  labels: true,
  links: true,
});

/** The classic board, with its fourteen official objectives. */
export const CLASSIC: WarWorld = {
  ...blank(),
  name: "the world",
  continents: CLASSIC_CONTINENT_IDS.map((id) => ({ id, ...CLASSIC_CONTINENTS[id] })),
  territories: CLASSIC_IDS.map((id, i) => {
    const drawn = CLASSIC_DRAWING.spots[id];
    const info = CLASSIC_TERRITORIES[id];
    return {
      id,
      name: info.name,
      continent: info.continent,
      x: Math.round(drawn?.x ?? info.x),
      y: Math.round(drawn?.y ?? info.y),
      ...(drawn?.shape ? { shape: drawn.shape } : {}),
      figure: SHAPES[i % 3],
    };
  }),
  borders: CLASSIC_EDGES.map(([a, b]) => [a, b] as [string, string]),
  objectives: [
    { kind: "continents", need: ["eu", "oc"], plusOne: true },
    { kind: "continents", need: ["eu", "sa"], plusOne: true },
    { kind: "continents", need: ["as", "sa"] },
    { kind: "continents", need: ["as", "af"] },
    { kind: "continents", need: ["na", "af"] },
    { kind: "continents", need: ["na", "oc"] },
    { kind: "territories", count: 24, armies: 1 },
    { kind: "territories", count: 18, armies: 2 },
    { kind: "destroy" },
  ],
};

/** Ancient Greece: city states, the islands, Ionia and Crete. Markers, no outlines -- lay a picture under it. */
export const GREECE: WarWorld = (() => {
  const continents: WarContinent[] = [
    { id: "mac", name: "Macedonia", bonus: 3, tint: "#c98a4b", label: { x: 170, y: 40 } },
    { id: "hel", name: "Hellas", bonus: 4, tint: "#5b8fd6", label: { x: 30, y: 230 } },
    { id: "pel", name: "Peloponnese", bonus: 5, tint: "#4fae6a", label: { x: 40, y: 545 } },
    { id: "isl", name: "The Islands", bonus: 2, tint: "#6fd0d8", label: { x: 470, y: 330 } },
    { id: "ion", name: "Ionia", bonus: 3, tint: "#d9b23f", label: { x: 800, y: 40 } },
    { id: "cre", name: "Crete", bonus: 1, tint: "#d56aa0", label: { x: 640, y: 545 } },
  ];
  const t = (id: string, name: string, continent: string, x: number, y: number): WarTerritory => ({ id, name, continent, x, y });
  const territories: WarTerritory[] = [
    t("epirus", "Epirus", "mac", 140, 150),
    t("pella", "Pella", "mac", 260, 90),
    t("chalcidice", "Chalcidice", "mac", 370, 125),
    t("thrace", "Thrace", "mac", 480, 70),
    t("thessaly", "Thessaly", "hel", 270, 190),
    t("aetolia", "Aetolia", "hel", 160, 260),
    t("phocis", "Delphi", "hel", 245, 265),
    t("boeotia", "Thebes", "hel", 320, 280),
    t("euboea", "Euboea", "hel", 405, 245),
    t("attica", "Athens", "hel", 385, 335),
    t("corinth", "Corinth", "pel", 300, 345),
    t("achaea", "Achaea", "pel", 205, 335),
    t("elis", "Olympia", "pel", 140, 405),
    t("arcadia", "Arcadia", "pel", 230, 410),
    t("argolis", "Argos", "pel", 320, 405),
    t("laconia", "Sparta", "pel", 275, 485),
    t("messenia", "Messenia", "pel", 180, 475),
    t("cyclades", "Naxos", "isl", 490, 395),
    t("lesbos", "Lesbos", "isl", 625, 185),
    t("chios", "Chios", "isl", 640, 280),
    t("rhodes", "Rhodes", "isl", 800, 450),
    t("troad", "Troy", "ion", 660, 95),
    t("lydia", "Sardis", "ion", 790, 215),
    t("ionia", "Miletus", "ion", 730, 330),
    t("caria", "Halicarnassus", "ion", 845, 360),
    t("knossos", "Knossos", "cre", 580, 505),
    t("gortyn", "Gortyn", "cre", 470, 520),
  ].map((x, i) => ({ ...x, figure: SHAPES[i % 3] }));
  const b = (pairs: string): Array<[string, string]> =>
    pairs
      .trim()
      .split(/\s+/)
      .map((p) => p.split("-") as [string, string]);
  const borders = b(`
    epirus-pella epirus-thessaly epirus-aetolia pella-chalcidice pella-thessaly chalcidice-thrace thrace-troad
    thessaly-phocis thessaly-aetolia thessaly-euboea aetolia-phocis aetolia-achaea phocis-boeotia boeotia-attica
    boeotia-euboea attica-corinth attica-cyclades corinth-achaea corinth-argolis corinth-arcadia achaea-elis
    achaea-arcadia elis-arcadia elis-messenia arcadia-messenia arcadia-laconia arcadia-argolis argolis-laconia
    laconia-messenia laconia-gortyn argolis-cyclades cyclades-ionia cyclades-knossos lesbos-troad lesbos-chios
    lesbos-lydia chios-ionia troad-lydia lydia-ionia lydia-caria ionia-caria caria-rhodes rhodes-knossos knossos-gortyn
    chalcidice-lesbos
  `);
  // Its objectives are worked out from its continents when they are needed.
  return { ...blank(), name: "ancient Greece", sea: "#123a55", continents, territories, borders };
})();

export const BUILT_IN: WarWorld[] = [CLASSIC, GREECE];

// ---------------------------------------------------------------------------
// Reading a world
// ---------------------------------------------------------------------------

export interface WorldIndex {
  world: WarWorld;
  ids: string[];
  byId: Map<string, WarTerritory>;
  continents: Map<string, WarContinent>;
  /** Continents that have territories, in order. */
  continentIds: string[];
  members: Map<string, string[]>;
  neighbors: Map<string, string[]>;
  figure: (t: string) => Shape;
}

const cache = new WeakMap<WarWorld, WorldIndex>();

/** Everything worth looking up about a world, worked out once per world. */
export function indexOf(world: WarWorld): WorldIndex {
  const found = cache.get(world);
  if (found) return found;
  const ids = world.territories.map((t) => t.id);
  const byId = new Map(world.territories.map((t) => [t.id, t]));
  const continents = new Map(world.continents.map((c) => [c.id, c]));
  const members = new Map<string, string[]>(world.continents.map((c) => [c.id, []]));
  for (const t of world.territories) members.get(t.continent)?.push(t.id);
  const neighbors = new Map<string, string[]>(ids.map((id) => [id, []]));
  for (const [a, b] of world.borders) {
    if (a === b || !byId.has(a) || !byId.has(b)) continue;
    const na = neighbors.get(a) as string[];
    const nb = neighbors.get(b) as string[];
    if (!na.includes(b)) na.push(b);
    if (!nb.includes(a)) nb.push(a);
  }
  const order = new Map(ids.map((id, i) => [id, i]));
  const index: WorldIndex = {
    world,
    ids,
    byId,
    continents,
    continentIds: world.continents.map((c) => c.id).filter((c) => (members.get(c)?.length ?? 0) > 0),
    members,
    neighbors,
    figure: (t) => byId.get(t)?.figure ?? SHAPES[(order.get(t) ?? 0) % 3],
  };
  cache.set(world, index);
  return index;
}

/** Turns an older room's map -- the classic forty-two, moved and renamed -- into a world. */
export function fromLegacyMap(map: WarMapData): WarWorld {
  return {
    ...CLASSIC,
    name: map.name || CLASSIC.name,
    image: map.image,
    sea: map.sea,
    shapes: map.shapes,
    labels: map.labels,
    links: map.links,
    territories: CLASSIC.territories.map((t) => {
      const spot = legacySpot(map, t.id as never);
      const shape = legacyShape({ ...map, shapes: true }, t.id as never);
      return { ...t, name: legacyName(map, t.id as never), x: Math.round(spot.x), y: Math.round(spot.y), ...(shape ? { shape } : { shape: undefined }) };
    }),
    borders: [...CLASSIC.borders, ...map.customLinks.map(([a, b]) => [a, b] as [string, string])],
  };
}

/** The world a game state is on: its own, an older room's map turned into one, or the classic board. */
export function worldOf(state: { world?: WarWorld; map?: Partial<WarMapData> } | null | undefined): WarWorld {
  if (state?.world && Array.isArray(state.world.territories)) return state.world;
  if (state?.map && typeof state.map === "object" && state.map.spots) {
    return fromLegacyMap({ ...CLASSIC_DRAWING, ...state.map, spots: state.map.spots ?? {}, names: state.map.names ?? {}, customLinks: state.map.customLinks ?? [] } as WarMapData);
  }
  return CLASSIC;
}

export const rulesOf = (state: { rules?: Partial<WarRules> } | null | undefined): WarRules => tidyRules(state?.rules);

export const territoryName = (world: WarWorld, id: string) => indexOf(world).byId.get(id)?.name ?? id;
export const continentName = (world: WarWorld, id: string) => indexOf(world).continents.get(id)?.name ?? id;

/** Where a continent writes its name: where it was put, or above the middle of its territories. */
export function labelSpot(world: WarWorld, continent: string): { x: number; y: number } {
  const c = indexOf(world).continents.get(continent);
  if (c?.label) return c.label;
  const ts = (indexOf(world).members.get(continent) ?? []).map((id) => indexOf(world).byId.get(id) as WarTerritory);
  if (!ts.length) return { x: 20, y: 20 };
  const x = ts.reduce((s, t) => s + t.x, 0) / ts.length;
  const y = Math.min(...ts.map((t) => t.y)) - 40;
  return { x: Math.max(10, Math.min(MAP_W - 10, x)), y: Math.max(14, y) };
}

// ---------------------------------------------------------------------------
// Objectives
// ---------------------------------------------------------------------------

/**
 * Objectives for a world that did not bring its own: pairs of continents
 * worth going for (with "one more of your choice" when the pair is small),
 * a share of the territories, a smaller share held with two armies each, and
 * a card to destroy each colour.
 */
export function suggestObjectives(world: WarWorld): ObjectiveSpec[] {
  const index = indexOf(world);
  const total = index.ids.length;
  const sized = index.continentIds.map((c) => ({ c, n: index.members.get(c)?.length ?? 0 })).sort((a, b) => b.n - a.n);
  const out: ObjectiveSpec[] = [];
  const pairs: Array<{ need: string[]; n: number }> = [];
  for (let i = 0; i < sized.length; i += 1) {
    for (let j = i + 1; j < sized.length; j += 1) pairs.push({ need: [sized[i].c, sized[j].c], n: sized[i].n + sized[j].n });
  }
  // Pairs that are neither a walkover nor most of the world.
  const fair = pairs.filter((p) => p.n >= total * 0.2 && p.n <= total * 0.62);
  for (const p of (fair.length ? fair : pairs).slice(0, 8)) {
    out.push({ kind: "continents", need: p.need, ...(p.n < total * 0.38 && sized.length > 2 ? { plusOne: true } : {}) });
  }
  if (total >= 6) {
    out.push({ kind: "territories", count: Math.max(3, Math.round((total * 24) / 42)), armies: 1 });
    out.push({ kind: "territories", count: Math.max(3, Math.round((total * 18) / 42)), armies: 2 });
  }
  out.push({ kind: "destroy" });
  return out;
}

export const objectiveSpecs = (world: WarWorld): ObjectiveSpec[] => world.objectives ?? suggestObjectives(world);

/** A dealt objective, as a string a pile can hold. */
export function encodeObjective(spec: ObjectiveSpec, color?: string): string {
  if (spec.kind === "continents") return `c:${spec.need.join(",")}${spec.plusOne ? ":+1" : ""}`;
  if (spec.kind === "territories") return `t:${spec.count}:${spec.armies}`;
  return `kill:${color ?? ""}`;
}

/** Objective codes from games dealt before worlds existed. */
const LEGACY: Record<string, ObjectiveSpec> = {
  "eu-oc-any": { kind: "continents", need: ["eu", "oc"], plusOne: true },
  "eu-sa-any": { kind: "continents", need: ["eu", "sa"], plusOne: true },
  "as-sa": { kind: "continents", need: ["as", "sa"] },
  "as-af": { kind: "continents", need: ["as", "af"] },
  "na-af": { kind: "continents", need: ["na", "af"] },
  "na-oc": { kind: "continents", need: ["na", "oc"] },
  t24: { kind: "territories", count: 24, armies: 1 },
  t18: { kind: "territories", count: 18, armies: 2 },
};

export type ParsedObjective =
  | { kind: "continents"; need: string[]; plusOne: boolean }
  | { kind: "territories"; count: number; armies: number }
  | { kind: "kill"; color: string };

export function parseObjective(code: string): ParsedObjective | null {
  const legacy = LEGACY[code];
  if (legacy?.kind === "continents") return { kind: "continents", need: legacy.need, plusOne: Boolean(legacy.plusOne) };
  if (legacy?.kind === "territories") return legacy;
  if (code.startsWith("kill-")) return { kind: "kill", color: code.slice(5) };
  const [kind, a, b] = code.split(":");
  if (kind === "c" && a) return { kind: "continents", need: a.split(",").filter(Boolean), plusOne: b === "+1" };
  if (kind === "t") return { kind: "territories", count: Number(a) || 0, armies: Number(b) || 1 };
  if (kind === "kill" && a) return { kind: "kill", color: a };
  return null;
}

/** How many territories a destroy-a-colour card turns into, when it cannot be done. */
export function fallbackCount(world: WarWorld): number {
  const counts = objectiveSpecs(world)
    .filter((s): s is Extract<ObjectiveSpec, { kind: "territories" }> => s.kind === "territories" && s.armies <= 1)
    .map((s) => s.count);
  return counts.length ? Math.max(...counts) : Math.max(3, Math.round((indexOf(world).ids.length * 24) / 42));
}

/** The objective cards for a game: this world's, with the destroy cards for the colours playing. */
export function dealObjectives(world: WarWorld, colors: string[], rules: WarRules): string[] {
  const index = indexOf(world);
  const out: string[] = [];
  for (const spec of objectiveSpecs(world)) {
    if (spec.kind === "destroy") {
      if (rules.destroyObjectives) for (const c of colors) out.push(encodeObjective(spec, c));
      continue;
    }
    if (spec.kind === "continents" && !spec.need.every((c) => index.continentIds.includes(c))) continue;
    if (spec.kind === "territories" && spec.count > index.ids.length) continue;
    out.push(encodeObjective(spec));
  }
  return out;
}

export function describeObjective(world: WarWorld, code: string): string {
  const o = parseObjective(code);
  if (!o) return code;
  if (o.kind === "continents") {
    const names = o.need.map((c) => continentName(world, c));
    const list = names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : names[0];
    return o.plusOne ? `conquer ${list}, plus one more continent of your choice` : `conquer ${list}`;
  }
  if (o.kind === "territories") {
    return o.armies > 1
      ? `conquer ${o.count} territories and hold each with at least ${o.armies} armies`
      : `conquer ${o.count} territories of your choice`;
  }
  return `destroy the ${o.color} armies completely. If they are yours, or someone else gets them first, conquer ${fallbackCount(world)} territories instead`;
}

// ---------------------------------------------------------------------------
// Making and changing a world
// ---------------------------------------------------------------------------

export const TINTS = ["#e8913f", "#4fae6a", "#5b8fd6", "#d56aa0", "#d9b23f", "#b0714c", "#8f7fe0", "#6fd0d8", "#e0655c", "#a6d189", "#c98a4b", "#9aa0b8"];

const newKey = (prefix: string, taken: Set<string>) => {
  for (let i = 1; ; i += 1) {
    const id = `${prefix}${i}`;
    if (!taken.has(id)) return id;
  }
};

export function emptyWorld(name = "a new world"): WarWorld {
  return { ...blank(), name, continents: [{ id: "c1", name: "the first land", bonus: 2, tint: TINTS[0] }], territories: [], borders: [] };
}

export function addContinent(world: WarWorld, name?: string): { world: WarWorld; id: string } {
  const id = newKey("c", new Set(world.continents.map((c) => c.id)));
  const tint = TINTS.find((t) => !world.continents.some((c) => c.tint === t)) ?? TINTS[world.continents.length % TINTS.length];
  const continent: WarContinent = { id, name: name?.trim() || `continent ${world.continents.length + 1}`, bonus: 2, tint };
  return { world: { ...world, continents: [...world.continents, continent], objectives: undefined }, id };
}

export function editContinent(world: WarWorld, id: string, patch: Partial<Omit<WarContinent, "id">>): WarWorld {
  return {
    ...world,
    continents: world.continents.map((c) =>
      c.id === id
        ? {
            ...c,
            ...patch,
            ...(patch.name !== undefined ? { name: patch.name.slice(0, 40) } : {}),
            ...(patch.bonus !== undefined ? { bonus: clampInt(patch.bonus, 0, 50, c.bonus) } : {}),
          }
        : c,
    ),
  };
}

/** A continent goes, and its territories with it -- unless they are moved to another first. */
export function removeContinent(world: WarWorld, id: string, moveTo?: string): WarWorld {
  const leaving = new Set(world.territories.filter((t) => t.continent === id).map((t) => t.id));
  const keep = moveTo && moveTo !== id && world.continents.some((c) => c.id === moveTo);
  return {
    ...world,
    continents: world.continents.filter((c) => c.id !== id),
    territories: keep
      ? world.territories.map((t) => (t.continent === id ? { ...t, continent: moveTo as string } : t))
      : world.territories.filter((t) => !leaving.has(t.id)),
    borders: keep ? world.borders : world.borders.filter(([a, b]) => !leaving.has(a) && !leaving.has(b)),
    objectives: undefined,
  };
}

export function addTerritory(world: WarWorld, continent: string, x: number, y: number, name?: string): { world: WarWorld; id: string } {
  const id = newKey("t", new Set(world.territories.map((t) => t.id)));
  const territory: WarTerritory = {
    id,
    name: name?.trim() || `territory ${world.territories.length + 1}`,
    continent,
    x: Math.round(Math.max(0, Math.min(MAP_W, x))),
    y: Math.round(Math.max(0, Math.min(MAP_H, y))),
    figure: SHAPES[world.territories.length % 3],
  };
  return { world: { ...world, territories: [...world.territories, territory], objectives: world.objectives }, id };
}

export function editTerritory(world: WarWorld, id: string, patch: Partial<Omit<WarTerritory, "id">>): WarWorld {
  const changesContinent = patch.continent !== undefined && world.territories.find((t) => t.id === id)?.continent !== patch.continent;
  return {
    ...world,
    territories: world.territories.map((t) =>
      t.id === id
        ? {
            ...t,
            ...patch,
            ...(patch.name !== undefined ? { name: patch.name.slice(0, 30) } : {}),
            ...(patch.x !== undefined ? { x: Math.round(Math.max(0, Math.min(MAP_W, patch.x))) } : {}),
            ...(patch.y !== undefined ? { y: Math.round(Math.max(0, Math.min(MAP_H, patch.y))) } : {}),
          }
        : t,
    ),
    ...(changesContinent ? { objectives: undefined } : {}),
  };
}

export function removeTerritory(world: WarWorld, id: string): WarWorld {
  return {
    ...world,
    territories: world.territories.filter((t) => t.id !== id),
    borders: world.borders.filter(([a, b]) => a !== id && b !== id),
  };
}

const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

export const bordered = (world: WarWorld, a: string, b: string) => world.borders.some(([x, y]) => pairKey(x, y) === pairKey(a, b));

export function toggleBorder(world: WarWorld, a: string, b: string): WarWorld {
  if (a === b) return world;
  const key = pairKey(a, b);
  const has = world.borders.some(([x, y]) => pairKey(x, y) === key);
  return { ...world, borders: has ? world.borders.filter(([x, y]) => pairKey(x, y) !== key) : [...world.borders, [a, b]] };
}

/**
 * Borders worked out from where things sit: each territory joined to its
 * nearest two or three, keeping every join that is not much longer than the
 * nearest one. A start for a new map, to fix by hand afterwards.
 */
export function suggestBorders(world: WarWorld): WarWorld {
  const ts = world.territories;
  const keys = new Set(world.borders.map(([a, b]) => pairKey(a, b)));
  const borders = [...world.borders];
  for (const t of ts) {
    const near = ts
      .filter((o) => o.id !== t.id)
      .map((o) => ({ o, d: Math.hypot(o.x - t.x, o.y - t.y) }))
      .sort((p, q) => p.d - q.d);
    if (!near.length) continue;
    const limit = near[0].d * 1.6;
    for (const { o, d } of near.slice(0, 3)) {
      if (d > limit) break;
      const key = pairKey(t.id, o.id);
      if (keys.has(key)) continue;
      keys.add(key);
      borders.push([t.id, o.id]);
    }
  }
  return { ...world, borders };
}

/** Sets a territory's outline, moving its marker to the middle of it. */
export function outline(world: WarWorld, id: string, shape: string | undefined): WarWorld {
  if (!shape) return editTerritory(world, id, { shape: undefined });
  const [x, y] = middle(shape);
  return editTerritory(world, id, { shape, x, y });
}

/** Whether every territory can be reached from every other. */
export function connected(world: WarWorld): boolean {
  const index = indexOf(world);
  if (index.ids.length <= 1) return true;
  const seen = new Set([index.ids[0]]);
  const queue = [index.ids[0]];
  while (queue.length) {
    for (const n of index.neighbors.get(queue.shift() as string) ?? []) {
      if (!seen.has(n)) {
        seen.add(n);
        queue.push(n);
      }
    }
  }
  return seen.size === index.ids.length;
}

/** Why a game cannot start on this world with this many players, if it cannot. */
export function worldProblem(world: WarWorld, players: number): string | null {
  const index = indexOf(world);
  if (index.ids.length < players * 2) return `${players} players need at least ${players * 2} territories; this map has ${index.ids.length}`;
  if (world.territories.some((t) => !index.continents.has(t.continent))) return "a territory belongs to a continent that is gone";
  if (!connected(world)) return "some territories cannot be reached -- join them with borders";
  return null;
}

// ---------------------------------------------------------------------------
// Taking one elsewhere
// ---------------------------------------------------------------------------

/** A world as saved or pasted, made safe: known fields only, numbers in range, borders between territories that exist. */
export function tidyWorld(raw: unknown): WarWorld | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Partial<WarWorld>;
  if (!Array.isArray(r.territories) || !Array.isArray(r.continents)) return null;
  const continents: WarContinent[] = r.continents
    .filter((c): c is WarContinent => Boolean(c && typeof c.id === "string" && c.id))
    .slice(0, 40)
    .map((c, i) => ({
      id: String(c.id).slice(0, 24),
      name: String(c.name ?? `continent ${i + 1}`).slice(0, 40),
      bonus: clampInt(c.bonus, 0, 50, 2),
      tint: typeof c.tint === "string" && /^#[0-9a-f]{3,8}$/i.test(c.tint) ? c.tint : TINTS[i % TINTS.length],
      ...(c.label && Number.isFinite(c.label.x) && Number.isFinite(c.label.y) ? { label: { x: Math.round(c.label.x), y: Math.round(c.label.y) } } : {}),
    }));
  const cids = new Set(continents.map((c) => c.id));
  const seen = new Set<string>();
  const territories: WarTerritory[] = r.territories
    .filter((t): t is WarTerritory => Boolean(t && typeof t.id === "string" && t.id && cids.has(t.continent)))
    .filter((t) => (seen.has(t.id) ? false : (seen.add(t.id), true)))
    .slice(0, 300)
    .map((t, i) => ({
      id: String(t.id).slice(0, 32),
      name: String(t.name ?? `territory ${i + 1}`).slice(0, 30),
      continent: t.continent,
      x: clampInt(t.x, 0, MAP_W, MAP_W / 2),
      y: clampInt(t.y, 0, MAP_H, MAP_H / 2),
      ...(typeof t.shape === "string" && t.shape.split(/\s+/).length >= 3 ? { shape: t.shape.slice(0, 4000) } : {}),
      ...(t.figure && SHAPES.includes(t.figure) ? { figure: t.figure } : {}),
    }));
  const tids = new Set(territories.map((t) => t.id));
  const borders = (Array.isArray(r.borders) ? r.borders : [])
    .filter((p): p is [string, string] => Array.isArray(p) && tids.has(p[0]) && tids.has(p[1]) && p[0] !== p[1])
    .slice(0, 2000)
    .map(([a, b]) => [a, b] as [string, string]);
  const image = r.image && typeof r.image.url === "string" ? { url: r.image.url, fit: r.image.fit ?? "contain", opacity: Math.max(0, Math.min(1, Number(r.image.opacity) || 1)) } : null;
  return {
    version: 1,
    name: String(r.name ?? "a map").slice(0, 60),
    continents,
    territories,
    borders,
    image: image as MapImage | null,
    sea: typeof r.sea === "string" ? r.sea : null,
    shapes: r.shapes !== false,
    labels: r.labels !== false,
    links: r.links !== false,
    ...(Array.isArray(r.objectives) ? { objectives: r.objectives.slice(0, 40) } : {}),
  };
}

export const exportWorld = (world: WarWorld, rules?: WarRules) => JSON.stringify({ nookWarWorld: 1, world, rules }, null, 1);

export function importWorld(text: string): { world: WarWorld; rules?: WarRules } | null {
  try {
    const parsed = JSON.parse(text) as { world?: unknown; rules?: Partial<WarRules> };
    const world = tidyWorld(parsed.world ?? parsed);
    if (!world) return null;
    return { world, ...(parsed.rules ? { rules: tidyRules(parsed.rules) } : {}) };
  } catch {
    return null;
  }
}
