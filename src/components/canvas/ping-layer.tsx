"use client";

import { useRoom } from "@/realtime/room-provider";
import { useRoomStore } from "@/state/room-store";

/** Short-lived reactions dropped on the canvas. Nothing here is persisted. */
export default function PingLayer() {
  const { pings } = useRoom();
  const scale = useRoomStore((s) => s.viewport.scale);

  return (
    <>
      {pings.map((ping) => (
        <div
          key={ping.id}
          className="animate-ping-pop pointer-events-none absolute top-0 left-0 z-[9500] text-6xl"
          style={{
            transform: `translate3d(${ping.x}px, ${ping.y}px, 0) scale(${1 / scale})`,
            transformOrigin: "center",
            textShadow: `0 0 22px ${ping.tint}`,
          }}
        >
          {ping.glyph}
        </div>
      ))}
    </>
  );
}
