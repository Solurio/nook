"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import clsx from "clsx";
import {
  Bomb,
  BrickWall,
  BookOpen,
  Brush,
  Anchor,
  Landmark,
  Circle,
  CircleDot,
  CircleUser,
  Coins,
  Columns3,
  Crosshair,
  Crown,
  Disc3,
  Dices,
  Eraser,
  Gamepad2,
  Earth,
  Globe,
  GripVertical,
  Hexagon,
  Hand,
  Grid3x3,
  ImagePlus,
  Layers,
  Maximize2,
  MessageSquare,
  Minus,
  MonitorPlay,
  MonitorUp,
  MapPin,
  MousePointer2,
  Music4,
  Pencil,
  Plus,
  Quote,
  Radio,
  Smile,
  Spade,
  Star,
  Sparkles,
  Sticker,
  StickyNote,
  Swords,
  Type,
  VenetianMask,
  X,
} from "lucide-react";
import { useRoom } from "@/realtime/room-provider";
import { useRoomStore, viewportForItems } from "@/state/room-store";
import { draftItem, topZ } from "@/lib/items";
import EmojiPicker from "./emoji-picker";
import type { GameKind, ItemDataMap, ItemKind } from "@/lib/types";
import { emptyTable } from "@/lib/table";
import { radioMedia } from "@/lib/radio";
import BrushPopover from "./brush-popover";
import StickersPanel from "./stickers-panel";
import { t } from "@/lib/i18n";

type GameGroup = "table" | "secrets" | "boards";

const GROUP_TITLE: Record<GameGroup, string> = {
  table: "on the table",
  secrets: "hidden hands",
  boards: "boards",
};

/**
 * Every game in one list, so the dock and the phone sheet always offer the same
 * things in the same order rather than two lists drifting apart.
 */
const GAMES: Array<{
  /** A game, or -- for pieces and grids -- a kind of thing of its own. */
  kind: GameKind | "token" | "grid";
  group: GameGroup;
  title: string;
  hint: string;
  icon: React.ReactNode;
  /** A game laid out a particular way, rather than its blank default. */
  setup?: () => ItemDataMap["game"];
}> = [
  { kind: "dice", group: "table", title: "dice", hint: "2d6+3, 4d6kh3, any of it", icon: <Dices /> },
  { kind: "coin", group: "table", title: "coin", hint: "heads or tails, or your own", icon: <Coins /> },
  { kind: "wheel", group: "table", title: "wheel", hint: "weighted, spun for everyone", icon: <Disc3 /> },
  { kind: "cards", group: "table", title: "card table", hint: "any deck, any rules", icon: <Spade /> },
  {
    kind: "cards",
    group: "table",
    title: "tarot",
    hint: "all 78, reversals and all",
    icon: <Sparkles />,
    setup: () => ({ game: "cards", state: { ...emptyTable("tarot"), autoSet: true } }),
  },
  { kind: "token", group: "table", title: "piece", hint: "a mini, a marker, a counter", icon: <CircleUser /> },
  { kind: "grid", group: "table", title: "grid", hint: "squares or hexes, over a map", icon: <Hexagon /> },
  { kind: "doodle", group: "table", title: "paint studio", hint: "layers, brushes, selections, together", icon: <Pencil /> },
  { kind: "uno", group: "secrets", title: "uno", hint: "match the colour, empty your hand", icon: <Layers /> },
  { kind: "coup", group: "secrets", title: "coup", hint: "lie well, or lose a card", icon: <VenetianMask /> },
  { kind: "spyfall", group: "secrets", title: "spyfall", hint: "everyone knows where but one", icon: <MapPin /> },
  { kind: "resistance", group: "secrets", title: "the resistance", hint: "five missions, spies among you", icon: <Radio /> },
  { kind: "codenames", group: "secrets", title: "codenames", hint: "one word, two spymasters", icon: <MessageSquare /> },
  { kind: "cah", group: "secrets", title: "cards against humanity", hint: "ours, yours, or both", icon: <Quote /> },
  { kind: "bang", group: "secrets", title: "BANG!", hint: "the dice game: a sheriff, outlaws, arrows", icon: <Star /> },
  { kind: "buckshot", group: "secrets", title: "buckshot roulette", hint: "live or blank, and nobody knows", icon: <Crosshair /> },
  { kind: "dominoes", group: "secrets", title: "dominoes", hint: "double six, teams optional", icon: <GripVertical /> },
  { kind: "catan", group: "secrets", title: "catan", hint: "build, trade, and mind the robber", icon: <Hexagon /> },
  { kind: "quoridor", group: "boards", title: "quoridor (bloqueio)", hint: "cross first, wall everyone else in", icon: <BrickWall /> },
  { kind: "war", group: "boards", title: "WAR", hint: "42 territories, a secret objective", icon: <Earth /> },
  { kind: "chess", group: "boards", title: "chess", hint: "check, mate, castling", icon: <Crown /> },
  { kind: "reversi", group: "boards", title: "reversi", hint: "close a line, flip it over", icon: <CircleDot /> },
  { kind: "pool", group: "table", title: "pool", hint: "eight ball, nine ball, or a free table", icon: <Circle /> },
  { kind: "battleship", group: "boards", title: "battleship", hint: "two fleets, hidden, and the guns take turns", icon: <Anchor /> },
  { kind: "monopoly", group: "table", title: "monopoly", hint: "buy the streets, build, bleed them dry", icon: <Landmark /> },
  { kind: "checkers", group: "boards", title: "checkers", hint: "jump and crown", icon: <CircleDot /> },
  { kind: "bomb", group: "boards", title: "bomb party", hint: "a word with the letters, before it blows", icon: <Bomb /> },
  { kind: "rps", group: "boards", title: "rock paper scissors", hint: "sealed throws, shown together", icon: <Hand /> },
  { kind: "intransitive", group: "boards", title: "intransitive", hint: "rock paper scissors, at war", icon: <Swords /> },
  { kind: "connectfour", group: "boards", title: "connect four", hint: "four in a row", icon: <Columns3 /> },
  { kind: "tictactoe", group: "boards", title: "tic tac toe", hint: "quick and petty", icon: <Grid3x3 /> },
];

const GROUPS = (Object.keys(GROUP_TITLE) as GameGroup[]).map((group) => ({
  group,
  title: GROUP_TITLE[group],
  games: GAMES.filter((game) => game.group === group),
}));

export default function Dock() {
  const { createItem, canEdit, sendPing } = useRoom();
  const viewport = useRoomStore((s) => s.viewport);
  const zoomAt = useRoomStore((s) => s.zoomAt);
  const setViewport = useRoomStore((s) => s.setViewport);
  const tool = useRoomStore((s) => s.tool);
  const setTool = useRoomStore((s) => s.setTool);
  const panel = useRoomStore((s) => s.panel);
  const setPanel = useRoomStore((s) => s.setPanel);
  const reaction = useRoomStore((s) => s.reaction);
  const setReaction = useRoomStore((s) => s.setReaction);

  const [gamesOpen, setGamesOpen] = useState(false);
  const [reactionsOpen, setReactionsOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const dockRef = useRef<HTMLDivElement>(null);
  // The gif panel hangs off this button rather than off a corner of the screen.
  const stickerRef = useRef<HTMLButtonElement>(null);

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
    async (kind: ItemKind, game?: GameKind, data?: ItemDataMap["game"]) => {
      if (!canEdit) return;
      const z = topZ(Object.values(useRoomStore.getState().items));
      const at = centerOfView();
      // Scatter a little so repeated clicks do not stack perfectly.
      const jitter = { x: at.x + (Math.random() * 90 - 45), y: at.y + (Math.random() * 90 - 45) };
      await createItem(draftItem(kind, jitter, z, game ? { game, ...(data ? { data } : {}) } : {}));
      setGamesOpen(false);
      setSheetOpen(false);
    },
    [canEdit, centerOfView, createItem],
  );

  /** The OMORI radio: a player with the whole playlist queued, going round and round. */
  const addRadio = useCallback(async () => {
    if (!canEdit) return;
    const base = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
    const z = topZ(Object.values(useRoomStore.getState().items));
    const at = centerOfView();
    const me = useRoomStore.getState().me?.name ?? "someone";
    await createItem(draftItem("media", at, z, { data: radioMedia(base, me) }));
    setSheetOpen(false);
  }, [canEdit, centerOfView, createItem]);

  /** Pull the camera back until everything in the room is on screen. */
  const fitEverything = useCallback(() => {
    const items = Object.values(useRoomStore.getState().items);
    setViewport(viewportForItems(items, window.innerWidth, window.innerHeight));
    setSheetOpen(false);
  }, [setViewport]);

  /**
   * One goes off straight away so picking feels like doing something, and the
   * same emoji stays loaded so the next few can be put exactly where they
   * belong -- on the photo, on the note, on whoever said it.
   */
  const react = useCallback(
    (glyph: string) => {
      const at = centerOfView();
      sendPing(at.x, at.y, glyph);
      setReaction(glyph);
      setTool("select");
      setReactionsOpen(false);
    },
    [centerOfView, sendPing, setReaction, setTool],
  );

  return (
    <div
      ref={dockRef}
      className="pointer-events-none absolute inset-x-0 bottom-0 z-50 flex justify-center p-2 sm:p-3"
    >
      <div className="pointer-events-auto flex items-end gap-1.5 sm:gap-2">
        {/* Zoom. Hidden on a phone, where pinching does the same job and the
            room is better off with the width. */}
        <div className="surface hidden items-center gap-0.5 rounded-2xl p-1.5 sm:flex">
          <DockButton
            label={t("zoom out")}
            onClick={() => zoomAt(0.85, window.innerWidth / 2, window.innerHeight / 2)}
          >
            <Minus className="size-4" strokeWidth={2.4} />
          </DockButton>
          <button
            type="button"
            onClick={() => setViewport({ x: 0, y: 0, scale: 1 })}
            title={t("back to the middle")}
            className="min-w-11 rounded-xl px-1.5 py-1.5 text-[11px] font-medium tabular-nums text-muted transition hover:bg-white/8 hover:text-chalk"
          >
            {Math.round(viewport.scale * 100)}%
          </button>
          <DockButton
            label={t("zoom in")}
            onClick={() => zoomAt(1.18, window.innerWidth / 2, window.innerHeight / 2)}
          >
            <Plus className="size-4" strokeWidth={2.4} />
          </DockButton>
        </div>

        {/* Tools: point, draw, erase */}
        <div className="surface relative flex items-center gap-0.5 rounded-2xl p-1.5">
          <DockButton
            label={t("point and drag (V)")}
            active={tool === "select"}
            onClick={() => setTool("select")}
          >
            <MousePointer2 className="size-4.5" strokeWidth={2} />
          </DockButton>
          <DockButton
            label={t("draw on the room (B)")}
            disabled={!canEdit}
            active={tool === "draw"}
            onClick={() => setTool(tool === "draw" ? "select" : "draw")}
          >
            <Brush className="size-4.5" strokeWidth={2} />
          </DockButton>
          <DockButton
            label={t("erase (E)")}
            disabled={!canEdit}
            active={tool === "erase"}
            onClick={() => setTool(tool === "erase" ? "select" : "erase")}
          >
            <Eraser className="size-4.5" strokeWidth={2} />
          </DockButton>

          {(tool === "draw" || tool === "erase") && <BrushPopover />}
        </div>

        {/* Two on a phone: eight of these did not fit, and the ends of the row
            were sliding off both edges of the screen unreachable. Getting lost
            in a big room is the one thing you cannot pinch your way out of, so
            the way back sits here rather than three taps into a sheet. */}
        <div className="surface flex items-center gap-0.5 rounded-2xl p-1.5 sm:hidden">
          <DockButton label={t("fit everything")} onClick={fitEverything}>
            <Maximize2 className="size-5" strokeWidth={2.2} />
          </DockButton>
          <DockButton
            label={t("add something")}
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
          <DockButton label={t("pin a picture")} disabled={!canEdit} onClick={() => add("image")}>
            <ImagePlus className="size-4.5" strokeWidth={2} />
          </DockButton>
          <DockButton
            ref={stickerRef}
            label={t("gifs and stickers")}
            disabled={!canEdit}
            active={panel === "stickers"}
            onClick={() => setPanel(panel === "stickers" ? null : "stickers")}
          >
            <Sticker className="size-4.5" strokeWidth={2} />
          </DockButton>
          <DockButton label={t("lay a document on the table (PDF)")} disabled={!canEdit} onClick={() => add("pdf")}>
            <BookOpen className="size-4.5" strokeWidth={2} />
          </DockButton>
          <DockButton label={t("put the OMORI radio on (loops for everyone)")} disabled={!canEdit} onClick={() => void addRadio()}>
            <Disc3 className="size-4.5" strokeWidth={2} />
          </DockButton>
          <DockButton label={t("leave a note")} disabled={!canEdit} onClick={() => add("note")}>
            <StickyNote className="size-4.5" strokeWidth={2} />
          </DockButton>
          <DockButton label={t("big text")} disabled={!canEdit} onClick={() => add("text")}>
            <Type className="size-4.5" strokeWidth={2} />
          </DockButton>
          <DockButton label={t("music or video")} disabled={!canEdit} onClick={() => add("media")}>
            <Music4 className="size-4.5" strokeWidth={2} />
          </DockButton>
          <DockButton label={t("a window to somewhere")} disabled={!canEdit} onClick={() => add("embed")}>
            <Globe className="size-4.5" strokeWidth={2} />
          </DockButton>
          <DockButton
            label={t("transmit a tab (live, one shares)")}
            disabled={!canEdit}
            onClick={() => add("screencast")}
          >
            <MonitorUp className="size-4.5" strokeWidth={2} />
          </DockButton>
          <DockButton
            label={t("shared browser (hyperbeam, both control)")}
            disabled={!canEdit}
            onClick={() => add("cobrowse")}
          >
            <MonitorPlay className="size-4.5" strokeWidth={2} />
          </DockButton>

          <DockButton
            label={t("games")}
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
            <div className="surface-raised animate-drift-in absolute right-1.5 bottom-full mb-2 max-h-[min(34rem,calc(100dvh-7rem))] w-[26rem] max-w-[90vw] overflow-y-auto overscroll-contain rounded-2xl p-2 shadow-2xl">
              {GROUPS.map(({ group, title, games }) => (
                <div key={group} className="mb-1 last:mb-0">
                  <p className="px-2.5 pt-1 pb-0.5 text-[10px] tracking-wide text-muted/60 uppercase">{title}</p>
                  <div className="grid grid-cols-2 gap-1">
                    {games.map((game) => (
                      <GameOption
                        key={game.title}
                        icon={game.icon}
                        title={t(game.title)}
                        hint={t(game.hint)}
                        onClick={() =>
                          game.kind === "token" || game.kind === "grid"
                            ? add(game.kind)
                            : add("game", game.kind, game.setup?.())
                        }
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Reactions */}
        <div className="surface relative flex items-center rounded-2xl p-1.5">
          <DockButton
            label={reaction ? t(`${reaction} loaded -- tap the room, or tap here to put it down`) : t("react")}
            active={reactionsOpen || Boolean(reaction)}
            onClick={() => {
              // While one is loaded the button unloads it; that is what you
              // want from it at that moment, not the picker again.
              if (reaction) {
                setReaction(null);
                setReactionsOpen(false);
                return;
              }
              setReactionsOpen((v) => !v);
              setGamesOpen(false);
            }}
          >
            {reaction ? (
              <span className="text-lg leading-none">{reaction}</span>
            ) : (
              <Smile className="size-4.5" strokeWidth={2} />
            )}
          </DockButton>

          {reactionsOpen && (
            <EmojiPicker onPick={react} onClose={() => setReactionsOpen(false)} />
          )}
        </div>
      </div>

      {panel === "stickers" && <StickersPanel anchor={stickerRef} />}

      {sheetOpen && (
        <AddSheet
          canEdit={canEdit}
          onClose={() => setSheetOpen(false)}
          onAdd={add}
          onFit={fitEverything}
          onRadio={() => void addRadio()}
          onStickers={() => {
            setPanel("stickers");
            setSheetOpen(false);
          }}
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
  onStickers,
  onRadio,
}: {
  canEdit: boolean;
  onClose: () => void;
  onAdd: (kind: ItemKind, game?: GameKind, data?: ItemDataMap["game"]) => void;
  onFit: () => void;
  onStickers: () => void;
  onRadio: () => void;
}) {
  const things: Array<{ icon: React.ReactNode; label: string; run: () => void }> = [
    { icon: <ImagePlus className="size-5" strokeWidth={2} />, label: "picture", run: () => onAdd("image") },
    { icon: <Sticker className="size-5" strokeWidth={2} />, label: "gifs and stickers", run: onStickers },
    { icon: <Disc3 className="size-5" strokeWidth={2} />, label: "OMORI radio", run: onRadio },
    { icon: <StickyNote className="size-5" strokeWidth={2} />, label: "note", run: () => onAdd("note") },
    { icon: <BookOpen className="size-5" strokeWidth={2} />, label: "document (PDF)", run: () => onAdd("pdf") },
    { icon: <Type className="size-5" strokeWidth={2} />, label: "big text", run: () => onAdd("text") },
    { icon: <Music4 className="size-5" strokeWidth={2} />, label: "music or video", run: () => onAdd("media") },
    { icon: <Globe className="size-5" strokeWidth={2} />, label: "window", run: () => onAdd("embed") },
    { icon: <MonitorUp className="size-5" strokeWidth={2} />, label: "share a tab", run: () => onAdd("screencast") },
    { icon: <MonitorPlay className="size-5" strokeWidth={2} />, label: "shared browser", run: () => onAdd("cobrowse") },
  ];


  return (
    <div className="pointer-events-auto fixed inset-0 z-60 flex flex-col justify-end sm:hidden">
      <button
        type="button"
        aria-label={t("close")}
        onClick={onClose}
        className="absolute inset-0 bg-ink-950/55"
      />

      <div className="surface-raised animate-drift-in relative max-h-[78dvh] overflow-y-auto rounded-t-3xl px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/20" />

        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">{t("add to the room")}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("close")}
            className="grid size-9 place-items-center rounded-xl text-muted transition hover:bg-white/8 hover:text-chalk"
          >
            <X className="size-4" strokeWidth={2.4} />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {things.map((thing) => (
            <SheetTile key={thing.label} disabled={!canEdit} onClick={thing.run} icon={thing.icon}>
              {t(thing.label)}
            </SheetTile>
          ))}
        </div>

        {GROUPS.map(({ group, title, games }) => (
          <div key={group}>
            <h2 className="mt-5 mb-3 text-sm font-semibold">{title}</h2>
            <div className="grid grid-cols-2 gap-2">
              {games.map((game) => (
                <SheetTile
                  key={game.title}
                  disabled={!canEdit}
                  onClick={() =>
                    game.kind === "token" || game.kind === "grid"
                      ? onAdd(game.kind)
                      : onAdd("game", game.kind, game.setup?.())
                  }
                  icon={game.icon}
                  hint={t(game.hint)}
                >
                  {t(game.title)}
                </SheetTile>
              ))}
            </div>
          </div>
        ))}

        <h2 className="mt-5 mb-3 text-sm font-semibold">{t("view")}</h2>
        <div className="grid grid-cols-2 gap-2">
          <SheetTile onClick={onFit} icon={<Maximize2 className="size-5" strokeWidth={2} />}>{t("fit everything")}</SheetTile>
        </div>
      </div>
    </div>
  );
}

function SheetTile({
  children,
  icon,
  hint,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  icon: React.ReactNode;
  hint?: string;
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
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-glow/18 text-glow [&_svg]:size-5">
        {icon}
      </span>
      {/* Two lines rather than an ellipsis. Half these labels did not fit
          across a phone, and "shared brow..." tells nobody anything. */}
      <span className="min-w-0">
        <span className="block leading-tight text-balance">{children}</span>
        {hint && (
          <span className="mt-0.5 block text-[11px] leading-tight font-normal text-balance text-muted/70">
            {t(hint)}
          </span>
        )}
      </span>
    </button>
  );
}

function DockButton({
  children,
  label,
  onClick,
  disabled,
  active,
  ref,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  ref?: React.Ref<HTMLButtonElement>;
}) {
  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={clsx(
        // 44px on touch, tighter once there is a mouse to aim with -- and 40px
        // on the narrowest phones, where 44 pushed both ends of the dock off
        // the screen.
        "grid size-10 place-items-center rounded-xl transition select-none disabled:opacity-35 disabled:hover:bg-transparent min-[360px]:size-11 sm:size-9",
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
      className="flex min-h-12 w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition hover:bg-white/9"
    >
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-glow/18 text-glow [&_svg]:size-4">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-xs font-medium">{title}</span>
        <span className="block truncate text-[11px] text-muted/70">{t(hint)}</span>
      </span>
    </button>
  );
}
