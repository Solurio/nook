// Where a game starts: its first state, for the dock to put down. Each game's
// rules are fetched the first time one is started, so the room itself does
// not carry every game's code.

import type { GameKind, ItemDataMap } from "./types";

export async function startingGame(game: GameKind): Promise<ItemDataMap["game"]> {
  switch (game) {
    case "tictactoe":
      return {
        game: "tictactoe",
        state: {
          board: Array(9).fill(null),
          turn: "x",
          seats: { x: null, o: null },
          wins: { x: 0, o: 0, draw: 0 },
        },
      };
    case "connectfour":
      return {
        game: "connectfour",
        state: {
          columns: Array.from({ length: 7 }, () => [] as (string | null)[]),
          turn: "r",
          seats: { r: null, y: null },
          wins: { r: 0, y: 0, draw: 0 },
        },
      };
    case "doodle":
      return { game: "doodle", state: { strokes: [] } };
    case "chess":
      return {
        game: "chess",
        state: {
          board: (await import("./chess")).initialBoard(),
          turn: "w",
          seats: { w: null, b: null },
          wins: { w: 0, b: 0, draw: 0 },
        },
      };
    case "coup":
      return { game: "coup", state: (await import("./coup")).emptyCoup(4) };
    case "spyfall":
      return {
        game: "spyfall",
        state: {
          seats: {},
          seatCount: 6,
          holders: {},
          round: 0,
          startedAt: null,
          seconds: (await import("./spyfall")).DEFAULT_SECONDS,
          called: false,
          pack: "en",
          wins: { spy: 0, table: 0 },
        },
      };
    case "uno":
      return { game: "uno", state: (await import("./uno")).emptyUno(4) };
    case "dice":
      return { game: "dice", state: (await import("./dice")).emptyDice() };
    case "coin":
      return { game: "coin", state: (await import("./coin")).emptyCoin() };
    case "wheel":
      return { game: "wheel", state: (await import("./wheel")).emptyWheel() };
    case "buckshot":
      return { game: "buckshot", state: (await import("./buckshot")).emptyBuckshot(2) };
    case "rps":
      return { game: "rps", state: (await import("./rps")).emptyRps(2) };
    case "bang":
      return { game: "bang", state: (await import("./bang")).emptyBang(5) };
    case "bomb":
      return { game: "bomb", state: (await import("./bomb")).emptyBomb(4) };
    case "war":
      return { game: "war", state: (await import("./war")).emptyWar(4) };
    case "cah":
      return { game: "cah", state: (await import("./cah")).emptyCah(5) };
    case "quoridor":
      return { game: "quoridor", state: (await import("./quoridor")).emptyQuoridor(2) };
    case "catan":
      return { game: "catan", state: (await import("./catan")).emptyCatan(4) };
    case "reversi":
      return { game: "reversi", state: (await import("./reversi")).emptyReversi() };
    case "pool":
      return { game: "pool", state: (await import("./pool")).emptyPool() };
    case "battleship":
      return { game: "battleship", state: (await import("./battleship")).emptyBattleship() };
    case "monopoly":
      return { game: "monopoly", state: (await import("./monopoly")).emptyMonopoly() };
    case "resistance":
      return {
        game: "resistance",
        state: {
          seats: {},
          seatCount: 5,
          holders: {},
          leader: 0,
          mission: 0,
          results: [],
          rejections: 0,
          team: [],
          voteNo: 0,
          stage: "lobby",
          wins: { resistance: 0, spies: 0 },
        },
      };
    case "codenames":
      return {
        game: "codenames",
        state: {
          pack: "en",
          words: [],
          turn: "red",
          seats: { redMaster: null, blueMaster: null },
          holders: { redMaster: null, blueMaster: null },
          clue: null,
          wins: { red: 0, blue: 0 },
          round: 0,
          results: {},
          assassin: null,
        },
      };
    case "dominoes":
      return {
        game: "dominoes",
        state: {
          line: [],
          seats: {},
          holders: {},
          seatCount: 4,
          teams: 2,
          turn: "s0",
          passes: 0,
          round: 0,
          results: {},
        },
      };
    case "cards":
      return { game: "cards", state: (await import("./table")).emptyTable("52") };
    case "intransitive":
      return {
        game: "intransitive",
        state: {
          board: (await import("./intransitive")).initialBoard(),
          turn: "blue",
          seats: { blue: null, red: null },
          wins: { blue: 0, red: 0, draw: 0 },
        },
      };
    case "checkers":
      return {
        game: "checkers",
        state: {
          board: (await import("./checkers")).initialBoard(),
          turn: "r",
          seats: { r: null, b: null },
          wins: { r: 0, b: 0, draw: 0 },
          chain: null,
        },
      };
  }
}
