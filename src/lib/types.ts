export type ItemKind =
  | "image"
  | "note"
  | "text"
  | "media"
  | "embed"
  | "game"
  | "cobrowse"
  | "screencast"
  | "pdf"
  | "token"
  | "grid";

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
  /**
   * Things tied together move together: a map and the pieces on it, a note
   * and the picture it is about. Anything sharing this id is one bundle.
   */
  group?: string;
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
  /** A document on the table, read as a book or on a clipboard. */
  pdf: import("./pdf").PdfData;
  /** A piece for the table: a mini, a marker, a counter. */
  token: import("./grid").TokenData;
  /** Squares or hexes to play on, over a map or bare. */
  grid: import("./grid").GridData;
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
  /** What happens when a track ends: stop at the end of the queue, go round again, or play it again. */
  repeat?: "off" | "all" | "one";
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
  | "coup"
  | "spyfall"
  | "resistance"
  | "uno"
  | "dice"
  | "coin"
  | "wheel"
  | "buckshot"
  | "rps"
  | "bang"
  | "bomb"
  | "war"
  | "cah";

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
  | { game: "coup"; state: CoupState }
  | { game: "spyfall"; state: SpyfallState }
  | { game: "resistance"; state: ResistanceState }
  | { game: "uno"; state: import("./uno").UnoState }
  | { game: "dice"; state: import("./dice").DiceState }
  | { game: "coin"; state: import("./coin").CoinState }
  | { game: "wheel"; state: import("./wheel").WheelState }
  | { game: "buckshot"; state: import("./buckshot").BuckshotState }
  | { game: "rps"; state: import("./rps").RpsState }
  | { game: "bang"; state: import("./bang").BangState }
  | { game: "bomb"; state: import("./bomb").BombState }
  | { game: "war"; state: import("./war").WarState }
  | { game: "cah"; state: import("./cah").CahState };

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

/**
 * Spyfall. Everyone is somewhere together and knows their job there, except
 * one, who knows neither and has to keep up.
 */
export interface SpyfallState {
  seats: Record<string, string | null>;
  holders?: Record<string, string | null>;
  seatCount: number;
  /** Counts up with every deal. */
  round?: number;
  /** Epoch ms the clock was set running, null while it is stopped. */
  startedAt: number | null;
  /** Seconds still to run when the clock was last set going. */
  seconds: number;
  /** The round has been called, and everyone turns their card over. */
  called?: boolean;
  pack: "en" | "pt";
  wins: { spy: number; table: number };
  /** Written by the database: who holds which briefing. */
  piles?: import("./piles").PileMeta;
  /** Written by the database: briefings turned over at the end of a round. */
  revealed?: Record<string, unknown[]>;
  /** From before briefings were private. Wiped on sight. */
  location?: number | null;
  spy?: string | null;
  roles?: Record<string, string>;
}

/** The Resistance. Five missions, and spies hidden among the people sent on them. */
export interface ResistanceState {
  seats: Record<string, string | null>;
  /** Who is in each chair, by user id: whose role card is whose. */
  holders?: Record<string, string | null>;
  seatCount: number;
  /** Index into the chairs: whose proposal it is. */
  leader: number;
  /** Which mission, 0 through 4. */
  mission: number;
  /** How the missions came back so far; true is a success. */
  results: boolean[];
  /** Proposals turned down in a row. Five and the cell has collapsed. */
  rejections: number;
  /** Chair ids the leader wants to send. */
  team: string[];
  /** Counts up with every vote, so each has piles of its own. */
  voteNo?: number;
  /** How the last vote went, by name, once it was turned over. */
  lastVote?: Record<string, boolean> | null;
  /** How many sabotaged the last mission. */
  lastFails?: number | null;
  stage: "lobby" | "propose" | "vote" | "mission" | "over";
  wins: { resistance: number; spies: number };
  /** Written by the database: role cards, votes and mission cards, by owner and size. */
  piles?: import("./piles").PileMeta;
  /** Written by the database: whatever has been turned over. */
  revealed?: Record<string, unknown[]>;
  /** From before roles were private. Wiped on sight. */
  spies?: string[];
  votes?: Record<string, boolean>;
  plays?: Record<string, boolean>;
}

/**
 * Codenames: the words and whose turn it is. The key is not in here -- it is a
 * secret pile, copied to each spymaster, and a word's colour only becomes
 * public when it is guessed and the database turns that position over.
 */
export interface CodenamesState {
  words: string[];
  pack: "en" | "pt";
  /** The side with nine words, which goes first. */
  first?: "red" | "blue";
  turn: "red" | "blue";
  seats: { redMaster: string | null; blueMaster: string | null };
  holders?: { redMaster: string | null; blueMaster: string | null };
  clue: { word: string; count: number } | null;
  wins: { red: number; blue: number };
  round?: number;
  /** Round number to the side that took it. */
  results?: Record<string, "red" | "blue">;
  /** Set when the assassin is turned over: the side that turned it. */
  assassin?: "red" | "blue" | null;
  /** Written by the database: who holds a copy of the key. */
  piles?: import("./piles").PileMeta;
  /** Written by the database: each guessed word's colour, as word:<index>. */
  revealed?: Record<string, unknown[]>;
  /** From before the key was private. Wiped on sight. */
  key?: ("red" | "blue" | "neutral" | "assassin")[];
}

/**
 * Dominoes on a double-six set, on your own or in pairs.
 *
 * The hands and the boneyard are not in here: they live in secret piles that
 * only their owners can read (see lib/piles.ts). This is what the whole table
 * is allowed to know.
 */
export interface DominoesState {
  /** Laid out left to right; touching halves match. */
  line: [number, number][];
  seats: Record<string, string | null>;
  /** Who is in each chair, by user id. Decides whose hand is whose. */
  holders?: Record<string, string | null>;
  seatCount: number;
  teams: number;
  /** Chair id whose go it is. */
  turn: string;
  passes: number;
  /** Counts up with every deal, so each round's result has a place to go. */
  round?: number;
  /** Round number to the chair that took it; null for a dead heat. */
  results?: Record<string, string | null>;
  /** Written by the database: who holds each pile, and how many tiles. */
  piles?: import("./piles").PileMeta;
  /** Written by the database: hands turned over at the end of a blocked round. */
  revealed?: Record<string, unknown[]>;
  /** From before hands were private. Ignored, and dropped on the next deal. */
  hands?: Record<string, [number, number][]>;
  boneyard?: [number, number][];
  wins?: Record<string, number>;
}

/**
 * The card table: decks, stacks on the felt, chairs. The shape lives in
 * lib/table.ts; a table saved before stacks existed is upgraded on load.
 */
export type CardTableState = import("./table").TableState;

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
