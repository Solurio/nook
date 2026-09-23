import { emptyMedia } from "./media";
import { emptyPdf } from "./pdf";
import { emptyGrid, emptyToken } from "./grid";
import type { AnyItem, GameKind, ItemDataMap, ItemKind } from "./types";

export const NOTE_TINTS = [
  "#f7e6a2",
  "#f6c1c1",
  "#c8e6c0",
  "#bcd9f2",
  "#e2c8f5",
  "#f5d6b8",
] as const;

export interface ItemDraft {
  kind: ItemKind;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  z: number;
  data: ItemDataMap[ItemKind];
}

/**
 * Things about an item that no game knows it is carrying: stuck to the wall,
 * tied to other things. A game saves its data whole -- { game, state } -- and
 * would drop them every time anybody made a move. So a save that does not
 * mention one keeps it as it was; to clear one, a save says null.
 */
export const ITEM_FLAGS = ["pinned", "group"] as const;

export function keepItemFlags<T extends object>(live: object | undefined, next: T): T {
  const out = { ...next } as Record<string, unknown>;
  const was = (live ?? {}) as Record<string, unknown>;
  for (const key of ITEM_FLAGS) {
    if (!(key in out) && was[key] !== undefined && was[key] !== null) out[key] = was[key];
    if (out[key] === null || out[key] === undefined) delete out[key];
  }
  return out as T;
}

const DEFAULT_SIZE: Record<ItemKind, { width: number; height: number }> = {
  image: { width: 320, height: 240 },
  note: { width: 240, height: 240 },
  text: { width: 360, height: 90 },
  media: { width: 480, height: 340 },
  embed: { width: 520, height: 380 },
  game: { width: 340, height: 400 },
  cobrowse: { width: 640, height: 440 },
  screencast: { width: 640, height: 420 },
  pdf: { width: 620, height: 460 },
  token: { width: 64, height: 64 },
  grid: { width: 480, height: 480 },
};

const GAME_SIZE: Record<GameKind, { width: number; height: number }> = {
  tictactoe: { width: 320, height: 390 },
  connectfour: { width: 400, height: 430 },
  doodle: { width: 860, height: 620 },
  chess: { width: 380, height: 440 },
  checkers: { width: 380, height: 440 },
  intransitive: { width: 420, height: 480 },
  cards: { width: 440, height: 420 },
  dominoes: { width: 440, height: 400 },
  codenames: { width: 480, height: 440 },
  coup: { width: 460, height: 420 },
  spyfall: { width: 460, height: 440 },
  resistance: { width: 480, height: 460 },
  uno: { width: 480, height: 460 },
  dice: { width: 360, height: 430 },
  coin: { width: 280, height: 360 },
  wheel: { width: 360, height: 440 },
  buckshot: { width: 440, height: 460 },
  rps: { width: 380, height: 420 },
  bang: { width: 560, height: 560 },
  bomb: { width: 420, height: 440 },
  war: { width: 820, height: 640 },
  cah: { width: 640, height: 620 },
  quoridor: { width: 480, height: 560 },
  catan: { width: 920, height: 660 },
  reversi: { width: 380, height: 450 },
  pool: { width: 640, height: 440 },
  battleship: { width: 640, height: 520 },
  monopoly: { width: 720, height: 780 },
};

/** A slight tilt on drop makes a wall of items feel arranged rather than gridded. */
function casualTilt(): number {
  return Math.round((Math.random() * 6 - 3) * 10) / 10;
}

export function draftItem(
  kind: ItemKind,
  at: { x: number; y: number },
  z: number,
  options: { game?: GameKind; data?: Partial<ItemDataMap[ItemKind]> } = {},
): ItemDraft {
  const size =
    kind === "game" && options.game ? GAME_SIZE[options.game] : DEFAULT_SIZE[kind];

  let data: ItemDataMap[ItemKind];
  switch (kind) {
    case "image":
      data = { url: "", frame: "shadow", radius: 10 };
      break;
    case "note":
      data = {
        body: "",
        tint: NOTE_TINTS[Math.floor(Math.random() * NOTE_TINTS.length)],
      };
      break;
    case "text":
      data = { body: "type here", size: 34, color: "#f4efe6", weight: 600, align: "left" };
      break;
    case "media":
      data = emptyMedia();
      break;
    case "embed":
      data = { url: "" };
      break;
    case "game":
      // The game's starting state comes from startingGame (lib/game-start),
      // which loads the game's rules only when one is put down.
      data = (options.data as ItemDataMap["game"] | undefined) ?? {
        game: "tictactoe",
        state: { board: Array(9).fill(null), turn: "x", seats: { x: null, o: null }, wins: { x: 0, o: 0, draw: 0 } },
      };
      break;
    case "cobrowse":
      data = { url: "", status: "idle" };
      break;
    case "screencast":
      data = { url: "", broadcaster: null };
      break;
    case "pdf":
      data = emptyPdf();
      break;
    case "token":
      data = emptyToken();
      break;
    case "grid":
      data = emptyGrid();
      break;
  }

  if (options.data) data = { ...data, ...options.data } as ItemDataMap[ItemKind];

  const upright =
    kind === "text" || kind === "media" || kind === "cobrowse" || kind === "screencast";

  return {
    kind,
    x: Math.round(at.x - size.width / 2),
    y: Math.round(at.y - size.height / 2),
    width: size.width,
    height: size.height,
    rotation: upright ? 0 : casualTilt(),
    z,
    data,
  };
}

export function topZ(items: AnyItem[]): number {
  return items.reduce((max, item) => Math.max(max, item.z), 0) + 1;
}

/** Minimum sizes stop a stray resize from collapsing something to nothing. */
export const MIN_ITEM_SIZE: Record<ItemKind, { width: number; height: number }> = {
  image: { width: 80, height: 60 },
  note: { width: 120, height: 120 },
  text: { width: 100, height: 40 },
  media: { width: 300, height: 210 },
  embed: { width: 240, height: 180 },
  game: { width: 260, height: 300 },
  cobrowse: { width: 380, height: 280 },
  screencast: { width: 360, height: 240 },
  pdf: { width: 280, height: 240 },
  token: { width: 24, height: 24 },
  grid: { width: 96, height: 96 },
};

export function clampSize(kind: ItemKind, width: number, height: number) {
  const min = MIN_ITEM_SIZE[kind];
  return {
    width: Math.max(min.width, Math.round(width)),
    height: Math.max(min.height, Math.round(height)),
  };
}

/** Where in the pile an item should end up. */
export type Layering = "front" | "back" | "forward" | "backward";

/**
 * Work out the z changes that move one item through the stack. "front" and
 * "back" clear the whole pile; "forward" and "backward" trade places with the
 * one neighbour on that side, so you can slide something out from behind a
 * photo without launching it over everything else.
 *
 * Returns only the rows that actually change, empty when there is nothing to do.
 */
export function relayer(
  items: AnyItem[],
  id: string,
  where: Layering,
): Array<{ id: string; z: number }> {
  const me = items.find((item) => item.id === id);
  if (!me) return [];

  // Seeded from the items themselves. Starting the search at zero would call an
  // empty patch of wall the top of the stack whenever every item sits above it.
  const layers = items.map((item) => item.z ?? 0);

  if (where === "front") {
    const top = Math.max(...layers);
    const alone = me.z === top && layers.filter((z) => z === top).length === 1;
    return alone ? [] : [{ id, z: top + 1 }];
  }

  if (where === "back") {
    const bottom = Math.min(...layers);
    const alone = me.z === bottom && layers.filter((z) => z === bottom).length === 1;
    return alone ? [] : [{ id, z: bottom - 1 }];
  }

  const others = items.filter((item) => item.id !== id);
  const neighbour =
    where === "forward"
      ? others
          .filter((item) => (item.z ?? 0) >= (me.z ?? 0))
          .sort((a, b) => (a.z ?? 0) - (b.z ?? 0))[0]
      : others
          .filter((item) => (item.z ?? 0) <= (me.z ?? 0))
          .sort((a, b) => (b.z ?? 0) - (a.z ?? 0))[0];

  if (!neighbour) return [];

  // Already sharing a number with the neighbour: swapping would change nothing,
  // so step past it instead.
  if ((neighbour.z ?? 0) === (me.z ?? 0)) {
    return [{ id, z: (me.z ?? 0) + (where === "forward" ? 1 : -1) }];
  }

  return [
    { id, z: neighbour.z ?? 0 },
    { id: neighbour.id, z: me.z ?? 0 },
  ];
}
