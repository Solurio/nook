"use client";

import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { BookOpen, Coins, Eye, EyeOff, Layers } from "lucide-react";
import { useRoom } from "@/realtime/room-provider";
import { usePiles } from "@/realtime/use-piles";
import { useHandOver } from "@/realtime/use-hand-over";
import { useRoomStore } from "@/state/room-store";
import { chairOf, claimChair } from "@/lib/seats";
import { readCard } from "@/lib/cards";
import {
  DECK,
  SEATS,
  afterDouble,
  afterHit,
  afterStand,
  canDouble,
  dealt,
  deck,
  emptyTwentyOne,
  holeCard,
  holeSlot,
  newRound,
  other,
  settle,
  total,
  upCards,
  upKey,
  type Seat,
  type TwentyOneState,
} from "@/lib/twentyone";
import type { Item } from "@/lib/types";
import PlayingCard from "@/components/cards/playing-card";
import RulesSheet from "./rules-sheet";
import { t } from "@/lib/i18n";

const upgrade = (raw: unknown): TwentyOneState => ({ ...emptyTwentyOne(), ...(raw as Partial<TwentyOneState>) }) as TwentyOneState;

function Card({ card, width, down, fresh }: { card: string | null; width: number; down?: boolean; fresh?: boolean }) {
  const read = card ? readCard(card) : null;
  return (
    <div className={clsx(fresh && "animate-drift-in")}>
      <PlayingCard face={read && !down ? { kind: "standard", rank: read.rank, suit: read.suit } : null} deck={null} down={down || !read} width={width} className="h-auto w-[clamp(54px,13cqw,104px)]" />
    </div>
  );
}

/**
 * Twenty-one for two, with chips: a card face down that only you see, the
 * rest face up, and the choice every go between another card, standing, or
 * doubling the stake on one more.
 */
export default function TwentyOne({ item, state: raw }: { item: Item<"game">; state: unknown }) {
  const { updateDataIf, pile, canEdit, setNotice } = useRoom();
  const me = useRoomStore((s) => s.me);
  const state = useMemo(() => upgrade(raw), [raw]);
  const [busy, setBusy] = useState(false);
  const [peek, setPeek] = useState(false);
  const [rules, setRules] = useState(false);

  const holders = useMemo(() => state.holders ?? { a: null, b: null }, [state.holders]);
  const myChair = chairOf(state.seats, holders, me) as Seat | null;
  const piles = state.piles;
  const mine = usePiles(item.id, piles);
  useHandOver(item.id, piles, holders);

  const label = (s: Seat) => state.seats[s] ?? t("seat {n}", { n: s === "a" ? 1 : 2 });
  const holds = (s: Seat) => Boolean(me) && piles?.[holeSlot(s)]?.owner === me?.userId;
  const acting = state.phase === "play" && canEdit && holds(state.turn) && (!myChair || myChair === state.turn);
  /** This device reads a hidden card: its own chair's, or, with nobody sitting, whoever's go it is, while peeking. */
  const sees = (s: Seat) => holds(s) && (myChair ? myChair === s : peek && state.turn === s);

  const strip = (next: TwentyOneState): TwentyOneState => {
    const copy = { ...next };
    delete copy.piles;
    delete copy.revealed;
    return copy;
  };
  const live = () => upgrade((useRoomStore.getState().items[item.id]?.data as { state?: unknown } | undefined)?.state);

  const save = async (make: (fresh: TwentyOneState) => TwentyOneState | null): Promise<boolean> => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const row = useRoomStore.getState().items[item.id];
      if (!row) return false;
      const next = make(upgrade((row.data as { state?: unknown }).state));
      if (!next) return false;
      if (await updateDataIf(item.id, { game: "twentyone", state: strip(next) } as never, row.updated_at)) return true;
      await new Promise((resolve) => window.setTimeout(resolve, 60 + attempt * 80));
    }
    setNotice("somebody else moved first. try that again.");
    return false;
  };

  const run = async (work: () => Promise<unknown>) => {
    if (busy || !canEdit) return;
    setBusy(true);
    try {
      await work();
    } finally {
      setBusy(false);
    }
  };

  const deal = () =>
    run(async () => {
      if (!me) return;
      setPeek(false);
      const next = newRound(live(), label);
      const setup = await pile("pile_setup", { p_item: item.id, p_piles: [{ slot: DECK, cards: deck(), shuffle: true }], p_public: { game: "twentyone", state: strip(next) } });
      if (setup.error) return;
      const hidden = await pile("pile_deal", {
        p_item: item.id,
        p_from: DECK,
        p_targets: SEATS.map((s) => ({ slot: holeSlot(s), owner: holders[s] ?? me.userId, count: 1 })),
      });
      if (hidden.error) return;
      for (const s of SEATS) await pile("pile_reveal", { p_item: item.id, p_slots: [DECK], p_count: 1, p_as: upKey(s, 0) });
      await save((fresh) => (fresh.round === next.round && fresh.shown.a === 0 ? dealt(fresh) : null));
    });

  const hit = (then?: "stand") =>
    run(async () => {
      const seat = state.turn;
      const n = state.shown[seat];
      await pile("pile_reveal", { p_item: item.id, p_slots: [DECK], p_count: 1, p_as: upKey(seat, n) });
      await save((fresh) => {
        if (fresh.phase !== "play" || fresh.turn !== seat || fresh.shown[seat] !== n) return null;
        const next = afterHit(fresh, seat, label);
        return then === "stand" && next.phase === "play" ? afterStand(next, seat, label) : next;
      });
      setPeek(false);
    });

  const stand = () =>
    run(async () => {
      const seat = state.turn;
      await save((fresh) => (fresh.phase === "play" && fresh.turn === seat ? afterStand(fresh, seat, label) : null));
      setPeek(false);
    });

  const double = async () => {
    const seat = state.turn;
    if (busy) return;
    const ok = await save((fresh) => (canDouble(fresh, seat) ? afterDouble(fresh, seat, label) : null));
    if (ok) await hit("stand");
  };

  // At the end, each hidden card is turned over by the device that holds it.
  const turned = useRef(new Set<string>());
  const toTurn = state.phase === "showdown" ? SEATS.filter((s) => holds(s) && !holeCard(state, s)).join(",") : "";
  useEffect(() => {
    if (!toTurn || !canEdit) return;
    for (const s of toTurn.split(",") as Seat[]) {
      const key = `${state.round}:${s}`;
      if (turned.current.has(key)) continue;
      turned.current.add(key);
      void pile("pile_reveal", { p_item: item.id, p_slots: [holeSlot(s)], p_as: holeSlot(s), p_keep: true });
    }
  }, [toTurn, canEdit, state.round, item.id, pile]);

  // With both over, whoever sees it first settles the pot.
  const ready = state.phase === "showdown" && SEATS.every((s) => holeCard(state, s));
  const settleNow = useEffectEvent(() => {
    void save((fresh) => (fresh.phase === "showdown" && SEATS.every((s) => holeCard(fresh, s)) ? settle(fresh, label) : null));
  });
  useEffect(() => {
    if (ready && canEdit) settleNow();
  }, [ready, canEdit]);

  const sit = (s: Seat) => me && void save((fresh) => ({ ...fresh, ...claimChair(fresh.seats, fresh.holders ?? { a: null, b: null }, s, me) }));

  // The player at the bottom is you, if you sit; the one whose go it is, if nobody does.
  const bottom: Seat = myChair ?? (state.phase === "play" ? state.turn : "b");
  const rows: Seat[] = [other(bottom), bottom];
  const over = state.phase === "showdown" || state.phase === "done";

  const headline =
    state.phase === "idle"
      ? t("sit down, then deal")
      : state.phase === "done"
        ? state.matchWinner
          ? t("{who} wins the match", { who: label(state.matchWinner) })
          : state.result?.winner
            ? t("{who} takes the pot", { who: label(state.result.winner) })
            : t("a push -- nobody wins")
        : state.phase === "showdown"
          ? t("turning the cards over...")
          : acting
            ? t("your go: another card, or stand")
            : t("{turn} to play", { turn: label(state.turn) });

  return (
    <div className="surface grain @container relative flex size-full flex-col gap-2 overflow-hidden rounded-2xl p-2.5">
      <div className="flex items-center gap-1.5">
        {SEATS.map((s) => (
          <button
            key={s}
            type="button"
            disabled={!canEdit || !me}
            onClick={() => sit(s)}
            className={clsx(
              "flex min-h-10 min-w-0 flex-1 items-center gap-2 rounded-xl px-2.5 text-left transition",
              state.turn === s && state.phase === "play" ? "bg-white/12 ring-1 ring-glow/45" : "bg-white/5 hover:bg-white/8",
            )}
          >
            <span className={clsx("min-w-0 flex-1 truncate text-[11px]", state.seats[s] ? (s === myChair ? "text-chalk" : "text-muted") : "text-muted/55")}>{label(s)}</span>
            <span className="flex items-center gap-1 text-[11px] font-semibold text-warm tabular-nums">
              <Coins className="size-3.5" />
              {state.chips[s]}
            </span>
          </button>
        ))}
        <button type="button" onClick={() => setRules(true)} aria-label={t("rules")} title={t("rules")} className="grid size-9 shrink-0 place-items-center rounded-lg text-muted hover:bg-white/8 hover:text-chalk">
          <BookOpen className="size-3.5" />
        </button>
      </div>

      <div className="relative flex min-h-0 flex-1 flex-col justify-between gap-2 rounded-xl bg-[radial-gradient(ellipse_at_center,#1f5a3c_0%,#123524_75%)] p-3 inset-ring inset-ring-black/30">
        {state.phase === "idle" ? (
          <div className="grid flex-1 place-items-center">
            <button type="button" disabled={!canEdit || busy} onClick={() => void deal()} className="flex min-h-11 items-center gap-2 rounded-xl bg-[#f7f4ee] px-4 text-[13px] font-semibold text-[#1b1a22] shadow-lg active:scale-95 disabled:opacity-50">
              <Layers className="size-4" />
              {t("deal")}
            </button>
          </div>
        ) : (
          rows.map((s, row) => {
            const ups = upCards(state, s);
            const hole = holeCard(state, s);
            const hidden = (mine[holeSlot(s)] as string[] | undefined)?.[0] ?? null;
            const known = hole ?? (sees(s) ? hidden : null);
            const cards = known ? [known, ...ups] : ups;
            const sum = total(cards);
            const winner = state.phase === "done" && state.result?.winner === s;
            return (
              <div key={s} className="flex items-center justify-center gap-3">
                <div className={clsx("flex min-w-0 flex-wrap items-end justify-center gap-1", row === 0 && "order-2 sm:order-none")}>
                  <Card card={known} down={!known} width={54} />
                  {ups.map((c, i) => (
                    <Card key={`${c}-${i}`} card={c} width={54} fresh={i === ups.length - 1 && i > 0} />
                  ))}
                </div>
                <div className="flex shrink-0 flex-col items-center gap-0.5">
                  <span className={clsx("rounded-lg px-2 py-0.5 text-[16px] font-bold tabular-nums", sum > 21 ? "bg-[#d63a3a]/80 text-white" : winner ? "bg-warm text-ink-950" : "bg-black/35 text-chalk")}>
                    {known ? sum : `? + ${total(ups)}`}
                  </span>
                  <span className="max-w-20 truncate text-[10px] text-chalk/70">{label(s)}</span>
                  {state.stood[s] && !over && <span className="text-[9px] text-chalk/60">{t("stands")}</span>}
                </div>
              </div>
            );
          })
        )}

        {state.phase !== "idle" && (
          <div className="pointer-events-none absolute top-1/2 left-1/2 flex -translate-1/2 items-center gap-1 rounded-full bg-black/35 px-2.5 py-1 text-[12px] font-semibold text-warm">
            <Coins className="size-3.5" />
            {state.stake * 2}
            {state.doubled && <span className="text-[9px] font-normal text-chalk/70">{t("doubled")}</span>}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <p className="min-w-0 flex-1 basis-40 truncate text-[11px] text-muted">
          {headline}
          {state.log.length > 0 && <span className="text-muted/50"> · {t(state.log.at(-1) ?? "")}</span>}
        </p>
        {acting && !myChair && holds(state.turn) && (
          <button type="button" onClick={() => setPeek((v) => !v)} className="flex min-h-9 items-center gap-1 rounded-lg bg-white/8 px-2.5 text-[11px] text-chalk">
            {peek ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
            {peek ? t("hide it") : t("pass the phone to {turn}, then tap to look", { turn: label(state.turn) })}
          </button>
        )}
        {acting && (
          <>
            <button type="button" disabled={busy} onClick={() => void hit()} className="min-h-9 rounded-lg bg-chalk px-3 text-[11px] font-semibold text-ink-950">
              {t("another card")}
            </button>
            <button type="button" disabled={busy} onClick={() => void stand()} className="min-h-9 rounded-lg bg-white/10 px-3 text-[11px] text-chalk">
              {t("stand")}
            </button>
            {canDouble(state, state.turn) && (
              <button type="button" disabled={busy} onClick={() => void double()} className="min-h-9 rounded-lg bg-warm/25 px-3 text-[11px] font-semibold text-warm">
                {t("double")}
              </button>
            )}
          </>
        )}
        {state.phase === "done" && (
          <button type="button" disabled={!canEdit || busy} onClick={() => void deal()} className="min-h-9 rounded-lg bg-chalk px-3 text-[11px] font-semibold text-ink-950">
            {state.matchWinner ? t("new match") : t("next round")}
          </button>
        )}
      </div>

      {rules && (
        <RulesSheet title={t("how twenty-one goes")} onClose={() => setRules(false)}>
          <p>{t("Each round you both get one card face down, which only you can see, and one face up. Get closer to 21 than the other player without going over.")}</p>
          <p>{t("On your go: take another card (it comes face up), stand, or double -- the stake doubles, you take exactly one more card, and stand.")}</p>
          <p>{t("Number cards count their number, pictures count 10, an ace counts 11 or 1, whichever is better. 21 in two cards beats any other 21.")}</p>
          <p>{t("Over 21 on the cards showing and everyone knows you are bust. Over with the hidden card and only you know -- until the cards come over at the end.")}</p>
          <p>{t("Both start with {n} chips and put 1 in each round. The winner of the round takes the pot; run out of chips and the match is over.", { n: 20 })}</p>
        </RulesSheet>
      )}
    </div>
  );
}
