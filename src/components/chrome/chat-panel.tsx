"use client";

import { useEffect, useRef, useState } from "react";
import { Eye, EyeOff, SendHorizontal, X } from "lucide-react";
import { useRoom } from "@/realtime/room-provider";
import { useRoomStore } from "@/state/room-store";
import { t } from "@/lib/i18n";

const LIVE_KEY = "nook.chat.live";

/** Whether the others see your words as you type them, or only that you are typing. Yours to choose, kept on this device. */
function readLive(): boolean {
  try {
    return window.localStorage.getItem(LIVE_KEY) !== "off";
  } catch {
    return true;
  }
}

export default function ChatPanel() {
  const { sendMessage, canEdit, broadcastTyping } = useRoom();
  const messages = useRoomStore((s) => s.messages);
  const me = useRoomStore((s) => s.me);
  const setPanel = useRoomStore((s) => s.setPanel);
  const typing = useRoomStore((s) => s.typing);

  const [draft, setDraft] = useState("");
  const [live, setLive] = useState(readLive);
  const scroller = useRef<HTMLDivElement>(null);

  const drafts = Object.entries(typing).filter(([id]) => id !== me?.userId);
  const drafting = drafts.map(([id, d]) => `${id}:${d.text.length}`).join(",");

  useEffect(() => {
    const node = scroller.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages.length, drafting]);

  // Closing the chat takes your draft down for everyone else.
  useEffect(() => () => broadcastTyping(null), [broadcastTyping]);

  const toggleLive = () => {
    const next = !live;
    setLive(next);
    try {
      window.localStorage.setItem(LIVE_KEY, next ? "on" : "off");
    } catch {
      // Just for this visit, then.
    }
    if (draft.trim()) broadcastTyping(draft, !next);
  };

  return (
    <aside className="surface animate-drift-in absolute inset-x-2 bottom-20 z-40 flex max-h-[68dvh] flex-col overflow-hidden rounded-3xl sm:inset-x-auto sm:top-16 sm:right-3 sm:max-h-none sm:w-[19rem]">
      <header className="flex items-center justify-between border-b border-white/8 px-4 py-3">
        <h2 className="text-sm font-semibold">{t("chat")}</h2>
        <button
          type="button"
          onClick={toggleLive}
          aria-pressed={live}
          title={live ? t("the others see what you type, as you type it") : t("the others only see that you are typing")}
          className="ml-auto mr-1 flex h-6 items-center gap-1 rounded-lg px-1.5 text-[10px] text-muted transition hover:bg-white/8 hover:text-chalk"
        >
          {live ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
          {live ? t("live typing") : t("typing hidden")}
        </button>
        <button
          type="button"
          onClick={() => setPanel(null)}
          aria-label={t("close chat")}
          className="grid size-6 place-items-center rounded-lg text-muted transition hover:bg-white/8 hover:text-chalk"
        >
          <X className="size-3.5" strokeWidth={2.4} />
        </button>
      </header>

      <div ref={scroller} className="flex-1 space-y-2.5 overflow-y-auto px-4 py-3.5">
        {messages.length === 0 && drafts.length === 0 && (
          <p className="pt-6 text-center text-xs leading-relaxed text-muted/60">{t("nothing said yet.")}<br />{t("say something first.")}</p>
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
                    {message.author_id === me?.userId ? t("you") : message.author_name}
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

        {drafts.map(([id, d]) => (
          <div key={`typing-${id}`} aria-live="polite">
            <div className="mb-0.5 flex items-baseline gap-1.5">
              <span className="text-[11px] font-semibold" style={{ color: d.tint }}>
                {d.name}
              </span>
              <span className="text-[10px] text-muted/45">{t("typing")}</span>
            </div>
            {d.hidden || !d.text ? (
              <p className="flex h-5 items-center gap-1" aria-label={t("typing")}>
                {[0, 1, 2].map((i) => (
                  <span key={i} className="size-1.5 animate-pulse rounded-full bg-chalk/45" style={{ animationDelay: `${i * 180}ms` }} />
                ))}
              </p>
            ) : (
              <p className="text-sm leading-snug wrap-anywhere text-chalk/55 italic">
                {d.text}
                <span className="ml-0.5 inline-block h-3.5 w-px animate-pulse bg-chalk/60 align-middle" />
              </p>
            )}
          </div>
        ))}
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          const body = draft.trim();
          if (!body) return;
          setDraft("");
          broadcastTyping(null);
          void sendMessage(body);
        }}
        className="flex items-center gap-1.5 border-t border-white/8 p-2.5"
      >
        <input
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            broadcastTyping(event.target.value, !live);
          }}
          onKeyDown={(event) => event.stopPropagation()}
          disabled={!canEdit}
          placeholder={canEdit ? t("say something") : t("the room is locked")}
          maxLength={2000}
          className="min-w-0 flex-1 rounded-xl bg-white/7 px-3 py-2 text-sm ring-1 ring-white/10 outline-none placeholder:text-muted/55 focus:ring-glow/45 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!canEdit || !draft.trim()}
          aria-label={t("send")}
          className="grid size-9 shrink-0 place-items-center rounded-xl bg-chalk text-ink-950 transition hover:bg-white disabled:opacity-35"
        >
          <SendHorizontal className="size-4" strokeWidth={2.4} />
        </button>
      </form>
    </aside>
  );
}
