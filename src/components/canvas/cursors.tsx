"use client";

import { useRoomStore } from "@/state/room-store";

export default function Cursors() {
  const peers = useRoomStore((s) => s.peers);
  const meId = useRoomStore((s) => s.me?.userId);
  const scale = useRoomStore((s) => s.viewport.scale);

  return (
    <>
      {Object.values(peers).map((peer) => {
        if (peer.userId === meId || !peer.cursor) return null;
        return (
          <div
            key={peer.userId}
            className="pointer-events-none absolute top-0 left-0 z-[9000]"
            style={{
              // Counter-scaling keeps cursors legible at any zoom level.
              transform: `translate3d(${peer.cursor.x}px, ${peer.cursor.y}px, 0) scale(${1 / scale})`,
              transition: "transform 90ms linear",
              transformOrigin: "top left",
            }}
          >
            <svg width="20" height="22" viewBox="0 0 20 22" fill="none" aria-hidden>
              <path
                d="M2 1.5 17 11.2l-6.6 1.1L7 19.4 2 1.5Z"
                fill={peer.tint}
                stroke="rgb(16 13 22 / 0.55)"
                strokeWidth="1.4"
                strokeLinejoin="round"
              />
            </svg>
            <span
              className="mt-0.5 ml-3 inline-block rounded-lg px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap text-ink-950 shadow-sm"
              style={{ background: peer.tint }}
            >
              {peer.name}
            </span>
          </div>
        );
      })}
    </>
  );
}
