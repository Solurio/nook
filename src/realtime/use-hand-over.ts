"use client";

import { useEffect, useRef } from "react";
import { useRoom } from "@/realtime/room-provider";
import { useRoomStore } from "@/state/room-store";
import { handsOwed, type PileMeta } from "@/lib/piles";

/**
 * Hands the cards to whoever sits down.
 *
 * A hand dealt to an empty chair belongs to whoever dealt it -- that is how
 * one phone passed round the table plays every hand. But if somebody then
 * sits in that chair, the dealer's phone would go on reading a hand that is
 * now a real person's. So the device that owns it gives it to them, the
 * moment it sees them sit. Only the owner can give a pile away, so this has to
 * run on the dealer's side; it does, on every device, for whatever that
 * device happens to own.
 */
export function useHandOver(
  itemId: string,
  meta: PileMeta | undefined,
  holders: Record<string, string | null> | undefined,
): void {
  const { pile, canEdit } = useRoom();
  const me = useRoomStore((s) => s.me?.userId ?? null);
  const given = useRef(new Set<string>());

  const owed = handsOwed(meta, me, holders)
    .map(([slot, holder]) => `${slot}>${holder}`)
    .join(",");

  useEffect(() => {
    if (!owed || !canEdit) return;
    for (const pair of owed.split(",")) {
      if (given.current.has(pair)) continue;
      given.current.add(pair);
      const [slot, holder] = pair.split(">");
      void pile("pile_give", { p_item: itemId, p_slot: slot, p_owner: holder });
    }
  }, [owed, canEdit, itemId, pile]);
}

/**
 * Wipes an old, leaky save the first time someone who can edit the room sees
 * it. The interface already ignores what the old versions kept in the open,
 * but ignoring it still sent it to everyone who loaded the room; writing the
 * clean state back is what actually takes it out of the database.
 */
export function useScrub(needed: boolean, write: () => void): void {
  const { canEdit } = useRoom();
  const done = useRef(false);
  useEffect(() => {
    if (!needed || !canEdit || done.current) return;
    done.current = true;
    write();
    // Written once per mount; the clean state that comes back has nothing to scrub.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needed, canEdit]);
}
