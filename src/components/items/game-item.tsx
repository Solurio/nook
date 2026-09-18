"use client";

import type { Item } from "@/lib/types";
import TicTacToe from "@/components/games/tic-tac-toe";
import ConnectFour from "@/components/games/connect-four";
import Doodle from "@/components/games/doodle";
import Chess from "@/components/games/chess";
import Checkers from "@/components/games/checkers";
import Intransitive from "@/components/games/intransitive";
import CardTable from "@/components/games/card-table";
import Dominoes from "@/components/games/dominoes";
import Codenames from "@/components/games/codenames";
import Coup from "@/components/games/coup";
import Spyfall from "@/components/games/spyfall";
import Resistance from "@/components/games/resistance";
import Uno from "@/components/games/uno";
import Dice from "@/components/games/dice";
import Coin from "@/components/games/coin";
import Wheel from "@/components/games/wheel";
import Buckshot from "@/components/games/buckshot";
import Rps from "@/components/games/rps";

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
    default:
      return null;
  }
}
