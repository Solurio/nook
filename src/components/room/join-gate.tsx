"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, Dices, DoorOpen } from "lucide-react";
import { useRoom } from "@/realtime/room-provider";
import { useRoomStore } from "@/state/room-store";
import { randomName, TINTS } from "@/lib/identity";

/**
 * The doorstep: pick a name and colour before stepping into the room. Prefilled
 * from whatever you called yourself last time, so returning is one tap.
 */
export default function JoinGate() {
  const { join } = useRoom();
  const me = useRoomStore((s) => s.me);
  const room = useRoomStore((s) => s.room);
  const peers = useRoomStore((s) => s.peers);

  const [name, setName] = useState(me?.name ?? "");
  const [tint, setTint] = useState(me?.tint ?? TINTS[0]);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);

  const enter = () => {
    const chosen = name.trim() || me?.name || randomName();
    join(chosen, tint);
  };

  const alreadyHere = Object.keys(peers).length;

  return (
    <main className="relative grid min-h-dvh place-items-center overflow-hidden bg-ink-950 px-6">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(70rem_40rem_at_20%_-10%,#372550_0%,transparent_58%),radial-gradient(60rem_38rem_at_88%_10%,#243049_0%,transparent_55%)]"
      />

      <div className="animate-drift-in surface relative w-full max-w-sm rounded-3xl p-6">
        <div className="mb-5 flex items-center gap-2.5">
          <div className="grid size-9 place-items-center rounded-xl bg-glow/20 ring-1 ring-glow/35">
            <DoorOpen className="size-4.5 text-glow" strokeWidth={2} />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{room?.name ?? "a nook"}</p>
            <p className="text-xs text-muted">
              {alreadyHere > 0
                ? `${alreadyHere} ${alreadyHere === 1 ? "person is" : "people are"} inside`
                : "nobody here yet"}
            </p>
          </div>
        </div>

        <label className="mb-1.5 block text-xs font-medium text-muted">what should we call you?</label>
        <div className="flex gap-1.5">
          <input
            ref={input}
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") enter();
            }}
            placeholder="a name"
            maxLength={32}
            spellCheck={false}
            className="min-w-0 flex-1 rounded-xl bg-white/7 px-3.5 py-2.5 text-sm ring-1 ring-white/10 outline-none placeholder:text-muted/55 focus:ring-glow/45"
          />
          <button
            type="button"
            onClick={() => setName(randomName())}
            aria-label="surprise me"
            title="surprise me"
            className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/7 text-muted ring-1 ring-white/10 transition hover:bg-white/11 hover:text-chalk"
          >
            <Dices className="size-4" strokeWidth={2.2} />
          </button>
        </div>

        <p className="mt-4 mb-2 text-xs font-medium text-muted">your colour</p>
        <div className="flex flex-wrap gap-2">
          {TINTS.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setTint(option)}
              aria-label={`colour ${option}`}
              className={
                "size-7 rounded-full transition hover:scale-110 " +
                (tint === option ? "ring-2 ring-chalk ring-offset-2 ring-offset-ink-800" : "")
              }
              style={{ background: option }}
            />
          ))}
        </div>

        <button
          type="button"
          onClick={enter}
          className="group mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-chalk py-3 text-sm font-semibold text-ink-950 transition hover:bg-white"
        >
          step inside
          <ArrowRight
            className="size-4 transition-transform group-hover:translate-x-0.5"
            strokeWidth={2.4}
          />
        </button>
      </div>
    </main>
  );
}
