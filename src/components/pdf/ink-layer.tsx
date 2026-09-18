"use client";

import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { StickyNote } from "lucide-react";
import { newId } from "@/lib/slug";
import { markAt, type PdfMark } from "@/lib/pdf";
import { useRoomStore } from "@/state/room-store";

export type InkTool = "pen" | "highlight" | "note" | "eraser";

/** Stroke widths, in thousandths of the page's width. */
const WIDTH = { pen: 3, highlight: 16 } as const;

const toPoints = (points: number[]) => {
  const out: string[] = [];
  for (let i = 0; i + 1 < points.length; i += 2) out.push(`${points[i]},${points[i + 1]}`);
  return out.join(" ");
};

/**
 * The room's layer over a page: pen, highlighter and pinned notes. Drawn in
 * page coordinates, so it sits on the same words at any size.
 */
export default function InkLayer({
  marks,
  tool,
  color,
  onMark,
  onErase,
  onNote,
}: {
  marks: PdfMark[];
  tool: InkTool | null;
  color: string;
  onMark?: (mark: PdfMark) => void;
  onErase?: (id: string) => void;
  onNote?: (id: string) => void;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const [width, setWidth] = useState(0);
  const [drawing, setDrawing] = useState<number[] | null>(null);
  const me = useRoomStore((s) => s.me?.name);

  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const at = (event: React.PointerEvent) => {
    const rect = (svg.current as SVGSVGElement).getBoundingClientRect();
    return [(event.clientX - rect.left) / rect.width, (event.clientY - rect.top) / rect.height] as const;
  };
  const px = (w: number) => Math.max(1, (w * width) / 1000);

  const down = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!tool) return;
    event.stopPropagation();
    event.preventDefault();
    const [x, y] = at(event);
    if (tool === "note") {
      const id = newId();
      onMark?.({ id, kind: "note", x, y, text: "", color: "#ffe066", ...(me ? { by: me } : {}) });
      onNote?.(id);
      return;
    }
    if (tool === "eraser") {
      const hit = markAt(marks, x, y);
      if (hit) onErase?.(hit.id);
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    if (tool === "pen" || tool === "highlight") setDrawing([x, y]);
  };

  const move = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!tool) return;
    event.stopPropagation();
    const [x, y] = at(event);
    if (tool === "eraser" && event.buttons) {
      const hit = markAt(marks, x, y);
      if (hit) onErase?.(hit.id);
      return;
    }
    if (drawing) setDrawing([...drawing, x, y]);
  };

  const up = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!tool) return;
    event.stopPropagation();
    if (drawing && (tool === "pen" || tool === "highlight")) {
      onMark?.({ id: newId(), kind: tool, color, width: WIDTH[tool], points: drawing, ...(me ? { by: me } : {}) });
    }
    setDrawing(null);
  };

  const ink = marks.filter((m): m is Exclude<PdfMark, { kind: "note" }> => m.kind !== "note");
  const notes = marks.filter((m) => m.kind === "note");

  return (
    <>
      <svg
        ref={svg}
        viewBox="0 0 1 1"
        preserveAspectRatio="none"
        className={clsx("absolute inset-0 size-full", tool ? "touch-none" : "pointer-events-none", tool === "eraser" ? "cursor-cell" : tool ? "cursor-crosshair" : "")}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={() => setDrawing(null)}
      >
        {ink.map((mark) => (
            <polyline
              key={mark.id}
              points={toPoints(mark.points)}
              fill="none"
              stroke={mark.color}
              strokeWidth={px(mark.width)}
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
              opacity={mark.kind === "highlight" ? 0.38 : 0.95}
              style={mark.kind === "highlight" ? { mixBlendMode: "multiply" } : undefined}
            />
        ))}
        {drawing && (
          <polyline
            points={toPoints(drawing)}
            fill="none"
            stroke={color}
            strokeWidth={px(tool === "highlight" ? WIDTH.highlight : WIDTH.pen)}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
            opacity={tool === "highlight" ? 0.38 : 0.95}
          />
        )}
      </svg>
      {notes.map((note) =>
        note.kind === "note" ? (
          <button
            key={note.id}
            type="button"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              if (tool === "eraser") onErase?.(note.id);
              else onNote?.(note.id);
            }}
            title={note.text || "a note"}
            className="absolute grid size-6 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-md shadow-[0_2px_6px_rgba(0,0,0,0.35)] transition hover:scale-110"
            style={{ left: `${note.x * 100}%`, top: `${note.y * 100}%`, background: note.color }}
          >
            <StickyNote className="size-3.5 text-ink-950/70" strokeWidth={2.2} />
          </button>
        ) : null,
      )}
    </>
  );
}
