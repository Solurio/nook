"use client";

import { BRUSH_COLORS, useRoomStore } from "@/state/room-store";

const SIZES = [2, 4, 8, 16] as const;

/** Colour and thickness for the room brush. Shown while the draw tool is on. */
export default function BrushPopover() {
  const brush = useRoomStore((s) => s.brush);
  const setBrush = useRoomStore((s) => s.setBrush);

  return (
    <div className="surface-raised animate-drift-in absolute bottom-full left-1/2 mb-2 flex -translate-x-1/2 items-center gap-2.5 rounded-2xl p-2 shadow-2xl">
      <div className="flex items-center gap-1">
        {BRUSH_COLORS.map((color) => (
          <button
            key={color}
            type="button"
            onClick={() => setBrush({ color })}
            aria-label={`brush ${color}`}
            className={
              "size-6 rounded-full transition hover:scale-110 " +
              (brush.color === color ? "ring-2 ring-chalk ring-offset-2 ring-offset-ink-700" : "")
            }
            style={{ background: color }}
          />
        ))}

        <label
          className="relative size-6 cursor-pointer overflow-hidden rounded-full ring-1 ring-white/20"
          title="custom colour"
          style={{
            background:
              "conic-gradient(#f2a4b8,#f6c177,#a6d189,#8bc7e8,#c4a7f0,#f2a4b8)",
          }}
        >
          <input
            type="color"
            value={brush.color}
            onChange={(event) => setBrush({ color: event.target.value })}
            className="absolute inset-0 cursor-pointer opacity-0"
          />
        </label>
      </div>

      <div className="h-5 w-px bg-white/12" />

      <div className="flex items-center gap-1">
        {SIZES.map((size) => (
          <button
            key={size}
            type="button"
            onClick={() => setBrush({ size })}
            aria-label={`thickness ${size}`}
            className={
              "grid size-7 place-items-center rounded-lg transition " +
              (brush.size === size ? "bg-white/14" : "hover:bg-white/8")
            }
          >
            <span
              className="rounded-full"
              style={{
                width: Math.min(18, size + 3),
                height: Math.min(18, size + 3),
                background: brush.color,
              }}
            />
          </button>
        ))}
      </div>
    </div>
  );
}
