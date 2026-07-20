"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import clsx from "clsx";
import {
  Brush,
  Dices,
  Eraser,
  Gamepad2,
  Globe,
  Grid3x3,
  ImagePlus,
  Minus,
  MousePointer2,
  Music4,
  Pencil,
  Plus,
  Smile,
  StickyNote,
  Type,
} from "lucide-react";
import { useRoom } from "@/realtime/room-provider";
import { useRoomStore } from "@/state/room-store";
import { draftItem, topZ } from "@/lib/items";
import { REACTIONS, REACTION_GLYPHS } from "@/lib/reactions";
import type { GameKind, ItemKind } from "@/lib/types";
import BrushPopover from "./brush-popover";

export default function Dock() {
  const { createItem, canEdit, sendPing } = useRoom();
  const viewport = useRoomStore((s) => s.viewport);
  const zoomAt = useRoomStore((s) => s.zoomAt);
  const setViewport = useRoomStore((s) => s.setViewport);
  const tool = useRoomStore((s) => s.tool);
  const setTool = useRoomStore((s) => s.setTool);

  const [gamesOpen, setGamesOpen] = useState(false);
  const [reactionsOpen, setReactionsOpen] = useState(false);
  const dockRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (event: PointerEvent) => {
      if (dockRef.current?.contains(event.target as Node)) return;
      setGamesOpen(false);
      setReactionsOpen(false);
    };
    window.addEventListener("pointerdown", onDown);
    return () => window.removeEventListener("pointerdown", onDown);
  }, []);

  /** Roughly the middle of what the viewer can currently see. */
  const centerOfView = useCallback(() => {
    const vp = useRoomStore.getState().viewport;
    return {
      x: (window.innerWidth / 2 - vp.x) / vp.scale,
      y: (window.innerHeight / 2 - vp.y) / vp.scale,
    };
  }, []);

  const add = useCallback(
    async (kind: ItemKind, game?: GameKind) => {
      if (!canEdit) return;
      const z = topZ(Object.values(useRoomStore.getState().items));
      const at = centerOfView();
      // Scatter a little so repeated clicks do not stack perfectly.
      const jitter = { x: at.x + (Math.random() * 90 - 45), y: at.y + (Math.random() * 90 - 45) };
      await createItem(draftItem(kind, jitter, z, game ? { game } : {}));
      setGamesOpen(false);
    },
    [canEdit, centerOfView, createItem],
  );

  const react = useCallback(
    (glyph: string) => {
      const at = centerOfView();
      sendPing(at.x + (Math.random() * 160 - 80), at.y + (Math.random() * 100 - 50), glyph);
    },
    [centerOfView, sendPing],
  );

  return (
    <div
      ref={dockRef}
      className="pointer-events-none absolute inset-x-0 bottom-0 z-50 flex justify-center p-3"
    >
      <div className="pointer-events-auto flex items-end gap-2">
        {/* Zoom */}
        <div className="surface flex items-center gap-0.5 rounded-2xl p-1.5">
          <DockButton
            label="zoom out"
            onClick={() => zoomAt(0.85, window.innerWidth / 2, window.innerHeight / 2)}
          >
            <Minus className="size-4" strokeWidth={2.4} />
          </DockButton>
          <button
            type="button"
            onClick={() => setViewport({ x: 0, y: 0, scale: 1 })}
            title="back to the middle"
            className="min-w-11 rounded-xl px-1.5 py-1.5 text-[11px] font-medium tabular-nums text-muted transition hover:bg-white/8 hover:text-chalk"
          >
            {Math.round(viewport.scale * 100)}%
          </button>
          <DockButton
            label="zoom in"
            onClick={() => zoomAt(1.18, window.innerWidth / 2, window.innerHeight / 2)}
          >
            <Plus className="size-4" strokeWidth={2.4} />
          </DockButton>
        </div>

        {/* Tools: point, draw, erase */}
        <div className="surface relative flex items-center gap-0.5 rounded-2xl p-1.5">
          <DockButton
            label="point and drag (V)"
            active={tool === "select"}
            onClick={() => setTool("select")}
          >
            <MousePointer2 className="size-4.5" strokeWidth={2} />
          </DockButton>
          <DockButton
            label="draw on the room (B)"
            disabled={!canEdit}
            active={tool === "draw"}
            onClick={() => setTool(tool === "draw" ? "select" : "draw")}
          >
            <Brush className="size-4.5" strokeWidth={2} />
          </DockButton>
          <DockButton
            label="erase (E)"
            disabled={!canEdit}
            active={tool === "erase"}
            onClick={() => setTool(tool === "erase" ? "select" : "erase")}
          >
            <Eraser className="size-4.5" strokeWidth={2} />
          </DockButton>

          {tool === "draw" && <BrushPopover />}
        </div>

        {/* Add things */}
        <div className="surface relative flex items-center gap-0.5 rounded-2xl p-1.5">
          <DockButton label="pin a picture" disabled={!canEdit} onClick={() => add("image")}>
            <ImagePlus className="size-4.5" strokeWidth={2} />
          </DockButton>
          <DockButton label="leave a note" disabled={!canEdit} onClick={() => add("note")}>
            <StickyNote className="size-4.5" strokeWidth={2} />
          </DockButton>
          <DockButton label="big text" disabled={!canEdit} onClick={() => add("text")}>
            <Type className="size-4.5" strokeWidth={2} />
          </DockButton>
          <DockButton label="music or video" disabled={!canEdit} onClick={() => add("media")}>
            <Music4 className="size-4.5" strokeWidth={2} />
          </DockButton>
          <DockButton label="a window to somewhere" disabled={!canEdit} onClick={() => add("embed")}>
            <Globe className="size-4.5" strokeWidth={2} />
          </DockButton>

          <DockButton
            label="games"
            disabled={!canEdit}
            active={gamesOpen}
            onClick={() => {
              setGamesOpen((v) => !v);
              setReactionsOpen(false);
            }}
          >
            <Gamepad2 className="size-4.5" strokeWidth={2} />
          </DockButton>

          {gamesOpen && (
            <div className="surface-raised animate-drift-in absolute bottom-full right-1.5 mb-2 w-48 overflow-hidden rounded-2xl p-1 shadow-2xl">
              <GameOption
                icon={<Grid3x3 className="size-4" strokeWidth={2} />}
                title="tic tac toe"
                hint="quick and petty"
                onClick={() => add("game", "tictactoe")}
              />
              <GameOption
                icon={<Dices className="size-4" strokeWidth={2} />}
                title="connect four"
                hint="slightly less quick"
                onClick={() => add("game", "connectfour")}
              />
              <GameOption
                icon={<Pencil className="size-4" strokeWidth={2} />}
                title="doodle board"
                hint="draw together"
                onClick={() => add("game", "doodle")}
              />
            </div>
          )}
        </div>

        {/* Reactions */}
        <div className="surface relative flex items-center rounded-2xl p-1.5">
          <DockButton
            label="react"
            active={reactionsOpen}
            onClick={() => {
              setReactionsOpen((v) => !v);
              setGamesOpen(false);
            }}
          >
            <Smile className="size-4.5" strokeWidth={2} />
          </DockButton>

          {reactionsOpen && (
            <div className="surface-raised animate-drift-in absolute right-0 bottom-full mb-2 grid grid-cols-8 gap-0.5 rounded-2xl p-1.5 shadow-2xl">
              {REACTIONS.map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => react(REACTION_GLYPHS[key])}
                  aria-label={`react ${key}`}
                  className="grid size-9 place-items-center rounded-xl text-xl transition hover:scale-110 hover:bg-white/10"
                >
                  {REACTION_GLYPHS[key]}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DockButton({
  children,
  label,
  onClick,
  disabled,
  active,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={clsx(
        "grid size-9 place-items-center rounded-xl transition disabled:opacity-35 disabled:hover:bg-transparent",
        active ? "bg-glow/22 text-glow" : "text-muted hover:bg-white/8 hover:text-chalk",
      )}
    >
      {children}
    </button>
  );
}

function GameOption({
  icon,
  title,
  hint,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition hover:bg-white/9"
    >
      <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-glow/18 text-glow">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-xs font-medium">{title}</span>
        <span className="block truncate text-[11px] text-muted/70">{hint}</span>
      </span>
    </button>
  );
}
