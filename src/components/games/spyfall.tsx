"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { Eye, Languages, MapPin, Minus, Pause, Play, Plus, RotateCcw } from "lucide-react";
import { useRoom } from "@/realtime/room-provider";
import { usePiles } from "@/realtime/use-piles";
import { useScrub } from "@/realtime/use-hand-over";
import { useRoomStore } from "@/state/room-store";
import { seatIds } from "@/lib/cards";
import { chairOf, claimChair } from "@/lib/seats";
import {
  BRIEFINGS,
  DEFAULT_SECONDS,
  MAX_SEATS,
  MIN_SEATS,
  PLACES,
  briefingChoices,
  clock,
  readBriefing,
  remaining,
  roleSlot,
  unmasked,
} from "@/lib/spyfall";
import type { Item, SpyfallState } from "@/lib/types";
import { t } from "@/lib/i18n";

/**
 * Spyfall. Everybody is somewhere together and knows what they do there --
 * everybody but one, who was told nothing and has to keep up from the questions
 * alone while working out where they are.
 *
 * Nobody deals it, not even whoever pressed the button: the database is
 * offered one possible deck per place, picks one without saying which, and
 * deals a card to each chair that only that chair can read. At the end of the
 * round everyone turns theirs over. The list of places stays on show, which is
 * the whole point of it -- it is what the spy bluffs from.
 */
export default function Spyfall({ item, state }: { item: Item<"game">; state: SpyfallState }) {
  const { updateData, pile, canEdit } = useRoom();
  const me = useRoomStore((s) => s.me);
  const [peek, setPeek] = useState<string | null>(null);
  const [places, setPlaces] = useState(false);
  const [busy, setBusy] = useState(false);

  const chairs = seatIds(state.seatCount);
  const holders = useMemo(() => state.holders ?? {}, [state.holders]);
  const myChair = chairOf(state.seats, holders, me);
  const piles = state.piles;
  const mine = usePiles(item.id, piles);
  const pack = PLACES[state.pack];
  const dealt = Boolean(piles?.[roleSlot(chairs[0])]);
  const called = Boolean(state.called);

  // A save from before the briefings were private had the answer in the open.
  const legacy = "location" in state || "spy" in state || "roles" in state || typeof state.revealed === "boolean";
  useScrub(legacy, () => void updateData(item.id, { game: "spyfall", state: clean(state) }));

  // The clock is a shared start time rather than a shared countdown, so nobody
  // has to keep writing the seconds to the database for everyone else to read.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (state.startedAt === null) return;
    const tick = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(tick);
  }, [state.startedAt]);
  const left = remaining(state.startedAt, state.seconds, now);
  const expired = state.startedAt !== null && left === 0;

  const write = (next: SpyfallState) => {
    setPeek(null);
    void updateData(item.id, { game: "spyfall", state: clean(next) });
  };

  const newRound = async () => {
    if (!me || busy) return;
    setBusy(true);
    try {
      const fresh = clean({
        ...state,
        round: (state.round ?? 0) + 1,
        startedAt: null,
        seconds: DEFAULT_SECONDS,
        called: false,
      });
      delete fresh.revealed;
      const setup = await pile("pile_setup", {
        p_item: item.id,
        p_piles: [{ slot: BRIEFINGS, choices: briefingChoices(state.pack, chairs.length), shuffle: true }],
        p_public: { game: "spyfall", state: fresh },
      });
      if (setup.error) return;
      await pile("pile_deal", {
        p_item: item.id,
        p_from: BRIEFINGS,
        p_targets: chairs.map((chair) => ({
          slot: roleSlot(chair),
          owner: holders[chair] ?? me.userId,
          count: 1,
        })),
      });
    } finally {
      setBusy(false);
    }
  };

  const resize = (by: number) => {
    const count = Math.max(MIN_SEATS, Math.min(MAX_SEATS, state.seatCount + by));
    if (count === state.seatCount) return;
    const keep = seatIds(count);
    write({
      ...state,
      seatCount: count,
      seats: Object.fromEntries(keep.map((c) => [c, state.seats[c] ?? null])),
      holders: Object.fromEntries(keep.map((c) => [c, holders[c] ?? null])),
      startedAt: null,
      seconds: DEFAULT_SECONDS,
      called: false,
    });
  };

  /** Call it: the score goes up, and everyone turns their card over. */
  const callIt = (caught: boolean) =>
    write({
      ...state,
      called: true,
      startedAt: null,
      wins: caught
        ? { ...state.wins, table: state.wins.table + 1 }
        : { ...state.wins, spy: state.wins.spy + 1 },
    });

  // Once the round is called, each device turns over the cards it holds.
  const turning = useRef("");
  const toTurn = called
    ? chairs.map(roleSlot).filter((slot) => slot in mine && !state.revealed?.[slot])
    : [];
  const turnKey = toTurn.length ? `${state.round ?? 0}:${toTurn.join(",")}` : "";
  useEffect(() => {
    if (!turnKey || turning.current === turnKey) return;
    turning.current = turnKey;
    const slots = turnKey.slice(turnKey.indexOf(":") + 1).split(",");
    void pile("pile_reveal", { p_item: item.id, p_slots: slots, p_keep: true });
  }, [turnKey, item.id, pile]);

  const label = (chair: string) => state.seats[chair] ?? t(`seat ${chairs.indexOf(chair) + 1}`);
  const end = unmasked(state.revealed, chairs, state.pack);

  /** What this chair was told. Only ever shown to whoever asked to see it. */
  const briefing = (chair: string) => {
    const read = readBriefing((mine[roleSlot(chair)] as string[] | undefined)?.[0], state.pack);
    if (!read) return { title: "...", body: "" };
    if (read.spy) return { title: "you are the spy", body: "you have no idea where this is. Find out." };
    return { title: read.placeName, body: `you are the ${read.role}` };
  };

  // Which cards this device may look at: your own, or empty chairs dealt to it.
  const lookable = chairs.filter((chair) => roleSlot(chair) in mine && (!myChair || chair === myChair));

  return (
    <div className="surface grain relative flex size-full flex-col gap-2 overflow-hidden rounded-2xl p-2.5">
      {/* Table size, the pack, and the clock */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-muted/70">
        <span className="flex items-center gap-0.5">
          <button
            type="button"
            disabled={!canEdit || state.seatCount <= MIN_SEATS}
            onClick={() => resize(-1)}
            aria-label={t("one chair fewer")}
            className="grid size-7 place-items-center rounded transition hover:bg-white/10 hover:text-chalk disabled:opacity-30"
          >
            <Minus className="size-3" strokeWidth={2.6} />
          </button>
          <span className="tabular-nums text-chalk">{state.seatCount}</span>
          <span>{t("chairs")}</span>
          <button
            type="button"
            disabled={!canEdit || state.seatCount >= MAX_SEATS}
            onClick={() => resize(1)}
            aria-label={t("one chair more")}
            className="grid size-7 place-items-center rounded transition hover:bg-white/10 hover:text-chalk disabled:opacity-30"
          >
            <Plus className="size-3" strokeWidth={2.6} />
          </button>
        </span>

        <button
          type="button"
          disabled={!canEdit}
          onClick={() => write({ ...state, pack: state.pack === "en" ? "pt" : "en", called: false })}
          title={t("switch the list of places")}
          className="flex items-center gap-1 rounded-lg px-1.5 py-1 transition hover:bg-white/8 hover:text-chalk disabled:opacity-40"
        >
          <Languages className="size-3" strokeWidth={2.2} />
          {state.pack === "en" ? t("english") : t("portugues")}
        </button>

        <span className="ml-auto flex items-center gap-1.5">
          <span className="text-muted/50">{t("spy {spy} · table {table}", { spy: state.wins.spy, table: state.wins.table })}
          </span>
          <span className={clsx("tabular-nums", expired ? "font-semibold text-warm" : "text-chalk")}>
            {clock(left)}
          </span>
          <button
            type="button"
            disabled={!canEdit || !dealt || called}
            onClick={() =>
              write({
                ...state,
                // Stopping banks what is left rather than throwing it away.
                startedAt: state.startedAt === null ? Date.now() : null,
                seconds: state.startedAt === null ? state.seconds : left,
              })
            }
            aria-label={state.startedAt === null ? t("start the clock") : t("stop the clock")}
            className="grid size-7 place-items-center rounded-lg transition hover:bg-white/10 hover:text-chalk disabled:opacity-30"
          >
            {state.startedAt === null ? (
              <Play className="size-3" strokeWidth={2.4} />
            ) : (
              <Pause className="size-3" strokeWidth={2.4} />
            )}
          </button>
        </span>
      </div>

      {/* Everyone at the table */}
      <div className="flex flex-wrap gap-1.5">
        {chairs.map((chair, index) => {
          const who = state.seats[chair];
          const isMine = chair === myChair;
          const caught = called && chair === end.spy;
          return (
            <button
              key={chair}
              type="button"
              disabled={!canEdit || !me}
              onClick={() => me && write({ ...state, ...claimChair(state.seats, holders, chair, me) })}
              title={who ? (isMine ? t("stand up") : who) : t("sit here")}
              className={clsx(
                "flex min-h-9 min-w-0 flex-1 basis-24 items-center gap-1.5 rounded-xl px-2 py-1.5 text-left transition disabled:opacity-50",
                caught ? "bg-warm/20 ring-1 ring-warm/50" : "bg-white/5 hover:bg-white/9",
              )}
            >
              <span className="min-w-0 flex-1 truncate text-[11px]">
                {who ? (
                  <span className={isMine ? "text-chalk" : "text-muted"}>{who}</span>
                ) : (
                  <span className="text-muted/55">{t("seat {n}", { n: index + 1 })}</span>
                )}
              </span>
              {called && dealt && (
                <span className="shrink-0 truncate text-[9px] text-muted/70">
                  {chair === end.spy ? t("the spy") : (end.roles[chair] ?? "...")}
                </span>
              )}
              {!who && <span className="shrink-0 text-[9px] text-muted/35">{t("open")}</span>}
            </button>
          );
        })}
      </div>

      {/* What you were told */}
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto rounded-xl bg-ink-950/25 p-2 inset-ring inset-ring-white/6">
        {!dealt ? (
          <p className="my-auto text-center text-[11px] text-muted/50">{t("everyone sits down, then deal to send them somewhere")}</p>
        ) : called ? (
          <div className="my-auto text-center">
            {end.waitingOn.length > 0 ? (
              <p className="text-[11px] text-muted/60">{t("turning the cards over...")}</p>
            ) : (
              <>
                <p className="text-[11px] text-muted/60">{t("everyone was at the")}</p>
                <p className="text-sm font-semibold text-chalk">{end.place ?? "?"}</p>
                <p className="mt-1 text-[11px] text-warm">
                  {t("{what} was the spy", { what: end.spy ? label(end.spy) : t("somebody") })}</p>
              </>
            )}
          </div>
        ) : (
          <>
            <p className="text-[10px] text-muted/60">
              {expired ? t("time is up -- last chance to accuse") : t("ask each other questions. Nothing written down.")}
            </p>

            {/* Your own card, or an empty chair's on a phone passed round. It
                shows only while it is asked for. */}
            <div className="flex flex-wrap gap-1">
              {lookable.map((chair) => (
                <button
                  key={chair}
                  type="button"
                  onClick={() => setPeek(peek === chair ? null : chair)}
                  className={clsx(
                    "flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] transition",
                    peek === chair ? "bg-glow/20 text-glow" : "bg-white/6 text-muted hover:bg-white/10 hover:text-chalk",
                  )}
                >
                  <Eye className="size-3.5" strokeWidth={2.2} />
                  {myChair ? t("your card") : label(chair)}
                </button>
              ))}
              {lookable.length === 0 && (
                <p className="text-[11px] text-muted/50">{t("you are watching this round")}</p>
              )}
            </div>

            {peek && (
              <div className="rounded-xl bg-[#f3ead7] p-3 text-center text-[#2a2118] shadow-lg">
                <p className="text-sm font-semibold">{t(briefing(peek).title)}</p>
                <p className="mt-0.5 text-[11px] opacity-75">{t(briefing(peek).body)}</p>
              </div>
            )}

            {canEdit && (
              <div className="mt-auto flex flex-wrap gap-1 pt-1">
                <button
                  type="button"
                  onClick={() => callIt(true)}
                  className="min-h-9 rounded-lg bg-white/8 px-2.5 py-1.5 text-[11px] text-chalk transition hover:bg-white/12"
                >{t("we caught the spy")}</button>
                <button
                  type="button"
                  onClick={() => callIt(false)}
                  className="min-h-9 rounded-lg bg-warm/15 px-2.5 py-1.5 text-[11px] text-warm transition hover:bg-warm/25"
                >{t("the spy got away")}</button>
              </div>
            )}
          </>
        )}
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setPlaces(true)}
          className="flex min-w-0 flex-1 items-center gap-1.5 truncate rounded-lg px-1.5 py-1 text-left text-[10px] text-muted transition hover:bg-white/8 hover:text-chalk"
        >
          <MapPin className="size-3 shrink-0" strokeWidth={2.2} />
          <span className="truncate">{t("all {pack} places", { pack: pack.length })}</span>
        </button>
        <button
          type="button"
          disabled={!canEdit || busy}
          onClick={() => void newRound()}
          aria-label={t("deal a new round")}
          title={t("deal a new round")}
          className="grid size-9 shrink-0 place-items-center rounded-lg text-muted transition hover:bg-white/8 hover:text-chalk disabled:opacity-40 sm:size-8"
        >
          <RotateCcw className="size-3.5" strokeWidth={2.2} />
        </button>
      </div>

      {places && (
        <div className="absolute inset-0 z-10 flex flex-col rounded-2xl bg-ink-950/94 p-2.5 backdrop-blur-sm">
          <div className="mb-2 flex shrink-0 items-center justify-between">
            <h3 className="text-[11px] font-semibold text-chalk">{t("where it might be")}</h3>
            <button
              type="button"
              onClick={() => setPlaces(false)}
              className="min-h-8 rounded-lg px-2 py-1 text-[10px] text-muted transition hover:bg-white/8 hover:text-chalk"
            >{t("close")}</button>
          </div>
          <div className="grid min-h-0 flex-1 grid-cols-2 gap-x-2 gap-y-0.5 overflow-y-auto text-[11px] text-muted">
            {pack.map((place) => (
              <p key={place.name} className="truncate">
                {place.name}
              </p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** The state without anything the old, leaky version kept, or the database owns. */
function clean(state: SpyfallState): SpyfallState {
  const out = { ...state } as SpyfallState & Record<string, unknown>;
  delete out.location;
  delete out.spy;
  delete out.roles;
  delete out.piles;
  if (typeof out.revealed === "boolean") delete out.revealed;
  return out;
}
