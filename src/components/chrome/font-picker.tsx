"use client";

import { useState } from "react";
import clsx from "clsx";
import { Type, X } from "lucide-react";
import { BUNDLED_FONTS, INSTALLED_FONTS, fontStack } from "@/lib/fonts";

/**
 * A button that opens the list of fonts, each written in itself. The first
 * few are for everyone; the rest show where they are installed.
 */
export default function FontPicker({ value, onPick }: { value: string | undefined; onPick: (family: string | undefined) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const match = (f: string) => !q || f.toLowerCase().includes(q);

  const option = (family: string | undefined, label: string) => (
    <button
      key={label}
      type="button"
      onClick={() => {
        onPick(family);
        setOpen(false);
      }}
      className={clsx(
        "w-full truncate rounded-lg px-2 py-1.5 text-left text-[15px] text-chalk hover:bg-white/8",
        value === family && "bg-glow/15 ring-1 ring-glow/40",
      )}
      style={{ fontFamily: fontStack(family) }}
      title={label}
    >
      {label}
    </button>
  );

  return (
    <span className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-label="font"
        title="font"
        className={clsx(
          "flex h-8 max-w-28 items-center gap-1 rounded-xl px-2 text-[11px] ring-1 ring-white/10",
          open ? "bg-glow/20 text-chalk" : "bg-white/7 text-muted hover:text-chalk",
        )}
      >
        <Type className="size-3.5 shrink-0" strokeWidth={2.2} />
        <span className="truncate" style={{ fontFamily: fontStack(value) }}>
          {value ?? "font"}
        </span>
      </button>
      {open && (
        <div
          className="absolute top-10 left-1/2 z-50 flex max-h-80 w-64 -translate-x-1/2 flex-col gap-1 rounded-2xl bg-ink-900/97 p-2 shadow-2xl ring-1 ring-white/10 backdrop-blur-md"
          onPointerDown={(event) => event.stopPropagation()}
        >
          <div className="flex items-center gap-1">
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={`find one of ${BUNDLED_FONTS.length + INSTALLED_FONTS.length}`}
              className="h-8 min-w-0 flex-1 rounded-lg bg-white/7 px-2 text-[12px] text-chalk outline-none ring-1 ring-white/10 focus:ring-glow/45"
            />
            <button type="button" onClick={() => setOpen(false)} aria-label="close" className="grid size-8 place-items-center rounded-lg text-muted hover:text-chalk">
              <X className="size-3.5" />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {!q && option(undefined, "the room's own")}
            <p className="px-2 pt-1 text-[9px] font-semibold tracking-wide text-muted/60 uppercase">for everyone</p>
            {BUNDLED_FONTS.filter((f) => match(f.family)).map((f) => option(f.family, f.family))}
            <p className="px-2 pt-2 text-[9px] font-semibold tracking-wide text-muted/60 uppercase">where installed</p>
            {INSTALLED_FONTS.filter(match).map((f) => option(f, f))}
          </div>
        </div>
      )}
    </span>
  );
}
