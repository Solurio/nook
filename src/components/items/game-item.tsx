"use client";

import { preloadable } from "@/lib/preload";
import type { Item } from "@/lib/types";
import { t } from "@/lib/i18n";

// Each game is its own file, so a room opens without downloading every game
// first. They come down afterwards, while the room is idle (lib/preload), so
// putting one on the table draws it at once; until then, a small placeholder.

function Opening() {
  return <div className="surface grain grid size-full place-items-center rounded-2xl text-[11px] text-muted">{t("opening the game...")}</div>;
}

const TicTacToe = preloadable(() => import("@/components/games/tic-tac-toe"), Opening);
const ConnectFour = preloadable(() => import("@/components/games/connect-four"), Opening);
const Doodle = preloadable(() => import("@/components/games/doodle"), Opening);
const Chess = preloadable(() => import("@/components/games/chess"), Opening);
const Checkers = preloadable(() => import("@/components/games/checkers"), Opening);
const Intransitive = preloadable(() => import("@/components/games/intransitive"), Opening);
const CardTable = preloadable(() => import("@/components/games/cards/card-table"), Opening);
const Dominoes = preloadable(() => import("@/components/games/dominoes"), Opening);
const Codenames = preloadable(() => import("@/components/games/codenames"), Opening);
const Coup = preloadable(() => import("@/components/games/coup"), Opening);
const Spyfall = preloadable(() => import("@/components/games/spyfall"), Opening);
const Resistance = preloadable(() => import("@/components/games/resistance"), Opening);
const Uno = preloadable(() => import("@/components/games/uno"), Opening);
const Dice = preloadable(() => import("@/components/games/dice"), Opening);
const Coin = preloadable(() => import("@/components/games/coin"), Opening);
const Wheel = preloadable(() => import("@/components/games/wheel"), Opening);
const Buckshot = preloadable(() => import("@/components/games/buckshot"), Opening);
const Rps = preloadable(() => import("@/components/games/rps"), Opening);
const Bang = preloadable(() => import("@/components/games/bang"), Opening);
const Bomb = preloadable(() => import("@/components/games/bomb"), Opening);
const War = preloadable(() => import("@/components/games/war"), Opening);
const Cah = preloadable(() => import("@/components/games/cah"), Opening);
const Quoridor = preloadable(() => import("@/components/games/quoridor"), Opening);
const Catan = preloadable(() => import("@/components/games/catan"), Opening);
const Reversi = preloadable(() => import("@/components/games/reversi"), Opening);
const Pool = preloadable(() => import("@/components/games/pool"), Opening);
const Battleship = preloadable(() => import("@/components/games/battleship"), Opening);
const Monopoly = preloadable(() => import("@/components/games/monopoly"), Opening);
const Chinese = preloadable(() => import("@/components/games/chinese"), Opening);
const TwentyOne = preloadable(() => import("@/components/games/twentyone"), Opening);

export default function GameItem({ item }: { item: Item<"game"> }) {
  switch (item.data.game) {
    case "tictactoe":
      return <TicTacToe item={item} state={item.data.state} />;
    case "connectfour":
      return <ConnectFour item={item} state={item.data.state} />;
    case "doodle":
      return <Doodle item={item} state={item.data.state} />;
    case "chess":
      return <Chess item={item} state={item.data.state} />;
    case "checkers":
      return <Checkers item={item} state={item.data.state} />;
    case "intransitive":
      return <Intransitive item={item} state={item.data.state} />;
    case "cards":
      return <CardTable item={item} state={item.data.state} />;
    case "dominoes":
      return <Dominoes item={item} state={item.data.state} />;
    case "codenames":
      return <Codenames item={item} state={item.data.state} />;
    case "coup":
      return <Coup item={item} state={item.data.state} />;
    case "spyfall":
      return <Spyfall item={item} state={item.data.state} />;
    case "resistance":
      return <Resistance item={item} state={item.data.state} />;
    case "uno":
      return <Uno item={item} state={item.data.state} />;
    case "dice":
      return <Dice item={item} state={item.data.state} />;
    case "coin":
      return <Coin item={item} state={item.data.state} />;
    case "wheel":
      return <Wheel item={item} state={item.data.state} />;
    case "buckshot":
      return <Buckshot item={item} state={item.data.state} />;
    case "rps":
      return <Rps item={item} state={item.data.state} />;
    case "bang":
      return <Bang item={item} state={item.data.state} />;
    case "bomb":
      return <Bomb item={item} state={item.data.state} />;
    case "war":
      return <War item={item} state={item.data.state} />;
    case "cah":
      return <Cah item={item} state={item.data.state} />;
    case "quoridor":
      return <Quoridor item={item} state={item.data.state} />;
    case "catan":
      return <Catan item={item} state={item.data.state} />;
    case "pool":
      return <Pool item={item} state={item.data.state} />;
    case "battleship":
      return <Battleship item={item} state={item.data.state} />;
    case "monopoly":
      return <Monopoly item={item} state={item.data.state} />;
    case "reversi":
      return <Reversi item={item} state={item.data.state} />;
    case "chinese":
      return <Chinese item={item} state={item.data.state} />;
    case "twentyone":
      return <TwentyOne item={item} state={item.data.state} />;
    default:
      return null;
  }
}
