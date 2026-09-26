"use client";

import dynamic from "next/dynamic";
import type { Item } from "@/lib/types";
import { t } from "@/lib/i18n";

// Each game is fetched the first time one is on the table, not with the room:
// a room with a chess board has no business downloading Monopoly's deck, the
// studio or Catan's island. What loads is small, and shows while it does.

function Opening() {
  return <div className="surface grain grid size-full place-items-center rounded-2xl text-[11px] text-muted">{t("opening the game...")}</div>;
}

const TicTacToe = dynamic(() => import("@/components/games/tic-tac-toe"), { loading: Opening });
const ConnectFour = dynamic(() => import("@/components/games/connect-four"), { loading: Opening });
const Doodle = dynamic(() => import("@/components/games/doodle"), { loading: Opening });
const Chess = dynamic(() => import("@/components/games/chess"), { loading: Opening });
const Checkers = dynamic(() => import("@/components/games/checkers"), { loading: Opening });
const Intransitive = dynamic(() => import("@/components/games/intransitive"), { loading: Opening });
const CardTable = dynamic(() => import("@/components/games/cards/card-table"), { loading: Opening });
const Dominoes = dynamic(() => import("@/components/games/dominoes"), { loading: Opening });
const Codenames = dynamic(() => import("@/components/games/codenames"), { loading: Opening });
const Coup = dynamic(() => import("@/components/games/coup"), { loading: Opening });
const Spyfall = dynamic(() => import("@/components/games/spyfall"), { loading: Opening });
const Resistance = dynamic(() => import("@/components/games/resistance"), { loading: Opening });
const Uno = dynamic(() => import("@/components/games/uno"), { loading: Opening });
const Dice = dynamic(() => import("@/components/games/dice"), { loading: Opening });
const Coin = dynamic(() => import("@/components/games/coin"), { loading: Opening });
const Wheel = dynamic(() => import("@/components/games/wheel"), { loading: Opening });
const Buckshot = dynamic(() => import("@/components/games/buckshot"), { loading: Opening });
const Rps = dynamic(() => import("@/components/games/rps"), { loading: Opening });
const Bang = dynamic(() => import("@/components/games/bang"), { loading: Opening });
const Bomb = dynamic(() => import("@/components/games/bomb"), { loading: Opening });
const War = dynamic(() => import("@/components/games/war"), { loading: Opening });
const Cah = dynamic(() => import("@/components/games/cah"), { loading: Opening });
const Quoridor = dynamic(() => import("@/components/games/quoridor"), { loading: Opening });
const Catan = dynamic(() => import("@/components/games/catan"), { loading: Opening });
const Reversi = dynamic(() => import("@/components/games/reversi"), { loading: Opening });
const Pool = dynamic(() => import("@/components/games/pool"), { loading: Opening });
const Battleship = dynamic(() => import("@/components/games/battleship"), { loading: Opening });
const Monopoly = dynamic(() => import("@/components/games/monopoly"), { loading: Opening });
const Chinese = dynamic(() => import("@/components/games/chinese"), { loading: Opening });
const TwentyOne = dynamic(() => import("@/components/games/twentyone"), { loading: Opening });

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
