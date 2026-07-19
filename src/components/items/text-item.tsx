"use client";

import { useEffect, useRef, useState } from "react";
import { useRoom } from "@/realtime/room-provider";
import { useRoomStore } from "@/state/room-store";
import { useDebouncedSave } from "@/lib/use-debounced-save";
import type { Item } from "@/lib/types";

function typeStyle(data: Item<"text">["data"]): React.CSSProperties {
  return {
    fontSize: data.size,
    color: data.color,
    fontWeight: data.weight,
    textAlign: data.align,
    lineHeight: 1.15,
    letterSpacing: "-0.01em",
    textShadow: "0 2px 18px rgb(0 0 0 / 0.35)",
  };
}

export default function TextItem({ item, editing }: { item: Item<"text">; editing: boolean }) {
  const { canEdit } = useRoom();

  if (editing) return <TextEditor item={item} />;

  return (
    <p style={typeStyle(item.data)} className="size-full overflow-hidden p-1 break-words whitespace-pre-wrap">
      {item.data.body || <span className="opacity-40">{canEdit ? "double-click to edit" : ""}</span>}
    </p>
  );
}

function TextEditor({ item }: { item: Item<"text"> }) {
  const { updateData } = useRoom();
  const setEditing = useRoomStore((s) => s.setEditing);
  const [draft, setDraft] = useState(item.data.body);
  const textarea = useRef<HTMLTextAreaElement>(null);

  const saver = useDebouncedSave<string>((body) => updateData(item.id, { ...item.data, body }));

  useEffect(() => {
    const node = textarea.current;
    if (!node) return;
    node.focus();
    node.select();
  }, []);

  return (
    <textarea
      ref={textarea}
      value={draft}
      onChange={(event) => {
        setDraft(event.target.value);
        saver.queue(event.target.value);
      }}
      onBlur={() => {
        saver.flush();
        setEditing(null);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") event.currentTarget.blur();
        event.stopPropagation();
      }}
      spellCheck={false}
      style={typeStyle(item.data)}
      className="size-full resize-none rounded-lg bg-ink-950/25 p-1 outline-none ring-2 ring-glow/50"
    />
  );
}
