// Codenames: twenty five words on the table, and only the two spymasters know
// which of them belong to whom. Everything here is the setup and the scoring;
// the clue giving is the part that happens out loud.

export type Team = "red" | "blue";
export type Slot = Team | "neutral" | "assassin";
export type Pack = "en" | "pt";

export const GRID = 25;

/** The team that starts gets the extra card, which is what makes it fair. */
export const FIRST_TEAM_CARDS = 9;
export const SECOND_TEAM_CARDS = 8;
export const NEUTRAL_CARDS = 7;
export const ASSASSIN_CARDS = 1;

const EN = [
  "apple", "anchor", "angel", "arrow", "bank", "beach", "bell", "berry", "block", "board",
  "bolt", "bottle", "branch", "bridge", "brush", "cable", "camp", "candle", "cap", "card",
  "carpet", "castle", "cat", "chain", "chair", "cheese", "chest", "circle", "cloud", "coin",
  "comet", "compass", "cook", "copper", "crane", "crown", "crystal", "dance", "deck", "desert",
  "diamond", "doctor", "dragon", "dream", "drum", "eagle", "engine", "fair", "feather", "field",
  "figure", "file", "fire", "flute", "forest", "fork", "fountain", "garden", "ghost", "glass",
  "glove", "gold", "grass", "hammer", "harbour", "hawk", "heart", "hood", "horn", "ice",
  "iron", "island", "jacket", "jam", "jet", "key", "king", "kite", "knight", "ladder",
  "lamp", "leaf", "lemon", "light", "lion", "lock", "mammoth", "map", "marble", "mask",
  "match", "mine", "mint", "mirror", "moon", "mountain", "mouse", "needle", "net", "night",
  "note", "novel", "ocean", "orange", "organ", "palm", "paper", "park", "parrot", "pearl",
  "pilot", "pipe", "plate", "point", "port", "queen", "ring", "river", "robot", "rock",
];

const PT = [
  "abelha", "agulha", "alvo", "amora", "anel", "anjo", "antena", "areia", "arco", "asa",
  "banco", "bandeira", "barco", "bateria", "bicho", "bola", "bolso", "bomba", "bota", "braco",
  "brilho", "bruxa", "cabo", "cacto", "caixa", "cama", "caminho", "campo", "cana", "canto",
  "capa", "carta", "casa", "castelo", "cavalo", "chave", "chuva", "cobra", "coco", "coelho",
  "coroa", "corpo", "corrente", "cristal", "dedo", "dente", "deserto", "disco", "doce", "dragao",
  "escada", "escola", "espelho", "estrela", "faca", "farol", "ferro", "festa", "figura", "fio",
  "flauta", "floresta", "flor", "fogo", "folha", "fonte", "forca", "forno", "fruta", "fundo",
  "gaiola", "galho", "garfo", "gato", "gelo", "gigante", "girassol", "globo", "gota", "grade",
  "guarda", "harpa", "ilha", "janela", "jardim", "joia", "jornal", "lago", "lampada", "lanca",
  "leao", "leite", "lente", "letra", "livro", "lua", "luva", "maca", "mapa", "mar",
  "martelo", "mascara", "mesa", "mina", "moeda", "molho", "monte", "motor", "muro", "navio",
  "neve", "noite", "nota", "nuvem", "oculos", "onda", "osso", "ouro", "ovo", "palco",
];

export const PACKS: Record<Pack, string[]> = { en: EN, pt: PT };

export const PACK_NAME: Record<Pack, string> = { en: "english", pt: "portugues" };

function pick<T>(items: readonly T[], count: number, random: () => number): T[] {
  const pool = items.slice();
  const out: T[] = [];
  for (let i = 0; i < count && pool.length > 0; i += 1) {
    const at = Math.floor(random() * pool.length);
    out.push(pool.splice(at, 1)[0]);
  }
  return out;
}

export interface Setup {
  words: string[];
  key: Slot[];
  /** Whoever got the extra card leads. */
  first: Team;
}

/**
 * Twenty five words and the key behind them. One team gets nine cards and
 * starts, the other eight; seven belong to nobody and one ends the game on the
 * spot for whoever touches it.
 */
export function newSetup(pack: Pack, random: () => number = Math.random): Setup {
  const words = pick(PACKS[pack], GRID, random);
  const first: Team = random() < 0.5 ? "red" : "blue";
  const second: Team = first === "red" ? "blue" : "red";

  const slots: Slot[] = [
    ...Array<Slot>(FIRST_TEAM_CARDS).fill(first),
    ...Array<Slot>(SECOND_TEAM_CARDS).fill(second),
    ...Array<Slot>(NEUTRAL_CARDS).fill("neutral"),
    ...Array<Slot>(ASSASSIN_CARDS).fill("assassin"),
  ];

  // Shuffle the key so the layout is not the same shape every time.
  for (let i = slots.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [slots[i], slots[j]] = [slots[j], slots[i]];
  }

  return { words, key: slots, first };
}

/** How many of a team's cards are still face down. */
export function remaining(key: Slot[], revealed: boolean[], team: Team): number {
  let left = 0;
  for (let i = 0; i < key.length; i += 1) {
    if (key[i] === team && !revealed[i]) left += 1;
  }
  return left;
}

export type CodenamesOutcome =
  | { kind: "playing" }
  | { kind: "won"; winner: Team; reason: "cleared" | "assassin" };

/**
 * Where it stands. Turning over the assassin hands the game to the other side
 * immediately; otherwise it is won by clearing your own words.
 */
export function outcome(key: Slot[], revealed: boolean[], turn: Team): CodenamesOutcome {
  for (let i = 0; i < key.length; i += 1) {
    if (key[i] === "assassin" && revealed[i]) {
      return { kind: "won", winner: turn === "red" ? "blue" : "red", reason: "assassin" };
    }
  }
  for (const team of ["red", "blue"] as Team[]) {
    if (remaining(key, revealed, team) === 0) {
      return { kind: "won", winner: team, reason: "cleared" };
    }
  }
  return { kind: "playing" };
}

/**
 * What turning over this card does. Your own word lets you keep going; anything
 * else hands the turn over, and the assassin ends it.
 */
export function guessResult(slot: Slot, turn: Team): "continue" | "handover" | "lost" {
  if (slot === "assassin") return "lost";
  if (slot === turn) return "continue";
  return "handover";
}

// ---------------------------------------------------------------------------
// A key nobody but the spymasters can read
//
// The key lives in secret piles: one nobody owns, and an identical copy for
// each spymaster. Guessing a word turns over just that position of the
// ownerless copy, for everyone. What the table knows is what has been turned
// over, and since each side's total is public -- the first team has nine, the
// second eight -- the score and the end of the game follow from that alone.
// ---------------------------------------------------------------------------

export const KEY = "key";
export const MASTERS = ["redMaster", "blueMaster"] as const;
export type Master = (typeof MASTERS)[number];

export function keySlot(master: Master): string {
  return `key:${master}`;
}

export function wordSlot(index: number): string {
  return `word:${index}`;
}

/** The colours in a key, before the database shuffles them. */
export function keyCards(first: Team): Slot[] {
  const second: Team = first === "red" ? "blue" : "red";
  return [
    ...Array<Slot>(FIRST_TEAM_CARDS).fill(first),
    ...Array<Slot>(SECOND_TEAM_CARDS).fill(second),
    ...Array<Slot>(NEUTRAL_CARDS).fill("neutral"),
    ...Array<Slot>(ASSASSIN_CARDS).fill("assassin"),
  ];
}

/** Which words have been turned over, and what they were. */
export function turnedFrom(revealed: Record<string, unknown[]> | undefined): Record<number, Slot> {
  const out: Record<number, Slot> = {};
  for (const [key, cards] of Object.entries(revealed ?? {})) {
    if (!key.startsWith("word:")) continue;
    const slot = cards?.[0] as Slot | undefined;
    if (slot) out[Number(key.slice(5))] = slot;
  }
  return out;
}

export function totalFor(team: Team, first: Team): number {
  return team === first ? FIRST_TEAM_CARDS : SECOND_TEAM_CARDS;
}

export function leftFor(team: Team, first: Team, turned: Record<number, Slot>): number {
  return totalFor(team, first) - Object.values(turned).filter((slot) => slot === team).length;
}

/**
 * Where the game stands from what has been turned over. The assassin ends it
 * against whoever found it, which is the side whose turn it was when it was
 * turned -- the caller says which that was.
 */
export function standing(
  turned: Record<number, Slot>,
  first: Team,
  assassinFoundBy: Team | null,
): CodenamesOutcome {
  if (assassinFoundBy) {
    return { kind: "won", winner: assassinFoundBy === "red" ? "blue" : "red", reason: "assassin" };
  }
  for (const team of ["red", "blue"] as Team[]) {
    if (leftFor(team, first, turned) === 0) return { kind: "won", winner: team, reason: "cleared" };
  }
  return { kind: "playing" };
}

/** Picks the words for a board and which side goes first. The key is not made here. */
export function newBoard(pack: Pack, random: () => number = Math.random): { words: string[]; first: Team } {
  const setup = newSetup(pack, random);
  return { words: setup.words, first: setup.first };
}
