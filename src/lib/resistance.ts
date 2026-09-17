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
