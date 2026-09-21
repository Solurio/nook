"use client";

import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { Copy, RotateCcw, Save, Trash2 } from "lucide-react";
import { BUILT_IN_BRUSHES, tidyBrush, type BrushMode, type BrushSpec, type Tip } from "@/lib/studio/brush";
import { Studio } from "@/lib/studio/render";
import { Panel, Range, Segmented } from "./widgets";

const TIPS: Array<{ id: Tip; name: string }> = [
  { id: "round", name: "round" },
  { id: "square", name: "square" },
  { id: "flat", name: "flat" },
  { id: "grain", name: "grainy" },
  { id: "spray", name: "spray" },
];

const MODES: Array<{ id: BrushMode; name: string }> = [
  { id: "paint", name: "paint" },
  { id: "erase", name: "erase" },
  { id: "smudge", name: "smudge" },
  { id: "blur", name: "blur" },
  { id: "liquify", name: "liquify" },
];

const W = 132;
const H = 34;

/** A sample stroke with the brush: a gentle S, heavier in the middle. */
function Preview({ spec, color }: { spec: BrushSpec; color: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const key = JSON.stringify(spec);
  useEffect(() => {
    const c = ref.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    const whole = JSON.parse(key) as BrushSpec;
    const s = tidyBrush({ ...whole, size: Math.min(22, Math.max(2, whole.size)) });
    const studio = new Studio({ w: W, h: H, background: null });
    const layer = studio.canvasOf("p");
    const lctx = layer.getContext("2d");
    if (!lctx) return;
    if (s.mode !== "paint") {
      // Something to rub out, push or smear.
      for (let x = 0; x < W; x += 12) {
        lctx.fillStyle = x % 24 ? "#8bc7e8" : "#f2a4b8";
        lctx.fillRect(x, 0, 12, H);
      }
    }
    const points: number[] = [];
    const pressures: number[] = [];
    for (let i = 0; i <= 40; i += 1) {
      const t = i / 40;
      points.push(10 + t * (W - 20), H / 2 + Math.sin(t * Math.PI * 2) * (H / 2 - 9));
      pressures.push(0.35 + Math.sin(t * Math.PI) * 0.65);
    }
    studio.stroke(layer, { id: `preview-${s.id}`, kind: "stroke", doc: true, points, pressures, color, size: s.size, spec: s });
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(layer, 0, 0);
  }, [color, key]);
  return <canvas ref={ref} width={W} height={H} className="h-[34px] w-[132px] shrink-0" />;
}

/**
 * Brushes: the studio's and the table's own. Picking one takes it up; the
 * sliders below change the one in hand, and "save as new" keeps it on the
 * board for everyone.
 */
export default function BrushPanel({
  spec,
  color,
  custom,
  canEdit,
  onPick,
  onSpec,
  onCustom,
  onClose,
}: {
  spec: BrushSpec;
  color: string;
  custom: BrushSpec[];
  canEdit: boolean;
  onPick: (spec: BrushSpec) => void;
  onSpec: (spec: BrushSpec) => void;
  onCustom: (next: BrushSpec[]) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"list" | "edit">("list");
  const all = [...BUILT_IN_BRUSHES, ...custom];
  const mine = custom.some((b) => b.id === spec.id);
  const builtIn = BUILT_IN_BRUSHES.find((b) => b.id === spec.id);
  const set = (patch: Partial<BrushSpec>) => onSpec(tidyBrush({ ...spec, ...patch }));

  return (
    <Panel title="brushes" onClose={onClose} className="top-2 left-12 w-80">
      <div className="mb-2 flex items-center gap-2">
        <Segmented
          value={tab}
          options={[
            { id: "list", name: "all brushes" },
            { id: "edit", name: "edit this one" },
          ]}
          onChange={setTab}
        />
      </div>

      {tab === "list" && (
        <div className="space-y-2">
          {MODES.map((mode) => {
            const list = all.filter((b) => b.mode === mode.id);
            if (!list.length) return null;
            return (
              <div key={mode.id}>
                <p className="mb-1 text-[9px] tracking-wide text-muted/60 uppercase">{mode.name}</p>
                <div className="space-y-0.5">
                  {list.map((b) => (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => onPick(b)}
                      className={clsx("flex w-full items-center gap-2 rounded-lg p-1 text-left", b.id === spec.id ? "bg-glow/18 ring-1 ring-glow/40" : "hover:bg-white/5")}
                    >
                      <Preview spec={b} color={color} />
                      <span className="min-w-0 flex-1 truncate text-[11px] text-chalk">{b.name}</span>
                      {custom.some((c) => c.id === b.id) && <span className="text-[9px] text-glow">made here</span>}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {tab === "edit" && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 rounded-lg bg-white/4 p-1">
            <Preview spec={spec} color={color} />
            <input
              key={spec.id}
              defaultValue={spec.name}
              onBlur={(event) => set({ name: event.target.value.slice(0, 30) || spec.name })}
              className="h-7 min-w-0 flex-1 rounded-md bg-white/7 px-1.5 text-[11px] text-chalk outline-none"
              aria-label="brush name"
            />
          </div>
          <div className="flex flex-wrap items-center gap-1">
            <button
              type="button"
              disabled={!canEdit || custom.length >= 40}
              onClick={() => {
                const made = tidyBrush({ ...spec, id: `b${Date.now().toString(36)}`, name: mine || builtIn ? `${spec.name} copy` : spec.name });
                onCustom([...custom, made]);
                onSpec(made);
              }}
              className="flex min-h-7 items-center gap-1 rounded-md bg-glow/25 px-2 text-[10px] text-glow disabled:opacity-30"
            >
              <Copy className="size-3" /> save as a new brush
            </button>
            {mine && (
              <>
                <button
                  type="button"
                  disabled={!canEdit}
                  onClick={() => onCustom(custom.map((b) => (b.id === spec.id ? spec : b)))}
                  className="flex min-h-7 items-center gap-1 rounded-md bg-white/8 px-2 text-[10px] text-chalk disabled:opacity-30"
                >
                  <Save className="size-3" /> keep changes
                </button>
                <button
                  type="button"
                  disabled={!canEdit}
                  onClick={() => {
                    onCustom(custom.filter((b) => b.id !== spec.id));
                    onPick(BUILT_IN_BRUSHES.find((b) => b.mode === spec.mode) ?? BUILT_IN_BRUSHES[0]);
                  }}
                  className="flex min-h-7 items-center gap-1 rounded-md px-2 text-[10px] text-muted hover:bg-red-500/15 hover:text-red-300 disabled:opacity-30"
                >
                  <Trash2 className="size-3" /> delete
                </button>
              </>
            )}
            {builtIn && (
              <button type="button" onClick={() => onSpec(builtIn)} className="flex min-h-7 items-center gap-1 rounded-md px-2 text-[10px] text-muted hover:bg-white/8 hover:text-chalk">
                <RotateCcw className="size-3" /> as it came
              </button>
            )}
          </div>

          <p className="pt-1 text-[9px] tracking-wide text-muted/60 uppercase">tip</p>
          <Segmented value={spec.tip} options={TIPS} onChange={(tip) => set({ tip })} />
          <p className="pt-1 text-[9px] tracking-wide text-muted/60 uppercase">what it does</p>
          <Segmented value={spec.mode} options={MODES} onChange={(mode) => set({ mode })} />

          <p className="pt-1 text-[9px] tracking-wide text-muted/60 uppercase">shape</p>
          <Range label="size" value={Math.round(spec.size)} min={1} max={500} onChange={(v) => set({ size: v })} format={(v) => `${v}px`} />
          <Range label="hardness" value={Math.round(spec.hardness * 100)} min={0} max={100} onChange={(v) => set({ hardness: v / 100 })} format={(v) => `${v}%`} />
          <Range label="roundness" value={Math.round(spec.roundness * 100)} min={3} max={100} onChange={(v) => set({ roundness: v / 100 })} format={(v) => `${v}%`} />
          <Range label="angle" value={Math.round(spec.angle)} min={-180} max={180} onChange={(v) => set({ angle: v })} format={(v) => `${v}°`} />
          <Range label="grain" value={Math.round(spec.grain * 100)} min={0} max={100} onChange={(v) => set({ grain: v / 100 })} format={(v) => `${v}%`} />

          <p className="pt-1 text-[9px] tracking-wide text-muted/60 uppercase">ink</p>
          <Range label="opacity" value={Math.round(spec.opacity * 100)} min={1} max={100} onChange={(v) => set({ opacity: v / 100 })} format={(v) => `${v}%`} />
          <Range label="flow" value={Math.round(spec.flow * 100)} min={1} max={100} onChange={(v) => set({ flow: v / 100 })} format={(v) => `${v}%`} />
          <Range label="spacing" value={Math.round(spec.spacing * 100)} min={2} max={400} onChange={(v) => set({ spacing: v / 100 })} format={(v) => `${v}%`} />
          {spec.mode !== "paint" && spec.mode !== "erase" && (
            <Range label="strength" value={Math.round(spec.strength * 100)} min={1} max={100} onChange={(v) => set({ strength: v / 100 })} format={(v) => `${v}%`} />
          )}

          <p className="pt-1 text-[9px] tracking-wide text-muted/60 uppercase">wander</p>
          <Range label="size jitter" value={Math.round(spec.jitterSize * 100)} min={0} max={100} onChange={(v) => set({ jitterSize: v / 100 })} format={(v) => `${v}%`} />
          <Range label="opacity jitter" value={Math.round(spec.jitterOpacity * 100)} min={0} max={100} onChange={(v) => set({ jitterOpacity: v / 100 })} format={(v) => `${v}%`} />
          <Range label="angle jitter" value={Math.round(spec.jitterAngle)} min={0} max={180} onChange={(v) => set({ jitterAngle: v })} format={(v) => `${v}°`} />
          <Range label="scatter" value={Math.round(spec.scatter * 100)} min={0} max={300} onChange={(v) => set({ scatter: v / 100 })} format={(v) => `${v}%`} />

          <p className="pt-1 text-[9px] tracking-wide text-muted/60 uppercase">stroke</p>
          <Range label="taper in" value={Math.round(spec.taperIn * 100)} min={0} max={50} onChange={(v) => set({ taperIn: v / 100 })} format={(v) => `${v}%`} />
          <Range label="taper out" value={Math.round(spec.taperOut * 100)} min={0} max={50} onChange={(v) => set({ taperOut: v / 100 })} format={(v) => `${v}%`} />
          <div className="flex flex-wrap gap-1 pt-1">
            <Check on={spec.follow} onClick={() => set({ follow: !spec.follow })}>
              tip follows the stroke
            </Check>
            <Check on={spec.pressureSize} onClick={() => set({ pressureSize: !spec.pressureSize })}>
              pressure: size
            </Check>
            <Check on={spec.pressureOpacity} onClick={() => set({ pressureOpacity: !spec.pressureOpacity })}>
              pressure: opacity
            </Check>
          </div>
        </div>
      )}
    </Panel>
  );
}

function Check({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className={clsx("min-h-7 rounded-md px-2 text-[10px]", on ? "bg-glow/25 text-glow" : "bg-white/6 text-muted hover:text-chalk")}>
      {children}
    </button>
  );
}
