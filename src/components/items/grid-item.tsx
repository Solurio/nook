"use client";

import { useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { Circle, Eraser, Minus, Ruler, SlidersHorizontal, Square, Trash2, Triangle } from "lucide-react";
import { useRoom } from "@/realtime/room-provider";
import { newId } from "@/lib/slug";
import type { Item } from "@/lib/types";
import {
  AREA_ANCHORS,
  AREA_COLORS,
  MAX_AREAS,
  areaAnchor,
  areaShape,
  areaText,
  cellsBetween,
  columnName,
  distanceText,
  emptyGrid,
  hexCenter,
  hexCorners,
  nextUnit,
  unitText,
  type Area,
  type AreaKind,
  type GridData,
} from "@/lib/grid";
import { t as tx } from "@/lib/i18n";

/** Past this many cells the grid is only drawn as far as this. */
const MAX_CELLS = 3000;

type Tool = "measure" | AreaKind | "erase";

const TOOLS: Array<{ tool: Tool; label: string; icon: React.ReactNode }> = [
  { tool: "measure", label: "measure a distance", icon: <Ruler /> },
  { tool: "circle", label: "a circle (radius)", icon: <Circle /> },
  { tool: "cone", label: "a cone", icon: <Triangle /> },
  { tool: "square", label: "a cube", icon: <Square /> },
  { tool: "line", label: "a line", icon: <Minus /> },
  { tool: "erase", label: "take an area away", icon: <Eraser /> },
];

/**
 * A grid to play on: squares or hexes, over a map if there is one. Pieces let
 * go over it settle into the cell they land in. It measures -- in feet or
 * metres, however much ground a cell stands for -- and holds the areas a
 * table of adventurers keeps needing: circles, cones, cubes and lines.
 */
export default function GridItem({ item }: { item: Item<"grid"> }) {
  const { updateData, canEdit } = useRoom();
  const data = { ...emptyGrid(), ...item.data } as GridData;
  const { width, height } = item;
  const cell = Math.max(8, data.cell);
  const areas = useMemo(() => data.areas ?? [], [data.areas]);

  const [tool, setTool] = useState<Tool | null>(null);
  const [drag, setDrag] = useState<{ x: number; y: number; tx: number; ty: number } | null>(null);
  const [color, setColor] = useState(AREA_COLORS[0]);
  const [tuning, setTuning] = useState(false);
  const areaAlpha = data.areaAlpha ?? 0.26;
  const imageAlpha = data.imageAlpha ?? 1;
  const surface = useRef<HTMLDivElement>(null);

  const lines = useMemo(() => {
    if (data.shape === "square") {
      let d = "";
      for (let x = 0; x <= width + 0.5; x += cell) d += `M${x} 0V${height}`;
      for (let y = 0; y <= height + 0.5; y += cell) d += `M0 ${y}H${width}`;
      return d;
    }
    let d = "";
    let drawn = 0;
    const size = cell / Math.sqrt(3);
    const rows = Math.ceil(height / (1.5 * size)) + 1;
    for (let r = 0; r < rows && drawn < MAX_CELLS; r += 1) {
      // Offset rows, converted to the axial columns the snapping uses.
      const cols = Math.ceil(width / cell) + 1;
      for (let col = -1; col < cols && drawn < MAX_CELLS; col += 1) {
        const q = col - (r - (r & 1)) / 2;
        const c = hexCenter(q, r, cell);
        if (c.x < -cell || c.x > width + cell) continue;
        const corners = hexCorners(c.x, c.y, cell);
        d += `M${corners.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join("L")}Z`;
        drawn += 1;
      }
    }
    return d;
  }, [data.shape, width, height, cell]);

  const labels = useMemo(() => {
    if (!data.labels || data.shape !== "square") return [];
    const out: Array<{ x: number; y: number; text: string }> = [];
    const cols = Math.floor(width / cell);
    const rows = Math.floor(height / cell);
    if (cols * rows > 900) return out;
    for (let c = 0; c < cols; c += 1) {
      for (let r = 0; r < rows; r += 1) out.push({ x: c * cell + 3, y: r * cell + 10, text: `${columnName(c)}${r + 1}` });
    }
    return out;
  }, [data.labels, data.shape, width, height, cell]);

  /** A pointer position in the grid's own pixels, whatever the zoom. */
  const local = (event: React.PointerEvent) => {
    const rect = (surface.current as HTMLDivElement).getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * width,
      y: ((event.clientY - rect.top) / rect.height) * height,
    };
  };

  const save = (next: Partial<GridData>) => void updateData(item.id, { ...item.data, ...next } as never);

  const down = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!tool || tool === "erase") return;
    event.stopPropagation();
    event.preventDefault();
    const at = local(event);
    const start = tool === "measure" ? at : areaAnchor(data.shape, cell, at.x, at.y, data.anchor);
    setDrag({ x: start.x, y: start.y, tx: at.x, ty: at.y });
    // Keeps the drag going if the pointer leaves the grid; not every pointer can be held.
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Carry on without it.
    }
  };
  const move = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!drag) return;
    event.stopPropagation();
    const at = local(event);
    setDrag({ ...drag, tx: at.x, ty: at.y });
  };
  const up = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!drag || !tool) return;
    event.stopPropagation();
    if (tool !== "measure" && tool !== "erase" && canEdit) {
      const area: Area = { id: newId(), kind: tool, x: drag.x, y: drag.y, tx: drag.tx, ty: drag.ty, color };
      save({ areas: [...areas, area].slice(-MAX_AREAS) });
      setDrag(null);
    }
    // A measurement stays on the grid until the next one, so it can be read out.
  };

  const draft: Area | null = drag && tool && tool !== "measure" && tool !== "erase" ? { id: "draft", kind: tool, ...drag, color } : null;
  const measured = drag && tool === "measure" ? cellsBetween(data.shape, cell, drag.x, drag.y, drag.tx, drag.ty) : null;
  const fontSize = Math.max(11, Math.min(20, cell / 3));

  const drawArea = (area: Area, faint?: boolean) => {
    const shape = areaShape(area, cell);
    const common = {
      fill: area.color,
      fillOpacity: faint ? areaAlpha * 0.7 : areaAlpha,
      stroke: area.color,
      strokeWidth: 2,
      vectorEffect: "non-scaling-stroke" as const,
    };
    const eraseMe =
      tool === "erase" && canEdit && !faint
        ? {
            onPointerDown: (event: React.PointerEvent) => event.stopPropagation(),
            onClick: () => save({ areas: areas.filter((a) => a.id !== area.id) }),
            style: { cursor: "pointer", pointerEvents: "auto" as const },
          }
        : {};
    const labelAt = "circle" in shape ? { x: shape.circle.cx, y: shape.circle.cy } : { x: area.x, y: area.y };
    return (
      <g key={area.id}>
        {"circle" in shape ? <circle cx={shape.circle.cx} cy={shape.circle.cy} r={shape.circle.r} {...common} {...eraseMe} /> : <polygon points={shape.points.map((p) => p.join(",")).join(" ")} {...common} {...eraseMe} />}
        <text x={labelAt.x + 4} y={labelAt.y - 4} fontSize={fontSize} fontWeight={700} fill="#f4efe6" stroke="#100d16" strokeWidth={3} paintOrder="stroke">
          {areaText(area, cell, data.unit)}
        </text>
      </g>
    );
  };

  return (
    <div
      className="relative size-full overflow-hidden rounded-md"
      style={{ background: data.image ? "#2a2233" : "color-mix(in oklab, #2a2233 70%, transparent)" }}
    >
      {data.image && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{ background: `center / cover no-repeat url("${data.image.replace(/"/g, "%22")}")`, opacity: imageAlpha }}
        />
      )}
      <svg className="pointer-events-none absolute inset-0 size-full" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden>
        <path d={lines} fill="none" stroke={data.color} strokeOpacity={data.opacity} strokeWidth={1.2} vectorEffect="non-scaling-stroke" />
        {labels.map((l) => (
          <text key={l.text} x={l.x} y={l.y} fontSize={Math.min(10, cell / 4)} fill={data.color} fillOpacity={Math.min(1, data.opacity + 0.25)}>
            {l.text}
          </text>
        ))}
      </svg>

      {/* Areas, and whatever is being drawn or measured */}
      <svg className="pointer-events-none absolute inset-0 size-full" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
        {areas.map((a) => drawArea(a))}
        {draft && drawArea(draft, true)}
        {drag && measured !== null && (
          <g>
            <line x1={drag.x} y1={drag.y} x2={drag.tx} y2={drag.ty} stroke="#f6c177" strokeWidth={3} strokeDasharray="6 4" vectorEffect="non-scaling-stroke" />
            <circle cx={drag.x} cy={drag.y} r={4} fill="#f6c177" />
            <circle cx={drag.tx} cy={drag.ty} r={4} fill="#f6c177" />
            <text x={drag.tx + 8} y={drag.ty - 8} fontSize={fontSize} fontWeight={700} fill="#f6c177" stroke="#100d16" strokeWidth={3} paintOrder="stroke">
              {distanceText(measured, data.unit)}
            </text>
          </g>
        )}
      </svg>

      {/* Drawing surface: only there while a tool is in hand */}
      {tool && tool !== "erase" && (
        <div ref={surface} className="absolute inset-0 cursor-crosshair touch-none" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={() => setDrag(null)} />
      )}
      {(!tool || tool === "erase") && <div ref={surface} className="pointer-events-none absolute inset-0" />}

      {tuning && canEdit && (
        <div
          className="absolute top-11 left-1.5 z-10 flex w-52 flex-col gap-1.5 rounded-lg bg-ink-950/85 p-2 text-[10px] text-muted backdrop-blur-sm"
          onPointerDown={(event) => event.stopPropagation()}
        >
          <span>{tx("areas start at")}</span>
          <span className="flex rounded-md bg-white/6 p-0.5">
            {AREA_ANCHORS.map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => save({ anchor: a })}
                className={clsx("min-h-7 flex-1 rounded px-1", (data.anchor ?? "corner") === a ? "bg-chalk text-ink-950" : "text-muted hover:text-chalk")}
              >
                {a === "corner" ? tx("a corner") : a === "center" ? tx("a middle") : tx("anywhere")}
              </button>
            ))}
          </span>
          {(
            [
              ["areas", areaAlpha, 0.05, 0.9, (v: number) => save({ areaAlpha: v })],
              ["map", imageAlpha, 0, 1, (v: number) => save({ imageAlpha: v })],
              ["lines", data.opacity, 0, 1, (v: number) => save({ opacity: v })],
            ] as Array<[string, number, number, number, (v: number) => void]>
          ).map(([name, value, min, max, set]) => (
            <label key={name} className="flex items-center gap-2">
              <span className="w-9">{name}</span>
              <input
                type="range"
                min={min}
                max={max}
                step={0.05}
                value={value}
                onChange={(event) => set(Number(event.target.value))}
                className="min-w-0 flex-1 accent-[#f6c177]"
              />
              <span className="w-7 text-right tabular-nums">{Math.round(value * 100)}%</span>
            </label>
          ))}
        </div>
      )}

      {/* The tools */}
      <div
        className="absolute top-1.5 left-1.5 flex flex-wrap items-center gap-0.5 rounded-lg bg-ink-950/75 p-0.5 backdrop-blur-sm"
        onPointerDown={(event) => event.stopPropagation()}
      >
        {TOOLS.filter((t) => t.tool === "measure" || canEdit).map((t) => (
          <button
            key={t.tool}
            type="button"
            title={t.label}
            aria-label={t.label}
            onClick={() => {
              setTool(tool === t.tool ? null : t.tool);
              setDrag(null);
            }}
            className={clsx(
              "grid size-7 place-items-center rounded-md transition [&_svg]:size-3.5",
              tool === t.tool ? "bg-warm/25 text-warm" : "text-muted hover:bg-white/10 hover:text-chalk",
            )}
          >
            {t.icon}
          </button>
        ))}
        {canEdit && tool && tool !== "measure" && tool !== "erase" && (
          <span className="flex items-center gap-0.5 px-0.5">
            {AREA_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={tx(`colour ${c}`)}
                onClick={() => setColor(c)}
                className={clsx("size-4 rounded-full", color === c && "ring-2 ring-chalk")}
                style={{ background: c }}
              />
            ))}
          </span>
        )}
        <button
          type="button"
          disabled={!canEdit}
          title={tx("how much ground one square stands for")}
          onClick={() => save({ unit: nextUnit(data.unit) })}
          className="min-h-7 rounded-md px-1.5 text-[10px] text-chalk tabular-nums hover:bg-white/10 disabled:cursor-default"
        >
          1 = {unitText(data.unit)}
        </button>
        {canEdit && (
          <button
            type="button"
            title={tx("see-through and where areas start")}
            aria-label={tx("grid settings")}
            onClick={() => setTuning(!tuning)}
            className={clsx(
              "grid size-7 place-items-center rounded-md transition [&_svg]:size-3.5",
              tuning ? "bg-warm/25 text-warm" : "text-muted hover:bg-white/10 hover:text-chalk",
            )}
          >
            <SlidersHorizontal />
          </button>
        )}
        {canEdit && areas.length > 0 && (
          <button
            type="button"
            title={tx("clear every area")}
            aria-label={tx("clear every area")}
            onClick={() => save({ areas: [] })}
            className="grid size-7 place-items-center rounded-md text-muted hover:bg-white/10 hover:text-chalk [&_svg]:size-3.5"
          >
            <Trash2 />
          </button>
        )}
      </div>
    </div>
  );
}
