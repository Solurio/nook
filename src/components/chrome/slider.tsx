"use client";

import clsx from "clsx";

/**
 * A slider you can actually hit with a thumb. The visible track stays thin, but
 * the input itself is tall, so the touch target is the full height rather than
 * the few pixels of the bar.
 */
export default function Slider({
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  label,
  className,
}: {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  label: string;
  className?: string;
}) {
  return (
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(event) => onChange(Number(event.target.value))}
      // Sliders live inside draggable items; the canvas must not steal the drag.
      onPointerDown={(event) => event.stopPropagation()}
      aria-label={label}
      title={label}
      className={clsx(
        "h-7 w-full cursor-pointer appearance-none bg-transparent",
        "[&::-webkit-slider-runnable-track]:h-1 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-white/15",
        "[&::-webkit-slider-thumb]:-mt-[5px] [&::-webkit-slider-thumb]:size-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-chalk [&::-webkit-slider-thumb]:shadow",
        "[&::-moz-range-track]:h-1 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-white/15",
        "[&::-moz-range-thumb]:size-3.5 [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-chalk",
        className,
      )}
    />
  );
}
