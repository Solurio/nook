"use client";

import { useEffect, useMemo, useState } from "react";
import { useRoom } from "@/realtime/room-provider";
import { useRoomStore } from "@/state/room-store";
import { ownedSignature, ownedSlots, type PileMeta } from "@/lib/piles";

/**
 * The cards in this visitor's own piles for one item, and nothing else.
 *
 * There is no subscription here. Every change to a pile also rewrites the
 * item's public metadata, which already arrives over the room's channel; when
 * the part of it describing *my* piles changes, this reads them again. The
 * read goes through row level security, so what comes back is only ever mine.
 *
 * Kept in component state rather than the room store on purpose: it holds this
 * person's cards and only while the game is on screen.
 */
export function usePiles(itemId: string, meta: PileMeta | undefined): Record<string, unknown[]> {
  const { readPiles } = useRoom();
  const me = useRoomStore((s) => s.me?.userId ?? null);
  const signature = ownedSignature(meta, me);
  const [loaded, setLoaded] = useState<Record<string, unknown[]>>({});

  useEffect(() => {
    if (!signature) return;
    let cancelled = false;
    let retry = 0;
    // The slots the table says are mine: each entry is "<slot>:<size>:<at>".
    const wanted = signature.split("|").map((entry) => entry.split(":").slice(0, -2).join(":"));
    const read = (attempt: number) => {
      void readPiles(itemId).then((piles) => {
        if (cancelled) return;
        setLoaded(piles);
        // A read can land a moment before the cards it was told about. Ask
        // again, a few times at most, rather than show an empty hand.
        if (attempt < 3 && wanted.some((slot) => !(slot in piles))) {
          retry = window.setTimeout(() => read(attempt + 1), 600 * (attempt + 1));
        }
      });
    };
    read(0);
    return () => {
      cancelled = true;
      window.clearTimeout(retry);
    };
  }, [itemId, signature, readPiles]);

  // Only what the table currently says is mine. A pile handed to someone else
  // disappears from here the moment the metadata says so, without waiting for
  // a read that row level security would answer with nothing anyway.
  return useMemo(() => {
    const out: Record<string, unknown[]> = {};
    for (const slot of ownedSlots(meta, me)) {
      if (loaded[slot]) out[slot] = loaded[slot];
    }
    return out;
  }, [loaded, meta, me]);
}
