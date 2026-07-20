"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import {
  Check,
  DoorOpen,
  Link2,
  Lock,
  MessageCircle,
  Palette,
  Sticker,
  Unlock,
  Users,
} from "lucide-react";
import { useRoom } from "@/realtime/room-provider";
import { useRoomStore } from "@/state/room-store";

export default function TopBar() {
  const { renameRoom, canEdit, isOwner, setLocked } = useRoom();
  const room = useRoomStore((s) => s.room);
  const peers = useRoomStore((s) => s.peers);
  const panel = useRoomStore((s) => s.panel);
  const setPanel = useRoomStore((s) => s.setPanel);
  const unread = useRoomStore((s) => s.unreadChat);
  const connection = useRoomStore((s) => s.connection);

  const [editingName, setEditingName] = useState(false);
  const [copied, setCopied] = useState(false);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard is blocked on insecure origins; the URL bar still works.
    }
  };

  const headcount = Object.keys(peers).length;

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-50 flex items-start justify-between gap-3 p-3">
      <div className="surface pointer-events-auto flex items-center gap-1 rounded-2xl p-1.5">
        <Link
          href="/"
          aria-label="back to the front door"
          className="grid size-8 place-items-center rounded-xl text-muted transition hover:bg-white/8 hover:text-chalk"
        >
          <DoorOpen className="size-4" strokeWidth={2.2} />
        </Link>

        <div className="mx-0.5 h-5 w-px bg-white/10" />

        {editingName ? (
          <NameField
            initial={room?.name ?? ""}
            onCommit={(next) => {
              setEditingName(false);
              if (next && next !== room?.name) void renameRoom(next);
            }}
            onCancel={() => setEditingName(false)}
          />
        ) : (
          <button
            type="button"
            disabled={!canEdit}
            onClick={() => setEditingName(true)}
            title={canEdit ? "rename this nook" : undefined}
            className="max-w-52 truncate rounded-xl px-2.5 py-1.5 text-sm font-medium transition hover:bg-white/8 disabled:hover:bg-transparent"
          >
            {room?.name ?? "a nook"}
          </button>
        )}

        <span
          className={clsx(
            "ml-0.5 size-1.5 shrink-0 rounded-full transition",
            connection === "live" && "bg-emerald-400",
            connection === "connecting" && "bg-warm animate-pulse",
            connection === "offline" && "bg-red-400",
          )}
          title={connection === "live" ? "connected" : connection}
        />
      </div>

      <div className="surface pointer-events-auto flex items-center gap-1 rounded-2xl p-1.5">
        <button
          type="button"
          onClick={() => setPanel(panel === "peers" ? null : "peers")}
          title="who is here"
          className={clsx(
            "flex h-8 items-center gap-1.5 rounded-xl px-2.5 text-xs font-medium transition",
            panel === "peers" ? "bg-glow/22 text-glow" : "text-muted hover:bg-white/8 hover:text-chalk",
          )}
        >
          <Users className="size-4" strokeWidth={2.2} />
          {headcount}
        </button>

        <button
          type="button"
          onClick={() => setPanel(panel === "chat" ? null : "chat")}
          title="chat"
          className={clsx(
            "relative grid size-8 place-items-center rounded-xl transition",
            panel === "chat" ? "bg-glow/22 text-glow" : "text-muted hover:bg-white/8 hover:text-chalk",
          )}
        >
          <MessageCircle className="size-4" strokeWidth={2.2} />
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 grid min-w-4 place-items-center rounded-full bg-warm px-1 text-[10px] font-bold text-ink-950">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>

        <button
          type="button"
          disabled={!canEdit}
          onClick={() => setPanel(panel === "stickers" ? null : "stickers")}
          title="gifs and stickers"
          className={clsx(
            "grid size-8 place-items-center rounded-xl transition disabled:opacity-40",
            panel === "stickers"
              ? "bg-glow/22 text-glow"
              : "text-muted hover:bg-white/8 hover:text-chalk",
          )}
        >
          <Sticker className="size-4" strokeWidth={2.2} />
        </button>

        <button
          type="button"
          disabled={!canEdit}
          onClick={() => setPanel(panel === "background" ? null : "background")}
          title="change the walls"
          className={clsx(
            "grid size-8 place-items-center rounded-xl transition disabled:opacity-40",
            panel === "background"
              ? "bg-glow/22 text-glow"
              : "text-muted hover:bg-white/8 hover:text-chalk",
          )}
        >
          <Palette className="size-4" strokeWidth={2.2} />
        </button>

        {isOwner && (
          <button
            type="button"
            onClick={() => void setLocked(!room?.locked)}
            title={room?.locked ? "unlock so others can edit" : "lock so only you can edit"}
            className={clsx(
              "grid size-8 place-items-center rounded-xl transition",
              room?.locked
                ? "bg-warm/22 text-warm"
                : "text-muted hover:bg-white/8 hover:text-chalk",
            )}
          >
            {room?.locked ? (
              <Lock className="size-4" strokeWidth={2.2} />
            ) : (
              <Unlock className="size-4" strokeWidth={2.2} />
            )}
          </button>
        )}

        <div className="mx-0.5 h-5 w-px bg-white/10" />

        <button
          type="button"
          onClick={copyLink}
          className="flex h-8 items-center gap-1.5 rounded-xl bg-chalk px-3 text-xs font-semibold text-ink-950 transition hover:bg-white"
        >
          {copied ? (
            <Check className="size-3.5" strokeWidth={2.8} />
          ) : (
            <Link2 className="size-3.5" strokeWidth={2.6} />
          )}
          {copied ? "copied" : "invite"}
        </button>
      </div>
    </div>
  );
}

/** Mounted only while renaming, so its draft needs no syncing. */
function NameField({
  initial,
  onCommit,
  onCancel,
}: {
  initial: string;
  onCommit: (value: string) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    input.current?.select();
  }, []);

  return (
    <input
      ref={input}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => onCommit(draft.trim())}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") onCancel();
        event.stopPropagation();
      }}
      maxLength={80}
      className="w-44 rounded-xl bg-white/8 px-2.5 py-1.5 text-sm font-medium ring-1 ring-glow/45 outline-none"
    />
  );
}
