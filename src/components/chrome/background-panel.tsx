"use client";

import { useState } from "react";
import clsx from "clsx";
import { Loader2, Upload, X } from "lucide-react";
import { useRoom } from "@/realtime/room-provider";
import { useRoomStore } from "@/state/room-store";
import type { Background } from "@/lib/types";

const SOLIDS = [
  "#100d16", "#1b2233", "#22201a", "#1d2b22",
  "#2b1d28", "#141b26", "#2a2118", "#0f1a1a",
];

const GRADIENTS: Array<{ from: string; to: string; angle: number }> = [
  { from: "#1b1725", to: "#2c2136", angle: 150 },
  { from: "#132030", to: "#28394f", angle: 165 },
  { from: "#2a1c2b", to: "#4a2b3c", angle: 140 },
  { from: "#16241f", to: "#2c3f33", angle: 155 },
  { from: "#241a10", to: "#43301c", angle: 145 },
  { from: "#191932", to: "#3a2a54", angle: 170 },
];

export default function BackgroundPanel() {
  const { updateBackground, uploadFile } = useRoom();
  const room = useRoomStore((s) => s.room);
  const setPanel = useRoomStore((s) => s.setPanel);

  const [urlDraft, setUrlDraft] = useState("");
  const [uploading, setUploading] = useState(false);

  const background = room?.background;
  const isImage = background?.kind === "image";

  const apply = (next: Background) => void updateBackground(next);

  return (
    <aside className="surface animate-drift-in absolute top-16 right-3 z-40 flex max-h-[calc(100dvh-9rem)] w-[19rem] flex-col overflow-hidden rounded-3xl">
      <header className="flex items-center justify-between border-b border-white/8 px-4 py-3">
        <h2 className="text-sm font-semibold">the walls</h2>
        <button
          type="button"
          onClick={() => setPanel(null)}
          aria-label="close"
          className="grid size-6 place-items-center rounded-lg text-muted transition hover:bg-white/8 hover:text-chalk"
        >
          <X className="size-3.5" strokeWidth={2.4} />
        </button>
      </header>

      <div className="space-y-5 overflow-y-auto px-4 py-4">
        <Section title="gradients">
          <div className="grid grid-cols-3 gap-2">
            {GRADIENTS.map((preset) => {
              const active =
                background?.kind === "gradient" &&
                background.from === preset.from &&
                background.to === preset.to;
              return (
                <button
                  key={preset.from + preset.to}
                  type="button"
                  onClick={() => apply({ kind: "gradient", ...preset })}
                  aria-label={`gradient ${preset.from}`}
                  className={clsx(
                    "h-12 rounded-xl transition hover:scale-[1.04]",
                    active ? "ring-2 ring-glow ring-offset-2 ring-offset-ink-800" : "ring-1 ring-white/12",
                  )}
                  style={{
                    background: `linear-gradient(${preset.angle}deg, ${preset.from}, ${preset.to})`,
                  }}
                />
              );
            })}
          </div>
        </Section>

        <Section title="flat colours">
          <div className="grid grid-cols-4 gap-2">
            {SOLIDS.map((color) => {
              const active = background?.kind === "solid" && background.color === color;
              return (
                <button
                  key={color}
                  type="button"
                  onClick={() => apply({ kind: "solid", color })}
                  aria-label={`colour ${color}`}
                  className={clsx(
                    "h-9 rounded-xl transition hover:scale-[1.06]",
                    active ? "ring-2 ring-glow ring-offset-2 ring-offset-ink-800" : "ring-1 ring-white/12",
                  )}
                  style={{ background: color }}
                />
              );
            })}
          </div>

          <label className="mt-2 flex items-center justify-between rounded-xl bg-white/6 px-3 py-2 text-xs text-muted ring-1 ring-white/10">
            pick your own
            <input
              type="color"
              value={background?.kind === "solid" ? background.color : "#1b1725"}
              onChange={(event) => apply({ kind: "solid", color: event.target.value })}
              className="size-6 cursor-pointer rounded border-0 bg-transparent p-0"
            />
          </label>
        </Section>

        <Section title="wallpaper">
          <div className="space-y-2">
            <label
              className={clsx(
                "flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-white/7 px-3 py-2.5 text-xs font-medium ring-1 ring-white/10 transition hover:bg-white/11",
                uploading && "pointer-events-none opacity-60",
              )}
            >
              {uploading ? (
                <Loader2 className="size-3.5 animate-spin" strokeWidth={2.4} />
              ) : (
                <Upload className="size-3.5" strokeWidth={2.4} />
              )}
              {uploading ? "sending" : "upload an image"}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  setUploading(true);
                  const url = await uploadFile(file);
                  setUploading(false);
                  if (url) apply({ kind: "image", url, fit: "cover", dim: 25 });
                }}
              />
            </label>

            <form
              onSubmit={(event) => {
                event.preventDefault();
                const trimmed = urlDraft.trim();
                if (!trimmed) return;
                apply({ kind: "image", url: trimmed, fit: "cover", dim: 25 });
                setUrlDraft("");
              }}
            >
              <input
                value={urlDraft}
                onChange={(event) => setUrlDraft(event.target.value)}
                onKeyDown={(event) => event.stopPropagation()}
                placeholder="or paste an image url"
                spellCheck={false}
                className="w-full rounded-xl bg-white/7 px-3 py-2 text-xs ring-1 ring-white/10 outline-none placeholder:text-muted/55 focus:ring-glow/45"
              />
            </form>
          </div>

          {isImage && (
            <div className="mt-3 space-y-3 rounded-xl bg-white/4 p-3 ring-1 ring-white/8">
              <div className="flex gap-1.5">
                {(["cover", "tile"] as const).map((fit) => (
                  <button
                    key={fit}
                    type="button"
                    onClick={() => apply({ ...background, fit })}
                    className={clsx(
                      "flex-1 rounded-lg py-1.5 text-xs font-medium transition",
                      background.fit === fit
                        ? "bg-glow/25 text-glow"
                        : "bg-white/6 text-muted hover:bg-white/10",
                    )}
                  >
                    {fit}
                  </button>
                ))}
              </div>

              {background.fit === "tile" && (
                <Slider
                  label="tile size"
                  min={60}
                  max={600}
                  step={10}
                  value={background.scale ?? 240}
                  onChange={(scale) => apply({ ...background, scale })}
                />
              )}

              <Slider
                label="dim"
                min={0}
                max={80}
                step={5}
                value={background.dim ?? 0}
                onChange={(dim) => apply({ ...background, dim })}
              />
            </div>
          )}
        </Section>
      </div>
    </aside>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-[11px] font-medium tracking-wide text-muted uppercase">{title}</h3>
      {children}
    </section>
  );
}

function Slider({
  label,
  min,
  max,
  step,
  value,
  onChange,
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 flex items-center justify-between text-[11px] text-muted">
        {label}
        <span className="tabular-nums opacity-70">{value}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-1 w-full cursor-pointer appearance-none rounded-full bg-white/15 accent-glow"
      />
    </label>
  );
}
