"use client";

import clsx from "clsx";
import { X } from "lucide-react";
import type { Guides } from "@/lib/studio/guides";
import { t } from "@/lib/i18n";

function Choice<T extends string | number>({ value, options, onChange }: { value: T; options: Array<{ id: T; name: string }>; onChange: (v: T) => void }) {
  return (
    <span className="flex rounded-lg bg-white/6 p-0.5">
      {options.map((o) => (
        <button
          key={String(o.id)}
          type="button"
          onClick={() => onChange(o.id)}
          className={clsx("min-h-7 flex-1 rounded-md px-2 text-[10px] whitespace-nowrap transition", value === o.id ? "bg-chalk font-semibold text-ink-950" : "text-muted hover:text-chalk")}
        >
          {t(o.name)}
        </button>
      ))}
    </span>
  );
}

function Toggle({ on, onClick, name, hint }: { on: boolean; onClick: () => void; name: string; hint: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={onClick} className="flex w-full items-start gap-2 rounded-lg px-1 py-1 text-left hover:bg-white/5">
      <span className={clsx("mt-0.5 flex h-4 w-7 shrink-0 items-center rounded-full p-0.5 transition", on ? "bg-[#5a96ff]" : "bg-white/15")}>
        <span className={clsx("size-3 rounded-full bg-white shadow transition", on && "translate-x-3")} />
      </span>
      <span className="min-w-0">
        <span className="block text-[11px] text-chalk">{t(name)}</span>
        <span className="block text-[10px] leading-snug text-muted">{t(hint)}</span>
      </span>
    </button>
  );
}

/**
 * Guides over the picture and help with strokes: a grid, thirds, perspective,
 * strokes that keep to the guides, and shapes that tidy themselves. Only on
 * this device -- nobody else sees your guides.
 */
export default function GuidesMenu({ guides, onChange, onClose }: { guides: Guides; onChange: (next: Guides) => void; onClose: () => void }) {
  const set = (patch: Partial<Guides>) => onChange({ ...guides, ...patch });
  return (
    <div
      className="surface-raised animate-drift-in absolute top-2 right-2 z-20 w-64 max-w-[calc(100%-1rem)] space-y-2.5 rounded-xl p-2.5 shadow-2xl"
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold text-chalk">{t("guides and drawing help")}</p>
        <button type="button" onClick={onClose} aria-label={t("close")} className="grid size-7 place-items-center rounded-md text-muted hover:bg-white/8 hover:text-chalk">
          <X className="size-3.5" />
        </button>
      </div>

      <div className="space-y-1">
        <p className="text-[9px] tracking-wide text-muted/70 uppercase">{t("grid")}</p>
        <Choice
          value={guides.grid}
          options={[
            { id: 0, name: "off" },
            { id: 32, name: "fine" },
            { id: 100, name: "medium" },
            { id: 250, name: "coarse" },
          ]}
          onChange={(grid) => set({ grid })}
        />
      </div>

      <div className="space-y-1">
        <p className="text-[9px] tracking-wide text-muted/70 uppercase">{t("perspective")}</p>
        <Choice
          value={guides.perspective}
          options={[
            { id: 0, name: "off" },
            { id: 1, name: "1 point" },
            { id: 2, name: "2 points" },
          ]}
          onChange={(perspective) => set({ perspective })}
        />
        {guides.perspective > 0 && <p className="text-[10px] leading-snug text-muted">{t("drag the blue dots on the picture to move the vanishing points; the horizon goes with them")}</p>}
      </div>

      <div className="space-y-0.5 border-t border-white/8 pt-1.5">
        <Toggle on={guides.thirds} onClick={() => set({ thirds: !guides.thirds })} name="thirds" hint="the picture cut in three each way, for placing things" />
        <Toggle
          on={guides.assist}
          onClick={() => set({ assist: !guides.assist })}
          name="keep strokes on the guides"
          hint={guides.perspective > 0 ? "each stroke runs straight toward a vanishing point, or straight up" : "each stroke runs straight: across, up, or at 45 degrees"}
        />
        <Toggle on={guides.quickShape} onClick={() => set({ quickShape: !guides.quickShape })} name="hold to tidy" hint="hold still at the end of a stroke: it becomes a clean line, circle or shape" />
      </div>
      <p className="text-[9px] text-muted/60">{t("only on this device -- nobody else sees your guides")}</p>
    </div>
  );
}
