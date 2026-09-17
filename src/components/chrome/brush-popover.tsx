"use client";

import { BRUSH_COLORS, useRoomStore } from "@/state/room-store";
import Slider from "./slider";

/**
 * Colour, thickness and opacity for the room brush, shown while the draw tool
 * is on. Size and opacity are continuous rather than a handful of presets, so
 * picking a weight feels like a paint app instead of four buttons.
 */
export default function BrushPopover() {
  const brush = useRoomStore((s) => s.brush);
  const setBrush = useRoomStore((s) => s.setBrush);
  const tool = useRoomStore((s) => s.tool);
  const erasing = tool === "erase";

  // The preview dot maxes out so a fat brush does not blow the popover open.
  const dot = Math.min(34, Math.max(3, brush.size));

  return (
    <div className="surface-raised animate-drift-in absolute bottom-full left-1/2 mb-2 w-[16.5rem] max-w-[92vw] -translate-x-1/2 space-y-2.5 rounded-2xl p-3 shadow-2xl">
      {!erasing && (
        <div className="flex flex-wrap items-center gap-1.5">
          {BRUSH_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              onClick={() => setBrush({ color })}
              aria-label={`brush ${color}`}
              className={
                "size-7 rounded-full transition hover:scale-110 " +
                (brush.color === color ? "ring-2 ring-chalk ring-offset-2 ring-offset-ink-700" : "")
              }
              style={{ background: color }}
            />
          ))}

          <label
            className="relative size-7 cursor-pointer overflow-hidden rounded-full ring-1 ring-white/20"
            title="custom colour"
            style={{
              background: "conic-gradient(#f2a4b8,#f6c177,#a6d189,#8bc7e8,#c4a7f0,#f2a4b8)",
            }}
          >
            <input
              type="color"
              value={brush.color.slice(0, 7)}
              onChange={(event) => setBrush({ color: event.target.value })}
              className="absolute inset-0 cursor-pointer opacity-0"
            />
          </label>
        </div>
      )}

      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className="grid size-9 shrink-0 place-items-center rounded-lg bg-white/6"
          title="preview"
        >
          <span
            className="rounded-full"
            style={{
              width: dot,
              height: dot,
              background: erasing ? "#f4efe6" : brush.color.slice(0, 7),
              opacity: erasing ? 0.65 : brush.opacity,
            }}
          />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between text-[10px] text-muted/70">
            <span>size</span>
            <span className="tabular-nums">{brush.size}</span>
          </div>
          <Slider
            label="brush size"
            min={1}
            max={64}
            value={brush.size}
            onChange={(size) => setBrush({ size })}
          />
        </div>
      </div>

      {!erasing && (
        <div>
          <div className="flex items-center justify-between text-[10px] text-muted/70">
            <span>opacity</span>
            <span className="tabular-nums">{Math.round(brush.opacity * 100)}%</span>
          </div>
          <Slider
            label="brush opacity"
            min={10}
            max={100}
            value={Math.round(brush.opacity * 100)}
            onChange={(value) => setBrush({ opacity: value / 100 })}
          />
        </div>
      )}
    </div>
  );
}
