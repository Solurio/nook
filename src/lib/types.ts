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
/** Things any item can carry, whatever kind it is. */
export interface CommonItemData {
  /**
   * Pinned items stay where they are: no dragging, no resizing. For the
   * backdrop pieces you arranged once and keep catching by accident.
   */
  pinned?: boolean;
}

/** Kind-specific payloads. Anything not listed is ignored by the renderer. */
interface ItemPayloads {
  image: { url: string; alt?: string; radius?: number; frame?: FrameStyle };
  note: { body: string; tint: string };
  text: {
    body: string;
    size: number;
    color: string;
    weight: number;
    align: "left" | "center" | "right";
    /** Absent means plain text; the rest animate. */
    effect?: TextEffect;
  };
  media: MediaData;
  /**
   * A window onto another page that everyone in the room shares. The address
   * lives here rather than in one person's browser, so navigating it moves the
   * window for everybody at once.
   */
  embed: { url: string; title?: string; openedBy?: string; navigatedAt?: number };
  game: GameData;
  cobrowse: CobrowseData;
  screencast: ScreencastData;
}

/** Every payload, plus the fields shared across all of them. */
export type ItemDataMap = {
  [K in keyof ItemPayloads]: ItemPayloads[K] & CommonItemData;
};

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

export type MediaProvider = "youtube" | "audio" | "video" | "soundcloud";

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

export type TextEffect = "none" | "rainbow" | "shake" | "wave" | "glow" | "pulse";

export type GameKind =
  | "tictactoe"
  | "connectfour"
  | "doodle"
  | "chess"
  | "checkers"
  | "intransitive"
  | "cards"
  | "dominoes"
  | "codenames"
  | "coup";

export type GameData =
  | { game: "tictactoe"; state: TicTacToeState }
  | { game: "connectfour"; state: ConnectFourState }
  | { game: "doodle"; state: DoodleState }
  | { game: "chess"; state: ChessState }
  | { game: "checkers"; state: CheckersState }
  | { game: "intransitive"; state: IntransitiveState }
  | { game: "cards"; state: CardTableState }
  | { game: "dominoes"; state: DominoesState }
  | { game: "codenames"; state: CodenamesState }
  | { game: "coup"; state: CoupState };

export interface ChessState {
  /** 64 cells, index = row*8+col, row 0 is black's back rank. */
  board: ({ color: "w" | "b"; type: "p" | "n" | "b" | "r" | "q" | "k" } | null)[];
  turn: "w" | "b";
  seats: { w: string | null; b: string | null };
  wins: { w: number; b: number; draw: number };
  /** Castles still available. Absent on games saved before castling existed. */
  castling?: { wk: boolean; wq: boolean; bk: boolean; bq: boolean };
  /** Square a pawn just skipped, capturable en passant on this turn only. */
  ep?: number | null;
}

/** Coup. The shape lives in lib/coup.ts; this mirrors it for stored state. */
export type CoupState = import("./coup").CoupState;

/** Codenames: the words, and the key only the spymasters look at. */
export interface CodenamesState {
  words: string[];
  key: ("red" | "blue" | "neutral" | "assassin")[];
  revealed: boolean[];
  turn: "red" | "blue";
  seats: { redMaster: string | null; blueMaster: string | null };
  clue: { word: string; count: number } | null;
  wins: { red: number; blue: number };
  pack: "en" | "pt";
}

/** Dominoes on a double-six set, on your own or in pairs. */
export interface DominoesState {
  /** Laid out left to right; touching halves match. */
  line: [number, number][];
  hands: Record<string, [number, number][]>;
  boneyard: [number, number][];
  seats: Record<string, string | null>;
  seatCount: number;
  teams: number;
  /** Chair id whose go it is. */
  turn: string;
  wins: Record<string, number>;
  passes: number;
}

/** A deck on a table, with whatever rules the players agree on. */
export interface CardTableState {
  config: {
    ranks: ("A" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "J" | "Q" | "K")[];
    suits: ("S" | "H" | "D" | "C")[];
    jokers: number;
    copies: number;
  };
  /** Face down, top of the deck first. */
  deck: string[];
  /** Chair id to the cards held there. */
  hands: Record<string, string[]>;
  /** Face up in the middle. */
  table: { card: string; by: string }[];
  discard: string[];
  seats: Record<string, string | null>;
  seatCount: number;
  /** 0 is everyone for themselves; 2 or more pairs the chairs up. */
  teams: number;
  dealEach: number;
}

export interface IntransitiveState {
  /** 81 cells, index = row*9+col, row 0 is red's back rank. */
  board: ({ side: "blue" | "red"; shape: "R" | "P" | "S" } | null)[];
  turn: "blue" | "red";
  seats: { blue: string | null; red: string | null };
  wins: { blue: number; red: number; draw: number };
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

export type DoodleBrush = "pen" | "marker" | "airbrush" | "eraser" | "fill";

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
