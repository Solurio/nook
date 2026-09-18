"use client";

import clsx from "clsx";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  BringToFront,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Frame,
  Maximize2,
  Pencil,
  Pin,
  SendToBack,
  Trash2,
} from "lucide-react";
import { useRoom } from "@/realtime/room-provider";
import { useRoomStore } from "@/state/room-store";
import { NOTE_TINTS } from "@/lib/items";
import type { AnyItem, FrameStyle, Item, TextEffect } from "@/lib/types";

const TEXT_COLORS = ["#f4efe6", "#f6c177", "#f2a4b8", "#a6d189", "#8bc7e8", "#c4a7f0"];

const TEXT_EFFECTS: Array<{ id: TextEffect; label: string }> = [
  { id: "none", label: "plain" },
  { id: "rainbow", label: "rainbow" },
  { id: "shake", label: "shake" },
  { id: "wave", label: "wave" },
  { id: "glow", label: "glow" },
  { id: "pulse", label: "pulse" },
];

/** What the bar calls whatever is selected. */
const KIND_NAME: Record<AnyItem["kind"], string> = {
  image: "picture",
  note: "note",
  text: "text",
  media: "player",
  embed: "window",
  game: "game",
  cobrowse: "shared browser",
  screencast: "shared tab",
  pdf: "document",
};

/**
 * Controls for whatever is selected, in two shapes.
 *
 * With a mouse it is a thin strip above the item: small targets are fine when
 * you are aiming with a pointer, and it keeps out of the room.
 *
 * On a phone that strip was seven unlabelled icons across the top of the
 * screen -- the far end from the thumb, with nothing saying what any of them
 * did, and sharing that spot with the tool and reaction chips so they drew
 * over each other. The phone gets a bar along the bottom instead, with words
 * on the buttons and room to hit them.
 */
export default function Inspector() {
  const { canEdit } = useRoom();
  const selectedId = useRoomStore((s) => s.selectedId);
  const item = useRoomStore((s) => (s.selectedId ? s.items[s.selectedId] : undefined));
  const editingId = useRoomStore((s) => s.editingId);
  const focusedId = useRoomStore((s) => s.focusedId);

  if (!item || !selectedId || editingId === selectedId) return null;
  // The item is already filling the screen; it does not need a bar about it.
  if (focusedId) return null;

  // A locked room still lets you open something to look at it properly. That
  // is reading, not editing, and on a phone it is the only way to read a board
  // at all -- so the bar appears with the one thing you are allowed to do.
  return (
    <>
      <DeskStrip item={item} readOnly={!canEdit} />
      <ThumbBar item={item} readOnly={!canEdit} />
    </>
  );
}

// ---------------------------------------------------------------------------
// With a mouse
// ---------------------------------------------------------------------------

function DeskStrip({ item, readOnly }: { item: AnyItem; readOnly: boolean }) {
  const { deleteItem, duplicateItem, restack, updateData } = useRoom();
  const setEditing = useRoomStore((s) => s.setEditing);
  const focus = useRoomStore((s) => s.focus);
  const pinned = Boolean(item.data.pinned);

  if (readOnly) {
    return (
      <div className="pointer-events-none absolute inset-x-0 top-16 z-40 hidden justify-center px-3 sm:flex">
        <div className="surface pointer-events-auto flex items-center gap-1 rounded-2xl p-1.5">
          <Action label="open it full screen" onClick={() => focus(item.id)}>
            <Maximize2 className="size-4" strokeWidth={2.2} />
          </Action>
          <span className="pr-1.5 text-[11px] text-muted">the room is locked</span>
        </div>
      </div>
    );
  }

  return (
    <div className="pointer-events-none absolute inset-x-0 top-16 z-40 hidden justify-center px-3 sm:flex">
      <div className="surface pointer-events-auto flex max-w-[calc(100vw-1.5rem)] items-center gap-1 overflow-x-auto rounded-2xl p-1.5">
        {!pinned && item.kind === "note" && (
          <>
            <Swatches
              values={NOTE_TINTS as unknown as string[]}
              active={(item as Item<"note">).data.tint}
              onPick={(tint) => void updateData(item.id, { ...(item as Item<"note">).data, tint })}
            />
            <Divider />
            <Action label="write" onClick={() => setEditing(item.id)}>
              <Pencil className="size-4" strokeWidth={2.2} />
            </Action>
          </>
        )}

        {!pinned && item.kind === "text" && (
          <>
            <Action label="edit" onClick={() => setEditing(item.id)}>
              <Pencil className="size-4" strokeWidth={2.2} />
            </Action>
            <Divider />
            <TextControls item={item as Item<"text">} />
          </>
        )}

        {!pinned && item.kind === "image" && <ImageControls item={item as Item<"image">} />}

        {pinned && <span className="px-2.5 text-[11px] text-warm">stuck to the wall</span>}

        <Divider />

        <Action label="open it full screen" onClick={() => focus(item.id)}>
          <Maximize2 className="size-4" strokeWidth={2.2} />
        </Action>

        <Divider />

        {/* Far to near. The outer two clear the whole pile; the inner two step
            past a single neighbour, which is what you want when something is
            hiding behind one particular photo. */}
        <Action label="send to the back" onClick={() => void restack(item.id, "back")}>
          <SendToBack className="size-4" strokeWidth={2.2} />
        </Action>
        <Action label="one step back" onClick={() => void restack(item.id, "backward")}>
          <ChevronDown className="size-4" strokeWidth={2.2} />
        </Action>
        <Action label="one step forward" onClick={() => void restack(item.id, "forward")}>
          <ChevronUp className="size-4" strokeWidth={2.2} />
        </Action>
        <Action label="bring to the front" onClick={() => void restack(item.id, "front")}>
          <BringToFront className="size-4" strokeWidth={2.2} />
        </Action>

        <Divider />

        <Action
          label={pinned ? "unpin" : "pin where it is"}
          active={pinned}
          onClick={() => void updateData(item.id, { ...item.data, pinned: !pinned })}
        >
          <Pin className="size-4" strokeWidth={2.2} />
        </Action>

        <Action label="duplicate" onClick={() => void duplicateItem(item.id)}>
          <Copy className="size-4" strokeWidth={2.2} />
        </Action>
        <Action label="remove" danger onClick={() => void deleteItem(item.id)}>
          <Trash2 className="size-4" strokeWidth={2.2} />
        </Action>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// With a thumb
// ---------------------------------------------------------------------------

function ThumbBar({ item, readOnly }: { item: AnyItem; readOnly: boolean }) {
  const { deleteItem, duplicateItem, restack, updateData } = useRoom();
  const select = useRoomStore((s) => s.select);
  const setEditing = useRoomStore((s) => s.setEditing);
  const focus = useRoomStore((s) => s.focus);
  const pinned = Boolean(item.data.pinned);

  const hasOptions = item.kind === "note" || item.kind === "text" || item.kind === "image";

  return (
    <div className="animate-drift-in pointer-events-none absolute inset-x-0 bottom-[5.25rem] z-40 px-2 sm:hidden">
      <div className="surface pointer-events-auto rounded-2xl px-2 py-2">
        <div className="mb-1.5 flex items-center gap-2 px-1">
          <span className="min-w-0 truncate text-[11px] font-medium text-muted">
            {KIND_NAME[item.kind]}
            {readOnly && <span className="text-warm"> · the room is locked</span>}
            {!readOnly && pinned && <span className="text-warm"> · stuck to the wall</span>}
          </span>
          <button
            type="button"
            onClick={() => select(null)}
            className="ml-auto flex min-h-8 shrink-0 items-center gap-1 rounded-lg px-2 text-[11px] font-medium text-muted transition active:bg-white/10"
          >
            <Check className="size-3.5" strokeWidth={2.4} />
            done
          </button>
        </div>

        <div className="flex items-stretch gap-1.5">
          <button
            type="button"
            onClick={() => focus(item.id)}
            className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-glow/20 px-3 text-[13px] font-semibold text-glow transition active:bg-glow/30"
          >
            <Maximize2 className="size-4" strokeWidth={2.4} />
            open
          </button>

          {!readOnly && !pinned && (item.kind === "note" || item.kind === "text") && (
            <ThumbAction label="write" onClick={() => setEditing(item.id)}>
              <Pencil className="size-4.5" strokeWidth={2.2} />
            </ThumbAction>
          )}

          {!readOnly && (
            <>
              <ThumbAction
                label={pinned ? "unpin" : "pin"}
                active={pinned}
                onClick={() => void updateData(item.id, { ...item.data, pinned: !pinned })}
              >
                <Pin className="size-4.5" strokeWidth={2.2} />
              </ThumbAction>

              <ThumbAction label="copy" onClick={() => void duplicateItem(item.id)}>
                <Copy className="size-4.5" strokeWidth={2.2} />
              </ThumbAction>

              <ThumbAction label="delete" danger onClick={() => void deleteItem(item.id)}>
                <Trash2 className="size-4.5" strokeWidth={2.2} />
              </ThumbAction>
            </>
          )}
        </div>

        {/* Stacking, and whatever this kind of thing can have changed about it,
            on a row that scrolls rather than one that squeezes. */}
        {!readOnly && (
          <div className="-mx-1 mt-1.5 flex items-center gap-1 overflow-x-auto px-1 pb-0.5">
            <span className="shrink-0 pr-0.5 text-[10px] text-muted/55">layer</span>
            <ThumbAction small label="to back" onClick={() => void restack(item.id, "back")}>
              <SendToBack className="size-4" strokeWidth={2.2} />
            </ThumbAction>
            <ThumbAction small label="back" onClick={() => void restack(item.id, "backward")}>
              <ChevronDown className="size-4" strokeWidth={2.2} />
            </ThumbAction>
            <ThumbAction small label="forward" onClick={() => void restack(item.id, "forward")}>
              <ChevronUp className="size-4" strokeWidth={2.2} />
            </ThumbAction>
            <ThumbAction small label="to front" onClick={() => void restack(item.id, "front")}>
              <BringToFront className="size-4" strokeWidth={2.2} />
            </ThumbAction>

            {!pinned && hasOptions && (
              <>
                <span className="mx-0.5 h-6 w-px shrink-0 bg-white/10" />
                {item.kind === "note" && (
                  <Swatches
                    values={NOTE_TINTS as unknown as string[]}
                    active={(item as Item<"note">).data.tint}
                    onPick={(tint) =>
                      void updateData(item.id, { ...(item as Item<"note">).data, tint })
                    }
                  />
                )}
                {item.kind === "text" && <TextControls item={item as Item<"text">} />}
                {item.kind === "image" && <ImageControls item={item as Item<"image">} />}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ThumbAction({
  children,
  label,
  onClick,
  active,
  danger,
  small,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
  danger?: boolean;
  small?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={clsx(
        "flex shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl transition",
        small ? "min-h-9 px-2 py-1" : "min-h-11 px-2.5",
        active && "bg-glow/22 text-glow",
        !active && danger && "text-muted active:bg-red-500/20 active:text-red-300",
        !active && !danger && "text-muted active:bg-white/10 active:text-chalk",
      )}
    >
      {children}
      <span className="text-[9px] leading-none font-medium">{label}</span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Shared pieces
// ---------------------------------------------------------------------------

function TextControls({ item }: { item: Item<"text"> }) {
  const { updateData } = useRoom();
  const data = item.data;

  return (
    <>
      <input
        type="range"
        min={14}
        max={110}
        value={data.size}
        onChange={(event) =>
          void updateData(item.id, { ...data, size: Number(event.target.value) })
        }
        aria-label="text size"
        title="size"
        className="h-1 w-20 shrink-0 cursor-pointer appearance-none rounded-full bg-white/15 accent-glow"
      />

      <Divider />

      {(["left", "center", "right"] as const).map((align) => (
        <Action
          key={align}
          label={align}
          active={data.align === align}
          onClick={() => void updateData(item.id, { ...data, align })}
        >
          {align === "left" && <AlignLeft className="size-4" strokeWidth={2.2} />}
          {align === "center" && <AlignCenter className="size-4" strokeWidth={2.2} />}
          {align === "right" && <AlignRight className="size-4" strokeWidth={2.2} />}
        </Action>
      ))}

      <Divider />

      <Swatches
        values={TEXT_COLORS}
        active={data.color}
        onPick={(color) => void updateData(item.id, { ...data, color })}
      />

      <Divider />

      <select
        value={data.effect ?? "none"}
        onChange={(event) =>
          void updateData(item.id, { ...data, effect: event.target.value as TextEffect })
        }
        aria-label="text effect"
        title="effect"
        className="h-8 shrink-0 cursor-pointer rounded-xl bg-white/7 px-2 text-[11px] text-muted ring-1 ring-white/10 outline-none focus:ring-glow/45"
      >
        {TEXT_EFFECTS.map((effect) => (
          <option key={effect.id} value={effect.id} className="bg-ink-900 text-chalk">
            {effect.label}
          </option>
        ))}
      </select>
    </>
  );
}

function ImageControls({ item }: { item: Item<"image"> }) {
  const { updateData } = useRoom();
  const data = item.data;
  const frames: Array<{ id: FrameStyle; label: string }> = [
    { id: "none", label: "plain" },
    { id: "shadow", label: "lifted" },
    { id: "polaroid", label: "polaroid" },
    { id: "sticker", label: "sticker" },
  ];

  return (
    <>
      <span className="grid size-8 shrink-0 place-items-center text-muted">
        <Frame className="size-4" strokeWidth={2.2} />
      </span>

      {frames.map((frame) => (
        <button
          key={frame.id}
          type="button"
          onClick={() => void updateData(item.id, { ...data, frame: frame.id })}
          className={clsx(
            "shrink-0 rounded-xl px-2.5 py-1.5 text-[11px] font-medium transition",
            (data.frame ?? "shadow") === frame.id
              ? "bg-glow/22 text-glow"
              : "text-muted hover:bg-white/8 hover:text-chalk",
          )}
        >
          {frame.label}
        </button>
      ))}
    </>
  );
}

function Swatches({
  values,
  active,
  onPick,
}: {
  values: string[];
  active: string;
  onPick: (value: string) => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-1 px-1">
      {values.map((value) => (
        <button
          key={value}
          type="button"
          onClick={() => onPick(value)}
          aria-label={`colour ${value}`}
          className={clsx(
            "size-6 shrink-0 rounded-full transition hover:scale-110 sm:size-5",
            active === value && "ring-2 ring-chalk ring-offset-2 ring-offset-ink-800",
          )}
          style={{ background: value }}
        />
      ))}
    </div>
  );
}

function Divider() {
  return <span className="mx-0.5 h-5 w-px shrink-0 bg-white/10" />;
}

function Action({
  children,
  label,
  onClick,
  active,
  danger,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={clsx(
        "grid size-8 shrink-0 place-items-center rounded-xl transition",
        active && "bg-glow/22 text-glow",
        !active && danger && "text-muted hover:bg-red-500/15 hover:text-red-300",
        !active && !danger && "text-muted hover:bg-white/8 hover:text-chalk",
      )}
    >
      {children}
    </button>
  );
}
