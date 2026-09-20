"use client";

import { useRef, useState } from "react";
import clsx from "clsx";
import { Check, ClipboardPaste, Copy, ImagePlus, Link2, Move, PenLine, RotateCcw, Trash2, Undo2, X } from "lucide-react";
import { useRoom } from "@/realtime/room-provider";
import { prepareImage } from "@/lib/image-upload";
import { CONTINENTS, CONTINENT_IDS, TERRITORIES, TERRITORY_IDS, territoriesIn, type Territory } from "@/lib/war";
import {
  MAP_H,
  MAP_W,
  UNPLACED,
  emptyMap,
  exportMap,
  importMap,
  isCustom,
  middle,
  nameOf,
  rename,
  shapeOf,
  spotOf,
  toggleLink,
  unlinkAll,
  type WarMapData,
} from "@/lib/war-map";

const SEA_COLORS = ["#0c1826", "#101620", "#1b3a55", "#14202c", "#241d2e", "#2b241c", "#f4efe6"];
const FITS = ["cover", "contain", "stretch"] as const;

/** Where a tap landed, in the board's own coordinates. */
function onBoard(event: { clientX: number; clientY: number }, svg: SVGSVGElement): [number, number] {
  const box = svg.getBoundingClientRect();
  const scale = Math.min(box.width / MAP_W, box.height / MAP_H);
  const x = (event.clientX - box.left - (box.width - MAP_W * scale) / 2) / scale;
  const y = (event.clientY - box.top - (box.height - MAP_H * scale) / 2) / scale;
  return [Math.round(Math.max(0, Math.min(MAP_W, x))), Math.round(Math.max(0, Math.min(MAP_H, y)))];
}

/**
 * Making the room's own map.
 *
 * Lay a picture down -- a photograph of a board, a map somebody drew, a
 * fantasy coastline -- then move the forty-two territories onto it, and trace
 * any of them if you want the land to light up rather than a marker. It is
 * saved with the game, in the room, so everyone plays on it and it is still
 * there tomorrow.
 */
export default function WarMapEditor({
  map,
  onSave,
  onClose,
  canEdit,
}: {
  map: WarMapData;
  onSave: (map: WarMapData) => void;
  onClose: () => void;
  canEdit: boolean;
}) {
  const { uploadFile, setNotice } = useRoom();
  const svg = useRef<SVGSVGElement>(null);
  const file = useRef<HTMLInputElement>(null);

  const [chosen, setChosen] = useState<Territory | null>(null);
  const [mode, setMode] = useState<"move" | "draw" | "link">("move");
  const [tracing, setTracing] = useState<Array<[number, number]>>([]);
  const [dragging, setDragging] = useState<Territory | null>(null);
  const [preview, setPreview] = useState<[number, number] | null>(null);
  const [busy, setBusy] = useState(false);

  const save = (patch: Partial<WarMapData>) => onSave({ ...map, ...patch });
  const setSpot = (t: Territory, x: number, y: number) => {
    const current = map.spots[t] ?? spotOf(map, t);
    save({ spots: { ...map.spots, [t]: { ...current, x, y } } });
  };

  const tapBoard = (event: React.MouseEvent<SVGSVGElement>) => {
    if (!canEdit || !svg.current || !chosen) return;
    const [x, y] = onBoard(event, svg.current);
    if (mode === "draw") setTracing([...tracing, [x, y]]);
    else setSpot(chosen, x, y);
  };

  const finishShape = () => {
    if (!chosen || tracing.length < 3) return;
    const shape = tracing.map(([x, y]) => `${x},${y}`).join(" ");
    const [x, y] = middle(shape);
    save({ spots: { ...map.spots, [chosen]: { x: Math.round(x), y: Math.round(y), shape } } });
    setTracing([]);
    setMode("move");
  };

  const clearOne = (t: Territory) => {
    const spots = { ...map.spots };
    delete spots[t];
    save({ spots });
    setTracing([]);
  };

  const pickImage = async (chosenFile: File) => {
    setBusy(true);
    try {
      const ready = await prepareImage(chosenFile);
      if ("error" in ready) {
        setNotice(ready.error);
        return;
      }
      const url = await uploadFile(ready.file);
      if (url) save({ image: { url, fit: "contain", opacity: 1 }, shapes: false, links: false });
    } finally {
      setBusy(false);
    }
  };

  const placedCount = Object.keys(map.spots).length;

  return (
    <div className="absolute inset-0 z-30 flex flex-col gap-2 rounded-2xl bg-ink-950/96 p-2 backdrop-blur-sm">
      <div className="flex items-center gap-2">
        <input
          defaultValue={map.name}
          placeholder="name this map"
          maxLength={40}
          disabled={!canEdit}
          onBlur={(event) => event.target.value !== map.name && save({ name: event.target.value.trim() })}
          onKeyDown={(event) => event.key === "Enter" && (event.target as HTMLInputElement).blur()}
          className="h-9 min-w-0 flex-1 rounded-lg bg-white/8 px-2 text-[12px] text-chalk outline-none placeholder:text-muted/50"
        />
        <button
          type="button"
          onClick={onClose}
          className="flex min-h-9 items-center gap-1 rounded-lg bg-chalk px-3 text-[12px] font-semibold text-ink-950"
        >
          <Check className="size-3.5" /> done
        </button>
      </div>

      {/* The map being made */}
      <div className="relative min-h-0 flex-1 overflow-hidden rounded-xl inset-ring inset-ring-white/8">
        <svg
          ref={svg}
          viewBox={`0 0 ${MAP_W} ${MAP_H}`}
          className={clsx("size-full touch-none", chosen && "cursor-crosshair")}
          preserveAspectRatio="xMidYMid meet"
          onClick={tapBoard}
          onPointerMove={(event) => {
            if (!dragging || !svg.current) return;
            setPreview(onBoard(event, svg.current));
          }}
          onPointerUp={() => {
            if (dragging && preview) setSpot(dragging, preview[0], preview[1]);
            setDragging(null);
            setPreview(null);
          }}
          onPointerLeave={() => {
            setDragging(null);
            setPreview(null);
          }}
        >
          <rect width={MAP_W} height={MAP_H} fill={map.sea ?? "#0c1826"} />
          {map.image && (
            <image
              href={map.image.url}
              width={MAP_W}
              height={MAP_H}
              preserveAspectRatio={map.image.fit === "stretch" ? "none" : map.image.fit === "cover" ? "xMidYMid slice" : "xMidYMid meet"}
              opacity={map.image.opacity}
            />
          )}

          {/* This room's own connections, drawn under the markers so they stay tappable */}
          {map.customLinks.map(([a, b], i) => {
            const A = spotOf(map, a);
            const B = spotOf(map, b);
            const touches = chosen !== null && (a === chosen || b === chosen);
            return (
              <line
                key={`link-${i}`}
                x1={A.x}
                y1={A.y}
                x2={B.x}
                y2={B.y}
                stroke="#f6c177"
                strokeOpacity={touches ? 0.9 : 0.45}
                strokeWidth={touches ? 2.6 : 1.6}
              />
            );
          })}

          {TERRITORY_IDS.map((t) => {
            const spot = dragging === t && preview ? { x: preview[0], y: preview[1] } : spotOf(map, t);
            const shape = map.shapes ? shapeOf(map, t) : null;
            const tint = CONTINENTS[TERRITORIES[t].continent].tint;
            const here = chosen === t;
            const own = Boolean(map.spots[t]);
            return (
              <g key={t}>
                {shape && (
                  <polygon
                    points={shape}
                    fill={tint}
                    fillOpacity={here ? 0.4 : 0.14}
                    stroke={tint}
                    strokeOpacity={here ? 1 : 0.5}
                    strokeWidth={here ? 2.5 : 1}
                    strokeLinejoin="round"
                  />
                )}
                <g
                  transform={`translate(${spot.x} ${spot.y})`}
                  onPointerDown={(event) => {
                    if (!canEdit) return;
                    event.stopPropagation();
                    if (mode === "link" && chosen && chosen !== t) {
                      onSave(toggleLink(map, chosen, t));
                      return;
                    }
                    setChosen(t);
                    setTracing([]);
                    if (mode !== "link") {
                      setDragging(t);
                      setPreview([spot.x, spot.y]);
                    }
                  }}
                  style={{ cursor: canEdit ? (mode === "link" ? "pointer" : "grab") : "default" }}
                >
                  <circle
                    r={here ? 11 : 8}
                    fill={here ? "#f6c177" : own ? tint : "#3a3444"}
                    stroke="#100d16"
                    strokeWidth={1.5}
                    fillOpacity={0.95}
                  />
                  {here && (
                    <text y={-15} textAnchor="middle" fontSize={11} fontWeight={700} fill="#f4efe6" stroke="#0c1826" strokeWidth={3} paintOrder="stroke">
                      {nameOf(map, t)}
                    </text>
                  )}
                </g>
              </g>
            );
          })}

          {/* The outline being traced */}
          {tracing.length > 0 && (
            <g>
              <polyline points={tracing.map(([x, y]) => `${x},${y}`).join(" ")} fill="#f6c177" fillOpacity={0.22} stroke="#f6c177" strokeWidth={2} />
              {tracing.map(([x, y], i) => (
                <circle key={i} cx={x} cy={y} r={3} fill="#f6c177" />
              ))}
            </g>
          )}
        </svg>

        {chosen && (
          <div className="pointer-events-none absolute inset-x-0 bottom-1 flex justify-center">
            <span className="rounded-lg bg-ink-950/80 px-2 py-1 text-[10px] text-muted">
              {mode === "draw"
                ? "tap the map to trace its border"
                : mode === "link"
                  ? "tap another territory to connect or disconnect it"
                  : "tap the map to move it, or drag any marker"}
            </span>
          </div>
        )}
      </div>

      {/* What to do with it */}
      <div className="max-h-[42%] shrink-0 space-y-1.5 overflow-y-auto text-[11px]">
        <div className="flex flex-wrap items-center gap-1">
          <button
            type="button"
            disabled={!canEdit || busy}
            onClick={() => file.current?.click()}
            className="flex min-h-9 items-center gap-1 rounded-lg bg-white/8 px-2 text-chalk disabled:opacity-40"
          >
            <ImagePlus className="size-3.5" /> {map.image ? "another picture" : "a picture of a map"}
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
              if (url?.startsWith("http")) save({ image: { url, fit: "contain", opacity: 1 }, shapes: false, links: false });
            }}
            className="min-h-9 rounded-lg bg-white/8 px-2 text-muted hover:text-chalk disabled:opacity-40"
          >
            from a link
          </button>
          {map.image && (
            <>
              <span className="flex rounded-lg bg-white/6 p-0.5">
                {FITS.map((fit) => (
                  <button
                    key={fit}
                    type="button"
                    onClick={() => map.image && save({ image: { ...map.image, fit } })}
                    className={clsx("min-h-8 rounded-md px-2", map.image?.fit === fit ? "bg-chalk text-ink-950" : "text-muted")}
                  >
                    {fit === "cover" ? "fill" : fit === "contain" ? "fit" : "stretch"}
                  </button>
                ))}
              </span>
              <label className="flex min-h-9 items-center gap-1.5 rounded-lg bg-white/6 px-2 text-muted">
                fade
                <input
                  type="range"
                  min={0.15}
                  max={1}
                  step={0.05}
                  value={map.image.opacity}
                  onChange={(event) => map.image && save({ image: { ...map.image, opacity: Number(event.target.value) } })}
                  className="w-20 accent-[#f6c177]"
                />
              </label>
              <button
                type="button"
                onClick={() => save({ image: null })}
                aria-label="take the picture away"
                className="grid size-9 place-items-center rounded-lg text-muted hover:bg-red-500/15 hover:text-red-300"
              >
                <Trash2 className="size-3.5" />
              </button>
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1">
          {(
            [
              ["shapes", "outlines"],
              ["labels", "names"],
              ["links", "borders"],
            ] as Array<[keyof WarMapData, string]>
          ).map(([key, name]) => (
            <button
              key={key}
              type="button"
              disabled={!canEdit}
              onClick={() => save({ [key]: !map[key] } as Partial<WarMapData>)}
              className={clsx(
                "flex min-h-9 items-center gap-1.5 rounded-lg px-2 disabled:opacity-40",
                map[key] ? "bg-glow/15 text-glow" : "bg-white/5 text-muted",
              )}
            >
              <span className={clsx("size-3 rounded border", map[key] ? "border-glow bg-glow" : "border-white/30")} />
              {name}
            </button>
          ))}
          <span className="ml-1 flex items-center gap-1">
            {SEA_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                disabled={!canEdit}
                onClick={() => save({ sea: color })}
                aria-label={`sea ${color}`}
                className={clsx("size-5 rounded-full ring-1 ring-white/20", map.sea === color && "ring-2 ring-chalk")}
                style={{ background: color }}
              />
            ))}
          </span>
        </div>

        {/* The forty-two */}
        <div className="space-y-1">
          {CONTINENT_IDS.map((c) => (
            <div key={c} className="flex flex-wrap items-center gap-1">
              <span className="w-full text-[10px] text-muted/60" style={{ color: CONTINENTS[c].tint }}>
                {CONTINENTS[c].name}
              </span>
              {territoriesIn(c).map((t) => {
                const own = Boolean(map.spots[t]);
                return (
                  <button
                    key={t}
                    type="button"
                    disabled={!canEdit}
                    onClick={() => {
                      setChosen(chosen === t ? null : t);
                      setTracing([]);
                      setMode("move");
                    }}
                    className={clsx(
                      "min-h-8 rounded-lg px-2 text-[10.5px] disabled:opacity-40",
                      chosen === t ? "bg-warm/25 text-chalk ring-1 ring-warm" : own ? "bg-white/10 text-chalk" : "bg-white/4 text-muted",
                    )}
                  >
                    {nameOf(map, t)}
                    {map.spots[t]?.shape && <span className="ml-1 text-glow">◆</span>}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {/* What happens to the one you picked */}
        {chosen && (
          <div className="sticky bottom-0 space-y-1 rounded-lg bg-white/8 p-1">
            <div className="flex items-center gap-1.5 px-0.5">
              <input
                key={chosen}
                defaultValue={map.names[chosen] ?? ""}
                placeholder={TERRITORIES[chosen].name}
                maxLength={30}
                disabled={!canEdit}
                onBlur={(event) => onSave(rename(map, chosen, event.target.value))}
                onKeyDown={(event) => event.key === "Enter" && (event.target as HTMLInputElement).blur()}
                className="h-8 min-w-0 flex-1 rounded-lg bg-white/6 px-2 text-[11px] text-chalk outline-none placeholder:text-muted/50"
              />
            </div>
            <div className="flex flex-wrap items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  setMode("move");
                  setTracing([]);
                }}
                className={clsx("flex min-h-8 items-center gap-1 rounded-lg px-2", mode === "move" ? "bg-chalk text-ink-950" : "text-muted")}
              >
                <Move className="size-3" /> place it
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode("draw");
                  setTracing([]);
                }}
                className={clsx("flex min-h-8 items-center gap-1 rounded-lg px-2", mode === "draw" ? "bg-chalk text-ink-950" : "text-muted")}
              >
                <PenLine className="size-3" /> trace it
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode("link");
                  setTracing([]);
                }}
                className={clsx("flex min-h-8 items-center gap-1 rounded-lg px-2", mode === "link" ? "bg-chalk text-ink-950" : "text-muted")}
              >
                <Link2 className="size-3" /> connect it
              </button>
              {mode === "draw" && (
                <>
                  <button
                    type="button"
                    disabled={!tracing.length}
                    onClick={() => setTracing(tracing.slice(0, -1))}
                    aria-label="one point back"
                    className="grid size-8 place-items-center rounded-lg text-muted disabled:opacity-30"
                  >
                    <Undo2 className="size-3" />
                  </button>
                  <button
                    type="button"
                    disabled={tracing.length < 3}
                    onClick={finishShape}
                    className="min-h-8 rounded-lg bg-glow/20 px-2 text-glow disabled:opacity-30"
                  >
                    close the outline
                  </button>
                </>
              )}
              {mode === "link" && (
                <>
                  <span className="text-[10px] text-muted">
                    {map.customLinks.filter(([a, b]) => a === chosen || b === chosen).length} connected
                  </span>
                  <button
                    type="button"
                    disabled={!map.customLinks.some(([a, b]) => a === chosen || b === chosen)}
                    onClick={() => onSave(unlinkAll(map, chosen))}
                    className="min-h-8 rounded-lg px-2 text-muted hover:text-chalk disabled:opacity-30"
                  >
                    clear its connections
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={() => clearOne(chosen)}
                className="ml-auto flex min-h-8 items-center gap-1 rounded-lg px-2 text-muted hover:text-chalk"
              >
                <RotateCcw className="size-3" /> put it back
              </button>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-1 border-t border-white/8 pt-1.5 text-muted">
          {UNPLACED.length > 0 && (
            <span className="w-full text-[10px] text-warm/80">
              no outline matched {UNPLACED.map((t) => TERRITORIES[t].name).join(", ")} -- they stand as markers until you place them
            </span>
          )}
          <span className="text-[10px]">
            {placedCount ? `${placedCount} of your own` : "the world, as it comes"}
            {Object.keys(map.names).length > 0 && ` · ${Object.keys(map.names).length} renamed`}
            {map.customLinks.length > 0 && ` · ${map.customLinks.length} connection${map.customLinks.length === 1 ? "" : "s"}`}
          </span>
          <button
            type="button"
            disabled={!canEdit || !isCustom(map)}
            onClick={() => {
              onSave({ ...emptyMap(), name: map.name });
              setChosen(null);
            }}
            className="ml-auto min-h-8 rounded-lg px-2 hover:bg-white/8 hover:text-chalk disabled:opacity-30"
          >
            start from the world again
          </button>
          <button
            type="button"
            onClick={() => void navigator.clipboard?.writeText(exportMap(map))}
            className="flex min-h-8 items-center gap-1 rounded-lg px-2 hover:bg-white/8 hover:text-chalk"
          >
            <Copy className="size-3" /> copy
          </button>
          <button
            type="button"
            disabled={!canEdit}
            onClick={() => {
              const text = window.prompt("paste a map");
              const parsed = text ? importMap(text) : null;
              if (parsed) onSave(parsed);
              else if (text) setNotice("that is not a map");
            }}
            className="flex min-h-8 items-center gap-1 rounded-lg px-2 hover:bg-white/8 hover:text-chalk disabled:opacity-30"
          >
            <ClipboardPaste className="size-3" /> paste
          </button>
        </div>
      </div>

      {busy && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center rounded-2xl bg-ink-950/60 text-[12px] text-muted">
          sending the picture...
        </div>
      )}
      {!canEdit && (
        <div className="absolute inset-0 grid place-items-center rounded-2xl bg-ink-950/70 text-[12px] text-muted">
          the room is locked
          <button type="button" onClick={onClose} className="mt-2 min-h-9 rounded-lg bg-white/10 px-3 text-chalk">
            <X className="size-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
