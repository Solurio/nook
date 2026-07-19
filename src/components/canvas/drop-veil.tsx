"use client";

import { ImageDown } from "lucide-react";

export default function DropVeil() {
  return (
    <div className="pointer-events-none absolute inset-4 z-[9800] grid place-items-center rounded-3xl border-2 border-dashed border-glow/55 bg-ink-950/45 backdrop-blur-[2px]">
      <div className="flex items-center gap-2.5 rounded-2xl bg-ink-900/90 px-5 py-3 text-sm font-medium ring-1 ring-white/12">
        <ImageDown className="size-4.5 text-glow" strokeWidth={2.2} />
        drop it anywhere
      </div>
    </div>
  );
}
