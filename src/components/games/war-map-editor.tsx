"use client";

import { useRef, useState } from "react";
import clsx from "clsx";
import {
  Check,
  ClipboardPaste,
  Copy,
  Eraser,
  ImagePlus,
  Link2,
  MapPin,
  Minus,
  MousePointer2,
  PenLine,
  Plus,
  Sparkles,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import { useRoom } from "@/realtime/room-provider";
import { useRoomStore } from "@/state/room-store";
import { prepareImage } from "@/lib/image-upload";
import {
  BUILT_IN,
  DEFAULT_RULES,
  MAP_H,
  MAP_W,
  SHAPES,
  TINTS,
  addContinent,
  addTerritory,
  bordered,
  connected,
  describeObjective,
  editContinent,
  editTerritory,
  emptyWorld,
  encodeObjective,
  exportWorld,
  importWorld,
  indexOf,
  labelSpot,
  objectiveSpecs,
  outline,
  removeContinent,
  removeTerritory,
  suggestBorders,
  suggestObjectives,
  tidyRules,
  toggleBorder,
  type ObjectiveSpec,
  type Shape,
  type WarRules,
  type WarWorld,
} from "@/lib/war-world";
import { deleteSavedMap, loadSavedMap, saveMapTo, useSavedMaps } from "./war-library";
import { t as tx } from "@/lib/i18n";

const SEA_COLORS = ["#0c1826", "#101620", "#1b3a55", "#123a55", "#14202c", "#241d2e", "#2b241c", "#f4efe6"];
const FITS = ["cover", "contain", "stretch"] as const;

type Tool = "move" | "add" | "border" | "trace" | "erase";

const TOOLS: Array<{ tool: Tool; label: string; icon: React.ReactNode; structural: boolean }> = [
  { tool: "move", label: "pick and move", icon: <MousePointer2 />, structural: false },
  { tool: "add", label: "new territory", icon: <MapPin />, structural: true },
  { tool: "border", label: "borders", icon: <Link2 />, structural: true },
  { tool: "trace", label: "trace an outline", icon: <PenLine />, structural: false },
  { tool: "erase", label: "delete a territory", icon: <Eraser />, structural: true },
];

function Stepper({ value, min, max, onChange, disabled }: { value: number; min: number; max: number; onChange: (n: number) => void; disabled?: boolean }) {
  return (
    <span className="flex items-center gap-0.5 rounded-lg bg-white/6 px-0.5">
      <button type="button" disabled={disabled || value <= min} onClick={() => onChange(value - 1)} aria-label={tx("less")} className="grid size-7 place-items-center text-muted hover:text-chalk disabled:opacity-30">
        <Minus className="size-3" />
      </button>
      <span className="min-w-6 text-center text-[11px] text-chalk tabular-nums">{value}</span>
      <button type="button" disabled={disabled || value >= max} onClick={() => onChange(value + 1)} aria-label={tx("more")} className="grid size-7 place-items-center text-muted hover:text-chalk disabled:opacity-30">
        <Plus className="size-3" />
      </button>
    </span>
  );
}

function Toggle({ on, onChange, children, disabled }: { on: boolean; onChange: (v: boolean) => void; children: React.ReactNode; disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={clsx("flex min-h-8 items-center gap-1.5 rounded-lg px-2 text-left text-[11px] disabled:opacity-40", on ? "bg-glow/15 text-glow" : "bg-white/5 text-muted")}
    >
      <span className={clsx("size-3 shrink-0 rounded border", on ? "border-glow bg-glow" : "border-white/30")} />
      {children}
    </button>
  );
}

/**
 * The world a game is played on, made or changed: continents and territories
 * added and taken away, moved, renamed, outlined and joined by borders; a
 * picture laid under it; the table's rules and the objectives; and a library
 * of maps kept for everyone. While a game is on, only the look can change --
 * what exists and who borders whom waits for the next deal.
 */
export default function WarMapEditor({
  world,
  rules,
  playing,
  canEdit,
  onSave,
  onClose,
}: {
  world: WarWorld;
  rules: WarRules;
  playing: boolean;
  canEdit: boolean;
  onSave: (world: WarWorld, rules?: WarRules) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"map" | "rules" | "saved">("map");
  const [history, setHistory] = useState<WarWorld[]>([]);
  const locked = playing;

  const change = (next: WarWorld) => {
    if (!canEdit || next === world) return;
    setHistory((h) => [...h.slice(-40), world]);
    onSave(next);
  };
  const undo = () => {
    const last = history.at(-1);
    if (!last) return;
    setHistory((h) => h.slice(0, -1));
    onSave(last);
  };

  return (
    <div className="absolute inset-0 z-30 flex flex-col gap-2 rounded-2xl bg-ink-950/96 p-2 backdrop-blur-sm">
      <div className="flex flex-wrap items-center gap-1.5">
        <input
          key={world.name}
          defaultValue={world.name}
          placeholder={tx("name this map")}
          maxLength={60}
          disabled={!canEdit}
          onBlur={(event) => event.target.value.trim() !== world.name && change({ ...world, name: event.target.value.trim() })}
          onKeyDown={(event) => event.key === "Enter" && (event.target as HTMLInputElement).blur()}
          className="h-9 min-w-32 flex-1 rounded-lg bg-white/8 px-2 text-[12px] text-chalk outline-none placeholder:text-muted/50"
        />
        <span className="flex rounded-lg bg-white/5 p-0.5 text-[11px]">
          {(["map", "rules", "saved"] as const).map((t) => (
            <button key={t} type="button" onClick={() => setTab(t)} className={clsx("min-h-8 rounded-md px-2.5", tab === t ? "bg-white/12 text-chalk" : "text-muted hover:text-chalk")}>
              {t === "saved" ? tx("saved maps") : t}
            </button>
          ))}
        </span>
        <button type="button" disabled={!history.length} onClick={undo} aria-label={tx("undo")} title={tx("undo")} className="grid size-9 place-items-center rounded-lg text-muted hover:bg-white/8 hover:text-chalk disabled:opacity-30">
          <Undo2 className="size-4" />
        </button>
        <button type="button" onClick={onClose} className="flex min-h-9 items-center gap-1 rounded-lg bg-chalk px-3 text-[12px] font-semibold text-ink-950">
          <Check className="size-3.5" />{" "}{tx("done")}</button>
      </div>
      {locked && (
        <p className="rounded-lg bg-warm/10 px-2 py-1 text-[10px] text-warm">{tx("A game is on: positions, outlines, names and the picture can change now; territories, continents, borders and rules wait for the next deal.")}</p>
      )}

      {tab === "map" && <MapTab world={world} locked={locked} canEdit={canEdit} change={change} />}
      {tab === "rules" && <RulesTab world={world} rules={rules} locked={locked || !canEdit} onRules={(r) => onSave(world, r)} change={change} />}
      {tab === "saved" && (
        <SavedTab
          world={world}
          rules={rules}
          locked={locked}
          canEdit={canEdit}
          onLoad={(w, r) => {
            setHistory((h) => [...h.slice(-40), world]);
            onSave(w, r);
            setTab("map");
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The map itself
// ---------------------------------------------------------------------------

function MapTab({ world, locked, canEdit, change }: { world: WarWorld; locked: boolean; canEdit: boolean; change: (w: WarWorld) => void }) {
  const { uploadFile, setNotice } = useRoom();
  const svg = useRef<SVGSVGElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const index = indexOf(world);

  const [tool, setTool] = useState<Tool>("move");
  const [chosen, setChosen] = useState<string | null>(null);
  const [continent, setContinent] = useState<string | null>(null);
  const [tracing, setTracing] = useState<Array<[number, number]>>([]);
  const [drag, setDrag] = useState<{ id: string; x: number; y: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDrop, setConfirmDrop] = useState<string | null>(null);

  const selected = chosen ? (index.byId.get(chosen) ?? null) : null;
  const target = continent && index.continents.has(continent) ? continent : (world.continents[0]?.id ?? null);

  const toBoard = (event: { clientX: number; clientY: number }): [number, number] => {
    const el = svg.current;
    const m = el?.getScreenCTM();
    if (!el || !m) return [0, 0];
    const p = el.createSVGPoint();
    p.x = event.clientX;
    p.y = event.clientY;
    const q = p.matrixTransform(m.inverse());
    return [Math.round(Math.max(0, Math.min(MAP_W, q.x))), Math.round(Math.max(0, Math.min(MAP_H, q.y)))];
  };

  const tapEmpty = (event: React.MouseEvent<SVGSVGElement>) => {
    if (!canEdit) return;
    const [x, y] = toBoard(event);
    if (tool === "add" && !locked) {
      if (!target) {
        setNotice("make a continent first");
        return;
      }
      const made = addTerritory(world, target, x, y);
      change(made.world);
      setChosen(made.id);
    } else if (tool === "trace" && chosen) setTracing([...tracing, [x, y]]);
    else if (tool === "move" && chosen && !drag) change(editTerritory(world, chosen, { x, y }));
  };

  const tapTerritory = (event: React.PointerEvent, id: string) => {
    if (!canEdit) return;
    event.stopPropagation();
    if (tool === "erase" && !locked) {
      change(removeTerritory(world, id));
      if (chosen === id) setChosen(null);
      return;
    }
    if (tool === "border" && !locked) {
      if (chosen && chosen !== id) change(toggleBorder(world, chosen, id));
      else setChosen(id);
      return;
    }
    if (tool === "trace") {
      if (chosen !== id) {
        setChosen(id);
        setTracing([]);
      } else {
        const [x, y] = toBoard(event);
        setTracing([...tracing, [x, y]]);
      }
      return;
    }
    setChosen(id);
    const t = index.byId.get(id);
    if (t) setDrag({ id, x: t.x, y: t.y });
    try {
      (event.currentTarget as Element).setPointerCapture?.(event.pointerId);
    } catch {
      // Carry on without it.
    }
  };

  const finishTrace = () => {
    if (!chosen || tracing.length < 3) return;
    change(outline(world, chosen, tracing.map(([x, y]) => `${x},${y}`).join(" ")));
    setTracing([]);
  };

  const pickImage = async (picked: File) => {
    setBusy(true);
    try {
      const ready = await prepareImage(picked);
      if ("error" in ready) {
        setNotice(ready.error);
        return;
      }
      const url = await uploadFile(ready.file);
      if (url) change({ ...world, image: { url, fit: "contain", opacity: 1 } });
    } finally {
      setBusy(false);
    }
  };

  const borders: Array<[string, string]> = [];
  for (const [a, list] of index.neighbors) for (const b of list) if (a < b) borders.push([a, b]);
  const spotOf = (id: string) => (drag?.id === id ? drag : (index.byId.get(id) ?? { x: 0, y: 0 }));

  return (
    <>
      {/* Tools */}
      <div className="flex flex-wrap items-center gap-1 text-[11px]">
        {TOOLS.map((t) => (
          <button
            key={t.tool}
            type="button"
            disabled={!canEdit || (t.structural && locked)}
            onClick={() => {
              setTool(t.tool);
              setTracing([]);
            }}
            className={clsx(
              "flex min-h-8 items-center gap-1 rounded-lg px-2 disabled:opacity-30 [&_svg]:size-3.5",
              tool === t.tool ? "bg-chalk text-ink-950" : "bg-white/6 text-muted hover:text-chalk",
            )}
          >
            {t.icon} {tx(t.label)}
          </button>
        ))}
        <button
          type="button"
          disabled={!canEdit || locked || world.territories.length < 2}
          onClick={() => change(suggestBorders(world))}
          title={tx("join each territory to its nearest ones")}
          className="flex min-h-8 items-center gap-1 rounded-lg bg-white/6 px-2 text-muted hover:text-chalk disabled:opacity-30"
        >
          <Sparkles className="size-3.5" />{" "}{tx("suggest borders")}</button>
        <span className="ml-auto text-[10px] text-muted">
          {tx("{territories} territories · {borders} borders", { territories: world.territories.length, borders: borders.length })}{!connected(world) && world.territories.length > 1 && <span className="text-[#f2a4b8]">{" "}{tx("· some cannot be reached")}</span>}
        </span>
      </div>

      {/* The map being made */}
      <div className="relative min-h-0 flex-1 overflow-hidden rounded-xl inset-ring inset-ring-white/8">
        <svg
          ref={svg}
          viewBox={`0 0 ${MAP_W} ${MAP_H}`}
          className={clsx("size-full touch-none", tool !== "move" && "cursor-crosshair")}
          preserveAspectRatio="xMidYMid meet"
          onClick={tapEmpty}
          onPointerMove={(event) => {
            if (!drag) return;
            const [x, y] = toBoard(event);
            setDrag({ ...drag, x, y });
          }}
          onPointerUp={() => {
            if (!drag) return;
            const t = index.byId.get(drag.id);
            if (t && (t.x !== drag.x || t.y !== drag.y)) {
              // Moving a territory that has an outline moves the outline with it.
              const dx = drag.x - t.x;
              const dy = drag.y - t.y;
              const shape = t.shape
                ?.split(/\s+/)
                .map((pair) => pair.split(",").map(Number))
                .map(([x, y]) => `${Math.round(x + dx)},${Math.round(y + dy)}`)
                .join(" ");
              change(editTerritory(world, drag.id, { x: drag.x, y: drag.y, ...(shape ? { shape } : {}) }));
            }
            setDrag(null);
          }}
        >
          <rect width={MAP_W} height={MAP_H} fill={world.sea ?? "#0c1826"} />
          {world.image && (
            <image
              href={world.image.url}
              width={MAP_W}
              height={MAP_H}
              preserveAspectRatio={world.image.fit === "stretch" ? "none" : world.image.fit === "cover" ? "xMidYMid slice" : "xMidYMid meet"}
              opacity={world.image.opacity}
              style={{ pointerEvents: "none" }}
            />
          )}
          {borders.map(([a, b]) => {
            const A = spotOf(a);
            const B = spotOf(b);
            const touches = chosen === a || chosen === b;
            return <line key={`${a}-${b}`} x1={A.x} y1={A.y} x2={B.x} y2={B.y} stroke={touches ? "#f6c177" : "#e8e0d0"} strokeOpacity={touches ? 0.9 : 0.35} strokeWidth={touches ? 2.4 : 1.4} style={{ pointerEvents: "none" }} />;
          })}
          {world.continents.map((c) => {
            const at = labelSpot(world, c.id);
            return (
              <text key={c.id} x={at.x} y={at.y} textAnchor="middle" fontSize={11} fontWeight={700} fill={c.tint} stroke="#0c1826" strokeWidth={3} paintOrder="stroke" style={{ pointerEvents: "none" }}>
                {c.name.toUpperCase()} +{c.bonus}
              </text>
            );
          })}
          {world.territories.map((t) => {
            const at = spotOf(t.id);
            const tint = index.continents.get(t.continent)?.tint ?? "#888";
            const here = chosen === t.id;
            const linkedToChosen = tool === "border" && chosen && chosen !== t.id && bordered(world, chosen, t.id);
            return (
              <g key={t.id}>
                {t.shape && (
                  <polygon
                    points={t.shape}
                    fill={tint}
                    fillOpacity={here ? 0.45 : 0.2}
                    stroke={tint}
                    strokeOpacity={here ? 1 : 0.6}
                    strokeWidth={here ? 2.5 : 1}
                    strokeLinejoin="round"
                    transform={drag?.id === t.id ? `translate(${drag.x - t.x} ${drag.y - t.y})` : undefined}
                    style={{ pointerEvents: "none" }}
                  />
                )}
                <g transform={`translate(${at.x} ${at.y})`} onPointerDown={(event) => tapTerritory(event, t.id)} onClick={(event) => event.stopPropagation()} style={{ cursor: canEdit ? "pointer" : "default" }}>
                  <circle r={here ? 12 : 9} fill={here ? "#f6c177" : tint} stroke={linkedToChosen ? "#f6c177" : "#100d16"} strokeWidth={linkedToChosen ? 3 : 1.5} />
                  <text y={here ? 26 : 22} textAnchor="middle" fontSize={10} fontWeight={here ? 700 : 400} fill="#f4efe6" stroke="#0c1826" strokeWidth={3} paintOrder="stroke" style={{ pointerEvents: "none" }}>
                    {t.name}
                  </text>
                </g>
              </g>
            );
          })}
          {tracing.length > 0 && (
            <g style={{ pointerEvents: "none" }}>
              <polyline points={tracing.map(([x, y]) => `${x},${y}`).join(" ")} fill="#f6c177" fillOpacity={0.22} stroke="#f6c177" strokeWidth={2} />
              {tracing.map(([x, y], i) => (
                <circle key={i} cx={x} cy={y} r={3} fill="#f6c177" />
              ))}
            </g>
          )}
        </svg>
        <div className="pointer-events-none absolute inset-x-0 bottom-1 flex justify-center">
          <span className="rounded-lg bg-ink-950/80 px-2 py-1 text-[10px] text-muted">
            {tool === "add"
              ? tx(`tap the map to put a territory in ${index.continents.get(target ?? "")?.name ?? "a continent"}`)
              : tool === "border"
                ? chosen
                  ? tx(`tap another to join it to ${index.byId.get(chosen)?.name ?? "it"}, or take the border away`)
                  : tx("tap a territory, then its neighbours")
                : tool === "trace"
                  ? chosen
                    ? tx("tap round its edge, then close the outline")
                    : tx("tap a territory to outline it")
                  : tool === "erase"
                    ? tx("tap a territory to delete it")
                    : tx("tap a territory to pick it, drag to move it; tap the map to send the picked one there")}
          </span>
        </div>
        {busy && <div className="absolute inset-0 grid place-items-center bg-ink-950/60 text-[12px] text-muted">{tx("sending the picture...")}</div>}
      </div>

      <div className="max-h-[44%] shrink-0 space-y-2 overflow-y-auto text-[11px]">
        {/* The one picked */}
        {selected && (
          <div className="flex flex-wrap items-center gap-1.5 rounded-lg bg-white/8 p-1.5">
            <input
              key={selected.id}
              defaultValue={selected.name}
              maxLength={30}
              disabled={!canEdit}
              onBlur={(event) => event.target.value.trim() && event.target.value.trim() !== selected.name && change(editTerritory(world, selected.id, { name: event.target.value.trim() }))}
              onKeyDown={(event) => event.key === "Enter" && (event.target as HTMLInputElement).blur()}
              className="h-8 min-w-28 flex-1 rounded-lg bg-white/6 px-2 text-[11px] text-chalk outline-none"
            />
            <select
              value={selected.continent}
              disabled={!canEdit || locked}
              onChange={(event) => change(editTerritory(world, selected.id, { continent: event.target.value }))}
              className="h-8 rounded-lg bg-white/6 px-1.5 text-[11px] text-chalk outline-none disabled:opacity-40"
              aria-label={tx("continent")}
            >
              {world.continents.map((c) => (
                <option key={c.id} value={c.id} className="bg-ink-950">
                  {c.name}
                </option>
              ))}
            </select>
            <span className="flex rounded-lg bg-white/6 p-0.5" title={tx("the figure on its card")}>
              {SHAPES.map((f) => (
                <button
                  key={f}
                  type="button"
                  disabled={!canEdit || locked}
                  onClick={() => change(editTerritory(world, selected.id, { figure: f as Shape }))}
                  className={clsx("min-h-7 rounded-md px-1.5 text-[10px] disabled:opacity-40", index.figure(selected.id) === f ? "bg-chalk text-ink-950" : "text-muted")}
                >
                  {f}
                </button>
              ))}
            </span>
            {tool === "trace" && (
              <>
                <button type="button" disabled={!tracing.length} onClick={() => setTracing(tracing.slice(0, -1))} className="min-h-8 rounded-lg px-2 text-muted disabled:opacity-30">{tx("a point back")}</button>
                <button type="button" disabled={tracing.length < 3} onClick={finishTrace} className="min-h-8 rounded-lg bg-glow/20 px-2 text-glow disabled:opacity-30">{tx("close the outline")}</button>
              </>
            )}
            {selected.shape && (
              <button type="button" disabled={!canEdit} onClick={() => change(outline(world, selected.id, undefined))} className="min-h-8 rounded-lg px-2 text-muted hover:text-chalk">{tx("no outline")}</button>
            )}
            <span className="text-[10px] text-muted">{tx("{selected} borders", { selected: index.neighbors.get(selected.id)?.length ?? 0 })}</span>
            <button
              type="button"
              disabled={!canEdit || locked}
              onClick={() => {
                change(removeTerritory(world, selected.id));
                setChosen(null);
              }}
              className="ml-auto flex min-h-8 items-center gap-1 rounded-lg px-2 text-[#f2a4b8] hover:bg-[#e0655c]/15 disabled:opacity-30"
            >
              <Trash2 className="size-3" />{" "}{tx("delete")}</button>
          </div>
        )}

        {/* Continents */}
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <p className="text-[10px] font-semibold tracking-wide text-muted/70 uppercase">{tx("continents")}</p>
            <button
              type="button"
              disabled={!canEdit || locked}
              onClick={() => {
                const made = addContinent(world);
                change(made.world);
                setContinent(made.id);
              }}
              className="flex min-h-7 items-center gap-1 rounded-lg bg-warm/20 px-2 text-warm disabled:opacity-30"
            >
              <Plus className="size-3" />{" "}{tx("continent")}</button>
          </div>
          {world.continents.map((c) => {
            const count = index.members.get(c.id)?.length ?? 0;
            return (
              <div key={c.id} className={clsx("flex flex-wrap items-center gap-1.5 rounded-lg p-1", target === c.id ? "bg-white/8 ring-1 ring-white/15" : "bg-white/3")}>
                <button type="button" onClick={() => setContinent(c.id)} aria-label={tx(`put new territories in ${c.name}`)} className="size-5 rounded-full ring-2 ring-white/20" style={{ background: c.tint }} />
                <input
                  key={`${c.id}:${c.name}`}
                  defaultValue={c.name}
                  maxLength={40}
                  disabled={!canEdit}
                  onFocus={() => setContinent(c.id)}
                  onBlur={(event) => event.target.value.trim() && event.target.value.trim() !== c.name && change(editContinent(world, c.id, { name: event.target.value.trim() }))}
                  onKeyDown={(event) => event.key === "Enter" && (event.target as HTMLInputElement).blur()}
                  className="h-8 min-w-24 flex-1 rounded-lg bg-white/6 px-2 text-[11px] text-chalk outline-none"
                />
                <span className="text-[10px] text-muted">{tx("bonus")}</span>
                <Stepper value={c.bonus} min={0} max={50} disabled={!canEdit || locked} onChange={(bonus) => change(editContinent(world, c.id, { bonus }))} />
                <span className="flex gap-0.5">
                  {TINTS.slice(0, 8).map((tint) => (
                    <button
                      key={tint}
                      type="button"
                      disabled={!canEdit}
                      onClick={() => change(editContinent(world, c.id, { tint }))}
                      aria-label={tx(`colour ${tint}`)}
                      className={clsx("size-3.5 rounded-full", c.tint === tint && "ring-2 ring-chalk")}
                      style={{ background: tint }}
                    />
                  ))}
                </span>
                <span className="text-[10px] text-muted tabular-nums">{count}</span>
                {confirmDrop === c.id ? (
                  <span className="flex items-center gap-1">
                    {world.continents.length > 1 && count > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          const other = world.continents.find((o) => o.id !== c.id);
                          change(removeContinent(world, c.id, other?.id));
                          setConfirmDrop(null);
                        }}
                        className="min-h-7 rounded-md bg-white/8 px-1.5 text-[10px] text-chalk"
                      >{tx("keep its land (move to {continents})", { continents: world.continents.find((o) => o.id !== c.id)?.name })}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        change(removeContinent(world, c.id));
                        setConfirmDrop(null);
                      }}
                      className="min-h-7 rounded-md bg-[#e0655c]/25 px-1.5 text-[10px] text-[#f2a4b8]"
                    >{tx("delete{what}", { what: count ? tx(` with its ${count}`) : "" })}
                    </button>
                    <button type="button" onClick={() => setConfirmDrop(null)} aria-label={tx("never mind")} className="grid size-7 place-items-center text-muted">
                      <X className="size-3" />
                    </button>
                  </span>
                ) : (
                  <button type="button" disabled={!canEdit || locked} onClick={() => setConfirmDrop(c.id)} aria-label={tx(`delete ${c.name}`)} className="grid size-7 place-items-center rounded-md text-muted hover:text-[#f2a4b8] disabled:opacity-30">
                    <Trash2 className="size-3" />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* How it looks */}
        <div className="flex flex-wrap items-center gap-1">
          <button type="button" disabled={!canEdit || busy} onClick={() => file.current?.click()} className="flex min-h-8 items-center gap-1 rounded-lg bg-white/8 px-2 text-chalk disabled:opacity-40">
            <ImagePlus className="size-3.5" /> {world.image ? tx("another picture") : tx("a picture underneath")}
          </button>
          <input
            ref={file}
            type="file"
            accept="image/*"
            hidden
            onChange={async (event) => {
              const picked = event.target.files?.[0];
              event.target.value = "";
              if (picked) await pickImage(picked);
            }}
          />
          <button
            type="button"
            disabled={!canEdit}
            onClick={() => {
              const url = window.prompt("the address of the picture");
              if (url?.startsWith("http")) change({ ...world, image: { url, fit: "contain", opacity: 1 } });
            }}
            className="min-h-8 rounded-lg bg-white/8 px-2 text-muted hover:text-chalk disabled:opacity-40"
          >{tx("from a link")}</button>
          {world.image && (
            <>
              <span className="flex rounded-lg bg-white/6 p-0.5">
                {FITS.map((fit) => (
                  <button
                    key={fit}
                    type="button"
                    onClick={() => world.image && change({ ...world, image: { ...world.image, fit } })}
                    className={clsx("min-h-7 rounded-md px-2", world.image?.fit === fit ? "bg-chalk text-ink-950" : "text-muted")}
                  >
                    {fit === "cover" ? tx("fill") : fit === "contain" ? tx("fit") : tx("stretch")}
                  </button>
                ))}
              </span>
              <label className="flex min-h-8 items-center gap-1.5 rounded-lg bg-white/6 px-2 text-muted">{tx("fade")}<input
                  type="range"
                  min={0.1}
                  max={1}
                  step={0.05}
                  value={world.image.opacity}
                  onChange={(event) => world.image && change({ ...world, image: { ...world.image, opacity: Number(event.target.value) } })}
                  className="w-20 accent-[#f6c177]"
                />
              </label>
              <button type="button" onClick={() => change({ ...world, image: null })} aria-label={tx("take the picture away")} className="grid size-8 place-items-center rounded-lg text-muted hover:text-[#f2a4b8]">
                <Trash2 className="size-3.5" />
              </button>
            </>
          )}
          <Toggle on={world.shapes} onChange={(v) => change({ ...world, shapes: v })} disabled={!canEdit}>{tx("outlines")}</Toggle>
          <Toggle on={world.labels} onChange={(v) => change({ ...world, labels: v })} disabled={!canEdit}>{tx("names")}</Toggle>
          <Toggle on={world.links} onChange={(v) => change({ ...world, links: v })} disabled={!canEdit}>{tx("border lines")}</Toggle>
          <span className="flex items-center gap-1">
            {SEA_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                disabled={!canEdit}
                onClick={() => change({ ...world, sea: color })}
                aria-label={tx(`sea ${color}`)}
                className={clsx("size-5 rounded-full ring-1 ring-white/20", world.sea === color && "ring-2 ring-chalk")}
                style={{ background: color }}
              />
            ))}
          </span>
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Rules and objectives
// ---------------------------------------------------------------------------

function RulesTab({
  world,
  rules,
  locked,
  onRules,
  change,
}: {
  world: WarWorld;
  rules: WarRules;
  locked: boolean;
  onRules: (r: WarRules) => void;
  change: (w: WarWorld) => void;
}) {
  const set = (patch: Partial<WarRules>) => onRules(tidyRules({ ...rules, ...patch }));
  const index = indexOf(world);
  const specs = objectiveSpecs(world);
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [plus, setPlus] = useState(false);
  const [count, setCount] = useState(Math.max(3, Math.round((index.ids.length * 24) / 42)));
  const [armies, setArmies] = useState(1);
  const setSpecs = (next: ObjectiveSpec[] | undefined) => change({ ...world, objectives: next });

  const row = "flex flex-wrap items-center gap-2";
  return (
    <div className="min-h-0 flex-1 space-y-3 overflow-y-auto text-[11px] text-muted">
      <div className={row}>
        <span className="w-28">{tx("how to win")}</span>
        <span className="flex rounded-lg bg-white/5 p-0.5">
          {(["objectives", "conquest"] as const).map((g) => (
            <button key={g} type="button" disabled={locked} onClick={() => set({ goal: g })} className={clsx("min-h-8 rounded-md px-2.5 disabled:opacity-40", rules.goal === g ? "bg-chalk text-ink-950" : "text-muted")}>
              {g === "objectives" ? tx("secret objectives") : tx("last one standing")}
            </button>
          ))}
        </span>
      </div>
      <div className={row}>
        <span className="w-28">{tx("reinforcements")}</span>{tx("territories ÷")}{" "}<Stepper value={rules.divisor} min={1} max={10} disabled={locked} onChange={(divisor) => set({ divisor })} />{tx("at least")}{" "}<Stepper value={rules.minimum} min={0} max={50} disabled={locked} onChange={(minimum) => set({ minimum })} />
      </div>
      <div className={row}>
        <span className="w-28">{tx("dice")}</span>{tx("attack")}{" "}<Stepper value={rules.attackDice} min={1} max={6} disabled={locked} onChange={(attackDice) => set({ attackDice })} />{tx("defence")}{" "}<Stepper value={rules.defendDice} min={1} max={6} disabled={locked} onChange={(defendDice) => set({ defendDice })} />
        <Toggle on={rules.tiesToDefence} onChange={(tiesToDefence) => set({ tiesToDefence })} disabled={locked}>{tx("ties go to the defence")}</Toggle>
      </div>
      <div className={row}>
        <span className="w-28">{tx("the start")}</span>
        <Toggle on={rules.placeFirstRound} onChange={(placeFirstRound) => set({ placeFirstRound })} disabled={locked}>{tx("first round only places armies")}</Toggle>
      </div>
      <div className={row}>
        <span className="w-28">{tx("cards")}</span>
        <Toggle on={rules.cards} onChange={(cards) => set({ cards })} disabled={locked}>{tx("a card for every turn with a conquest")}</Toggle>
      </div>
      {rules.cards && (
        <>
          <div className={row}>
            <span className="w-28">{tx("trades are worth")}</span>
            <input
              key={rules.trades.join(",")}
              defaultValue={rules.trades.join(", ")}
              disabled={locked}
              onBlur={(event) => set({ trades: event.target.value.split(/[^0-9]+/).map(Number).filter((n) => n > 0) })}
              className="h-8 w-40 rounded-lg bg-white/6 px-2 text-chalk outline-none disabled:opacity-40"
            />{tx("then +")}<Stepper value={rules.tradeStep} min={0} max={100} disabled={locked} onChange={(tradeStep) => set({ tradeStep })} />{" "}{tx("each")}</div>
          <div className={row}>
            <span className="w-28" />{tx("extra on a pictured territory")}{" "}<Stepper value={rules.ownedCardBonus} min={0} max={20} disabled={locked} onChange={(ownedCardBonus) => set({ ownedCardBonus })} />{tx("must trade at")}{" "}<Stepper value={rules.mustTradeAt} min={3} max={20} disabled={locked} onChange={(mustTradeAt) => set({ mustTradeAt })} />{tx("jokers")}{" "}<Stepper value={rules.jokers} min={0} max={10} disabled={locked} onChange={(jokers) => set({ jokers })} />
          </div>
        </>
      )}
      <button type="button" disabled={locked} onClick={() => onRules(DEFAULT_RULES)} className="min-h-8 rounded-lg bg-white/6 px-2 text-muted hover:text-chalk disabled:opacity-40">{tx("back to the classic rules")}</button>

      {rules.goal === "objectives" && (
        <div className="space-y-1.5 border-t border-white/8 pt-2">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[10px] font-semibold tracking-wide text-muted/70 uppercase">{tx("objectives on this map")}</p>
            <Toggle on={rules.destroyObjectives} onChange={(destroyObjectives) => set({ destroyObjectives })} disabled={locked}>{tx("destroy-a-colour cards")}</Toggle>
            <button type="button" disabled={locked} onClick={() => setSpecs(suggestObjectives(world))} className="flex min-h-8 items-center gap-1 rounded-lg bg-white/6 px-2 text-muted hover:text-chalk disabled:opacity-40">
              <Sparkles className="size-3" />{" "}{tx("work them out from the continents")}</button>
          </div>
          {specs.filter((s) => s.kind !== "destroy").length === 0 && <p className="text-muted/60">{tx("none yet -- add some, or work them out")}</p>}
          {specs.map((spec, i) =>
            spec.kind === "destroy" ? null : (
              <div key={i} className="flex items-center gap-2 rounded-lg bg-white/4 px-2 py-1">
                <span className="min-w-0 flex-1 text-chalk">{tx(describeObjective(world, encodeObjective(spec)))}</span>
                <button type="button" disabled={locked} onClick={() => setSpecs(specs.filter((_, j) => j !== i))} aria-label="remove it" className="grid size-7 place-items-center text-muted hover:text-[#f2a4b8] disabled:opacity-30">
                  <X className="size-3" />
                </button>
              </div>
            ),
          )}
          <div className="flex flex-wrap items-center gap-1.5">{tx("conquer")}{[
              [a, setA],
              [b, setB],
            ].map(([value, setValue], k) => (
              <select
                key={k}
                value={value as string}
                disabled={locked}
                onChange={(event) => (setValue as (v: string) => void)(event.target.value)}
                className="h-8 rounded-lg bg-white/6 px-1.5 text-chalk outline-none disabled:opacity-40"
              >
                <option value="" className="bg-ink-950">
                  {k ? tx("(just the one)") : tx("a continent")}
                </option>
                {index.continentIds.map((c) => (
                  <option key={c} value={c} className="bg-ink-950">
                    {index.continents.get(c)?.name}
                  </option>
                ))}
              </select>
            ))}
            <Toggle on={plus} onChange={setPlus} disabled={locked}>{tx("plus one more")}</Toggle>
            <button
              type="button"
              disabled={locked || !a}
              onClick={() => {
                const need = [a, b].filter((x, i, all) => x && all.indexOf(x) === i);
                setSpecs([...specs, { kind: "continents", need, ...(plus ? { plusOne: true } : {}) }]);
                setA("");
                setB("");
              }}
              className="min-h-8 rounded-lg bg-chalk px-2.5 font-semibold text-ink-950 disabled:opacity-30"
            >{tx("add")}</button>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">{tx("hold")}{" "}<Stepper value={count} min={1} max={Math.max(1, index.ids.length)} disabled={locked} onChange={setCount} />{" "}{tx("territories with at least")}<Stepper value={armies} min={1} max={10} disabled={locked} onChange={setArmies} />{" "}{tx("armies each")}<button
              type="button"
              disabled={locked}
              onClick={() => setSpecs([...specs, { kind: "territories", count, armies }])}
              className="min-h-8 rounded-lg bg-chalk px-2.5 font-semibold text-ink-950 disabled:opacity-30"
            >{tx("add")}</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Maps kept for everyone
// ---------------------------------------------------------------------------

function SavedTab({
  world,
  rules,
  locked,
  canEdit,
  onLoad,
}: {
  world: WarWorld;
  rules: WarRules;
  locked: boolean;
  canEdit: boolean;
  onLoad: (world: WarWorld, rules?: WarRules) => void;
}) {
  const { setNotice } = useRoom();
  const me = useRoomStore((s) => s.me);
  const { maps, status, reload } = useSavedMaps();
  const [savedId, setSavedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<string | null>(null);
  const mineSaved = savedId ? maps.find((m) => m.id === savedId && m.owner_id === me?.userId) : null;

  const save = async (asNew: boolean) => {
    setBusy(true);
    const done = await saveMapTo(world, rules, me?.name ?? "", asNew ? null : (mineSaved?.id ?? null));
    setBusy(false);
    if ("problem" in done) {
      setNotice(done.problem);
      return;
    }
    setSavedId(done.id);
    reload();
  };

  const open = async (id: string) => {
    setBusy(true);
    const loaded = await loadSavedMap(id);
    setBusy(false);
    if ("problem" in loaded) {
      setNotice(loaded.problem);
      return;
    }
    setSavedId(id);
    onLoad(loaded.world, loaded.rules);
  };

  return (
    <div className="min-h-0 flex-1 space-y-3 overflow-y-auto text-[11px]">
      <div className="flex flex-wrap items-center gap-1.5">
        <button type="button" disabled={!canEdit || busy || status !== "ready"} onClick={() => void save(false)} className="min-h-9 rounded-lg bg-chalk px-3 font-semibold text-ink-950 disabled:opacity-35">
          {mineSaved ? tx(`save changes to "${mineSaved.name}"`) : tx("save this map for everyone")}
        </button>
        {mineSaved && (
          <button type="button" disabled={!canEdit || busy} onClick={() => void save(true)} className="min-h-9 rounded-lg bg-white/8 px-3 text-chalk disabled:opacity-35">{tx("save as a new one")}</button>
        )}
        <button type="button" onClick={() => void navigator.clipboard?.writeText(exportWorld(world, rules))} className="flex min-h-9 items-center gap-1 rounded-lg px-2 text-muted hover:bg-white/8 hover:text-chalk">
          <Copy className="size-3" />{" "}{tx("copy as text")}</button>
        <button
          type="button"
          disabled={!canEdit || locked}
          onClick={() => {
            const text = window.prompt("paste a map");
            const parsed = text ? importWorld(text) : null;
            if (parsed) onLoad(parsed.world, parsed.rules);
            else if (text) setNotice("that is not a map");
          }}
          className="flex min-h-9 items-center gap-1 rounded-lg px-2 text-muted hover:bg-white/8 hover:text-chalk disabled:opacity-30"
        >
          <ClipboardPaste className="size-3" />{" "}{tx("paste one")}</button>
      </div>
      {status === "missing" && <p className="text-[#f2a4b8]">{tx("Saved maps need the newest database update: run supabase/migrations/0008_war_maps.sql in the Supabase SQL editor.")}</p>}
      {status === "error" && <p className="text-[#f2a4b8]">{tx("The saved maps would not load. Try again in a moment.")}</p>}

      <div className="space-y-1">
        <p className="text-[10px] font-semibold tracking-wide text-muted/70 uppercase">{tx("to start from")}</p>
        {[...BUILT_IN, emptyWorld()].map((w) => (
          <button
            key={w.name}
            type="button"
            disabled={!canEdit || locked}
            onClick={() => onLoad(w, w === BUILT_IN[0] ? DEFAULT_RULES : undefined)}
            className="flex w-full items-center gap-2 rounded-lg bg-white/4 px-2 py-1.5 text-left text-chalk hover:bg-white/8 disabled:opacity-40"
          >
            <span className="min-w-0 flex-1 truncate">{w.territories.length ? w.name : tx("a blank page")}</span>
            <span className="text-muted">{w.territories.length ? tx(`${w.territories.length} territories, ${w.continents.length} continents`) : tx("make your own")}</span>
          </button>
        ))}
      </div>

      <div className="space-y-1">
        <p className="text-[10px] font-semibold tracking-wide text-muted/70 uppercase">{tx("everyone's maps")}</p>
        {status === "loading" && <p className="text-muted/60">{tx("looking...")}</p>}
        {status === "ready" && !maps.length && <p className="text-muted/60">{tx("nobody has saved one yet")}</p>}
        {maps.map((m) => {
          const mine = m.owner_id === me?.userId;
          return (
            <div key={m.id} className={clsx("flex items-center gap-2 rounded-lg px-2 py-1", savedId === m.id ? "bg-glow/10 ring-1 ring-glow/40" : "bg-white/4")}>
              <button type="button" disabled={!canEdit || locked || busy} onClick={() => void open(m.id)} className="min-w-0 flex-1 truncate text-left text-chalk hover:underline disabled:opacity-40">
                {m.name}
              </button>
              <span className="shrink-0 text-muted">{tx("{territory_count} territories", { territory_count: m.territory_count })}</span>
              {m.author && <span className="max-w-24 shrink-0 truncate text-muted/60">{tx("by {author}", { author: m.author })}</span>}
              {mine &&
                (confirm === m.id ? (
                  <button
                    type="button"
                    onClick={async () => {
                      const problem = await deleteSavedMap(m.id);
                      setConfirm(null);
                      if (problem) setNotice(problem);
                      else reload();
                    }}
                    className="min-h-7 rounded-md bg-[#e0655c]/25 px-1.5 text-[10px] text-[#f2a4b8]"
                  >{tx("delete it?")}</button>
                ) : (
                  <button type="button" onClick={() => setConfirm(m.id)} aria-label={tx(`delete ${m.name}`)} className="grid size-7 place-items-center text-muted hover:text-[#f2a4b8]">
                    <Trash2 className="size-3" />
                  </button>
                ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
