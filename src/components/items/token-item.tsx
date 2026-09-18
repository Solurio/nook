"use client";

import clsx from "clsx";
import type { Item } from "@/lib/types";
import { emptyToken, type TokenData } from "@/lib/grid";

/**
 * A piece for the table: a mini, a marker, a counter. A disc or a square in a
 * colour, with a picture or a couple of letters on it. Dragged like anything
 * else, it settles into a cell when let go over a grid.
 */
export default function TokenItem({ item }: { item: Item<"token"> }) {
  const data = { ...emptyToken(), ...item.data } as TokenData;
  const round = data.shape === "round";
  const letters = data.label.trim().slice(0, 3);

  return (
    <div
      className={clsx(
        "grid size-full place-items-center overflow-hidden border-[3px] shadow-[0_6px_14px_-4px_rgba(0,0,0,0.7)]",
        round ? "rounded-full" : "rounded-[18%]",
      )}
      style={{
        background: data.image ? `center / cover no-repeat url("${data.image.replace(/"/g, "%22")}")` : data.color,
        borderColor: data.image ? data.color : "rgba(255,255,255,0.55)",
      }}
      title={data.label || undefined}
    >
      {!data.image && letters && (
        <span
          className="font-bold text-ink-950 select-none"
          style={{ fontSize: `${Math.max(10, Math.min(item.width, item.height) * (letters.length > 2 ? 0.28 : 0.38))}px` }}
        >
          {letters}
        </span>
      )}
      {data.image && data.label && (
        <span className="absolute bottom-1 max-w-[90%] truncate rounded bg-ink-950/75 px-1 text-[10px] text-chalk">{data.label}</span>
      )}
    </div>
  );
}
