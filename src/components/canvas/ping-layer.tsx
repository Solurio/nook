"use client";

import { useRoom } from "@/realtime/room-provider";
import { useRoomStore } from "@/state/room-store";

/**
 * Short-lived reactions dropped on the canvas. Nothing here is persisted.
 *
 * Two elements per reaction rather than one, and on purpose: a CSS animation
 * beats an inline style in the cascade, so putting the position and the
 * keyframes on the same element let the animation overwrite the position and
 * every reaction drew itself at the world origin -- usually somewhere off
 * screen, which looked exactly like nothing happening. The outer element
 * places it, the inner one animates.
 */
export default function PingLayer() {
  const { pings } = useRoom();
  const scale = useRoomStore((s) => s.viewport.scale);

  return (
    <>
      {pings.map((ping) => (
        <div
          key={ping.id}
          className="pointer-events-none absolute top-0 left-0 z-[9500]"
          style={{
            // The -50% comes last so the emoji is centred on the point that was
            // clicked, whatever the zoom.
            transform: `translate3d(${ping.x}px, ${ping.y}px, 0) scale(${1 / scale}) translate(-50%, -50%)`,
          }}
        >
          <div className="animate-ping-pop flex flex-col items-center gap-0.5">
            <span className="text-6xl leading-none" style={{ textShadow: `0 0 22px ${ping.tint}` }}>
              {ping.glyph}
            </span>
            <span
              className="rounded-full px-1.5 py-0.5 text-[11px] font-semibold whitespace-nowrap text-ink-950"
              style={{ background: ping.tint }}
            >
              {ping.by}
            </span>
          </div>
        </div>
      ))}
    </>
  );
}
