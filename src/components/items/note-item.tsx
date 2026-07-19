"use client";

import { useEffect, useRef, useState } from "react";
import { useRoom } from "@/realtime/room-provider";
import { useRoomStore } from "@/state/room-store";
import { useDebouncedSave } from "@/lib/use-debounced-save";
import type { Item } from "@/lib/types";

export default function NoteItem({ item, editing }: { item: Item<"note">; editing: boolean }) {
  const { canEdit } = useRoom();

  return (
    <div
      className="size-full overflow-hidden rounded-[3px] p-4 shadow-[0_16px_38px_-16px_rgb(0_0_0/0.7)]"
      style={{
        background: `linear-gradient(170deg, ${item.data.tint}, color-mix(in oklab, ${item.data.tint} 84%, #000))`,
      }}
    >
      {editing ? (
        // Mounting the editor fresh means its draft starts from whatever the
        // note says right now, with no state to keep in sync afterwards.
        <NoteEditor item={item} />
      ) : (
        <p className="size-full overflow-hidden font-[family-name:var(--font-hand)] text-2xl leading-snug whitespace-pre-wrap text-ink-950">
          {item.data.body || (
            <span className="text-ink-950/35">{canEdit ? "double-click to write" : "empty"}</span>
          )}
        </p>
      )}
    </div>
  );
}

function NoteEditor({ item }: { item: Item<"note"> }) {
  const { updateData } = useRoom();
  const setEditing = useRoomStore((s) => s.setEditing);
  const [draft, setDraft] = useState(item.data.body);
  const textarea = useRef<HTMLTextAreaElement>(null);

  const saver = useDebouncedSave<string>((body) => updateData(item.id, { ...item.data, body }));

  useEffect(() => {
    const node = textarea.current;
    if (!node) return;
    node.focus();
    node.setSelectionRange(node.value.length, node.value.length);
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
      placeholder="write something"
      className="size-full resize-none bg-transparent font-[family-name:var(--font-hand)] text-2xl leading-snug text-ink-950 outline-none placeholder:text-ink-950/35"
    />
  );
}
