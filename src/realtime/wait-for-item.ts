import { useRoomStore } from "@/state/room-store";

/**
 * Waits for something to show up in an item's state -- a card the database
 * has just turned over, say -- which arrives over the room's channel a moment
 * after the call that caused it returns. Polls the store rather than guessing
 * a delay; gives up after a few seconds and returns null.
 */
export async function waitForItem<T>(
  itemId: string,
  read: (state: Record<string, unknown>) => T | null | undefined,
  tries = 20,
  every = 200,
): Promise<T | null> {
  for (let i = 0; i < tries; i += 1) {
    const item = useRoomStore.getState().items[itemId];
    const state = (item?.data as { state?: Record<string, unknown> } | undefined)?.state;
    const found = state ? read(state) : null;
    if (found !== null && found !== undefined) return found;
    await new Promise((resolve) => setTimeout(resolve, every));
  }
  return null;
}
