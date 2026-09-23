"use client";

// Where the studio's panels live. On a wide screen they dock down the left and
// the right of the picture, or along its bottom, stacked, the way desktop
// painting programs arrange them -- or float over it -- and each one's menu
// moves it. Which are open and where is remembered on this device. A tablet
// in portrait gets them floating; a phone gets one at a time, as a sheet that
// leaves the top of the picture showing.

import { createContext, useContext, useState } from "react";
import clsx from "clsx";
import { ChevronDown, GripHorizontal, MoreVertical, PanelBottom, PanelLeft, PanelRight, PictureInPicture2, X } from "lucide-react";
import { t } from "@/lib/i18n";

export type PanelId = "color" | "layers" | "brushes" | "adjust" | "animation" | "file";
export type Place = "left" | "right" | "bottom" | "float";

export interface Spot {
  place: Place;
  open: boolean;
  /** Folded down to its title, in a dock. */
  folded?: boolean;
  order: number;
  /** Where it floats, and how big. */
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Layout {
  spots: Record<PanelId, Spot>;
  left: number;
  right: number;
  bottom: number;
}

export type Mode = "wide" | "compact" | "phone";

const KEY = "nook.studio.layout.v1";

const spot = (place: Place, open: boolean, order: number, x = 64, y = 12, w = 280, h = 420): Spot => ({ place, open, order, x, y, w, h });

export const DEFAULT_LAYOUT: Layout = {
  spots: {
    color: spot("right", true, 0),
    layers: spot("right", true, 1),
    brushes: spot("left", true, 0),
    adjust: spot("float", false, 0, 80, 20, 290, 460),
    animation: spot("bottom", false, 0),
    file: spot("float", false, 1, 64, 12, 300, 480),
  },
  left: 250,
  right: 272,
  bottom: 176,
};

const PANEL_IDS = Object.keys(DEFAULT_LAYOUT.spots) as PanelId[];

function readLayout(): Layout {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<Layout> | null;
    if (!saved?.spots) return DEFAULT_LAYOUT;
    const spots = { ...DEFAULT_LAYOUT.spots };
    for (const id of PANEL_IDS) if (saved.spots[id]) spots[id] = { ...spots[id], ...saved.spots[id] };
    return { ...DEFAULT_LAYOUT, ...saved, spots };
  } catch {
    return DEFAULT_LAYOUT;
  }
}

/** The layout, kept on this device. The studio only ever draws in the browser, so it can be read straight away. */
export function useLayout(): [Layout, (change: (l: Layout) => Layout) => void] {
  const [layout, setLayout] = useState<Layout>(readLayout);
  const change = (fn: (l: Layout) => Layout) =>
    setLayout((l) => {
      const next = fn(l);
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        // Kept for this visit only.
      }
      return next;
    });
  return [layout, change];
}

/** Opens a panel where it last was, or closes it. On a phone only one is open at a time. */
export function togglePanel(layout: Layout, id: PanelId, mode: Mode, open?: boolean): Layout {
  const next = open ?? !layout.spots[id].open;
  const spots = { ...layout.spots };
  if (next && mode === "phone") for (const other of PANEL_IDS) if (other !== id && spots[other].open) spots[other] = { ...spots[other], open: false };
  spots[id] = { ...spots[id], open: next, folded: false };
  return { ...layout, spots };
}

export function movePanel(layout: Layout, id: PanelId, place: Place): Layout {
  const inPlace = PANEL_IDS.filter((p) => layout.spots[p].place === place && p !== id);
  const order = inPlace.length ? Math.max(...inPlace.map((p) => layout.spots[p].order)) + 1 : 0;
  return { ...layout, spots: { ...layout.spots, [id]: { ...layout.spots[id], place, order, open: true, folded: false } } };
}

// ---------------------------------------------------------------------------
// How a panel is shown, wherever it is
// ---------------------------------------------------------------------------

interface Host {
  id: PanelId;
  mode: Mode;
  place: Place;
  folded: boolean;
  onFold: () => void;
  onMove: (place: Place) => void;
  onDragStart: (event: React.PointerEvent) => void;
}

const HostContext = createContext<Host | null>(null);

export const usePanelHost = () => useContext(HostContext);

/** The frame round a panel's contents: its title bar, and what the place it is in needs. */
export function PanelFrame({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const host = usePanelHost();
  const [menu, setMenu] = useState(false);
  const place = host?.place ?? "float";
  const mode = host?.mode ?? "wide";
  return (
    <div
      className="flex h-full min-h-0 flex-col overflow-hidden"
      onPointerDown={(event) => event.stopPropagation()}
      onWheel={(event) => event.stopPropagation()}
    >
      <div
        className={clsx("relative flex shrink-0 items-center gap-1 border-b border-white/8 px-1.5 py-1", place === "float" && mode !== "phone" && "cursor-grab touch-none")}
        onPointerDown={(event) => {
          if (place === "float" && mode !== "phone" && (event.target as HTMLElement).closest("button") === null) host?.onDragStart(event);
        }}
      >
        {mode === "phone" ? <span className="absolute top-1 left-1/2 h-1 w-9 -translate-x-1/2 rounded-full bg-white/20" /> : place === "float" ? <GripHorizontal className="size-3.5 text-muted/50" /> : null}
        {place !== "float" && mode === "wide" && (
          <button type="button" onClick={host?.onFold} aria-label={host?.folded ? t("open it") : t("fold it")} className="grid size-6 place-items-center rounded text-muted hover:bg-white/8 hover:text-chalk">
            <ChevronDown className={clsx("size-3.5 transition", host?.folded && "-rotate-90")} />
          </button>
        )}
        <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-chalk">{title}</span>
        {mode === "wide" && host && (
          <button type="button" onClick={() => setMenu((v) => !v)} aria-label={t("move this panel")} title={t("move this panel")} className="grid size-6 place-items-center rounded text-muted hover:bg-white/8 hover:text-chalk">
            <MoreVertical className="size-3.5" />
          </button>
        )}
        <button type="button" onClick={onClose} aria-label={t("close")} className="grid size-6 place-items-center rounded text-muted hover:bg-white/8 hover:text-chalk">
          <X className="size-3.5" />
        </button>
        {menu && host && (
          <div className="surface-raised absolute top-full right-1 z-30 mt-1 flex w-40 flex-col rounded-lg p-1 shadow-2xl">
            {(
              [
                ["left", t("dock on the left"), <PanelLeft key="l" />],
                ["right", t("dock on the right"), <PanelRight key="r" />],
                ["bottom", t("dock along the bottom"), <PanelBottom key="b" />],
                ["float", t("float it"), <PictureInPicture2 key="f" />],
              ] as Array<[Place, string, React.ReactNode]>
            ).map(([where, label, icon]) => (
              <button
                key={where}
                type="button"
                disabled={place === where}
                onClick={() => {
                  setMenu(false);
                  host.onMove(where);
                }}
                className="flex min-h-7 items-center gap-2 rounded-md px-2 text-left text-[11px] text-muted hover:bg-white/8 hover:text-chalk disabled:opacity-40 [&_svg]:size-3.5"
              >
                {icon}
                {label}
              </button>
            ))}
          </div>
        )}
      </div>
      {!host?.folded && <div className="min-h-0 flex-1 overflow-y-auto p-2">{children}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The workspace
// ---------------------------------------------------------------------------

export interface PanelView {
  id: PanelId;
  node: React.ReactNode;
}

/** The mode for a width: where there is room for docks, and where there is not. */
export const modeFor = (width: number): Mode => (width >= 900 ? "wide" : width >= 600 ? "compact" : "phone");

export function Workspace({
  mode,
  layout,
  setLayout,
  panels,
  canvas,
  toolRail,
  sideRail,
  bottomBar,
}: {
  mode: Mode;
  layout: Layout;
  setLayout: (change: (l: Layout) => Layout) => void;
  /** The open panels' contents. */
  panels: PanelView[];
  canvas: React.ReactNode;
  toolRail: React.ReactNode;
  sideRail: React.ReactNode;
  /** On a phone: the bar along the bottom that stands in for the rails. */
  bottomBar?: React.ReactNode;
}) {
  // The studio passes only the panels that are open: docked ones on a wide
  // screen, the one overlay on a smaller one.
  const open = panels;
  const at = (place: Place) => open.filter((p) => (mode === "wide" ? layout.spots[p.id].place === place : place === "float")).sort((a, b) => layout.spots[a.id].order - layout.spots[b.id].order);

  const hostFor = (id: PanelId, place: Place): Host => ({
    id,
    mode,
    place,
    folded: Boolean(layout.spots[id].folded) && mode === "wide" && place !== "float",
    onFold: () => setLayout((l) => ({ ...l, spots: { ...l.spots, [id]: { ...l.spots[id], folded: !l.spots[id].folded } } })),
    onMove: (where) => setLayout((l) => movePanel(l, id, where)),
    onDragStart: (event) => startFloatDrag(event, id, "move"),
  });

  /** Dragging a floating panel by its title, or its corner to size it. */
  const startFloatDrag = (event: React.PointerEvent, id: PanelId, how: "move" | "size") => {
    event.preventDefault();
    const s0 = layout.spots[id];
    const x0 = event.clientX;
    const y0 = event.clientY;
    const bounds = (event.currentTarget as HTMLElement).closest("[data-studio-area]")?.getBoundingClientRect();
    const onMove = (e: PointerEvent) => {
      const dx = e.clientX - x0;
      const dy = e.clientY - y0;
      setLayout((l) => {
        const s = l.spots[id];
        const next =
          how === "move"
            ? { ...s, x: Math.max(0, Math.min((bounds?.width ?? 2000) - 60, s0.x + dx)), y: Math.max(0, Math.min((bounds?.height ?? 2000) - 32, s0.y + dy)) }
            : { ...s, w: Math.max(200, Math.min(900, s0.w + dx)), h: Math.max(160, Math.min(1200, s0.h + dy)) };
        return { ...l, spots: { ...l.spots, [id]: next } };
      });
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  /** Dragging a dock's edge to make it wider or taller. */
  const startDockDrag = (event: React.PointerEvent, side: "left" | "right" | "bottom") => {
    event.preventDefault();
    event.stopPropagation();
    const start = side === "bottom" ? event.clientY : event.clientX;
    const size0 = layout[side];
    const onMove = (e: PointerEvent) => {
      const d = (side === "bottom" ? e.clientY : e.clientX) - start;
      const size = side === "left" ? size0 + d : size0 - d;
      setLayout((l) => ({ ...l, [side]: Math.max(side === "bottom" ? 90 : 190, Math.min(side === "bottom" ? 520 : 520, size)) }));
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const dock = (side: "left" | "right" | "bottom") => {
    const list = at(side);
    if (!list.length) return null;
    const vertical = side !== "bottom";
    return (
      <div
        className={clsx("relative flex shrink-0 bg-ink-900/80", vertical ? "flex-col border-white/8" : "flex-row border-t border-white/8", side === "left" && "border-r", side === "right" && "border-l")}
        style={vertical ? { width: layout[side] } : { height: layout.bottom }}
      >
        {list.map((p) => {
          const folded = Boolean(layout.spots[p.id].folded);
          return (
            <div key={p.id} className={clsx("min-h-0 min-w-0 border-white/8", vertical ? "border-b last:border-b-0" : "border-r last:border-r-0", folded ? "shrink-0" : "flex-1")}>
              <HostContext.Provider value={hostFor(p.id, side)}>{p.node}</HostContext.Provider>
            </div>
          );
        })}
        <div
          role="separator"
          aria-orientation={vertical ? "vertical" : "horizontal"}
          onPointerDown={(event) => startDockDrag(event, side)}
          className={clsx("absolute z-10 touch-none", side === "left" && "top-0 -right-1 h-full w-2 cursor-col-resize", side === "right" && "top-0 -left-1 h-full w-2 cursor-col-resize", side === "bottom" && "-top-1 left-0 h-2 w-full cursor-row-resize")}
        />
      </div>
    );
  };

  const floating = at("float");

  if (mode === "phone") {
    const sheet = open[0];
    return (
      <div className="relative flex min-h-0 flex-1 flex-col">
        <div data-studio-area className="relative min-h-0 flex-1">
          {canvas}
          {sheet && (
            <div className="surface-raised animate-drift-in absolute inset-x-0 bottom-0 z-20 flex max-h-[62%] min-h-[40%] flex-col rounded-t-2xl shadow-2xl">
              <HostContext.Provider value={hostFor(sheet.id, "float")}>{sheet.node}</HostContext.Provider>
            </div>
          )}
        </div>
        {bottomBar}
      </div>
    );
  }

  return (
    <div className="relative flex min-h-0 flex-1">
      {toolRail}
      {mode === "wide" && dock("left")}
      <div className="relative flex min-w-0 flex-1 flex-col">
        <div data-studio-area className="relative min-h-0 flex-1">
          {canvas}
          {floating.map((p) => {
            const s = layout.spots[p.id];
            const compact = mode === "compact";
            return (
              <div
                key={p.id}
                className="surface-raised absolute z-20 flex flex-col overflow-hidden rounded-xl shadow-2xl"
                style={compact ? { top: 8, right: 8, width: Math.min(s.w, 320), maxHeight: "calc(100% - 16px)", height: s.h } : { left: s.x, top: s.y, width: s.w, height: s.h, maxHeight: "calc(100% - 8px)" }}
              >
                <HostContext.Provider value={hostFor(p.id, "float")}>{p.node}</HostContext.Provider>
                {!compact && (
                  <div
                    onPointerDown={(event) => {
                      event.stopPropagation();
                      startFloatDrag(event, p.id, "size");
                    }}
                    className="absolute right-0 bottom-0 size-4 cursor-nwse-resize touch-none"
                    aria-hidden
                  />
                )}
              </div>
            );
          })}
        </div>
        {mode === "wide" && dock("bottom")}
      </div>
      {sideRail}
      {mode === "wide" && dock("right")}
    </div>
  );
}
