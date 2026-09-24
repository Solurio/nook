"use client";

import { useMemo, useState } from "react";
import clsx from "clsx";
import { BookOpen, Eye, Layers, Megaphone, Minus, Plus, RotateCcw, RotateCw } from "lucide-react";
import { useRoom } from "@/realtime/room-provider";
import { usePiles } from "@/realtime/use-piles";
import { useHandOver } from "@/realtime/use-hand-over";
import { waitForItem } from "@/realtime/wait-for-item";
import { useRoomStore } from "@/state/room-store";
import { chairOf, claimChair } from "@/lib/seats";
import { sizeOf } from "@/lib/piles";
import {
  COLORS,
  COLOR_HEX,
  COLOR_NAME,
  DRAW_PILE,
  HAND_SIZE,
  MAX_SEATS,
  MIN_SEATS,
  afterDraw,
  afterPass,
  afterPlay,
  chairsFor,
  emptyUno,
  fullDeck,
  handSlot,
  isWild,
  openWith,
  playable,
  reshuffle,
  tally,
  type Color,
  type UnoState,
} from "@/lib/uno";
import type { Item } from "@/lib/types";
import UnoCard from "@/components/cards/uno-card";
import RulesSheet from "./rules-sheet";
import { t } from "@/lib/i18n";

/**
 * Uno, round the table. Your hand is yours alone -- a secret pile the
 * database deals and only you can read -- and the draw pile is read by nobody.
 * Everyone sees the discard pile, whose go it is, which way play runs, and how
 * many cards each player is holding, which is all you would see at a table.
 */
export default function Uno({ item, state: raw }: { item: Item<"game">; state: unknown }) {
  const { updateData, pile, canEdit } = useRoom();
  const me = useRoomStore((s) => s.me);
  const state = useMemo(() => ({ ...emptyUno(), ...(raw as Partial<UnoState>) }) as UnoState, [raw]);

  const [busy, setBusy] = useState(false);
  const [wildFor, setWildFor] = useState<string | null>(null);
  const [drawn, setDrawn] = useState<string | null>(null);
  const [rules, setRules] = useState(false);
  const [lookingAt, setLookingAt] = useState<string | null>(null);

  const chairs = chairsFor(state.seatCount);
  const holders = useMemo(() => state.holders ?? {}, [state.holders]);
  const myChair = chairOf(state.seats, holders, me);
  const piles = state.piles;
  const mine = usePiles(item.id, piles);
  useHandOver(item.id, piles, holders);
  const dealt = Boolean(piles && DRAW_PILE in piles) && state.discard.length > 0;
  const winner = state.results[String(state.round)];
  const over = Boolean(winner);

  const turnSlot = handSlot(state.turn);
  const actingHand = (mine[turnSlot] as string[] | undefined) ?? null;
  const myTurn = dealt && !over && actingHand !== null;
  const passedRound = Object.keys(mine).filter((s) => s.startsWith("hand:")).length > 1;
  const shownChair = myChair ?? (myTurn ? state.turn : null);
  const hand = useMemo(
    () => (shownChair ? ((mine[handSlot(shownChair)] as string[] | undefined) ?? []) : []),
    [shownChair, mine],
  );
  const gated = passedRound && !myChair && lookingAt !== state.turn;

  const top = state.discard[0];
  const legal = useMemo(() => {
    if (!myTurn || shownChair !== state.turn) return new Set<string>();
    if (state.color === null) return new Set<string>();
    const options = playable(hand, top, state.color);
    // Having drawn, only the card just drawn may still go down.
    if (state.drew === state.turn) return new Set(drawn && options.includes(drawn) ? [drawn] : []);
    return new Set(options);
  }, [myTurn, shownChair, state.turn, state.color, state.drew, hand, top, drawn]);

  const label = (chair: string) => state.seats[chair] ?? t(`seat ${chairs.indexOf(chair) + 1}`);
  const wins = tally(state.results);
  const drawLeft = sizeOf(piles, DRAW_PILE);

  const strip = (next: UnoState): UnoState => {
    const out = { ...next };
    delete out.piles;
    return out;
  };
  const write = (next: UnoState) => updateData(item.id, { game: "uno", state: strip(next) } as never);

  const run = async (work: () => Promise<unknown>) => {
    if (busy || !canEdit) return;
    setBusy(true);
    try {
      await work();
    } finally {
      setBusy(false);
    }
  };

  /** Makes sure the draw pile has at least `need` cards, reshuffling the discards under if not. */
  const ensureDraw = async (current: UnoState, need: number): Promise<UnoState> => {
    if (sizeOf(piles, DRAW_PILE) >= need || current.discard.length <= 1) return current;
    const { state: next, back } = reshuffle(current);
    await pile("pile_put", {
      p_item: item.id,
      p_to: DRAW_PILE,
      p_cards: back,
      p_shuffle: true,
      p_bottom: true,
      p_public: { game: "uno", state: strip({ ...next, log: [...next.log.slice(-19), "the discards went back under"] }) },
    });
    return next;
  };

  // ---------------------------------------------------------------------------
  // Dealing and opening a round
  // ---------------------------------------------------------------------------

  const deal = () =>
    run(async () => {
      if (!me) return;
      const round = state.round + 1;
      const dealer = chairs[(round - 1) % chairs.length];
      const fresh: UnoState = {
        ...state,
        discard: [],
        color: null,
        turn: dealer,
        direction: 1,
        round,
        called: {},
        exposed: null,
        drew: null,
        dealer,
        log: [`round ${round}: ${label(dealer)} deals`],
      };
      delete fresh.revealed;
      const setup = await pile("pile_setup", {
        p_item: item.id,
        p_piles: [{ slot: DRAW_PILE, cards: fullDeck(), shuffle: true }],
        p_public: { game: "uno", state: strip(fresh) },
      });
      if (setup.error) return;
      const dealtOut = await pile("pile_deal", {
        p_item: item.id,
        p_from: DRAW_PILE,
        p_targets: chairs.map((chair) => ({
          slot: handSlot(chair),
          owner: holders[chair] ?? me.userId,
          count: HAND_SIZE,
        })),
      });
      if (dealtOut.error) return;

      // Turn a card up to start on. A wild draw four goes back and another comes up.
      for (let attempt = 0; attempt < 6; attempt += 1) {
        const turned = await pile("pile_reveal", { p_item: item.id, p_slots: [DRAW_PILE], p_count: 1 });
        if (turned.error) return;
        const card = await waitForItem(item.id, (s) => {
          const shown = (s.revealed as Record<string, string[]> | undefined)?.[DRAW_PILE];
          return shown?.[0] ?? null;
        });
        if (!card) return;
        const live = { ...emptyUno(), ...(useRoomStore.getState().items[item.id]?.data as { state: UnoState }).state };
        const cleared = { ...live, revealed: {} };
        const opened = openWith(cleared, chairs, card);
        if (opened === "again") {
          await pile("pile_put", {
            p_item: item.id,
            p_to: DRAW_PILE,
            p_cards: [card],
            p_shuffle: true,
            p_public: { game: "uno", state: strip(cleared) },
          });
          continue;
        }
        await write(opened.state);
        if (opened.penalty) {
          await pile("pile_move", {
            p_item: item.id,
            p_from: DRAW_PILE,
            p_to: handSlot(opened.penalty.chair),
            p_count: opened.penalty.count,
          });
        }
        return;
      }
    });

  // ---------------------------------------------------------------------------
  // Playing
  // ---------------------------------------------------------------------------

  const play = (card: string, chosen: Color | null) =>
    run(async () => {
      if (!actingHand || !legal.has(card)) return;
      if (isWild(card) && !chosen) {
        setWildFor(card);
        return;
      }
      setWildFor(null);
      const next = afterPlay(state, chairs, card, chosen, actingHand.length - 1, label);
      const taken = await pile("pile_take", {
        p_item: item.id,
        p_from: turnSlot,
        p_cards: [card],
        p_public: { game: "uno", state: strip(next.state) },
      });
      if (taken.error) return;
      setDrawn(null);
      if (next.penalty) {
        const ready = await ensureDraw(next.state, next.penalty.count);
        await pile("pile_move", {
          p_item: item.id,
          p_from: DRAW_PILE,
          p_to: handSlot(next.penalty.chair),
          p_count: next.penalty.count,
          p_public: { game: "uno", state: strip(ready) },
        });
      }
    });

  const draw = () =>
    run(async () => {
      if (!myTurn || state.drew === state.turn) return;
      const ready = await ensureDraw(state, 1);
      const got = await pile<string[]>("pile_draw", {
        p_item: item.id,
        p_from: DRAW_PILE,
        p_to: turnSlot,
        p_count: 1,
        p_public: { game: "uno", state: strip(afterDraw(ready)) },
      });
      const card = got.data?.[0] ?? null;
      setDrawn(card);
      // Nothing to do with it: the turn simply moves on.
      if (card && !playable([card], top, state.color).includes(card)) {
        await write(afterPass(afterDraw(ready), chairs, label));
        setDrawn(null);
      }
    });

  const pass = () =>
    run(async () => {
      await write(afterPass(state, chairs, label));
      setDrawn(null);
    });

  const callUno = (chair: string) =>
    run(() =>
      write({
        ...state,
        called: { ...state.called, [chair]: true },
        exposed: state.exposed === chair ? null : state.exposed,
        log: [...state.log.slice(-19), `${label(chair)}: uno!`],
      }),
    );

  const catchOut = (chair: string) =>
    run(async () => {
      const ready = await ensureDraw(state, 2);
      await pile("pile_move", {
        p_item: item.id,
        p_from: DRAW_PILE,
        p_to: handSlot(chair),
        p_count: 2,
        p_public: {
          game: "uno",
          state: strip({
            ...ready,
            exposed: null,
            log: [...ready.log.slice(-19), `${label(chair)} was caught without calling uno, and draws two`],
          }),
        },
      });
    });

  const chooseOpeningColor = (color: Color) =>
    run(() => write({ ...state, color, log: [...state.log.slice(-19), `${label(state.turn)} calls ${COLOR_NAME[color]}`] }));

  const resize = (by: number) => {
    const count = Math.max(MIN_SEATS, Math.min(MAX_SEATS, state.seatCount + by));
    const keep = chairsFor(count);
    void write({
      ...state,
      seatCount: count,
      seats: Object.fromEntries(keep.map((c) => [c, state.seats[c] ?? null])),
      holders: Object.fromEntries(keep.map((c) => [c, holders[c] ?? null])),
    });
  };

  // ---------------------------------------------------------------------------

  const headline = over
    ? `${label(winner)} is out -- deal again`
    : !dealt
      ? "sit down, then deal"
      : state.color === null
        ? `${label(state.turn)} calls the colour`
        : myTurn && shownChair === state.turn
          ? state.drew === state.turn
            ? "play what you drew, or keep it"
            : "your go"
          : `${label(state.turn)} to play`;

  return (
    <div className="surface grain relative flex size-full flex-col gap-2 overflow-hidden rounded-2xl p-2.5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-muted/70">
        <span className="flex items-center gap-0.5">
          <button type="button" disabled={!canEdit || state.seatCount <= MIN_SEATS} onClick={() => resize(-1)} aria-label={t("one chair fewer")} className="grid size-7 place-items-center rounded disabled:opacity-30">
            <Minus className="size-3" />
          </button>
          <span className="tabular-nums text-chalk">{state.seatCount}</span>{" "}{t("chairs")}<button type="button" disabled={!canEdit || state.seatCount >= MAX_SEATS} onClick={() => resize(1)} aria-label={t("one chair more")} className="grid size-7 place-items-center rounded disabled:opacity-30">
            <Plus className="size-3" />
          </button>
        </span>
        <button type="button" onClick={() => setRules(true)} className="ml-auto flex items-center gap-1 rounded-lg px-1.5 py-1 hover:bg-white/8 hover:text-chalk">
          <BookOpen className="size-3" />{" "}{t("rules")}</button>
      </div>

      {/* Chairs */}
      <div className="flex flex-wrap gap-1.5">
        {chairs.map((chair, i) => {
          const who = state.seats[chair];
          const isMine = chair === myChair;
          const count = sizeOf(piles, handSlot(chair));
          const exposed = state.exposed === chair;
          return (
            <div
              key={chair}
              className={clsx(
                "flex min-h-10 min-w-0 flex-1 basis-28 items-center gap-1.5 rounded-xl px-2 py-1",
                state.turn === chair && dealt && !over ? "bg-white/12 ring-1 ring-glow/45" : "bg-white/5",
              )}
            >
              <button
                type="button"
                disabled={!canEdit || !me}
                onClick={() => me && void write({ ...state, ...claimChair(state.seats, holders, chair, me) })}
                className="min-w-0 flex-1 truncate text-left text-[11px]"
              >
                <span className={who ? (isMine ? "text-chalk" : "text-muted") : "text-muted/50"}>{who ?? t(`seat ${i + 1}`)}</span>
                {(wins[chair] ?? 0) > 0 && <span className="ml-1 text-warm">{wins[chair]}</span>}
              </button>
              {count > 0 && (
                <span className="flex items-center gap-0.5 text-[10px] tabular-nums text-muted">
                  <span className="h-3.5 w-2.5 rounded-[2px] bg-[#1b1a22] ring-1 ring-[#d63a3a]/60" />
                  {count}
                </span>
              )}
              {state.called[chair] && count === 1 && (
                <span className="rounded-full bg-[#d63a3a] px-1.5 text-[9px] font-bold text-white">{t("uno")}</span>
              )}
              {exposed && !isMine && canEdit && (
                <button type="button" onClick={() => void catchOut(chair)} className="rounded-lg bg-warm/25 px-1.5 py-1 text-[10px] font-semibold text-warm">{t("catch!")}</button>
              )}
            </div>
          );
        })}
      </div>

      {/* The middle of the table */}
      <div className="relative flex min-h-0 flex-1 items-center justify-center gap-6 rounded-xl bg-[radial-gradient(ellipse_at_center,#3a2e57_0%,#231c36_70%)] p-3 inset-ring inset-ring-black/30">
        {dealt ? (
          <>
            <button
              type="button"
              disabled={!myTurn || state.drew === state.turn || busy || gated}
              onClick={() => void draw()}
              title={t("draw a card")}
              className="relative transition active:scale-95 disabled:cursor-default"
            >
              <UnoCard card={null} down width={60} />
              <span className="absolute -right-2 -bottom-2 rounded-full bg-ink-950/85 px-1.5 text-[10px] text-chalk tabular-nums ring-1 ring-white/20">
                {drawLeft}
              </span>
            </button>
            <div className="relative">
              {state.discard[1] && (
                <div className="absolute top-1 left-1.5 rotate-[8deg] opacity-70">
                  <UnoCard card={state.discard[1]} width={76} />
                </div>
              )}
              <div className="relative -rotate-2">
                <UnoCard card={top ?? null} width={76} called={state.color} />
              </div>
            </div>
            <div className="flex flex-col items-center gap-1 text-[10px] text-muted">
              {state.direction === 1 ? <RotateCw className="size-5 text-chalk/70" /> : <RotateCcw className="size-5 text-chalk/70" />}
              {state.color && (
                <span className="size-4 rounded-full ring-2 ring-white/40" style={{ background: COLOR_HEX[state.color] }} title={t(COLOR_NAME[state.color])} />
              )}
            </div>
          </>
        ) : (
          <button
            type="button"
            disabled={!canEdit || busy}
            onClick={() => void deal()}
            className="flex min-h-11 items-center gap-2 rounded-xl bg-[#f7f4ee] px-4 text-[13px] font-semibold text-[#1b1a22] shadow-lg active:scale-95 disabled:opacity-50"
          >
            <Layers className="size-4" />{" "}{t("deal seven each")}</button>
        )}

        {/* Calling a colour: for a wild just played, or a round that opened on one */}
        {(wildFor || (dealt && state.color === null && myTurn && shownChair === state.turn && !gated)) && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-xl bg-ink-950/80">
            <p className="text-[12px] text-chalk">{t("call a colour")}</p>
            <div className="grid grid-cols-2 gap-2">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => (wildFor ? void play(wildFor, c) : void chooseOpeningColor(c))}
                  className="size-14 rounded-2xl shadow-lg ring-2 ring-white/30 transition active:scale-95"
                  style={{ background: COLOR_HEX[c] }}
                  aria-label={t(COLOR_NAME[c])}
                />
              ))}
            </div>
            {wildFor && (
              <button type="button" onClick={() => setWildFor(null)} className="text-[11px] text-muted">{t("keep the wild")}</button>
            )}
          </div>
        )}
      </div>

      {/* Your hand */}
      <div className="min-h-[5.5rem]">
        {gated && hand.length > 0 ? (
          <button type="button" onClick={() => setLookingAt(state.turn)} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-white/8 text-[12px] text-chalk">
            <Eye className="size-4" />{" "}{t("pass the phone to {turn}, then tap to look", { turn: label(state.turn) })}</button>
        ) : hand.length > 0 ? (
          <div className="flex gap-1 overflow-x-auto px-1 pt-3 pb-1">
            {hand.map((card, i) => {
              const ok = legal.has(card);
              return (
                <button
                  key={`${card}-${i}`}
                  type="button"
                  disabled={!ok || busy || !canEdit}
                  onClick={() => void play(card, null)}
                  className={clsx(
                    "shrink-0 transition",
                    ok ? "-translate-y-2 hover:-translate-y-3" : "opacity-55",
                    drawn === card && state.drew === state.turn && "ring-2 ring-glow rounded-[9px]",
                  )}
                  aria-label={card}
                >
                  <UnoCard card={card} width={52} />
                </button>
              );
            })}
          </div>
        ) : (
          <p className="pt-6 text-center text-[11px] text-muted/50">
            {myChair ? (dealt ? t("no cards") : t("waiting for the deal")) : t("sit down to be dealt in")}
          </p>
        )}
      </div>

      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 truncate text-[11px] text-muted">
          {t(headline)}
          <span className="text-muted/50"> · {t(state.log.at(-1) ?? "")}</span>
        </p>
        {myTurn && shownChair === state.turn && hand.length === 2 && !state.called[state.turn] && (
          <button type="button" onClick={() => void callUno(state.turn)} className="flex min-h-9 items-center gap-1 rounded-lg bg-[#d63a3a] px-2.5 text-[11px] font-bold text-white">
            <Megaphone className="size-3.5" />{" "}{t("uno!")}</button>
        )}
        {myChair && state.exposed === myChair && (
          <button type="button" onClick={() => void callUno(myChair)} className="flex min-h-9 items-center gap-1 rounded-lg bg-[#d63a3a] px-2.5 text-[11px] font-bold text-white">
            <Megaphone className="size-3.5" />{" "}{t("uno!")}</button>
        )}
        {myTurn && state.drew === state.turn && (
          <button type="button" onClick={() => void pass()} className="min-h-9 rounded-lg bg-white/8 px-2.5 text-[11px] text-chalk">{t("keep it")}</button>
        )}
        <button type="button" disabled={!canEdit || busy} onClick={() => void deal()} aria-label={t("deal a new round")} title={t("deal a new round")} className="grid size-9 place-items-center rounded-lg text-muted hover:bg-white/8 hover:text-chalk disabled:opacity-40">
          <RotateCcw className="size-3.5" />
        </button>
      </div>

      {rules && (
        <RulesSheet title={t("how uno goes")} onClose={() => setRules(false)}>
          <p>{t("Everyone starts with seven. On your go, put down a card that matches the one on top of the pile, by")}{" "}<b>{t("colour")}</b>{" "}{t("or by")}{" "}<b>{t("number or symbol")}</b>. A <b>{t("wild")}</b>{" "}{t("goes on anything and you call the colour that follows.")}</p>
          <p>{t("Nothing you can play, or would rather not?")}{" "}<b>{t("Draw one")}</b>. If it fits you may put it straight
            down; otherwise play moves on.
          </p>
          <h4>{t("the special cards")}</h4>
          <p>
            <b>{t("Skip")}</b>{" "}{t("-- the next player misses their go.")}{" "}<b>{t("Reverse")}</b>{" "}{t("-- play turns round (with two players, it is a skip).")}{" "}<b>{t("Draw two")}</b>{" "}{t("-- the next player draws two and misses their go.")}</p>
          <p>
            <b>{t("Wild draw four")}</b>{" "}{t("-- call a colour; the next player draws four and misses their go. You may only play it when you hold nothing of the colour in play.")}</p>
          <h4>{t("uno")}</h4>
          <p>{t("When you are about to go down to one card, press")}{" "}<b>{t("uno!")}</b>{" "}{t("first. Get down to one without calling it and anyone can")}{" "}<b>{t("catch")}</b>{" "}{t("you before the next card is played: you draw two.")}</p>
          <p>{t("The first to get rid of every card takes the round. The dealer moves one chair along each round.")}</p>
          <p className="text-muted/60">{t("Your hand is private to you -- not hidden on screen, but never sent to anyone else at all.")}</p>
        </RulesSheet>
      )}
    </div>
  );
}
