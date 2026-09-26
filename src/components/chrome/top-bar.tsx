"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import clsx from "clsx";
import {
  Check,
  DoorOpen,
  EyeOff,
  Link2,
  Lock,
  MessageCircle,
  MoreHorizontal,
  Palette,
  Unlock,
  Users,
} from "lucide-react";
import { useRoom } from "@/realtime/room-provider";
import { useRoomStore } from "@/state/room-store";
import { t } from "@/lib/i18n";
import { LanguagePicker } from "@/components/localized";
import { hideChrome } from "./chrome-toggle";

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
  const [more, setMore] = useState(false);

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
      <div className="surface pointer-events-auto flex items-center gap-0.5 rounded-2xl p-1 sm:gap-1 sm:p-1.5">
        {/* On a phone every pixel here is needed by the buttons on the right,
            and the browser's own back button already goes home. */}
        <Link
          href="/"
          aria-label={t("back to the front door")}
          className="hidden size-8 place-items-center rounded-xl text-muted transition hover:bg-white/8 hover:text-chalk sm:grid"
        >
          <DoorOpen className="size-4" strokeWidth={2.2} />
        </Link>

        <div className="mx-0.5 hidden h-5 w-px bg-white/10 sm:block" />

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
            title={canEdit ? t("rename this nook") : undefined}
            className="max-w-[9.5rem] truncate rounded-xl px-2.5 py-1.5 text-sm font-medium transition hover:bg-white/8 disabled:hover:bg-transparent sm:max-w-52"
          >
            {room?.name ?? t("a nook")}
          </button>
        )}

        <span
          className={clsx(
            "ml-0.5 size-1.5 shrink-0 rounded-full transition",
            connection === "live" && "bg-emerald-400",
            connection === "connecting" && "bg-warm animate-pulse",
            connection === "offline" && "bg-red-400",
          )}
          title={connection === "live" ? t("connected") : t(connection)}
        />
      </div>

      <div className="surface pointer-events-auto flex items-center gap-0.5 rounded-2xl p-1 sm:gap-1 sm:p-1.5">
        <button
          type="button"
          onClick={() => setPanel(panel === "peers" ? null : "peers")}
          title={t("who is here")}
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
          title={t("chat")}
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
          onClick={() => setPanel(panel === "background" ? null : "background")}
          title={t("change the walls")}
          className={clsx(
            "hidden size-8 place-items-center rounded-xl transition disabled:opacity-40 sm:grid",
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
            title={room?.locked ? t("unlock so others can edit") : t("lock so only you can edit")}
            className={clsx(
              "hidden size-8 place-items-center rounded-xl transition sm:grid",
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

        {/* Five buttons and a room name do not fit across a phone. The two
            that are not reached for mid-conversation move behind one. */}
        <button
          type="button"
          onClick={() => setMore(true)}
          aria-label={t("more")}
          className={clsx(
            "grid size-8 place-items-center rounded-xl transition sm:hidden",
            room?.locked ? "bg-warm/22 text-warm" : "text-muted active:bg-white/10",
          )}
        >
          <MoreHorizontal className="size-4" strokeWidth={2.4} />
        </button>

        <LanguagePicker compact className="hidden sm:flex" />

        <div className="mx-0.5 hidden h-5 w-px bg-white/10 sm:block" />

        <button
          type="button"
          onClick={copyLink}
          title={copied ? t("copied") : t("copy the invite link")}
          aria-label={t("copy the invite link")}
          className="flex h-8 items-center gap-1.5 rounded-xl bg-chalk px-2 text-xs font-semibold text-ink-950 transition hover:bg-white sm:px-3"
        >
          {copied ? (
            <Check className="size-3.5" strokeWidth={2.8} />
          ) : (
            <Link2 className="size-3.5" strokeWidth={2.6} />
          )}
          {/* The word costs more width than a phone can spare up here. */}
          <span className="hidden sm:inline">{copied ? t("copied") : t("invite")}</span>
        </button>
      </div>

      {more && (
        <MoreSheet
          locked={Boolean(room?.locked)}
          isOwner={isOwner}
          canEdit={canEdit}
          onWalls={() => {
            setPanel("background");
            setMore(false);
          }}
          onLock={() => {
            void setLocked(!room?.locked);
            setMore(false);
          }}
          onClose={() => setMore(false)}
        />
      )}
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

/**
 * The bits of the top bar a phone has no room for. A sheet rather than a
 * dropdown: it comes up where the thumb already is, and the labels say what
 * the icons could not.
 */
function MoreSheet({
  locked,
  isOwner,
  canEdit,
  onWalls,
  onLock,
  onClose,
}: {
  locked: boolean;
  isOwner: boolean;
  canEdit: boolean;
  onWalls: () => void;
  onLock: () => void;
  onClose: () => void;
}) {
  // On the page itself, not inside the top bar: the bar is its own layer, and
  // a sheet inside it sat under the dock however high its own z-index.
  return createPortal(
    <div className="pointer-events-auto fixed inset-0 z-60 flex flex-col justify-end sm:hidden">
      <button
        type="button"
        aria-label={t("close")}
        onClick={onClose}
        className="absolute inset-0 bg-ink-950/55"
      />

      <div className="surface-raised animate-drift-in relative rounded-t-3xl px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/20" />

        <button
          type="button"
          disabled={!canEdit}
          onClick={onWalls}
          className="flex min-h-12 w-full items-center gap-3 rounded-xl px-2 text-left text-sm transition active:bg-white/8 disabled:opacity-40"
        >
          <Palette className="size-5 shrink-0 text-glow" strokeWidth={2} />{t("change the walls")}</button>

        {isOwner && (
          <button
            type="button"
            onClick={onLock}
            className="flex min-h-12 w-full items-center gap-3 rounded-xl px-2 text-left text-sm transition active:bg-white/8"
          >
            {locked ? (
              <Lock className="size-5 shrink-0 text-warm" strokeWidth={2} />
            ) : (
              <Unlock className="size-5 shrink-0 text-glow" strokeWidth={2} />
            )}
            <span className="min-w-0">
              {locked ? t("unlock, so others can edit") : t("lock, so only you can edit")}
            </span>
          </button>
        )}

        <button
          type="button"
          onClick={() => {
            onClose();
            hideChrome(true);
          }}
          className="flex min-h-12 w-full items-center gap-3 rounded-xl px-2 text-left text-sm transition active:bg-white/8"
        >
          <EyeOff className="size-5 shrink-0 text-glow" strokeWidth={2} />
          <span className="min-w-0">{t("hide the buttons")}</span>
        </button>

        <LanguagePicker className="my-2 w-fit" />

        <Link
          href="/"
          className="flex min-h-12 w-full items-center gap-3 rounded-xl px-2 text-left text-sm text-muted transition active:bg-white/8"
        >
          <DoorOpen className="size-5 shrink-0" strokeWidth={2} />{t("back to the front door")}</Link>
      </div>
    </div>,
    document.body,
  );
}
