"use client";

import { useRoomStore } from "@/state/room-store";
import { inkPath, orderStrokes } from "@/lib/ink";

/**
 * Paints all room ink inside the world-transformed container: committed strokes
 * plus whatever anyone is drawing right now. Purely visual and click-through so
 * it never gets in the way of the items underneath.
 */
export default function RoomInkLayer() {
  const strokes = useRoomStore((s) => s.strokes);
  const liveInk = useRoomStore((s) => s.liveInk);

  const committed = orderStrokes(strokes);
  const live = Object.values(liveInk);

  if (committed.length === 0 && live.length === 0) return null;

  return (
    <svg
      className="pointer-events-none absolute top-0 left-0 overflow-visible"
      width={1}
      height={1}
      style={{ zIndex: 5000 }}
      aria-hidden
    >
      {committed.map((stroke) => (
        <path
          key={stroke.id}
          d={inkPath(stroke.points)}
          fill="none"
          stroke={stroke.color}
          strokeWidth={stroke.size}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
      {live.map((draft) => (
        <path
          key={draft.id}
          d={inkPath(draft.points)}
          fill="none"
          stroke={draft.color}
          strokeWidth={draft.size}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={0.9}
        />
      ))}
    </svg>
  );
}
