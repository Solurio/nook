export type ItemKind = "image" | "note" | "text" | "media" | "embed" | "game";

export type Background =
  | { kind: "solid"; color: string }
  | { kind: "gradient"; from: string; to: string; angle: number }
  | { kind: "image"; url: string; fit: "cover" | "tile"; scale?: number; dim?: number };

export interface Room {
  id: string;
  slug: string;
  name: string;
  owner_id: string | null;
  background: Background;
  locked: boolean;
  created_at: string;
  updated_at: string;
}

/** Kind-specific payloads. Anything not listed is ignored by the renderer. */
export interface ItemDataMap {
  image: { url: string; alt?: string; radius?: number; frame?: FrameStyle };
  note: { body: string; tint: string };
  text: { body: string; size: number; color: string; weight: number; align: "left" | "center" | "right" };
  media: MediaData;
  embed: { url: string; title?: string };
  game: GameData;
}

export type FrameStyle = "none" | "polaroid" | "shadow" | "sticker";

export interface MediaTrack {
  id: string;
  provider: "youtube";
  videoId: string;
  title: string;
  addedBy: string;
}

export interface MediaData {
  queue: MediaTrack[];
  index: number;
  playing: boolean;
  /** Playhead at the moment `anchoredAt` was written. */
  positionSec: number;
  /** Server-ish epoch ms. Clients extrapolate from here while playing. */
  anchoredAt: number;
  volume: number;
  /** Hides the video surface and renders a compact player instead. */
  audioOnly: boolean;
}

export type GameKind = "tictactoe" | "connectfour" | "doodle";

export type GameData =
  | { game: "tictactoe"; state: TicTacToeState }
  | { game: "connectfour"; state: ConnectFourState }
  | { game: "doodle"; state: DoodleState };

export interface TicTacToeState {
  /** 9 cells, "x" | "o" | null. */
  board: (string | null)[];
  turn: "x" | "o";
  /** Display names claimed for each seat. */
  seats: { x: string | null; o: string | null };
  wins: { x: number; o: number; draw: number };
}

export interface ConnectFourState {
  /** 7 columns x 6 rows, column-major, bottom-first. */
  columns: (string | null)[][];
  turn: "r" | "y";
  seats: { r: string | null; y: string | null };
  wins: { r: number; y: number; draw: number };
}

export interface DoodleStroke {
  id: string;
  color: string;
  size: number;
  /** Flat [x0,y0,x1,y1,...] in 0..1 space so strokes survive resizing. */
  points: number[];
}

export interface DoodleState {
  strokes: DoodleStroke[];
}

export interface Item<K extends ItemKind = ItemKind> {
  id: string;
  room_id: string;
  kind: K;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  z: number;
  data: ItemDataMap[K];
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type AnyItem = Item<ItemKind>;

export interface Message {
  id: string;
  room_id: string;
  author_id: string | null;
  author_name: string;
  author_tint: string;
  body: string;
  created_at: string;
}

export interface Identity {
  userId: string;
  name: string;
  tint: string;
}

export interface Peer extends Identity {
  /** World-space pointer position, absent until they move. */
  cursor?: { x: number; y: number };
  joinedAt: number;
}

/** Transform sent while a drag is still in flight (never hits the database). */
export interface TransformPatch {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}
