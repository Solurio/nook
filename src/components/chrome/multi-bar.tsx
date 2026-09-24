"use client";

import { useState } from "react";
import { Copy, Link2, Pin, PinOff, Trash2, Unlink2, X } from "lucide-react";
import { useRoom } from "@/realtime/room-provider";
import { useRoomStore } from "@/state/room-store";
import { newId } from "@/lib/slug";
import { t } from "@/lib/i18n";

/**
 * What can be done to several things at once: stuck down or freed, tied
 * together or apart, copied, thrown away. Shows while more than one is picked.
 */
export default function MultiBar() {
  const picked = useRoomStore((s) => s.picked);
  const items = useRoomStore((s) => s.items);
  const { deleteItem, duplicateItem, updateData, canEdit } = useRoom();
  const [confirm, setConfirm] = useState(false);
  if (picked.length < 2) return null;

  const list = picked.map((id) => items[id]).filter(Boolean);
  const allPinned = list.every((it) => it.data?.pinned);
  const tied = list.length > 1 && list.every((it) => it.data?.group && it.data.group === list[0].data?.group);

  const each = (patch: (data: Record<string, unknown>) => Record<string, unknown>) => {
    for (const it of list) void updateData(it.id, patch({ ...(it.data as unknown as Record<string, unknown>) }) as never);
  };

  const button = "flex min-h-8 items-center gap-1 rounded-lg px-2 text-[11px] text-chalk hover:bg-white/10 disabled:opacity-35 [&_svg]:size-3.5";

  return (
    <div className="pointer-events-none fixed inset-x-0 top-14 z-40 flex justify-center px-2">
      <div className="pointer-events-auto flex flex-wrap items-center gap-0.5 rounded-2xl bg-ink-900/92 p-1 shadow-xl ring-1 ring-white/10 backdrop-blur-md">
        <span className="px-2 text-[11px] font-semibold text-glow">{t("{list} picked", { list: list.length })}</span>
        <button type="button" disabled={!canEdit} className={button} onClick={() => each((d) => ({ ...d, pinned: !allPinned }))}>
          {allPinned ? <PinOff /> : <Pin />} {allPinned ? t("unpin") : t("pin")}
        </button>
        <button
          type="button"
          disabled={!canEdit}
          className={button}
          onClick={() => {
            const group = newId();
            each((d) => ({ ...d, group: tied ? null : group }));
          }}
        >
          {tied ? <Unlink2 /> : <Link2 />} {tied ? t("untie") : t("tie together")}
        </button>
        <button type="button" disabled={!canEdit} className={button} onClick={() => list.forEach((it) => void duplicateItem(it.id))}>
          <Copy />{" "}{t("copy")}</button>
        <button
          type="button"
          disabled={!canEdit}
          className={`${button} text-[#f2a4b8]`}
          onClick={() => {
            if (!confirm) {
              setConfirm(true);
              return;
            }
            setConfirm(false);
            list.filter((it) => !it.data?.pinned).forEach((it) => void deleteItem(it.id));
          }}
        >
          <Trash2 /> {confirm ? t("sure? tap again") : t("delete")}
        </button>
        <button
          type="button"
          aria-label={t("let go of them")}
          className={button}
          onClick={() => {
            setConfirm(false);
            useRoomStore.getState().select(null);
          }}
        >
          <X />
        </button>
      </div>
    </div>
  );
}
