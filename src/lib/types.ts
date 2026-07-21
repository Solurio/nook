export type ItemKind =
  | "image"
  | "note"
  | "text"
  | "media"
  | "embed"
  | "game"
  | "cobrowse"
  | "screencast";

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
  cobrowse: CobrowseData;
  screencast: ScreencastData;
}

/**
 * A live tab/screen broadcast (WebRTC). One person shares their tab -- running
 * in their own browser with their own logins -- and everyone else watches the
 * live stream. Only "who is broadcasting" is stored/synced; the video itself is
 * peer-to-peer and never touches the database.
 */
export interface ScreencastData {
  /** Optional link, a hint of what is being shown; the sharer opens it to share. */
  url?: string;
  broadcaster: { userId: string; name: string } | null;
}

/**
 * A live, shared cloud browser (Hyperbeam). Everyone in the room loads the same
 * embedUrl and controls the same machine. Unlike other items this is a live
 * session, not permanent state -- it ends when everyone leaves or on close.
 */
export interface CobrowseData {
  url: string;
  embedUrl?: string;
  sessionId?: string;
  status: "idle" | "live" | "ended";
  startedBy?: string;
}

export type FrameStyle = "none" | "polaroid" | "shadow" | "sticker";

export type MediaProvider = "youtube" | "audio" | "soundcloud";

export interface MediaTrack {
  id: string;
  provider: MediaProvider;
  /** youtube: the video id. audio/soundcloud: the source URL. */
  ref?: string;
  /** Legacy field for youtube tracks saved before `ref` existed. */
  videoId?: string;
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

export type GameKind = "tictactoe" | "connectfour" | "doodle" | "chess" | "checkers";

export type GameData =
  | { game: "tictactoe"; state: TicTacToeState }
  | { game: "connectfour"; state: ConnectFourState }
  | { game: "doodle"; state: DoodleState }
  | { game: "chess"; state: ChessState }
  | { game: "checkers"; state: CheckersState };

export interface ChessState {
  /** 64 cells, index = row*8+col, row 0 is black's back rank. */
  board: ({ color: "w" | "b"; type: "p" | "n" | "b" | "r" | "q" | "k" } | null)[];
  turn: "w" | "b";
  seats: { w: string | null; b: string | null };
  wins: { w: number; b: number; draw: number };
}

export interface CheckersState {
  /** 64 cells, row-major; pieces sit on dark squares. */
  board: ({ side: "r" | "b"; king: boolean } | null)[];
  turn: "r" | "b";
  seats: { r: string | null; b: string | null };
  wins: { r: number; b: number; draw: number };
  /** Board index of a piece mid multi-jump, if the turn must continue. */
  chain: number | null;
}

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

export type DoodleBrush = "pen" | "marker" | "airbrush" | "eraser";

export interface DoodleStroke {
  id: string;
  color: string;
  /** Base brush width in CSS px (scaled by pressure per point). */
  size: number;
  /** Flat [x0,y0,x1,y1,...] in 0..1 space so strokes survive resizing. */
  points: number[];
  /** 0..1; absent means fully opaque (old strokes). */
  opacity?: number;
  /** Defaults to "pen" for strokes saved before brushes existed. */
  brush?: DoodleBrush;
  /** Per-point pen pressure 0..1; absent means full pressure. */
  pressures?: number[];
  /** Layer id; absent means the base layer. */
  layer?: string;
}

export interface DoodleLayer {
  id: string;
  name: string;
  visible: boolean;
  opacity: number;
  /** hue-rotate effect in degrees. */
  hue: number;
}

export interface DoodleState {
  strokes: DoodleStroke[];
  /** Absent on old boards; treated as a single base layer. */
  layers?: DoodleLayer[];
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

/** A stroke of ink drawn directly onto the room canvas. */
export interface Stroke {
  id: string;
  room_id: string;
  color: string;
  size: number;
  /** Flat [x0,y0,x1,y1,...] in world coordinates. */
  points: number[];
  created_by: string | null;
  created_at: string;
}

/** In-flight stroke shared over broadcast before it is committed. */
export interface InkDraft {
  id: string;
  userId: string;
  color: string;
  size: number;
  points: number[];
}

export type Tool = "select" | "draw" | "erase";

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
