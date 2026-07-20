"use client";

import { memo, useMemo } from "react";
import { useRoomStore } from "@/state/room-store";
import { inkPath, orderStrokes } from "@/lib/ink";
import type { InkDraft, Stroke } from "@/lib/types";

/**
 * Paints all room ink inside the world-transformed container: committed strokes
 * plus whatever anyone is drawing right now. Purely visual and click-through so
 * it never gets in the way of the items underneath.
 *
 * Committed and in-flight ink are split into separate memoized layers, so a
 * live stroke arriving ~20 times a second does not repaint the (potentially
 * hundreds of) strokes already on the wall.
 */
function RoomInkLayer() {
  const strokes = useRoomStore((s) => s.strokes);
  const liveInk = useRoomStore((s) => s.liveInk);

  const hasAny = Object.keys(strokes).length > 0 || Object.keys(liveInk).length > 0;
  if (!hasAny) return null;

  return (
    <svg
      className="pointer-events-none absolute top-0 left-0 overflow-visible"
      width={1}
      height={1}
      style={{ zIndex: 5000 }}
      aria-hidden
    >
      <CommittedInk strokes={strokes} />
      <LiveInk drafts={liveInk} />
    </svg>
  );
}

const CommittedInk = memo(function CommittedInk({
  strokes,
}: {
  strokes: Record<string, Stroke>;
}) {
  const ordered = useMemo(() => orderStrokes(strokes), [strokes]);
  return (
    <>
      {ordered.map((stroke) => (
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
    </>
  );
});

function LiveInk({ drafts }: { drafts: Record<string, InkDraft> }) {
  return (
    <>
      {Object.values(drafts).map((draft) => (
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
    </>
  );
}

export default memo(RoomInkLayer);
