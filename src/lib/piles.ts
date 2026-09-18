// The client's view of secret piles. The rules live in the database (see
// supabase/migrations/0006_tabletop.sql); this is the vocabulary for talking
// to them and the pure bits of reasoning about what comes back.
//
// A pile is an ordered list of cards, the first one on top. Its owner can read
// it; nobody else can -- and a pile with no owner is read by nobody at all.
// What everyone can see is the pile's metadata, which the database writes into
// the game's state as state.piles.

export interface PileInfo {
  owner: string | null;
  size: number;
  /** When it last changed, in epoch ms. A change here means read it again. */
  at: number;
  sealed: boolean;
}

export type PileMeta = Record<string, PileInfo>;

/** Cards the database has turned over for everyone, by the pile they came from. */
export type Revealed = Record<string, unknown[]>;

export type PileFn =
  | "pile_setup"
  | "pile_deal"
  | "pile_move"
  | "pile_draw"
  | "pile_take"
  | "pile_put"
  | "pile_shuffle"
  | "pile_cut"
  | "pile_reveal"
  | "pile_peek"
  | "pile_show"
  | "pile_give"
  | "pile_drop";

/**
 * The functions that can write the table's public state in the same breath as
 * moving cards. The rest only touch piles; any public change that goes with
 * them has to be written on its own.
 */
export const TAKES_PUBLIC: ReadonlySet<PileFn> = new Set<PileFn>([
  "pile_setup",
  "pile_deal",
  "pile_move",
  "pile_draw",
  "pile_take",
  "pile_put",
  "pile_drop",
]);

/** The slots this person owns, among the ones the table knows about. */
export function ownedSlots(meta: PileMeta | undefined, userId: string | null | undefined): string[] {
  if (!meta || !userId) return [];
  return Object.keys(meta)
    .filter((slot) => meta[slot]?.owner === userId)
    .sort();
}

/**
 * A fingerprint of the piles this person owns: which, how big, how recent.
 * When it changes there is something new to read; when it does not, a fresh
 * read would come back identical. Contains nothing about the cards.
 */
export function ownedSignature(meta: PileMeta | undefined, userId: string | null | undefined): string {
  return ownedSlots(meta, userId)
    .map((slot) => `${slot}:${meta?.[slot]?.size ?? 0}:${meta?.[slot]?.at ?? 0}`)
    .join("|");
}

export function sizeOf(meta: PileMeta | undefined, slot: string): number {
  return meta?.[slot]?.size ?? 0;
}

/**
 * Who a seat's hand should go to. Somebody sitting there gets it; an empty
 * chair's hand goes to whoever dealt, which is how one phone passed round the
 * table plays every hand -- and nobody else in the room can read those.
 */
export function handOwner(
  holders: Record<string, string | null> | undefined,
  chair: string,
  dealer: string,
): string {
  return holders?.[chair] ?? dealer;
}

/**
 * Strips what the database owns out of a state about to be written, so a
 * client never sends back its own stale copy of the piles or a reveal it did
 * not make. The database fills both in again on every write.
 */
export function forWriting<T extends { piles?: unknown; revealed?: unknown; peeked?: unknown }>(
  state: T,
): Omit<T, "piles"> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { piles, ...rest } = state;
  return rest;
}

/** Turns what the database said into something a person can act on. */
export function explainPileError(message: string | undefined | null): string {
  const text = message ?? "";
  if (/could not find the function|PGRST202|does not exist/i.test(text)) {
    return "This table needs the newest database update. Run supabase/migrations/0006_tabletop.sql in the Supabase SQL editor.";
  }
  if (/locked/i.test(text)) return "The room is locked, so only its owner can play.";
  if (/not yours/i.test(text)) return "Those are not your cards.";
  if (/not in /i.test(text)) return "That card is not in your hand any more.";
  if (/committed/i.test(text)) return "Not everyone has chosen yet.";
  if (/own hand/i.test(text)) return "You can only draw into your own hand.";
  return text || "The table did not take that move.";
}

/**
 * Hands this device holds for a chair somebody else now sits in, as
 * [slot, new owner] pairs. Those are owed to the person sitting there.
 */
export function handsOwed(
  meta: PileMeta | undefined,
  me: string | null | undefined,
  holders: Record<string, string | null> | undefined,
): Array<[string, string]> {
  if (!meta || !me || !holders) return [];
  const out: Array<[string, string]> = [];
  for (const [slot, info] of Object.entries(meta)) {
    if (!slot.startsWith("hand:") || info?.owner !== me) continue;
    const holder = holders[slot.slice(5)];
    if (holder && holder !== me) out.push([slot, holder]);
  }
  return out.sort((a, b) => a[0].localeCompare(b[0]));
}
