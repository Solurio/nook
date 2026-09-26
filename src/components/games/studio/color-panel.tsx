"use client";

import { useState } from "react";
import clsx from "clsx";
import { ArrowLeftRight, Circle, Plus, SlidersHorizontal, Square, Trash2, Triangle } from "lucide-react";
import { BUILT_IN_PALETTES, harmonies, hexToHsv, hexToRgb, hsvToHex, parseHex, type HSV, type Palette } from "@/lib/studio/color";
import { Panel } from "./widgets";
import { Box, Sliders, Wheel, readPickerMode, savePickerMode, type PickerMode } from "./color-pickers";
import { t } from "@/lib/i18n";

const PICKERS: Array<{ id: PickerMode; name: string; icon: React.ReactNode }> = [
  { id: "square", name: "ring and square", icon: <Circle className="size-3.5" /> },
  { id: "triangle", name: "ring and triangle", icon: <Triangle className="size-3.5" /> },
  { id: "box", name: "big square", icon: <Square className="size-3.5" /> },
  { id: "sliders", name: "sliders", icon: <SlidersHorizontal className="size-3.5" /> },
];

/**
 * The colour: a wheel for the hue, a square (or a triangle) for how strong and how light,
 * the hex for when you know exactly, a second colour to swap to, the last few
 * used, and palettes -- the built-in ones and the table's own.
 */
export default function ColorPanel({
  color,
  second,
  recent,
  palettes,
  canEdit,
  onColor,
  onSwap,
  onPalettes,
  onClose,
}: {
  color: string;
  second: string;
  recent: string[];
  palettes: Palette[];
  canEdit: boolean;
  onColor: (hex: string) => void;
  onSwap: () => void;
  onPalettes: (next: Palette[]) => void;
  onClose: () => void;
}) {
  const [hsv, setHsv] = useState<HSV>(() => hexToHsv(color));
  // A grey has no hue of its own: keep the one the wheel was on.
  const fromHex = hexToHsv(color);
  const shown = hsvToHex(hsv) === color ? hsv : { ...fromHex, h: fromHex.s < 0.001 || fromHex.v < 0.001 ? hsv.h : fromHex.h };
  const [editing, setEditing] = useState<string | null>(null);
  const [mode, setMode] = useState<PickerMode>(readPickerMode);

  const set = (next: HSV) => {
    setHsv(next);
    onColor(hsvToHex(next));
  };

  const { r, g, b } = hexToRgb(color);
  const all = [...BUILT_IN_PALETTES, ...palettes];

  return (
    <Panel title={t("colour")} onClose={onClose} className="top-2 right-2 w-64">
      <div className="mb-2 flex gap-0.5 rounded-lg bg-white/5 p-0.5">
        {PICKERS.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => {
              setMode(m.id);
              savePickerMode(m.id);
            }}
            title={t(m.name)}
            aria-label={t(m.name)}
            className={clsx("grid h-7 flex-1 place-items-center rounded-md transition", mode === m.id ? "bg-white/14 text-chalk" : "text-muted hover:text-chalk")}
          >
            {m.icon}
          </button>
        ))}
      </div>

      {mode === "square" || mode === "triangle" ? (
        <Wheel hsv={shown} color={color} inner={mode} onChange={set} />
      ) : mode === "box" ? (
        <Box hsv={shown} color={color} onChange={set} />
      ) : (
        <Sliders hsv={shown} color={color} onChange={set} onColor={onColor} />
      )}

      <div className="mt-2 flex items-center gap-2">
        <span className="relative h-9 w-12 shrink-0">
          <span className="absolute top-0 left-0 size-7 rounded-md ring-2 ring-white/40" style={{ background: color }} title={t("this colour")} />
          <button type="button" onClick={onSwap} className="absolute right-0 bottom-0 size-5 rounded ring-1 ring-white/30" style={{ background: second }} title={t("the second colour: tap to swap")} aria-label={t("swap colours")} />
        </span>
        <input
          key={color}
          defaultValue={color}
          onBlur={(event) => {
            const hex = parseHex(event.target.value);
            if (hex) onColor(hex);
          }}
          onKeyDown={(event) => event.key === "Enter" && (event.target as HTMLInputElement).blur()}
          className="h-8 w-20 rounded-lg bg-white/7 px-2 text-[11px] text-chalk outline-none ring-1 ring-white/10"
          aria-label={t("hex")}
        />
        <span className="text-[10px] text-muted tabular-nums">
          {r} {g} {b}
        </span>
        <button type="button" onClick={onSwap} aria-label={t("swap colours")} className="ml-auto grid size-7 place-items-center rounded-lg text-muted hover:text-chalk">
          <ArrowLeftRight className="size-3.5" />
        </button>
      </div>

      {recent.length > 0 && (
        <div className="mt-2">
          <p className="mb-1 text-[9px] tracking-wide text-muted/60 uppercase">{t("just used")}</p>
          <div className="flex flex-wrap gap-1">
            {recent.map((c) => (
              <button key={c} type="button" onClick={() => onColor(c)} className="size-5 rounded ring-1 ring-white/15" style={{ background: c }} aria-label={c} />
            ))}
          </div>
        </div>
      )}

      <div className="mt-2">
        <p className="mb-1 text-[9px] tracking-wide text-muted/60 uppercase">{t("goes well with")}</p>
        <div className="flex flex-wrap gap-x-1.5 gap-y-1">
          {harmonies(shown).map((h) => (
            <span key={h.name} className="flex items-center gap-0.5 rounded-md bg-white/4 p-0.5" title={t(h.name)}>
              {h.colors.map((c, i) => (
                <button key={`${c}-${i}`} type="button" onClick={() => onColor(c)} className="size-4.5 rounded-sm ring-1 ring-white/15" style={{ background: c }} aria-label={`${t(h.name)}: ${c}`} />
              ))}
            </span>
          ))}
        </div>
      </div>

      <div className="mt-2 space-y-1.5">
        <div className="flex items-center gap-1">
          <p className="text-[9px] tracking-wide text-muted/60 uppercase">{t("palettes")}</p>
          <button
            type="button"
            disabled={!canEdit}
            onClick={() => {
              const id = `p${Date.now().toString(36)}`;
              onPalettes([...palettes, { id, name: `palette ${palettes.length + 1}`, colors: [color] }]);
              setEditing(id);
            }}
            className="ml-auto flex min-h-6 items-center gap-1 rounded-md bg-white/6 px-1.5 text-[10px] text-muted hover:text-chalk disabled:opacity-30"
          >
            <Plus className="size-3" />{" "}{t("new palette")}</button>
        </div>
        {all.map((p) => {
          const own = palettes.some((x) => x.id === p.id);
          return (
            <div key={p.id} className="rounded-lg bg-white/4 p-1">
              <div className="mb-1 flex items-center gap-1">
                {own && editing === p.id ? (
                  <input
                    autoFocus
                    defaultValue={p.name}
                    onBlur={(event) => {
                      onPalettes(palettes.map((x) => (x.id === p.id ? { ...x, name: event.target.value.slice(0, 24) || x.name } : x)));
                      setEditing(null);
                    }}
                    onKeyDown={(event) => event.key === "Enter" && (event.target as HTMLInputElement).blur()}
                    className="h-6 min-w-0 flex-1 rounded bg-white/8 px-1 text-[10px] text-chalk outline-none"
                  />
                ) : (
                  <button type="button" onClick={() => own && setEditing(p.id)} className="min-w-0 flex-1 truncate text-left text-[10px] text-muted">
                    {t(p.name)}
                  </button>
                )}
                {own && canEdit && (
                  <>
                    <button
                      type="button"
                      onClick={() => onPalettes(palettes.map((x) => (x.id === p.id && !x.colors.includes(color) ? { ...x, colors: [...x.colors, color].slice(0, 48) } : x)))}
                      aria-label={t("add this colour")}
                      title={t("add this colour")}
                      className="grid size-5 place-items-center rounded text-muted hover:text-chalk"
                    >
                      <Plus className="size-3" />
                    </button>
                    <button type="button" onClick={() => onPalettes(palettes.filter((x) => x.id !== p.id))} aria-label={t("delete the palette")} className="grid size-5 place-items-center rounded text-muted hover:text-red-300">
                      <Trash2 className="size-3" />
                    </button>
                  </>
                )}
              </div>
              <div className="flex flex-wrap gap-1">
                {p.colors.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => onColor(c)}
                    onContextMenu={(event) => {
                      if (!own || !canEdit) return;
                      event.preventDefault();
                      onPalettes(palettes.map((x) => (x.id === p.id ? { ...x, colors: x.colors.filter((y) => y !== c) } : x)));
                    }}
                    title={own ? t(`${c} -- right-click to take it out`) : c}
                    className={clsx("size-5 rounded ring-1 ring-white/15", c.toLowerCase() === color.toLowerCase() && "ring-2 ring-chalk")}
                    style={{ background: c }}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}
