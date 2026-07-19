"use client";

import { useEffect, useRef, useState } from "react";
import { SendHorizontal, X } from "lucide-react";
import { useRoom } from "@/realtime/room-provider";
import { useRoomStore } from "@/state/room-store";

export default function ChatPanel() {
  const { sendMessage, canEdit } = useRoom();
  const messages = useRoomStore((s) => s.messages);
  const me = useRoomStore((s) => s.me);
  const setPanel = useRoomStore((s) => s.setPanel);

  const [draft, setDraft] = useState("");
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = scroller.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages.length]);

  return (
    <aside className="surface animate-drift-in absolute top-16 right-3 bottom-20 z-40 flex w-[19rem] flex-col overflow-hidden rounded-3xl">
      <header className="flex items-center justify-between border-b border-white/8 px-4 py-3">
        <h2 className="text-sm font-semibold">chat</h2>
        <button
          type="button"
          onClick={() => setPanel(null)}
          aria-label="close chat"
          className="grid size-6 place-items-center rounded-lg text-muted transition hover:bg-white/8 hover:text-chalk"
        >
          <X className="size-3.5" strokeWidth={2.4} />
        </button>
      </header>

      <div ref={scroller} className="flex-1 space-y-2.5 overflow-y-auto px-4 py-3.5">
        {messages.length === 0 && (
          <p className="pt-6 text-center text-xs leading-relaxed text-muted/60">
            nothing said yet.
            <br />
            say something first.
          </p>
        )}

        {messages.map((message, index) => {
          const previous = messages[index - 1];
          const grouped =
            previous &&
            previous.author_id === message.author_id &&
            new Date(message.created_at).getTime() -
              new Date(previous.created_at).getTime() <
              4 * 60 * 1000;

          return (
            <div key={message.id} className={grouped ? "pl-0.5" : ""}>
              {!grouped && (
                <div className="mb-0.5 flex items-baseline gap-1.5">
                  <span
                    className="text-[11px] font-semibold"
                    style={{ color: message.author_tint }}
                  >
                    {message.author_id === me?.userId ? "you" : message.author_name}
                  </span>
                  <span className="text-[10px] text-muted/45">
                    {new Date(message.created_at).toLocaleTimeString([], {
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
              )}
              <p className="text-sm leading-snug wrap-anywhere text-chalk/90">{message.body}</p>
            </div>
          );
        })}
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          const body = draft.trim();
          if (!body) return;
          setDraft("");
          void sendMessage(body);
        }}
        className="flex items-center gap-1.5 border-t border-white/8 p-2.5"
      >
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => event.stopPropagation()}
          disabled={!canEdit}
          placeholder={canEdit ? "say something" : "the room is locked"}
          maxLength={2000}
          className="min-w-0 flex-1 rounded-xl bg-white/7 px-3 py-2 text-sm ring-1 ring-white/10 outline-none placeholder:text-muted/55 focus:ring-glow/45 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!canEdit || !draft.trim()}
          aria-label="send"
          className="grid size-9 shrink-0 place-items-center rounded-xl bg-chalk text-ink-950 transition hover:bg-white disabled:opacity-35"
        >
          <SendHorizontal className="size-4" strokeWidth={2.4} />
        </button>
      </form>
    </aside>
  );
}
