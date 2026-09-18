// The Resistance. A cell of rebels with spies planted in it. Five missions go
// out; the rebels need three to succeed and the spies need three to fail, and
// nobody knows for certain who is who except the spies, who know each other.
//
// The whole game is who gets sent. A leader proposes a team, the table votes it
// up or down, and only then do the people on it decide -- in private -- whether
// the mission works.

export const MIN_SEATS = 5;
export const MAX_SEATS = 10;
export const MISSIONS = 5;
/** Five proposals turned down in a row and the cell has fallen apart. */
export const MAX_REJECTIONS = 5;

/** How many of the table are working for the other side. */
export function spyCount(players: number): number {
  if (players <= 6) return 2;
  if (players <= 9) return 3;
  return 4;
}

/**
 * How many go on each mission. Straight from the board: the columns are five
 * players through ten, the rows are the five missions in order.
 */
const TEAM_SIZES: Record<number, number[]> = {
  5: [2, 3, 2, 3, 3],
  6: [2, 3, 4, 3, 4],
  7: [2, 3, 3, 4, 4],
  8: [3, 4, 4, 5, 5],
  9: [3, 4, 4, 5, 5],
  10: [3, 4, 4, 5, 5],
};

export function teamSize(players: number, mission: number): number {
  const row = TEAM_SIZES[Math.max(MIN_SEATS, Math.min(MAX_SEATS, players))];
  return row[Math.max(0, Math.min(MISSIONS - 1, mission))];
}

/**
 * The fourth mission at a big table needs two people to sabotage it, not one.
 * It is the one place a single spy on the team is not enough.
 */
export function needsTwoFails(players: number, mission: number): boolean {
  return players >= 7 && mission === 3;
}

/** Whether a mission came back a success, given how many sabotaged it. */
export function missionSucceeded(players: number, mission: number, fails: number): boolean {
  return fails < (needsTwoFails(players, mission) ? 2 : 1);
}

/** Picks who is working for the other side. */
export function dealSpies(chairs: string[], random: () => number = Math.random): string[] {
  const pool = [...chairs];
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, spyCount(chairs.length)).sort();
}

/** Who proposes first. Nobody should start with the job every game. */
export function firstLeader(players: number, random: () => number = Math.random): number {
  return Math.floor(random() * players);
}

export type Winner = "resistance" | "spies";

/**
 * Who has won, or null while it is still going. Three missions either way
 * settles it, and so does a table that will not agree on anyone at all.
 */
export function verdict(results: boolean[], rejections: number): Winner | null {
  const wins = results.filter(Boolean).length;
  const losses = results.length - wins;
  if (wins >= 3) return "resistance";
  if (losses >= 3) return "spies";
  if (rejections >= MAX_REJECTIONS) return "spies";
  return null;
}

/** Everyone has had their say on the proposal. */
export function voteIsIn(votes: Record<string, boolean>, chairs: string[]): boolean {
  return chairs.every((chair) => chair in votes);
}

/** A tie goes against the proposal: it takes a majority to send a team out. */
export function voteCarries(votes: Record<string, boolean>, chairs: string[]): boolean {
  const yes = chairs.filter((chair) => votes[chair] === true).length;
  return yes * 2 > chairs.length;
}

// ---------------------------------------------------------------------------
// Private roles, sealed votes, anonymous missions
//
// Who is a spy is a secret pile per chair, dealt by the database from a pool
// nobody sees shuffled; the spies are then told about each other and nobody
// else is. A vote is a sealed pile per chair: nobody can turn any of them over
// until everyone has voted, and then they all turn over together, by name --
// the vote is public in this game. Mission cards are sealed the same way but
// turned over pooled and shuffled, so the table learns how many failed and
// never who failed it.
//
// Each vote and each mission gets piles of its own, numbered, so a card turned
// over last time can never be mistaken for one turned over now.
// ---------------------------------------------------------------------------

export const ROLES = "roles";
export const SPY = "spy";
export const REBEL = "rebel";

export const roleSlot = (chair: string) => `role:${chair}`;
export const teamSlot = (chair: string) => `team:${chair}`;
export const voteSlot = (vote: number, chair: string) => `vote:${vote}:${chair}`;
export const playSlot = (mission: number, chair: string) => `play:${mission}:${chair}`;
export const missionPool = (mission: number) => `mission:${mission}`;

/** The cards the roles are dealt from: so many spies, the rest rebels. */
export function rolePool(players: number): string[] {
  const spies = spyCount(players);
  return [...Array(spies).fill(SPY), ...Array(Math.max(0, players - spies)).fill(REBEL)];
}

type Sizes = Record<string, { size: number } | undefined> | undefined;

/** Everyone listed has something in their pile. */
export function allCommitted(piles: Sizes, slots: string[]): boolean {
  return slots.length > 0 && slots.every((slot) => (piles?.[slot]?.size ?? 0) > 0);
}

/** The votes, once turned over: chair to approve. Null until every one is showing. */
export function readVotes(
  revealed: Record<string, unknown[]> | undefined,
  vote: number,
  chairs: string[],
): Record<string, boolean> | null {
  const out: Record<string, boolean> = {};
  for (const chair of chairs) {
    const card = revealed?.[voteSlot(vote, chair)]?.[0];
    if (typeof card !== "boolean") return null;
    out[chair] = card;
  }
  return out;
}

/** How many sabotaged a mission, once its cards are turned over. */
export function readFails(revealed: Record<string, unknown[]> | undefined, mission: number): number | null {
  const cards = revealed?.[missionPool(mission)];
  if (!Array.isArray(cards)) return null;
  return cards.filter((card) => card === "fail").length;
}

/** Spies, once everyone has turned their role over at the end. */
export function readSpies(
  revealed: Record<string, unknown[]> | undefined,
  chairs: string[],
): { spies: string[]; waitingOn: string[] } {
  const spies: string[] = [];
  const waitingOn: string[] = [];
  for (const chair of chairs) {
    const card = revealed?.[roleSlot(chair)]?.[0];
    if (card === undefined) waitingOn.push(chair);
    else if (card === SPY) spies.push(chair);
  }
  return { spies, waitingOn };
}
