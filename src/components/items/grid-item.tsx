"use client";

import { useMemo } from "react";
import type { Item } from "@/lib/types";
import { columnName, emptyGrid, hexCenter, hexCorners, type GridData } from "@/lib/grid";

/** Past this many cells the grid is only drawn as far as this. */
const MAX_CELLS = 3000;

/**
 * A grid to play on: squares or hexes, over a map if there is one. Pieces let
 * go over it settle into the cell they land in.
 */
export default function GridItem({ item }: { item: Item<"grid"> }) {
  const data = { ...emptyGrid(), ...item.data } as GridData;
  const { width, height } = item;
  const cell = Math.max(8, data.cell);

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

  return (
    <div
      className="relative size-full overflow-hidden rounded-md"
      style={{
        background: data.image
          ? `center / cover no-repeat url("${data.image.replace(/"/g, "%22")}"), #2a2233`
          : "color-mix(in oklab, #2a2233 70%, transparent)",
      }}
    >
      <svg className="absolute inset-0 size-full" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden>
        <path d={lines} fill="none" stroke={data.color} strokeOpacity={data.opacity} strokeWidth={1.2} vectorEffect="non-scaling-stroke" />
        {labels.map((l) => (
          <text key={l.text} x={l.x} y={l.y} fontSize={Math.min(10, cell / 4)} fill={data.color} fillOpacity={Math.min(1, data.opacity + 0.25)}>
            {l.text}
          </text>
        ))}
      </svg>
    </div>
  );
}
