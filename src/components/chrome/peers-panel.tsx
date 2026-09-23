"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Trash2, X } from "lucide-react";
import { useRoom } from "@/realtime/room-provider";
import { useRoomStore } from "@/state/room-store";
import { TINTS } from "@/lib/identity";
import { t } from "@/lib/i18n";

export default function PeersPanel() {
  const { updateIdentity, isOwner, deleteRoom } = useRoom();
  const router = useRouter();
  const peers = useRoomStore((s) => s.peers);
  const me = useRoomStore((s) => s.me);
  const room = useRoomStore((s) => s.room);
  const setPanel = useRoomStore((s) => s.setPanel);

  // This field is the only thing that can rename you, so it owns the value.
  const [nameDraft, setNameDraft] = useState(me?.name ?? "");
  const [confirming, setConfirming] = useState(false);
  const [removing, setRemoving] = useState(false);

  const others = Object.values(peers)
    .filter((peer) => peer.userId !== me?.userId)
    .sort((a, b) => a.joinedAt - b.joinedAt);

  return (
    <aside className="surface animate-drift-in absolute inset-x-2 bottom-20 z-40 max-h-[68dvh] overflow-hidden rounded-3xl sm:inset-x-auto sm:top-16 sm:right-3 sm:bottom-auto sm:w-[19rem]">
      <header className="flex items-center justify-between border-b border-white/8 px-4 py-3">
        <h2 className="text-sm font-semibold">{t("who is here")}</h2>
        <button
          type="button"
          onClick={() => setPanel(null)}
          aria-label={t("close")}
          className="grid size-6 place-items-center rounded-lg text-muted transition hover:bg-white/8 hover:text-chalk"
        >
          <X className="size-3.5" strokeWidth={2.4} />
        </button>
      </header>

      <div className="space-y-4 px-4 py-4">
        <section>
          <h3 className="mb-2 text-[11px] font-medium tracking-wide text-muted uppercase">{t("you")}</h3>

          <input
            value={nameDraft}
            onChange={(event) => setNameDraft(event.target.value)}
            onBlur={() => {
              const trimmed = nameDraft.trim().slice(0, 32);
              if (trimmed && trimmed !== me?.name) updateIdentity({ name: trimmed });
              else setNameDraft(me?.name ?? "");
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
              event.stopPropagation();
            }}
            maxLength={32}
            placeholder={t("what should we call you")}
            className="w-full rounded-xl bg-white/7 px-3 py-2 text-sm ring-1 ring-white/10 outline-none placeholder:text-muted/55 focus:ring-glow/45"
          />

          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {TINTS.map((tint) => (
              <button
                key={tint}
                type="button"
                onClick={() => updateIdentity({ tint })}
                aria-label={t(`colour ${tint}`)}
                className={clsx(
                  "size-6 rounded-full transition hover:scale-110",
                  me?.tint === tint && "ring-2 ring-chalk ring-offset-2 ring-offset-ink-800",
                )}
                style={{ background: tint }}
              />
            ))}
          </div>
        </section>

        <section>
          <h3 className="mb-2 text-[11px] font-medium tracking-wide text-muted uppercase">{t("also here")}</h3>

          {others.length === 0 ? (
            <p className="text-xs leading-relaxed text-muted/60">{t("just you for now. send the link to someone.")}</p>
          ) : (
            <ul className="space-y-1">
              {others.map((peer) => (
                <li key={peer.userId} className="flex items-center gap-2.5 rounded-xl px-1 py-1.5">
                  <span
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ background: peer.tint }}
                  />
                  <span className="min-w-0 flex-1 truncate text-sm">{peer.name}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {isOwner && (
          <section className="border-t border-white/8 pt-3">
            <h3 className="mb-2 text-[11px] font-medium tracking-wide text-muted uppercase">{t("this nook")}</h3>

            {confirming ? (
              <div className="space-y-2">
                <p className="text-xs leading-relaxed text-muted">{t("Delete")}{" "}<span className="text-chalk">{room?.name}</span>{" "}{t("and everything in it? The link stops working for everyone. This cannot be undone.")}</p>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    disabled={removing}
                    onClick={async () => {
                      setRemoving(true);
                      if (await deleteRoom()) router.push("/");
                      else setRemoving(false);
                    }}
                    className="flex-1 rounded-xl bg-red-500/20 py-2 text-xs font-semibold text-red-200 transition hover:bg-red-500/30 disabled:opacity-50"
                  >
                    {removing ? t("deleting") : t("yes, delete it")}
                  </button>
                  <button
                    type="button"
                    disabled={removing}
                    onClick={() => setConfirming(false)}
                    className="flex-1 rounded-xl bg-white/8 py-2 text-xs font-medium text-muted transition hover:bg-white/12 hover:text-chalk"
                  >{t("keep it")}</button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirming(true)}
                className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-xs text-muted transition hover:bg-red-500/12 hover:text-red-300"
              >
                <Trash2 className="size-3.5 shrink-0" strokeWidth={2.2} />{t("delete this nook")}</button>
            )}
          </section>
        )}
      </div>
    </aside>
  );
}
