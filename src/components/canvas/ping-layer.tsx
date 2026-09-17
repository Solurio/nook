"use client";

import { useRoom } from "@/realtime/room-provider";
import { useRoomStore } from "@/state/room-store";

/**
 * Short-lived reactions dropped on the canvas. Nothing here is persisted.
 *
 * Three elements per reaction, each with one job, because trying to do two of
 * them at once has bitten twice. The outer one is a zero-size marker at the
 * point that was tapped, counter-scaled so a reaction is the same size however
 * far the room is zoomed out. The middle one centres itself on that marker --
 * off its own box, which is the only measurement that can be trusted here.
 * The inner one animates, and nothing else, because a CSS animation overwrites
 * an inline transform and would otherwise throw the position away.
 *
 * The name hangs below without being part of the centring, so the emoji lands
 * on the spot rather than the emoji-and-a-label together.
 */
export default function PingLayer() {
  const { pings } = useRoom();
  const scale = useRoomStore((s) => s.viewport.scale);

  return (
    <>
      {pings.map((ping) => (
        <div
          key={ping.id}
          className="pointer-events-none absolute top-0 left-0 z-[9500] size-0"
          style={{ transform: `translate3d(${ping.x}px, ${ping.y}px, 0) scale(${1 / scale})` }}
        >
          <div className="absolute top-0 left-0 -translate-x-1/2 -translate-y-1/2">
            <div className="animate-ping-pop relative">
              <span
                className="block text-6xl leading-none"
                style={{ textShadow: `0 0 22px ${ping.tint}` }}
              >
                {ping.glyph}
              </span>
              <span
                className="absolute top-full left-1/2 mt-1 -translate-x-1/2 rounded-full px-1.5 py-0.5 text-[11px] font-semibold whitespace-nowrap text-ink-950"
                style={{ background: ping.tint }}
              >
                {ping.by}
              </span>
            </div>
          </div>
        </div>
      ))}
    </>
  );
}
