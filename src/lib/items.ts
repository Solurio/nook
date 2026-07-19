import { emptyMedia } from "./media";
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

const DEFAULT_SIZE: Record<ItemKind, { width: number; height: number }> = {
  image: { width: 320, height: 240 },
  note: { width: 240, height: 240 },
  text: { width: 360, height: 90 },
  media: { width: 480, height: 340 },
  embed: { width: 520, height: 380 },
  game: { width: 340, height: 400 },
};

const GAME_SIZE: Record<GameKind, { width: number; height: number }> = {
  tictactoe: { width: 320, height: 390 },
  connectfour: { width: 400, height: 430 },
  doodle: { width: 460, height: 400 },
};

function emptyGameData(game: GameKind): ItemDataMap["game"] {
  switch (game) {
    case "tictactoe":
      return {
        game: "tictactoe",
        state: {
          board: Array(9).fill(null),
          turn: "x",
          seats: { x: null, o: null },
          wins: { x: 0, o: 0, draw: 0 },
        },
      };
    case "connectfour":
      return {
        game: "connectfour",
        state: {
          columns: Array.from({ length: 7 }, () => [] as (string | null)[]),
          turn: "r",
          seats: { r: null, y: null },
          wins: { r: 0, y: 0, draw: 0 },
        },
      };
    case "doodle":
      return { game: "doodle", state: { strokes: [] } };
  }
}

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
      data = emptyGameData(options.game ?? "tictactoe");
      break;
  }

  if (options.data) data = { ...data, ...options.data } as ItemDataMap[ItemKind];

  return {
    kind,
    x: Math.round(at.x - size.width / 2),
    y: Math.round(at.y - size.height / 2),
    width: size.width,
    height: size.height,
    rotation: kind === "text" || kind === "media" ? 0 : casualTilt(),
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
};

export function clampSize(kind: ItemKind, width: number, height: number) {
  const min = MIN_ITEM_SIZE[kind];
  return {
    width: Math.max(min.width, Math.round(width)),
    height: Math.max(min.height, Math.round(height)),
  };
}
