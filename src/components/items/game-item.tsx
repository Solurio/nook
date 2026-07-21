"use client";

import type { Item } from "@/lib/types";
import TicTacToe from "@/components/games/tic-tac-toe";
import ConnectFour from "@/components/games/connect-four";
import Doodle from "@/components/games/doodle";
import Chess from "@/components/games/chess";
import Checkers from "@/components/games/checkers";

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
    default:
      return null;
  }
}
