"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import clsx from "clsx";
import {
  Brush,
  CircleDot,
  Crown,
  Dices,
  Eraser,
  Gamepad2,
  Globe,
  Grid3x3,
  ImagePlus,
  Maximize2,
  Minus,
  MonitorPlay,
  MonitorUp,
  MousePointer2,
  Music4,
  Pencil,
  Plus,
  Smile,
  Spade,
  StickyNote,
  Swords,
  Type,
  X,
} from "lucide-react";
import { useRoom } from "@/realtime/room-provider";
import { useRoomStore, viewportForItems } from "@/state/room-store";
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
  const [sheetOpen, setSheetOpen] = useState(false);
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
      setSheetOpen(false);
    },
    [canEdit, centerOfView, createItem],
  );

  /** Pull the camera back until everything in the room is on screen. */
  const fitEverything = useCallback(() => {
    const items = Object.values(useRoomStore.getState().items);
    setViewport(viewportForItems(items, window.innerWidth, window.innerHeight));
    setSheetOpen(false);
  }, [setViewport]);

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
        {/* Zoom. Hidden on a phone, where pinching does the same job and the
            room is better off with the width. */}
        <div className="surface hidden items-center gap-0.5 rounded-2xl p-1.5 sm:flex">
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

          {(tool === "draw" || tool === "erase") && <BrushPopover />}
        </div>

        {/* One button on a phone: eight of these did not fit, and the ends of
            the row were sliding off both edges of the screen unreachable. */}
        <div className="surface flex items-center rounded-2xl p-1.5 sm:hidden">
          <DockButton
            label="add something"
            disabled={!canEdit}
            active={sheetOpen}
            onClick={() => {
              setSheetOpen((v) => !v);
              setGamesOpen(false);
              setReactionsOpen(false);
            }}
          >
            <Plus className="size-5" strokeWidth={2.4} />
          </DockButton>
        </div>

        {/* Add things */}
        <div className="surface relative hidden items-center gap-0.5 rounded-2xl p-1.5 sm:flex">
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
            label="transmit a tab (live, one shares)"
            disabled={!canEdit}
            onClick={() => add("screencast")}
          >
            <MonitorUp className="size-4.5" strokeWidth={2} />
          </DockButton>
          <DockButton
            label="shared browser (hyperbeam, both control)"
            disabled={!canEdit}
            onClick={() => add("cobrowse")}
          >
            <MonitorPlay className="size-4.5" strokeWidth={2} />
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
            <div className="surface-raised animate-drift-in absolute right-1.5 bottom-full mb-2 w-48 overflow-hidden rounded-2xl p-1 shadow-2xl">
              <GameOption
                icon={<Crown className="size-4" strokeWidth={2} />}
                title="chess"
                hint="the real one"
                onClick={() => add("game", "chess")}
              />
              <GameOption
                icon={<Spade className="size-4" strokeWidth={2} />}
                title="card table"
                hint="any deck, any rules"
                onClick={() => add("game", "cards")}
              />
              <GameOption
                icon={<Swords className="size-4" strokeWidth={2} />}
                title="intransitive"
                hint="rock, paper, scissors at war"
                onClick={() => add("game", "intransitive")}
              />
              <GameOption
                icon={<CircleDot className="size-4" strokeWidth={2} />}
                title="checkers"
                hint="jump and crown"
                onClick={() => add("game", "checkers")}
              />
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
            <div className="surface-raised animate-drift-in absolute right-0 bottom-full mb-2 grid w-[17.5rem] max-w-[92vw] grid-cols-8 gap-1 rounded-2xl p-2 shadow-2xl">
              {REACTIONS.map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    react(REACTION_GLYPHS[key]);
                    setReactionsOpen(false);
                  }}
                  aria-label={`react ${key}`}
                  className="grid aspect-square place-items-center rounded-xl text-xl transition hover:scale-110 hover:bg-white/10"
                >
                  {REACTION_GLYPHS[key]}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {sheetOpen && (
        <AddSheet
          canEdit={canEdit}
          onClose={() => setSheetOpen(false)}
          onAdd={add}
          onFit={fitEverything}
        />
      )}
    </div>
  );
}

/**
 * The phone version of the add row. A bottom sheet with room to label things
 * beats a dock so wide its ends hang off both sides of the screen.
 */
function AddSheet({
  canEdit,
  onClose,
  onAdd,
  onFit,
}: {
  canEdit: boolean;
  onClose: () => void;
  onAdd: (kind: ItemKind, game?: GameKind) => void;
  onFit: () => void;
}) {
  const things: Array<{ icon: React.ReactNode; label: string; run: () => void }> = [
    { icon: <ImagePlus className="size-5" strokeWidth={2} />, label: "picture", run: () => onAdd("image") },
    { icon: <StickyNote className="size-5" strokeWidth={2} />, label: "note", run: () => onAdd("note") },
    { icon: <Type className="size-5" strokeWidth={2} />, label: "big text", run: () => onAdd("text") },
    { icon: <Music4 className="size-5" strokeWidth={2} />, label: "music or video", run: () => onAdd("media") },
    { icon: <Globe className="size-5" strokeWidth={2} />, label: "window", run: () => onAdd("embed") },
    { icon: <MonitorUp className="size-5" strokeWidth={2} />, label: "share a tab", run: () => onAdd("screencast") },
    { icon: <MonitorPlay className="size-5" strokeWidth={2} />, label: "shared browser", run: () => onAdd("cobrowse") },
  ];

  const games: Array<{ icon: React.ReactNode; label: string; kind: GameKind }> = [
    { icon: <Crown className="size-5" strokeWidth={2} />, label: "chess", kind: "chess" },
    { icon: <Swords className="size-5" strokeWidth={2} />, label: "intransitive", kind: "intransitive" },
    { icon: <Spade className="size-5" strokeWidth={2} />, label: "card table", kind: "cards" },
    { icon: <CircleDot className="size-5" strokeWidth={2} />, label: "checkers", kind: "checkers" },
    { icon: <Grid3x3 className="size-5" strokeWidth={2} />, label: "tic tac toe", kind: "tictactoe" },
    { icon: <Dices className="size-5" strokeWidth={2} />, label: "connect four", kind: "connectfour" },
    { icon: <Pencil className="size-5" strokeWidth={2} />, label: "paint board", kind: "doodle" },
  ];

  return (
    <div className="pointer-events-auto fixed inset-0 z-60 flex flex-col justify-end sm:hidden">
      <button
        type="button"
        aria-label="close"
        onClick={onClose}
        className="absolute inset-0 bg-ink-950/55"
      />

      <div className="surface-raised animate-drift-in relative max-h-[78dvh] overflow-y-auto rounded-t-3xl px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/20" />

        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">add to the room</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="close"
            className="grid size-9 place-items-center rounded-xl text-muted transition hover:bg-white/8 hover:text-chalk"
          >
            <X className="size-4" strokeWidth={2.4} />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {things.map((thing) => (
            <SheetTile key={thing.label} disabled={!canEdit} onClick={thing.run} icon={thing.icon}>
              {thing.label}
            </SheetTile>
          ))}
        </div>

        <h2 className="mt-5 mb-3 text-sm font-semibold">games</h2>
        <div className="grid grid-cols-2 gap-2">
          {games.map((game) => (
            <SheetTile
              key={game.kind}
              disabled={!canEdit}
              onClick={() => onAdd("game", game.kind)}
              icon={game.icon}
            >
              {game.label}
            </SheetTile>
          ))}
        </div>

        <h2 className="mt-5 mb-3 text-sm font-semibold">view</h2>
        <div className="grid grid-cols-2 gap-2">
          <SheetTile onClick={onFit} icon={<Maximize2 className="size-5" strokeWidth={2} />}>
            fit everything
          </SheetTile>
        </div>
      </div>
    </div>
  );
}

function SheetTile({
  children,
  icon,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  icon: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex min-h-14 items-center gap-3 rounded-2xl bg-white/6 px-3.5 py-3 text-left text-sm font-medium ring-1 ring-white/10 transition active:bg-white/12 disabled:opacity-35"
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-glow/18 text-glow">
        {icon}
      </span>
      <span className="min-w-0 truncate">{children}</span>
    </button>
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
        // 44px on touch, tighter once there is a mouse to aim with.
        "grid size-11 place-items-center rounded-xl transition select-none disabled:opacity-35 disabled:hover:bg-transparent sm:size-9",
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
