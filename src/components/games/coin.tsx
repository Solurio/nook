"use client";

import { useMemo, useState } from "react";
import clsx from "clsx";
import { Settings2, X } from "lucide-react";
import { useRoom } from "@/realtime/room-provider";
import { useRoomStore } from "@/state/room-store";
import { newId } from "@/lib/slug";
import { LABEL_MAX, METALS, emptyCoin, faceLabel, flip, streak, type CoinState, type Metal, type Side } from "@/lib/coin";
import type { Item } from "@/lib/types";

const METAL: Record<Metal, { face: string; rim: string; ink: string }> = {
  gold: { face: "radial-gradient(circle at 35% 30%, #fde6b0 0%, #f6c177 38%, #b98236 100%)", rim: "#8c5f22", ink: "#5a3a10" },
  silver: { face: "radial-gradient(circle at 35% 30%, #ffffff 0%, #d7dce5 40%, #8b93a3 100%)", rim: "#6b7384", ink: "#3a404c" },
  copper: { face: "radial-gradient(circle at 35% 30%, #fbd0b4 0%, #e0936a 40%, #97502e 100%)", rim: "#6f3a1f", ink: "#4a2410" },
  jade: { face: "radial-gradient(circle at 35% 30%, #d6f5ef 0%, #8fd3c8 40%, #3b8479 100%)", rim: "#2d6159", ink: "#173a35" },
};

/**
 * A coin. Tap it and it goes up turning over and over and comes down on one
 * side, on every screen at once; the faces say whatever the room likes.
 */
export default function Coin({ item, state: raw }: { item: Item<"game">; state: unknown }) {
  const { updateData, canEdit } = useRoom();
  const me = useRoomStore((s) => s.me);
  const state = useMemo(() => ({ ...emptyCoin(), ...(raw as Partial<CoinState>) }) as CoinState, [raw]);
  const [editing, setEditing] = useState(false);
  const latest = state.flips[0] ?? null;
  const [arrivedAfter] = useState(() => latest?.id ?? null);
  const [landed, setLanded] = useState<string | null>(() => latest?.id ?? null);

  const write = (next: CoinState) => updateData(item.id, { game: "coin", state: next } as never);
  const toss = () => {
    if (!canEdit) return;
    void write(flip(state, me?.name ?? "someone", newId(), Date.now()));
  };

  const metal = METAL[state.metal] ?? METAL.gold;
  const flying = latest !== null && latest.id !== arrivedAfter && landed !== latest.id;
  const from = state.flips[1]?.side === "tails" ? 180 : 0;
  const end = latest ? latest.spins * 360 + (latest.side === "tails" ? 180 : 0) : 0;
  const rest = latest?.side === "tails" ? 180 : 0;
  const run = streak(state.flips);
  const name = (side: Side) => faceLabel(side === "heads" ? state.heads : state.tails, side);

  // Half the coin's thickness: the faces sit this far either side of the
  // middle, with the rim filled in between, so it has an edge when it turns.
  const half = 4;
  const face = (side: Side) => (
    <div
      className="absolute inset-0 grid place-items-center rounded-full [backface-visibility:hidden]"
      style={{
        background: metal.face,
        boxShadow: `inset 0 0 0 5px ${metal.rim}, inset 0 0 0 8px rgba(255,255,255,0.25), inset 0 -6px 14px rgba(0,0,0,0.3)`,
        transform: side === "tails" ? `rotateX(180deg) translateZ(${half}px)` : `translateZ(${half}px)`,
      }}
    >
      <svg viewBox="0 0 100 100" className="absolute inset-[9%] size-[82%]" aria-hidden>
        {Array.from({ length: 24 }, (_, i) => (
          <circle key={i} cx={50 + 42 * Math.sin((i / 24) * Math.PI * 2)} cy={50 - 42 * Math.cos((i / 24) * Math.PI * 2)} r={1.3} fill={metal.ink} opacity={0.35} />
        ))}
        {side === "heads" ? (
          <path d="M50 22 l5 11 12 1.5 -9 8 2.5 12 -10.5 -6 -10.5 6 2.5 -12 -9 -8 12 -1.5z" fill={metal.ink} opacity={0.22} />
        ) : (
          <path d="M58 24 a24 24 0 1 0 0 34 a18 18 0 1 1 0 -34z" fill={metal.ink} opacity={0.22} transform="translate(-4 8)" />
        )}
      </svg>
      <span
        className="relative max-w-[70%] text-center leading-tight font-bold break-words"
        style={{ color: metal.ink, fontSize: name(side).length > 6 ? 13 : 17, textShadow: "0 1px 0 rgba(255,255,255,0.35)" }}
      >
        {name(side)}
      </span>
    </div>
  );

  return (
    <div className="surface grain relative flex size-full flex-col items-center gap-2 overflow-hidden rounded-2xl p-3">
      <button
        type="button"
        onClick={() => setEditing(true)}
        disabled={!canEdit}
        aria-label="change the coin"
        className="absolute top-2 right-2 z-10 grid size-9 place-items-center rounded-lg text-muted transition hover:bg-white/8 hover:text-chalk disabled:opacity-30"
      >
        <Settings2 className="size-4" />
      </button>

      {/* The air above the table */}
      <div className="flex min-h-0 w-full flex-1 items-end justify-center pb-3">
        {/* The perspective has to sit on the coin's own parent, or the turn
            flattens into a squash. */}
        <button
          type="button"
          onClick={toss}
          disabled={!canEdit || flying}
          aria-label="flip the coin"
          className="relative aspect-square w-[min(9rem,60%)] rounded-full outline-none [perspective:700px] focus-visible:ring-2 focus-visible:ring-glow"
        >
          <div
            key={latest?.id ?? "none"}
            className={clsx("absolute inset-0 [transform-style:preserve-3d]", flying && "animate-coin-toss")}
            style={
              {
                "--coin-from": `${from}deg`,
                "--coin-to": `${end}deg`,
                transform: flying ? undefined : `rotateX(${rest}deg)`,
              } as React.CSSProperties
            }
            onAnimationEnd={() => latest && setLanded(latest.id)}
          >
            {/* The rim, a disc at a time, so it reads as metal edge-on */}
            {Array.from({ length: half * 2 - 1 }, (_, i) => (
              <div
                key={i}
                aria-hidden
                className="absolute inset-[1px] rounded-full"
                style={{ background: metal.rim, transform: `translateZ(${i - half + 1}px)` }}
              />
            ))}
            {face("heads")}
            {face("tails")}
          </div>
          {/* Its shadow on the table, shrinking as it goes up */}
          <span className="pointer-events-none absolute inset-x-0 -bottom-3 flex justify-center">
            <span className={clsx("h-2 w-3/4 rounded-[50%] bg-black/35 blur-[3px]", flying && "animate-coin-shadow")} />
          </span>
        </button>
      </div>

      <div className="flex min-h-12 flex-col items-center text-center">
        {latest && !flying ? (
          <>
            <p className="animate-drift-in text-[20px] leading-none font-bold text-chalk">{name(latest.side)}</p>
            <p className="mt-1 text-[10px] text-muted">
              {latest.by} flipped it
              {run && run.length > 1 && (
                <>
                  {" "}
                  · {run.length} {name(run.side)} in a row
                </>
              )}
            </p>
          </>
        ) : (
          <p className="text-[11px] text-muted/60">{flying ? "..." : "tap the coin"}</p>
        )}
      </div>

      {/* The last few, oldest on the left */}
      <div className="flex w-full items-center gap-2">
        <span className="shrink-0 text-[10px] tabular-nums text-muted">
          {name("heads")} {state.tally.heads} · {name("tails")} {state.tally.tails}
        </span>
        <span className="flex min-w-0 flex-1 flex-row-reverse justify-start gap-0.5 overflow-hidden">
          {state.flips.slice(flying ? 1 : 0, 16).map((f) => (
            <span
              key={f.id}
              title={`${name(f.side)} -- ${f.by}`}
              className={clsx("size-2.5 shrink-0 rounded-full", f.side === "heads" ? "bg-warm" : "bg-glow/70")}
            />
          ))}
        </span>
      </div>

      {editing && (
        <div className="absolute inset-0 z-20 flex flex-col gap-3 rounded-2xl bg-ink-950/95 p-3 backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <h3 className="text-[12px] font-semibold text-chalk">the coin</h3>
            <button type="button" onClick={() => setEditing(false)} aria-label="close" className="grid size-9 place-items-center rounded-lg text-muted hover:bg-white/8 hover:text-chalk">
              <X className="size-4" />
            </button>
          </div>
          {(["heads", "tails"] as const).map((side) => (
            <label key={side} className="flex items-center gap-2 text-[11px] text-muted">
              <span className="w-10">{side}</span>
              <input
                defaultValue={side === "heads" ? state.heads : state.tails}
                maxLength={LABEL_MAX}
                onBlur={(event) => void write({ ...state, [side]: event.target.value.trim() || side })}
                onKeyDown={(event) => event.key === "Enter" && (event.target as HTMLInputElement).blur()}
                className="h-9 min-w-0 flex-1 rounded-lg bg-white/8 px-2 text-[12px] text-chalk outline-none"
              />
            </label>
          ))}
          <div className="flex gap-1.5">
            {METALS.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => void write({ ...state, metal: m })}
                aria-label={m}
                title={m}
                className={clsx("size-9 rounded-full", state.metal === m && "ring-2 ring-chalk ring-offset-2 ring-offset-ink-950")}
                style={{ background: METAL[m].face }}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={() => void write({ ...state, flips: [], tally: { heads: 0, tails: 0 } })}
            className="mt-auto min-h-9 rounded-lg text-[11px] text-muted hover:bg-white/8 hover:text-chalk"
          >
            forget the flips so far
          </button>
        </div>
      )}
    </div>
  );
}
