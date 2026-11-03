// Werewolf (Lobisomem). A village with wolves hidden in it: every night the
// wolves kill, every day the village votes someone to death, and it goes on
// until the wolves are gone or there are as many wolves as villagers.
//
// The narrator is the database (supabase/migrations/0011_werewolf.sql). Roles
// and night actions live where no browser can read them; what the village may
// know -- who died and what they were, the day's votes, who won -- is written
// into this item's state under `ww`, and only the database writes there.
// Everything here is the shape of that state and the words for it.

export const MIN_SEATS = 4;
export const MAX_SEATS = 16;

export type Role = "wolf" | "villager" | "seer" | "doctor" | "hunter" | "witch";

export const ROLE_NAME: Record<Role, string> = {
  wolf: "werewolf",
  villager: "villager",
  seer: "seer",
  doctor: "doctor",
  hunter: "hunter",
  witch: "witch",
};

export const ROLE_DOES: Record<Role, string> = {
  wolf: "each night, with the other wolves, choose someone to kill. By day, pass for a villager.",
  villager: "no power but your vote. Work out who the wolves are before they work through you.",
  seer: "each night, look at one player's card and learn what they are.",
  doctor: "each night, sit up with one player: if the wolves come for them, they live. Not the same one two nights running.",
  hunter: "when you die, by night or by vote, you take one player with you.",
  witch: "you see whom the wolves chose. Once a game you can save them, and once a game you can poison someone.",
};

export const ROLE_TINT: Record<Role, string> = {
  wolf: "#d65a5a",
  villager: "#c9b48a",
  seer: "#8f7bea",
  doctor: "#5bc08f",
  hunter: "#d99a4e",
  witch: "#b067c9",
};

export interface WerewolfSetup {
  wolves: number;
  seer: boolean;
  doctor: boolean;
  hunter: boolean;
  witch: boolean;
}

export type Phase = "night" | "day" | "hunter" | "over";

/** What the narrator has told the village. Written only by the database. */
export interface Narration {
  /** A fresh id for every deal, so what a phone remembers of one game does not leak into the next. */
  game?: string;
  phase: Phase;
  night: number;
  alive: string[];
  dead: Array<{ chair: string; role: Role; how: "night" | "poison" | "lynch" | "shot"; night: number }>;
  /** Who has finished their night (or nothing about who did what). */
  done: string[];
  /** Day votes, in the open: chair to the chair they want dead, or "skip". */
  votes: Record<string, string>;
  hunter: string | null;
  shot: boolean;
  then?: Phase;
  /** Who died in the night just gone. */
  morning: string[];
  winner: "village" | "wolves" | null;
  /** Every role, once the game is over. */
  roles: Record<string, Role> | null;
  log: string[];
}

export interface WerewolfState {
  seats: Record<string, string | null>;
  holders?: Record<string, string | null>;
  seatCount: number;
  setup: WerewolfSetup;
  ww?: Narration;
  piles?: import("./piles").PileMeta;
  revealed?: Record<string, unknown[]>;
}

/** Wolves for a table of this size: one in five, at least one. */
export function defaultWolves(players: number): number {
  return Math.max(1, Math.floor(players / 4.5));
}

export function emptyWerewolf(seatCount = 6): WerewolfState {
  return {
    seats: {},
    holders: {},
    seatCount,
    setup: { wolves: defaultWolves(seatCount), seer: true, doctor: true, hunter: false, witch: false },
  };
}

export function chairsFor(count: number): string[] {
  return Array.from({ length: Math.max(MIN_SEATS, Math.min(MAX_SEATS, count)) }, (_, i) => `s${i}`);
}

export const roleSlot = (chair: string) => `role:${chair}`;

/** A role card: the role, and for a wolf, the other wolves. */
export function readCard(cards: unknown[] | undefined): { role: Role; wolves: string[] } | null {
  const role = cards?.[0];
  if (typeof role !== "string" || !(role in ROLE_NAME)) return null;
  return { role: role as Role, wolves: (cards ?? []).slice(1).filter((c): c is string => typeof c === "string") };
}

/** How many special cards the setup asks for, wolves included; the rest are villagers. */
export function specials(setup: WerewolfSetup): number {
  return setup.wolves + [setup.seer, setup.doctor, setup.hunter, setup.witch].filter(Boolean).length;
}

/** Whether a setup can be dealt to this many chairs. */
export function fits(setup: WerewolfSetup, players: number): boolean {
  return players >= MIN_SEATS && setup.wolves >= 1 && setup.wolves <= Math.floor((players - 1) / 2) && specials(setup) <= players;
}

/** The day's tally: votes against each player, and how many chose to spare everyone. */
export function tally(votes: Record<string, string>, alive: string[]): { against: Record<string, number>; skips: number; cast: number } {
  const against: Record<string, number> = {};
  let skips = 0;
  let cast = 0;
  for (const [voter, target] of Object.entries(votes)) {
    if (!alive.includes(voter)) continue;
    cast += 1;
    if (target === "skip") skips += 1;
    else against[target] = (against[target] ?? 0) + 1;
  }
  return { against, skips, cast };
}

const HOW: Record<Narration["dead"][number]["how"], string> = {
  night: "killed in the night",
  poison: "poisoned",
  lynch: "voted out",
  shot: "shot by the hunter",
};
export const howTheyDied = (how: Narration["dead"][number]["how"]) => HOW[how];
