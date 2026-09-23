"use client";

import clsx from "clsx";
import { Bold, Check, FlipHorizontal2, FlipVertical2, Italic, RotateCw, X } from "lucide-react";
import { SYMMETRIES, type BrushSpec, type Symmetry } from "@/lib/studio/brush";
import type { Combine } from "@/lib/studio/mask";
import { BUNDLED_FONTS } from "@/lib/fonts";
import { t as tx } from "@/lib/i18n";

export type BrushTool = "brush" | "eraser" | "smudge" | "blur" | "liquify";
export type Tool = BrushTool | "fill" | "gradient" | "shape" | "text" | "select" | "wand" | "move" | "picker" | "hand";

export const isBrushTool = (t: Tool): t is BrushTool => t === "brush" || t === "eraser" || t === "smudge" || t === "blur" || t === "liquify";

/** Families that are CSS words rather than names, left unquoted. */
export const GENERIC_FONTS = ["sans-serif", "serif", "monospace", "cursive", "fantasy"];
export const TEXT_FONTS = [...GENERIC_FONTS, "Arial", "Georgia", "Impact", "Comic Sans MS", "Courier New", "Times New Roman", "Trebuchet MS", ...BUNDLED_FONTS.map((f) => f.family)];

export interface Options {
  stabilizer: number;
  symmetry: Symmetry;
  fillTolerance: number;
  fillSample: "layer" | "all";
  fillGrow: number;
  gradientShape: "linear" | "radial";
  gradientFade: boolean;
  shape: "line" | "rect" | "ellipse";
  shapeFill: boolean;
  font: string;
  bold: boolean;
  italic: boolean;
  selectShape: "rect" | "ellipse" | "lasso";
  selectMode: Combine;
  wandTolerance: number;
  wandSample: "layer" | "all";
  wandContiguous: boolean;
}

export const DEFAULT_OPTIONS: Options = {
  stabilizer: 2,
  symmetry: "none",
  fillTolerance: 32,
  fillSample: "all",
  fillGrow: 1,
  gradientShape: "linear",
  gradientFade: false,
  shape: "line",
  shapeFill: false,
  font: "sans-serif",
  bold: false,
  italic: false,
  selectShape: "rect",
  selectMode: "replace",
  wandTolerance: 32,
  wandSample: "layer",
  wandContiguous: true,
};

function Mini({ label, value, min, max, onChange, suffix = "" }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void; suffix?: string }) {
  return (
    <label className="flex shrink-0 items-center gap-1 text-[10px] text-muted">
      {label}
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-1 w-16 cursor-pointer accent-[#c4a7f0]"
      />
      <span className="w-7 text-chalk tabular-nums">
        {value}
        {suffix}
      </span>
    </label>
  );
}

function Pick<T extends string>({ value, options, onChange }: { value: T; options: Array<{ id: T; name: string }>; onChange: (v: T) => void }) {
  return (
    <span className="flex shrink-0 rounded-lg bg-white/6 p-0.5">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          className={clsx("min-h-6 rounded-md px-1.5 text-[10px] whitespace-nowrap", value === o.id ? "bg-chalk text-ink-950" : "text-muted hover:text-chalk")}
        >
          {tx(o.name)}
        </button>
      ))}
    </span>
  );
}

function Flag({ on, onClick, children, title }: { on: boolean; onClick: () => void; children: React.ReactNode; title?: string }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={clsx("flex min-h-6 shrink-0 items-center gap-1 rounded-md px-1.5 text-[10px] whitespace-nowrap [&_svg]:size-3", on ? "bg-glow/25 text-glow" : "bg-white/6 text-muted hover:text-chalk")}
    >
      {children}
    </button>
  );
}

const MODES: Array<{ id: Combine; name: string }> = [
  { id: "replace", name: "new" },
  { id: "add", name: "add" },
  { id: "subtract", name: "take away" },
];

/** What the tool in hand can be set to, in a row along the top. */
export default function ToolOptions({
  tool,
  spec,
  options,
  set,
  warping,
  onBrushes,
  onWarp,
}: {
  tool: Tool;
  spec: BrushSpec;
  options: Options;
  set: (patch: Partial<Options>) => void;
  warping: boolean;
  onBrushes: () => void;
  onWarp: (action: "flipX" | "flipY" | "turn" | "apply" | "cancel") => void;
}) {
  if (isBrushTool(tool)) {
    return (
      <>
        <button type="button" onClick={onBrushes} className="flex min-h-6 shrink-0 items-center rounded-md bg-white/8 px-2 text-[10px] text-chalk hover:bg-white/12" title={tx("brushes")}>
          {spec.name}
        </button>
        <Mini label={tx("steady")} value={options.stabilizer} min={0} max={10} onChange={(v) => set({ stabilizer: v })} />
        <label className="flex shrink-0 items-center gap-1 text-[10px] text-muted">{tx("symmetry")}<select
            value={options.symmetry}
            onChange={(event) => set({ symmetry: event.target.value as Symmetry })}
            className="h-6 rounded-md bg-white/7 px-1 text-[10px] text-chalk outline-none"
          >
            {SYMMETRIES.map((s) => (
              <option key={s.id} value={s.id}>
                {tx(s.name)}
              </option>
            ))}
          </select>
        </label>
      </>
    );
  }
  switch (tool) {
    case "fill":
      return (
        <>
          <Mini label={tx("tolerance")} value={options.fillTolerance} min={0} max={255} onChange={(v) => set({ fillTolerance: v })} />
          <Pick
            value={options.fillSample}
            options={[
              { id: "layer", name: "this layer" },
              { id: "all", name: "all layers" },
            ]}
            onChange={(v) => set({ fillSample: v })}
          />
          <Mini label={tx("grow")} value={options.fillGrow} min={0} max={8} onChange={(v) => set({ fillGrow: v })} suffix="px" />
        </>
      );
    case "gradient":
      return (
        <>
          <Pick
            value={options.gradientShape}
            options={[
              { id: "linear", name: "straight" },
              { id: "radial", name: "round" },
            ]}
            onChange={(v) => set({ gradientShape: v })}
          />
          <Flag on={options.gradientFade} onClick={() => set({ gradientFade: !options.gradientFade })} title={tx("fade to nothing instead of to the second colour")}>{tx("fade out")}</Flag>
        </>
      );
    case "shape":
      return (
        <>
          <Pick
            value={options.shape}
            options={[
              { id: "line", name: "line" },
              { id: "rect", name: "box" },
              { id: "ellipse", name: "ellipse" },
            ]}
            onChange={(v) => set({ shape: v })}
          />
          {options.shape !== "line" && (
            <Flag on={options.shapeFill} onClick={() => set({ shapeFill: !options.shapeFill })}>{tx("filled")}</Flag>
          )}
          <span className="shrink-0 text-[10px] text-muted/70">{tx("shift keeps it even")}</span>
        </>
      );
    case "text":
      return (
        <>
          <select
            value={options.font}
            onChange={(event) => set({ font: event.target.value })}
            className="h-6 max-w-36 shrink-0 rounded-md bg-white/7 px-1 text-[10px] text-chalk outline-none"
            aria-label={tx("font")}
          >
            {TEXT_FONTS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
          <Flag on={options.bold} onClick={() => set({ bold: !options.bold })}>
            <Bold />
          </Flag>
          <Flag on={options.italic} onClick={() => set({ italic: !options.italic })}>
            <Italic />
          </Flag>
          <span className="shrink-0 text-[10px] text-muted/70">{tx("tap where the text goes")}</span>
        </>
      );
    case "select":
      return (
        <>
          <Pick
            value={options.selectShape}
            options={[
              { id: "rect", name: "box" },
              { id: "ellipse", name: "ellipse" },
              { id: "lasso", name: "lasso" },
            ]}
            onChange={(v) => set({ selectShape: v })}
          />
          <Pick value={options.selectMode} options={MODES} onChange={(v) => set({ selectMode: v })} />
        </>
      );
    case "wand":
      return (
        <>
          <Mini label={tx("tolerance")} value={options.wandTolerance} min={0} max={255} onChange={(v) => set({ wandTolerance: v })} />
          <Flag on={options.wandContiguous} onClick={() => set({ wandContiguous: !options.wandContiguous })} title={tx("only what touches where you tap")}>{tx("touching only")}</Flag>
          <Pick
            value={options.wandSample}
            options={[
              { id: "layer", name: "this layer" },
              { id: "all", name: "all layers" },
            ]}
            onChange={(v) => set({ wandSample: v })}
          />
          <Pick value={options.selectMode} options={MODES} onChange={(v) => set({ selectMode: v })} />
        </>
      );
    case "move":
      return warping ? (
        <>
          <Flag on={false} onClick={() => onWarp("flipX")} title={tx("flip left-right")}>
            <FlipHorizontal2 />
          </Flag>
          <Flag on={false} onClick={() => onWarp("flipY")} title={tx("flip top-bottom")}>
            <FlipVertical2 />
          </Flag>
          <Flag on={false} onClick={() => onWarp("turn")} title={tx("turn a quarter")}>
            <RotateCw />
          </Flag>
          <Flag on onClick={() => onWarp("apply")}>
            <Check />{" "}{tx("done")}</Flag>
          <Flag on={false} onClick={() => onWarp("cancel")}>
            <X />{" "}{tx("cancel")}</Flag>
          <span className="shrink-0 text-[10px] text-muted/70">{tx("drag inside to move, corners to scale, the knob to turn")}</span>
        </>
      ) : (
        <span className="shrink-0 text-[10px] text-muted/70">{tx("tap the picture to move what is on this layer, or what is selected")}</span>
      );
    case "picker":
      return <span className="shrink-0 text-[10px] text-muted/70">{tx("tap to take a colour from the picture (alt with the brush does it too)")}</span>;
    case "hand":
      return <span className="shrink-0 text-[10px] text-muted/70">{tx("drag to look around; the wheel zooms, space held works as the hand anywhere")}</span>;
    default:
      return null;
  }
}
