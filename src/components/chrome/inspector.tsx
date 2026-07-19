"use client";

import clsx from "clsx";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Copy,
  Frame,
  Pencil,
  Trash2,
} from "lucide-react";
import { useRoom } from "@/realtime/room-provider";
import { useRoomStore } from "@/state/room-store";
import { NOTE_TINTS } from "@/lib/items";
import type { FrameStyle, Item } from "@/lib/types";

const TEXT_COLORS = ["#f4efe6", "#f6c177", "#f2a4b8", "#a6d189", "#8bc7e8", "#c4a7f0"];

/**
 * A floating strip of controls for whatever is selected. Kept off the canvas so
 * items themselves stay uncluttered.
 */
export default function Inspector() {
  const { canEdit, deleteItem, duplicateItem, updateData } = useRoom();
  const selectedId = useRoomStore((s) => s.selectedId);
  const item = useRoomStore((s) => (s.selectedId ? s.items[s.selectedId] : undefined));
  const editingId = useRoomStore((s) => s.editingId);
  const setEditing = useRoomStore((s) => s.setEditing);

  if (!item || !selectedId || !canEdit || editingId === selectedId) return null;

  return (
    <div className="pointer-events-none absolute inset-x-0 top-16 z-40 flex justify-center px-3">
      <div className="surface pointer-events-auto flex max-w-[calc(100vw-1.5rem)] items-center gap-1 overflow-x-auto rounded-2xl p-1.5">
        {item.kind === "note" && (
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

        {item.kind === "text" && <TextControls item={item as Item<"text">} />}

        {item.kind === "image" && <ImageControls item={item as Item<"image">} />}

        {(item.kind === "media" || item.kind === "embed" || item.kind === "game") && (
          <span className="px-2.5 text-[11px] text-muted">
            hold alt and drag to move, or use the handle above
          </span>
        )}

        <Divider />

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

function TextControls({ item }: { item: Item<"text"> }) {
  const { updateData } = useRoom();
  const setEditing = useRoomStore((s) => s.setEditing);
  const data = item.data;

  return (
    <>
      <Action label="edit" onClick={() => setEditing(item.id)}>
        <Pencil className="size-4" strokeWidth={2.2} />
      </Action>
      <Divider />

      <input
        type="range"
        min={14}
        max={110}
        value={data.size}
        onChange={(event) => void updateData(item.id, { ...data, size: Number(event.target.value) })}
        aria-label="text size"
        title="size"
        className="h-1 w-20 cursor-pointer appearance-none rounded-full bg-white/15 accent-glow"
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
      <span className="grid size-8 place-items-center text-muted">
        <Frame className="size-4" strokeWidth={2.2} />
      </span>

      {frames.map((frame) => (
        <button
          key={frame.id}
          type="button"
          onClick={() => void updateData(item.id, { ...data, frame: frame.id })}
          className={clsx(
            "rounded-xl px-2.5 py-1.5 text-[11px] font-medium transition",
            (data.frame ?? "shadow") === frame.id
              ? "bg-glow/22 text-glow"
              : "text-muted hover:bg-white/8 hover:text-chalk",
          )}
        >
          {frame.label}
        </button>
      ))}

      {(data.frame ?? "shadow") !== "polaroid" && (
        <>
          <Divider />
          <input
            type="range"
            min={0}
            max={90}
            value={data.radius ?? 10}
            onChange={(event) =>
              void updateData(item.id, { ...data, radius: Number(event.target.value) })
            }
            aria-label="corner rounding"
            title="rounding"
            className="h-1 w-16 cursor-pointer appearance-none rounded-full bg-white/15 accent-glow"
          />
        </>
      )}

      <Divider />

      <input
        value={data.alt ?? ""}
        onChange={(event) => void updateData(item.id, { ...data, alt: event.target.value })}
        onKeyDown={(event) => event.stopPropagation()}
        placeholder="caption"
        maxLength={90}
        className="w-28 rounded-xl bg-white/7 px-2.5 py-1.5 text-[11px] ring-1 ring-white/10 outline-none placeholder:text-muted/55 focus:ring-glow/45"
      />
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
    <div className="flex items-center gap-1 px-1">
      {values.map((value) => (
        <button
          key={value}
          type="button"
          onClick={() => onPick(value)}
          aria-label={`colour ${value}`}
          className={clsx(
            "size-5 rounded-full transition hover:scale-110",
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
