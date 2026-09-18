// Seats at a table. Every board game in a nook works the same way: chairs sit
// empty until someone claims one, and while they are all empty anyone may play
// either side -- which is what makes passing one phone around work.

export type Seats<K extends string> = Record<K, string | null>;

/**
 * Claiming a chair. Clicking your own chair stands up again, a chair someone
 * else is in does not budge, and taking one releases whichever you were in, so
 * a person is never sitting in two places at once.
 */
export function takeSeat<K extends string>(
  seats: Seats<K>,
  seat: NoInfer<K>,
  name: string,
): Seats<K> {
  const occupant = seats[seat];
  if (occupant === name) return { ...seats, [seat]: null };
  if (occupant) return seats;

  const next = { ...seats };
  for (const key of Object.keys(next) as K[]) {
    if (next[key] === name) next[key] = null;
  }
  next[seat] = name;
  return next;
}

/** Which chair this person is in, if any. */
export function seatOf<K extends string>(seats: Seats<K>, name: string): K | null {
  for (const key of Object.keys(seats) as K[]) {
    if (seats[key] === name) return key;
  }
  return null;
}

/** True while every chair is empty: the table is open to whoever is holding it. */
export function isOpenTable<K extends string>(seats: Seats<K>): boolean {
  return (Object.keys(seats) as K[]).every((key) => !seats[key]);
}

/**
 * Whether this person may make the move that is due. An open table lets anyone
 * play both sides (one device, passed around); otherwise it has to be your turn
 * in the chair you are sitting in.
 */
export function canPlay<K extends string>(
  seats: Seats<K>,
  turn: NoInfer<K>,
  name: string,
): boolean {
  if (isOpenTable(seats)) return true;
  return seats[turn] === name;
}

/**
 * What to tell the person above the board. Open tables say whose go it is so a
 * shared phone gets handed over; a seated table only nudges the player in that
 * chair.
 */
export function turnHint<K extends string>(
  seats: Seats<K>,
  turn: NoInfer<K>,
  name: string,
  label: (seat: K) => string,
): string {
  if (isOpenTable(seats)) return `${label(turn)} to play · pass it over`;
  if (seats[turn] === name) return "your go";
  if (seats[turn]) return `${seats[turn]} is thinking`;
  return `${label(turn)} to play · that chair is open`;
}

// ---------------------------------------------------------------------------
// Chairs that know who is in them
//
// A name is fine for showing who sits where, but a hidden hand has to belong to
// someone the database can recognise, and two visitors can share a name. So a
// table with anything secret on it also records each chair's user id.
// ---------------------------------------------------------------------------

export type Holders<K extends string> = Record<K, string | null>;

export interface Sitter {
  name: string;
  userId: string;
}

/**
 * The same rules as takeSeat -- your own chair stands you up, somebody else's
 * does not budge, and taking one lets go of any other -- keeping the names and
 * the ids in step.
 */
export function claimChair<K extends string>(
  seats: Seats<K>,
  holders: Partial<Holders<K>> | undefined,
  chair: NoInfer<K>,
  me: Sitter,
): { seats: Seats<K>; holders: Holders<K> } {
  const ids = { ...(holders ?? {}) } as Holders<K>;
  const mine = chairOf(seats, ids, me);

  if (mine === chair) {
    return { seats: { ...seats, [chair]: null }, holders: { ...ids, [chair]: null } };
  }
  if (seats[chair]) return { seats, holders: ids };

  const nextSeats = { ...seats };
  const nextIds = { ...ids };
  if (mine) {
    nextSeats[mine] = null;
    nextIds[mine] = null;
  }
  nextSeats[chair] = me.name;
  nextIds[chair] = me.userId;
  return { seats: nextSeats, holders: nextIds };
}

/**
 * Which chair is this person's. The id decides when there is one; a chair
 * taken before ids were recorded falls back to the name, so an old table does
 * not suddenly forget who was sitting at it.
 */
export function chairOf<K extends string>(
  seats: Seats<K>,
  holders: Partial<Holders<K>> | undefined,
  me: Sitter | null | undefined,
): K | null {
  if (!me) return null;
  for (const key of Object.keys(seats) as K[]) {
    const id = holders?.[key];
    if (id ? id === me.userId : seats[key] === me.name) return key;
  }
  return null;
}
