"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { Copy, FolderInput, ImagePlus, Loader2, RotateCcw, Save, Search, Trash2 } from "lucide-react";
import { BUILT_IN_BRUSHES, tidyBrush, type BrushBlend, type BrushMode, type BrushSpec, type Tip } from "@/lib/studio/brush";
import { Studio } from "@/lib/studio/render";
import { brushFromPicture, importFireAlpaca, MAX_IMPORTED, type Upload } from "@/lib/studio/brush-import";
import { Panel, Range, Segmented } from "./widgets";
import { t as tx } from "@/lib/i18n";

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

const BLENDS: Array<{ id: BrushBlend; name: string }> = [
  { id: "normal", name: "normal" },
  { id: "multiply", name: "multiply" },
  { id: "add", name: "add" },
  { id: "screen", name: "screen" },
  { id: "overlay", name: "overlay" },
  { id: "burn", name: "burn" },
];

type Group = "studio" | "firealpaca" | "board" | "imported";

const W = 132;
const H = 34;

/** A sample stroke with the brush: a gentle S, heavier in the middle, drawn once it scrolls into view. */
function Preview({ spec, color, studio, tick }: { spec: BrushSpec; color: string; studio: Studio; tick: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [seen, setSeen] = useState(false);
  const key = JSON.stringify(spec);
  useEffect(() => {
    const c = ref.current;
    if (!c || seen) return;
    const watch = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        setSeen(true);
        watch.disconnect();
      }
    });
    watch.observe(c);
    return () => watch.disconnect();
  }, [seen]);
  useEffect(() => {
    const c = ref.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx || !seen) return;
    const whole = JSON.parse(key) as BrushSpec;
    // Big brushes shown small: a scatter spray or a stamp has to fit the strip.
    const s = tidyBrush({ ...whole, size: Math.min(whole.tip === "image" || whole.tip === "roller" ? 26 : 22, Math.max(2, whole.size)), opacity: Math.max(0.35, whole.opacity) });
    const layer = studio.canvasOf("preview");
    const lctx = layer.getContext("2d");
    if (!lctx) return;
    lctx.clearRect(0, 0, W, H);
    if (s.mode !== "paint" || s.mix) {
      // Something to rub out, push, smear or pick up.
      for (let x = 0; x < W; x += 12) {
        lctx.fillStyle = x % 24 ? "#8bc7e8" : "#f2a4b8";
        lctx.fillRect(x, 0, 12, H);
      }
    }
    const points: number[] = [];
    const pressures: number[] = [];
    for (let i = 0; i <= 40; i += 1) {
      const f = i / 40;
      points.push(10 + f * (W - 20), H / 2 + Math.sin(f * Math.PI * 2) * (H / 2 - 9));
      pressures.push(0.35 + Math.sin(f * Math.PI) * 0.65);
    }
    studio.stroke(layer, { id: `preview-${s.id}`, kind: "stroke", doc: true, points, pressures, color, size: s.size, spec: s });
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(layer, 0, 0);
  }, [color, key, seen, studio, tick]);
  return <canvas ref={ref} width={W} height={H} className="h-[34px] w-[132px] shrink-0" />;
}

/**
 * Brushes: the studio's, FireAlpaca's, the board's own and the ones brought
 * in from this computer. Picking one takes it up; "edit" changes the one in
 * hand, and "save as new" keeps it on the board for everyone.
 */
export default function BrushPanel({
  spec,
  color,
  custom,
  firealpaca,
  imported,
  canEdit,
  onPick,
  onSpec,
  onCustom,
  onImported,
  upload,
  notice,
  onClose,
}: {
  spec: BrushSpec;
  color: string;
  custom: BrushSpec[];
  firealpaca: BrushSpec[];
  imported: BrushSpec[];
  canEdit: boolean;
  onPick: (spec: BrushSpec) => void;
  onSpec: (spec: BrushSpec) => void;
  onCustom: (next: BrushSpec[]) => void;
  onImported: (next: BrushSpec[]) => void;
  upload: Upload;
  notice: (message: string) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"list" | "edit">("list");
  const [group, setGroup] = useState<Group>(() => (spec.source === "FireAlpaca" ? "firealpaca" : spec.source === "imported" ? "imported" : "studio"));
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const studio = useMemo(() => new Studio({ w: W, h: H, background: null }, () => setTick((n) => n + 1)), []);
  const folder = useRef<HTMLInputElement>(null);
  const picture = useRef<HTMLInputElement>(null);

  const mine = custom.some((b) => b.id === spec.id);
  const builtIn = BUILT_IN_BRUSHES.find((b) => b.id === spec.id);
  const set = (patch: Partial<BrushSpec>) => onSpec(tidyBrush({ ...spec, ...patch }));

  const groups: Array<{ id: Group; name: string; list: BrushSpec[] }> = [
    { id: "studio", name: "studio", list: BUILT_IN_BRUSHES },
    { id: "firealpaca", name: "FireAlpaca", list: firealpaca },
    { id: "board", name: "this board", list: custom },
    { id: "imported", name: "brought in", list: imported },
  ];
  const current = groups.find((g) => g.id === group) ?? groups[0];
  const q = query.trim().toLowerCase();
  const shown = q ? groups.flatMap((g) => g.list).filter((b) => b.name.toLowerCase().includes(q) || tx(b.name).toLowerCase().includes(q)) : current.list;

  const bringIn = async (files: File[]) => {
    if (!files.length) return;
    setBusy(tx("reading the brushes"));
    try {
      const { brushes, missing } = await importFireAlpaca(files, upload, (done, total) => setBusy(tx(`reading the brushes... ${done} of ${total}`)));
      onImported([...brushes, ...imported].slice(0, MAX_IMPORTED));
      setGroup("imported");
      notice(missing ? tx(`${brushes.length} brushes brought in; ${missing} were missing their picture and draw round`) : tx(`${brushes.length} brushes brought in`));
    } catch (error) {
      notice(tx(`those brushes could not be read: ${(error as Error).message}`));
    } finally {
      setBusy(null);
    }
  };

  const stampFrom = async (file: File | undefined) => {
    if (!file) return;
    setBusy(tx("making the brush"));
    try {
      const made = await brushFromPicture(file, upload);
      onImported([made, ...imported].slice(0, MAX_IMPORTED));
      setGroup("imported");
      onPick(made);
    } catch (error) {
      notice(tx(`that picture could not be made into a brush: ${(error as Error).message}`));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Panel title={tx("brushes")} onClose={onClose} className="top-2 left-12 w-80">
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
          <label className="flex h-8 items-center gap-1.5 rounded-lg bg-white/6 px-2">
            <Search className="size-3.5 text-muted" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={tx("find a brush")} className="min-w-0 flex-1 bg-transparent text-[11px] text-chalk outline-none" />
          </label>
          {!q && (
            <div className="flex flex-wrap gap-1">
              {groups.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => setGroup(g.id)}
                  className={clsx("min-h-7 rounded-md px-2 text-[10px]", group === g.id ? "bg-chalk text-ink-950" : "bg-white/6 text-muted hover:text-chalk")}
                >
                  {tx(g.name)} <span className="opacity-60">{g.list.length}</span>
                </button>
              ))}
            </div>
          )}

          {!q && group === "imported" && (
            <div className="space-y-1 rounded-lg bg-white/4 p-1.5">
              <p className="text-[10px] leading-snug text-muted">{tx("Pick FireAlpaca's settings folder (FireAlpaca SE3, in AppData\\Local\\FireAlpaca), or its BrushNew.xml with the pictures from brush_bitmap. They stay on this device.")}</p>
              <div className="flex flex-wrap gap-1">
                <button type="button" disabled={Boolean(busy)} onClick={() => folder.current?.click()} className="flex min-h-7 items-center gap-1 rounded-md bg-glow/25 px-2 text-[10px] text-glow disabled:opacity-40">
                  <FolderInput className="size-3" />
                  {tx("bring in FireAlpaca brushes")}
                </button>
                <button type="button" disabled={Boolean(busy)} onClick={() => picture.current?.click()} className="flex min-h-7 items-center gap-1 rounded-md bg-white/8 px-2 text-[10px] text-chalk disabled:opacity-40">
                  <ImagePlus className="size-3" />
                  {tx("a stamp from a picture")}
                </button>
              </div>
              {busy && (
                <p className="flex items-center gap-1 text-[10px] text-muted">
                  <Loader2 className="size-3 animate-spin" />
                  {busy}
                </p>
              )}
              <input
                ref={folder}
                type="file"
                multiple
                className="hidden"
                // The whole folder where the browser allows it, loose files where it does not.
                {...({ webkitdirectory: "" } as Record<string, string>)}
                onChange={(event) => {
                  void bringIn([...(event.target.files ?? [])]);
                  event.target.value = "";
                }}
              />
              <input
                ref={picture}
                type="file"
                accept="image/*,.mdp"
                className="hidden"
                onChange={(event) => {
                  void stampFrom(event.target.files?.[0]);
                  event.target.value = "";
                }}
              />
              {imported.length > 0 && (
                <button type="button" onClick={() => onImported([])} className="text-[10px] text-muted underline decoration-dotted hover:text-red-300">
                  {tx("forget the brushes brought in")}
                </button>
              )}
            </div>
          )}

          {!q && group === "firealpaca" && !firealpaca.length && <p className="text-[11px] text-muted">{tx("FireAlpaca's brushes are not on this site.")}</p>}
          {!q && group === "board" && !custom.length && <p className="text-[11px] text-muted">{tx("none yet -- change a brush and save it as new")}</p>}

          <div className="space-y-0.5">
            {shown.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => onPick(b)}
                className={clsx("flex w-full items-center gap-2 rounded-lg p-1 text-left", b.id === spec.id ? "bg-glow/18 ring-1 ring-glow/40" : "hover:bg-white/5")}
              >
                <Preview spec={b} color={color} studio={studio} tick={tick} />
                <span className="min-w-0 flex-1 truncate text-[11px] text-chalk">{b.source ? b.name : tx(b.name)}</span>
                {b.mode !== "paint" && <span className="shrink-0 text-[9px] text-muted/70">{tx(MODES.find((m) => m.id === b.mode)?.name ?? "")}</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      {tab === "edit" && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 rounded-lg bg-white/4 p-1">
            <Preview spec={spec} color={color} studio={studio} tick={tick} />
            <input
              key={spec.id}
              defaultValue={spec.name}
              onBlur={(event) => set({ name: event.target.value.slice(0, 40) || spec.name })}
              className="h-7 min-w-0 flex-1 rounded-md bg-white/7 px-1.5 text-[11px] text-chalk outline-none"
              aria-label={tx("brush name")}
            />
          </div>
          <div className="flex flex-wrap items-center gap-1">
            <button
              type="button"
              disabled={!canEdit || custom.length >= 60}
              onClick={() => {
                const made = tidyBrush({ ...spec, id: `b${Date.now().toString(36)}`, source: undefined, name: mine || builtIn ? `${spec.name} copy` : spec.name });
                onCustom([...custom, made]);
                onSpec(made);
              }}
              className="flex min-h-7 items-center gap-1 rounded-md bg-glow/25 px-2 text-[10px] text-glow disabled:opacity-30"
            >
              <Copy className="size-3" />{" "}{tx("save as a new brush")}</button>
            {mine && (
              <>
                <button
                  type="button"
                  disabled={!canEdit}
                  onClick={() => onCustom(custom.map((b) => (b.id === spec.id ? spec : b)))}
                  className="flex min-h-7 items-center gap-1 rounded-md bg-white/8 px-2 text-[10px] text-chalk disabled:opacity-30"
                >
                  <Save className="size-3" />{" "}{tx("keep changes")}</button>
                <button
                  type="button"
                  disabled={!canEdit}
                  onClick={() => {
                    onCustom(custom.filter((b) => b.id !== spec.id));
                    onPick(BUILT_IN_BRUSHES.find((b) => b.mode === spec.mode) ?? BUILT_IN_BRUSHES[0]);
                  }}
                  className="flex min-h-7 items-center gap-1 rounded-md px-2 text-[10px] text-muted hover:bg-red-500/15 hover:text-red-300 disabled:opacity-30"
                >
                  <Trash2 className="size-3" />{" "}{tx("delete")}</button>
              </>
            )}
            {builtIn && (
              <button type="button" onClick={() => onSpec(builtIn)} className="flex min-h-7 items-center gap-1 rounded-md px-2 text-[10px] text-muted hover:bg-white/8 hover:text-chalk">
                <RotateCcw className="size-3" />{" "}{tx("as it came")}</button>
            )}
          </div>

          {spec.tip !== "image" && spec.tip !== "roller" && (
            <>
              <p className="pt-1 text-[9px] tracking-wide text-muted/60 uppercase">{tx("tip")}</p>
              <Segmented value={spec.tip} options={TIPS} onChange={(tip) => set({ tip })} />
            </>
          )}
          <p className="pt-1 text-[9px] tracking-wide text-muted/60 uppercase">{tx("what it does")}</p>
          <Segmented value={spec.mode} options={MODES} onChange={(mode) => set({ mode })} />
          {spec.mode === "paint" && (
            <>
              <p className="pt-1 text-[9px] tracking-wide text-muted/60 uppercase">{tx("how it lands")}</p>
              <Segmented value={spec.blend ?? "normal"} options={BLENDS} onChange={(blend) => set({ blend })} />
            </>
          )}

          <p className="pt-1 text-[9px] tracking-wide text-muted/60 uppercase">{tx("shape")}</p>
          <Range label={tx("size")} value={Math.round(spec.size)} min={1} max={1000} onChange={(v) => set({ size: v })} format={(v) => `${v}px`} />
          <Range label={tx("hardness")} value={Math.round(spec.hardness * 100)} min={0} max={100} onChange={(v) => set({ hardness: v / 100 })} format={(v) => `${v}%`} />
          <Range label={tx("roundness")} value={Math.round(spec.roundness * 100)} min={3} max={100} onChange={(v) => set({ roundness: v / 100 })} format={(v) => `${v}%`} />
          <Range label={tx("angle")} value={Math.round(spec.angle)} min={-180} max={180} onChange={(v) => set({ angle: v })} format={(v) => `${v}°`} />
          <Range label={tx("grain")} value={Math.round(spec.grain * 100)} min={0} max={100} onChange={(v) => set({ grain: v / 100 })} format={(v) => `${v}%`} />

          <p className="pt-1 text-[9px] tracking-wide text-muted/60 uppercase">{tx("ink")}</p>
          <Range label={tx("opacity")} value={Math.round(spec.opacity * 100)} min={1} max={100} onChange={(v) => set({ opacity: v / 100 })} format={(v) => `${v}%`} />
          <Range label={tx("flow")} value={Math.round(spec.flow * 100)} min={1} max={100} onChange={(v) => set({ flow: v / 100 })} format={(v) => `${v}%`} />
          <Range label={tx("spacing")} value={Math.round(spec.spacing * 100)} min={2} max={400} onChange={(v) => set({ spacing: v / 100 })} format={(v) => `${v}%`} />
          {spec.mode === "paint" && (
            <Range label={tx("wet mixing")} value={Math.round((spec.mix ?? 0) * 100)} min={0} max={100} onChange={(v) => set({ mix: v / 100 })} format={(v) => `${v}%`} />
          )}
          {spec.mode !== "paint" && spec.mode !== "erase" && (
            <Range label={tx("strength")} value={Math.round(spec.strength * 100)} min={1} max={100} onChange={(v) => set({ strength: v / 100 })} format={(v) => `${v}%`} />
          )}

          <p className="pt-1 text-[9px] tracking-wide text-muted/60 uppercase">{tx("wander")}</p>
          <Range label={tx("size jitter")} value={Math.round(spec.jitterSize * 100)} min={0} max={100} onChange={(v) => set({ jitterSize: v / 100 })} format={(v) => `${v}%`} />
          <Range label={tx("opacity jitter")} value={Math.round(spec.jitterOpacity * 100)} min={0} max={100} onChange={(v) => set({ jitterOpacity: v / 100 })} format={(v) => `${v}%`} />
          <Range label={tx("angle jitter")} value={Math.round(spec.jitterAngle)} min={0} max={180} onChange={(v) => set({ jitterAngle: v })} format={(v) => `${v}°`} />
          <Range label={tx("scatter")} value={Math.round(spec.scatter * 100)} min={0} max={300} onChange={(v) => set({ scatter: v / 100 })} format={(v) => `${v}%`} />
          <Range label={tx("particles")} value={spec.count ?? 1} min={1} max={24} onChange={(v) => set({ count: v })} />

          <p className="pt-1 text-[9px] tracking-wide text-muted/60 uppercase">{tx("stroke")}</p>
          <Range label={tx("taper in")} value={Math.round(spec.taperIn * 100)} min={0} max={50} onChange={(v) => set({ taperIn: v / 100 })} format={(v) => `${v}%`} />
          <Range label={tx("taper out")} value={Math.round(spec.taperOut * 100)} min={0} max={50} onChange={(v) => set({ taperOut: v / 100 })} format={(v) => `${v}%`} />
          <Range label={tx("lightest touch")} value={Math.round((spec.pressureMin ?? 0) * 100)} min={0} max={100} onChange={(v) => set({ pressureMin: v / 100 })} format={(v) => `${v}%`} />
          <div className="flex flex-wrap gap-1 pt-1">
            <Check on={spec.follow} onClick={() => set({ follow: !spec.follow })}>{tx("tip follows the stroke")}</Check>
            <Check on={spec.pressureSize} onClick={() => set({ pressureSize: !spec.pressureSize })}>{tx("pressure: size")}</Check>
            <Check on={spec.pressureOpacity} onClick={() => set({ pressureOpacity: !spec.pressureOpacity })}>{tx("pressure: opacity")}</Check>
            {spec.images && (
              <Check on={Boolean(spec.colorful)} onClick={() => set({ colorful: !spec.colorful })}>{tx("the picture's own colours")}</Check>
            )}
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
