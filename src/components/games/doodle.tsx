"use client";

import StudioBoard from "@/components/games/studio/studio";
import type { DoodleState, Item } from "@/lib/types";

/** The paint board: the studio, on the table. */
export default function Doodle({ item, state }: { item: Item<"game">; state: DoodleState }) {
  return <StudioBoard item={item} state={state} />;
}
