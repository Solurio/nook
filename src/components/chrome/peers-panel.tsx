"use client";

import { useState } from "react";
import clsx from "clsx";
import { X } from "lucide-react";
import { useRoom } from "@/realtime/room-provider";
import { useRoomStore } from "@/state/room-store";
import { TINTS } from "@/lib/identity";

export default function PeersPanel() {
  const { updateIdentity } = useRoom();
  const peers = useRoomStore((s) => s.peers);
  const me = useRoomStore((s) => s.me);
  const setPanel = useRoomStore((s) => s.setPanel);

  // This field is the only thing that can rename you, so it owns the value.
  const [nameDraft, setNameDraft] = useState(me?.name ?? "");

  const others = Object.values(peers)
    .filter((peer) => peer.userId !== me?.userId)
    .sort((a, b) => a.joinedAt - b.joinedAt);

  return (
    <aside className="surface animate-drift-in absolute top-16 right-3 z-40 w-[19rem] overflow-hidden rounded-3xl">
      <header className="flex items-center justify-between border-b border-white/8 px-4 py-3">
        <h2 className="text-sm font-semibold">who is here</h2>
        <button
          type="button"
          onClick={() => setPanel(null)}
          aria-label="close"
          className="grid size-6 place-items-center rounded-lg text-muted transition hover:bg-white/8 hover:text-chalk"
        >
          <X className="size-3.5" strokeWidth={2.4} />
        </button>
      </header>

      <div className="space-y-4 px-4 py-4">
        <section>
          <h3 className="mb-2 text-[11px] font-medium tracking-wide text-muted uppercase">you</h3>

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
            placeholder="what should we call you"
            className="w-full rounded-xl bg-white/7 px-3 py-2 text-sm ring-1 ring-white/10 outline-none placeholder:text-muted/55 focus:ring-glow/45"
          />

          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {TINTS.map((tint) => (
              <button
                key={tint}
                type="button"
                onClick={() => updateIdentity({ tint })}
                aria-label={`colour ${tint}`}
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
          <h3 className="mb-2 text-[11px] font-medium tracking-wide text-muted uppercase">
            also here
          </h3>

          {others.length === 0 ? (
            <p className="text-xs leading-relaxed text-muted/60">
              just you for now. send the link to someone.
            </p>
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
      </div>
    </aside>
  );
}
