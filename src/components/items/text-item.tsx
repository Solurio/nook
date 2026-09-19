"use client";

import { fontStack } from "@/lib/fonts";
import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { useRoom } from "@/realtime/room-provider";
import { useRoomStore } from "@/state/room-store";
import { useDebouncedSave } from "@/lib/use-debounced-save";
import type { Item, TextEffect } from "@/lib/types";

function typeStyle(data: Item<"text">["data"]): React.CSSProperties {
  return {
    fontSize: data.size,
    fontFamily: fontStack(data.font),
    color: data.color,
    fontWeight: data.weight,
    textAlign: data.align,
    lineHeight: 1.15,
    letterSpacing: "-0.01em",
    textShadow: "0 2px 18px rgb(0 0 0 / 0.35)",
  };
}

/** The class that drives each effect; "wave" is handled per character below. */
const EFFECT_CLASS: Record<Exclude<TextEffect, "none" | "wave">, string> = {
  rainbow: "fx-rainbow",
  shake: "fx-shake",
  glow: "fx-glow",
  pulse: "fx-pulse",
};

export default function TextItem({ item, editing }: { item: Item<"text">; editing: boolean }) {
  const { canEdit } = useRoom();

  if (editing) return <TextEditor item={item} />;

  const effect = item.data.effect ?? "none";
  const body = item.data.body;

  return (
    <p
      style={typeStyle(item.data)}
      className={clsx(
        "size-full overflow-hidden p-1 break-words whitespace-pre-wrap",
        effect === "wave" && "fx-wave",
        effect !== "none" && effect !== "wave" && EFFECT_CLASS[effect],
      )}
    >
      {body ? (
        effect === "wave" ? (
          <Rippled text={body} />
        ) : (
          body
        )
      ) : (
        <span className="opacity-40">{canEdit ? "double-click to edit" : ""}</span>
      )}
    </p>
  );
}

/**
 * Splits the text so each character can lag behind the one before it. Spaces are
 * kept inside their own span (white-space: pre) so words do not collapse.
 */
function Rippled({ text }: { text: string }) {
  return (
    <>
      {Array.from(text).map((char, i) => (
        <span key={i} style={{ animationDelay: `${(i % 24) * 55}ms` }}>
          {char}
        </span>
      ))}
    </>
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
