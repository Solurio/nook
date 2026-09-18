"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { BookOpen, Eye, EyeOff, Heart, Minus, Plus, Skull, Star } from "lucide-react";
import { useRoom } from "@/realtime/room-provider";
import { usePiles } from "@/realtime/use-piles";
import { useHandOver } from "@/realtime/use-hand-over";
import { useRoomStore } from "@/state/room-store";
import { chairOf, claimChair } from "@/lib/seats";
import { sizeOf } from "@/lib/piles";
import { randomBelow } from "@/lib/dice";
import {
  CARD_TEXT,
  CARD_TITLE,
  CHARACTERS,
  DECK,
  DECK_PILE,
  LIMBO,
  MAX_SEATS,
  MIN_SEATS,
  ROLE_GOAL,
  ROLE_NAME,
  ROLES_PILE,
  SUIT_MARK,
  alive,
  answerWithBang,
  canDrinkToLive,
  chairsFor,
  checkCount,
  checkKey,
  checked,
  checksDue,
  distance,
  dodge,
  drinkToLive,
  emptyBang,
  endTurn,
  fall,
  handSlot,
  info,
  isBlue,
  limboKey,
  mustDiscard,
  nameOf,
  play,
  playable,
  reach,
  roleSlot,
  sidHeals,
  startCheck,
  startGame,
  storeKey,
  storeLeft,
  takeIt,
  targetsFor,
  toDraw,
  toMain,
  tookFromStore,
  vultureFor,
  waitingOn,
  type BangState,
  type Effect,
  type Role,
} from "@/lib/bang";
import type { Item } from "@/lib/types";
import RulesSheet from "./rules-sheet";

const WINNER_TEXT = { sheriff: "the law wins", outlaws: "the Outlaws win", renegade: "the Renegade wins" } as const;

/** A card as it lies on the table: its name, and the suit and value draw! reads. */
function Card({
  id,
  onClick,
  active,
  dim,
  small,
}: {
  id: string;
  onClick?: () => void;
  active?: boolean;
  dim?: boolean;
  small?: boolean;
}) {
  const c = info(id);
  const red = c.suit === "H" || c.suit === "D";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      title={`${CARD_TITLE[c.name]}: ${CARD_TEXT[c.name]}`}
      className={clsx(
        "relative flex shrink-0 flex-col justify-between rounded-md border-2 bg-[#f3e6c8] text-left text-ink-950 shadow-[0_2px_4px_rgba(0,0,0,0.4)] transition disabled:cursor-default",
        small ? "h-10 w-8 p-0.5" : "h-[4.6rem] w-[3.3rem] p-1",
        isBlue(id) ? "border-[#4a78b8]" : "border-[#8a5a2b]",
        active && "-translate-y-1.5 ring-2 ring-warm",
        dim && "opacity-45",
        onClick && !dim && "hover:-translate-y-0.5",
      )}
    >
      <span className={clsx("font-bold leading-none", small ? "text-[6px]" : "text-[8px]", red ? "text-[#b3261e]" : "text-ink-950")}>
        {c.rank}
        {SUIT_MARK[c.suit]}
      </span>
      <span className={clsx("leading-tight font-bold", small ? "text-[6.5px]" : "text-[9px]")}>{CARD_TITLE[c.name]}</span>
    </button>
  );
}

/**
 * BANG!, round a table of four to seven. The Sheriff's star is out in the
 * open; every other role is known only to whoever holds it, until they die.
 * Hands are private, the deck unread, and everything in front of a player --
 * guns, horses, barrels, jail, dynamite -- is on show.
 */
export default function Bang({ item, state: raw }: { item: Item<"game">; state: unknown }) {
  const { updateData, pile, canEdit } = useRoom();
  const me = useRoomStore((s) => s.me);
  const state = useMemo(() => ({ ...emptyBang(), ...(raw as Partial<BangState>) }) as BangState, [raw]);
  const [busy, setBusy] = useState(false);
  const [manual, setManual] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const [chosen, setChosen] = useState<string[]>([]);
  const [looking, setLooking] = useState<string | null>(null);

  const chairs = chairsFor(state.seatCount);
  const holders = useMemo(() => state.holders ?? {}, [state.holders]);
  const myChair = chairOf(state.seats, holders, me);
  const piles = state.piles;
  const mine = usePiles(item.id, piles);
  useHandOver(item.id, piles, holders);

  const label = (chair: string) => state.seats[chair] ?? `seat ${chairs.indexOf(chair) + 1}`;
  const handOf = (chair: string) => (mine[handSlot(chair)] as string[] | undefined) ?? null;
  const owns = (chair: string) => handOf(chair) !== null;
  const playing = state.phase === "play";
  const ownedChairs = state.order.filter(owns);

  const clean = (s: BangState): BangState => {
    const out = { ...s } as BangState & Record<string, unknown>;
    delete out.piles;
    delete out.revealed;
    return out;
  };
  const write = (s: BangState) => updateData(item.id, { game: "bang", state: clean(s) } as never);
  const pub = (s: BangState) => ({ game: "bang", state: clean(s) });
  const latest = (): BangState => {
    const data = useRoomStore.getState().items[item.id]?.data as { state?: BangState } | undefined;
    return { ...emptyBang(), ...(data?.state ?? state) };
  };
  const run = async (work: () => Promise<unknown>) => {
    if (busy || !canEdit) return;
    setBusy(true);
    try {
      await work();
    } finally {
      setBusy(false);
      setPicked(null);
      setChosen([]);
    }
  };
  /** Waits for something the database is about to publish. */
  const until = async <T,>(read: (s: BangState) => T | null | undefined, tries = 25): Promise<T | null> => {
    for (let i = 0; i < tries; i += 1) {
      const found = read(latest());
      if (found) return found;
      await new Promise((r) => window.setTimeout(r, 200));
    }
    return null;
  };

  /** Makes sure the deck has at least `need` cards, shuffling the discards under if not. */
  const ensureDeck = async (need: number) => {
    const now = latest();
    if (sizeOf(now.piles, DECK_PILE) >= need || now.discard.length <= 1) return;
    const [top, ...rest] = now.discard;
    await pile("pile_put", {
      p_item: item.id,
      p_to: DECK_PILE,
      p_cards: rest,
      p_shuffle: true,
      p_public: pub({ ...now, discard: [top], log: [...now.log.slice(-30), "the discards are shuffled back in"] }),
    });
  };

  const draw = async (chair: string, count: number, publicState?: BangState) => {
    if (count <= 0) return;
    await ensureDeck(count);
    await pile("pile_draw", {
      p_item: item.id,
      p_from: DECK_PILE,
      p_to: handSlot(chair),
      p_count: count,
      ...(publicState ? { p_public: pub(publicState) } : {}),
    });
  };

  // ---------------------------------------------------------------------------
  // Dealing
  // ---------------------------------------------------------------------------

  const deal = () =>
    run(async () => {
      if (!me) return;
      const seated = chairs;
      const game = startGame(clean(state), seated, randomBelow, label);
      const set = await pile("pile_setup", {
        p_item: item.id,
        p_piles: [
          { slot: ROLES_PILE, cards: game.otherRoles, shuffle: true },
          { slot: DECK_PILE, cards: DECK, shuffle: true },
        ],
        p_public: pub(game.state),
      });
      if (set.error) return;
      await pile("pile_deal", {
        p_item: item.id,
        p_from: ROLES_PILE,
        p_targets: seated.filter((c) => c !== game.sheriff).map((c) => ({ slot: roleSlot(c), owner: holders[c] ?? me.userId, count: 1 })),
      });
      await pile("pile_deal", {
        p_item: item.id,
        p_from: DECK_PILE,
        p_targets: seated.map((c) => ({ slot: handSlot(c), owner: holders[c] ?? me.userId, count: game.hands[c] })),
      });
    });

  // ---------------------------------------------------------------------------
  // The start of a turn, run by whoever holds that hand
  // ---------------------------------------------------------------------------

  /** Turns up the cards for the draw! in progress. */
  const turnOver = async (s: BangState) => {
    if (!s.check) return;
    const n = checkCount(s, s.check.who);
    await ensureDeck(n);
    await pile("pile_reveal", { p_item: item.id, p_slots: [DECK_PILE], p_count: n, p_as: checkKey(s.check.n) });
  };

  const turnKey =
    playing && owns(state.turn) && !state.pending && !state.check && state.step === "checks"
      ? `${state.round}:${state.counter}:${state.turn}:${checksDue(state).join(",")}`
      : "";
  const started = useRef("");
  useEffect(() => {
    if (!turnKey || started.current === turnKey) return;
    started.current = turnKey;
    void (async () => {
      const now = latest();
      const due = checksDue(now);
      if (due.length === 0) {
        await write(toDraw(now));
        return;
      }
      const withCheck = startCheck(now, due[0], now.turn);
      await write(withCheck);
      await turnOver(withCheck);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turnKey]);

  // A draw! whose cards are showing is settled by the device holding that hand.
  const checkCards = state.check ? (state.revealed?.[checkKey(state.check.n)] as string[] | undefined) : undefined;
  const settleKey = state.check && checkCards && owns(state.check.who) ? `${state.check.n}` : "";
  const settled = useRef("");
  useEffect(() => {
    if (!settleKey || settled.current === settleKey) return;
    settled.current = settleKey;
    void (async () => {
      const now = latest();
      const c = now.check;
      const cards = c ? (now.revealed?.[checkKey(c.n)] as string[] | undefined) : undefined;
      if (!c || !cards) return;
      const after = checked(now, cards, label);
      if (c.why === "blackjack") {
        // A red second card and Black Jack draws one more.
        const red = info(cards[0]).suit === "H" || info(cards[0]).suit === "D";
        await write(after);
        if (red) await draw(c.who, 1, toMain(latest(), label, "draws three"));
        else await write(toMain(latest(), label));
        return;
      }
      await write(after);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settleKey]);

  // Debts: cards owed to a hand this device holds.
  const owedKey = state.owed.filter((o) => owns(o.to)).map((o, i) => `${i}:${o.to}:${o.draw ?? ""}:${o.from ?? ""}:${o.discardAll ?? ""}`).join("|");
  const paying = useRef("");
  useEffect(() => {
    if (!owedKey || paying.current === owedKey) return;
    paying.current = owedKey;
    void (async () => {
      const now = latest();
      const debt = now.owed.find((o) => owns(o.to));
      if (!debt) return;
      const rest = now.owed.filter((o) => o !== debt);
      const who = debt.to;
      if (now.players[who]?.dead) {
        await write({ ...now, owed: rest });
        return;
      }
      if (debt.discardAll) {
        const hand = handOf(who) ?? [];
        const gone = [...now.players[who].inPlay, ...hand];
        const next = {
          ...now,
          owed: rest,
          discard: [...gone, ...now.discard],
          players: { ...now.players, [who]: { ...now.players[who], inPlay: [] } },
        };
        if (hand.length) await pile("pile_take", { p_item: item.id, p_from: handSlot(who), p_cards: hand, p_public: pub(next) });
        else await write(next);
        return;
      }
      if (debt.from && debt.blind) {
        await pile("pile_move", { p_item: item.id, p_from: handSlot(debt.from), p_to: handSlot(who), p_random: true, p_count: debt.blind });
        await write({ ...latest(), owed: rest });
        return;
      }
      await draw(who, debt.draw ?? 0, { ...now, owed: rest });
      if (!debt.draw) await write({ ...latest(), owed: rest });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owedKey]);

  // Suzy Lafayette draws the moment her hand is empty.
  const suzy = state.order.find((c) => state.players[c]?.character === "suzy" && !state.players[c].dead && owns(c));
  const suzyKey = playing && suzy && (handOf(suzy)?.length ?? 1) === 0 && !state.pending ? `${state.round}:${state.counter}:${state.log.length}` : "";
  const suzyDrew = useRef("");
  useEffect(() => {
    if (!suzyKey || !suzy || suzyDrew.current === suzyKey) return;
    suzyDrew.current = suzyKey;
    void draw(suzy, 1, { ...latest(), log: [...latest().log.slice(-30), "Suzy Lafayette draws a card"] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suzyKey]);

  // ---------------------------------------------------------------------------
  // Drawing
  // ---------------------------------------------------------------------------

  const turnChar = state.players[state.turn]?.character;

  const drawTwo = () =>
    run(async () => {
      const now = latest();
      if (turnChar === "kit") {
        await draw(now.turn, 3, { ...now, kitBack: true });
        return;
      }
      if (turnChar === "blackjack") {
        await draw(now.turn, 2);
        // The second card drawn sits under the first, on top of the hand.
        const shown = startCheck(latest(), "blackjack", now.turn);
        await write(shown);
        await pile("pile_reveal", { p_item: item.id, p_slots: [handSlot(now.turn)], p_at: 1, p_keep: true, p_as: checkKey(shown.check?.n ?? 0) });
        return;
      }
      await draw(now.turn, 2, toMain(now, label));
    });

  const jesseDraws = (from: string) =>
    run(async () => {
      const now = latest();
      await pile("pile_move", { p_item: item.id, p_from: handSlot(from), p_to: handSlot(now.turn), p_random: true, p_count: 1 });
      await draw(now.turn, 1, toMain(latest(), label, `takes a card from ${label(from)} and draws one`));
    });

  const pedroDraws = () =>
    run(async () => {
      const now = latest();
      const [top, ...rest] = now.discard;
      if (!top) return;
      await pile("pile_put", { p_item: item.id, p_to: handSlot(now.turn), p_cards: [top], p_public: pub({ ...now, discard: rest }) });
      await draw(now.turn, 1, toMain(latest(), label, "takes the top discard and draws one"));
    });

  const kitPutsBack = (card: string) =>
    run(async () => {
      const now = latest();
      await pile("pile_move", {
        p_item: item.id,
        p_from: handSlot(now.turn),
        p_to: DECK_PILE,
        p_cards: [card],
        p_public: pub(toMain({ ...now, kitBack: false }, label, "draws three and puts one back")),
      });
    });

  // ---------------------------------------------------------------------------
  // Playing a card
  // ---------------------------------------------------------------------------

  const afterEffect = async (effect: Effect | undefined, by: string, target: string | null) => {
    if (!effect) return;
    if (effect.draw) await draw(by, effect.draw);
    if (effect.store) {
      const now = latest();
      const p = now.pending;
      if (p?.kind === "store") {
        await ensureDeck(effect.store);
        await pile("pile_reveal", { p_item: item.id, p_slots: [DECK_PILE], p_count: effect.store, p_as: storeKey(p.n) });
      }
    }
    if (effect.blind && target) {
      if (effect.blind.to === "hand") {
        await pile("pile_move", { p_item: item.id, p_from: handSlot(effect.blind.from), p_to: handSlot(by), p_random: true, p_count: 1 });
      } else {
        const n = latest().counter + 1;
        await write({ ...latest(), counter: n });
        await pile("pile_move", { p_item: item.id, p_from: handSlot(effect.blind.from), p_to: LIMBO, p_random: true, p_count: 1 });
        await pile("pile_reveal", { p_item: item.id, p_slots: [LIMBO], p_as: limboKey(n) });
        const card = await until((s) => (s.revealed?.[limboKey(n)] as string[] | undefined)?.[0]);
        if (card) await write({ ...latest(), discard: [card, ...latest().discard] });
      }
    }
  };

  const playCard = (card: string, target: string | null, pick?: string) =>
    run(async () => {
      const now = latest();
      const by = now.turn;
      const done = play(now, by, card, target, label, pick);
      const took = await pile("pile_take", { p_item: item.id, p_from: handSlot(by), p_cards: [card], p_public: pub(done.state) });
      if (took.error) return;
      // Panic! on a card in front of someone: it comes into your hand.
      if (pick && nameOf(card) === "panic") await pile("pile_put", { p_item: item.id, p_to: handSlot(by), p_cards: [pick] });
      await afterEffect(done.effect, by, target);
    });

  const discardAndEnd = () =>
    run(async () => {
      const now = latest();
      const hand = handOf(now.turn) ?? [];
      const over = mustDiscard(now, hand.length);
      if (chosen.length !== over) return;
      const next = endTurn({ ...now, discard: [...chosen, ...now.discard] }, label);
      if (over > 0) await pile("pile_take", { p_item: item.id, p_from: handSlot(now.turn), p_cards: chosen, p_public: pub(next) });
      else await write(next);
    });

  // ---------------------------------------------------------------------------
  // Answering
  // ---------------------------------------------------------------------------

  const answering = waitingOn(state);

  const spendCard = (card: string, next: BangState) =>
    run(async () => {
      if (!answering) return;
      await pile("pile_take", { p_item: item.id, p_from: handSlot(answering), p_cards: [card], p_public: pub(next) });
    });

  const tryBarrel = () =>
    run(async () => {
      if (!answering) return;
      const s = startCheck(latest(), "barrel", answering);
      await write(s);
      await turnOver(s);
    });

  const takeFromStore = (card: string) =>
    run(async () => {
      if (!answering) return;
      await pile("pile_put", { p_item: item.id, p_to: handSlot(answering), p_cards: [card], p_public: pub(tookFromStore(latest(), card, label)) });
    });

  const fallDown = () =>
    run(async () => {
      const now = latest();
      const p = now.pending;
      if (!p || p.kind !== "dying") return;
      const who = p.who;
      let role: Role | undefined = now.players[who].role;
      if (!role) {
        await pile("pile_reveal", { p_item: item.id, p_slots: [roleSlot(who)], p_keep: true });
        role = (await until((s) => (s.revealed?.[roleSlot(who)] as Role[] | undefined)?.[0])) ?? undefined;
      }
      if (!role) return;
      const hand = handOf(who) ?? [];
      const vulture = vultureFor(now, who);
      const next = fall(latest(), role, hand, label);
      if (vulture) {
        const inPlay = now.players[who].inPlay;
        if (inPlay.length) await pile("pile_put", { p_item: item.id, p_to: handSlot(who), p_cards: inPlay });
        const total = hand.length + inPlay.length;
        if (total) await pile("pile_move", { p_item: item.id, p_from: handSlot(who), p_to: handSlot(vulture), p_count: total, p_public: pub(next) });
        else await write(next);
      } else if (hand.length) {
        await pile("pile_take", { p_item: item.id, p_from: handSlot(who), p_cards: hand, p_public: pub(next) });
      } else {
        await write(next);
      }
    });

  const sidTrade = (who: string) =>
    run(async () => {
      if (chosen.length !== 2) return;
      await pile("pile_take", { p_item: item.id, p_from: handSlot(who), p_cards: chosen, p_public: pub(sidHeals(latest(), who, chosen, label)) });
    });

  // At the end, each role is turned over by whoever holds it.
  const endKey = state.phase === "over" ? ownedChairs.filter((c) => !state.players[c]?.role && !state.revealed?.[roleSlot(c)]).join(",") : "";
  const unmasked = useRef("");
  useEffect(() => {
    if (!endKey || unmasked.current === endKey) return;
    unmasked.current = endKey;
    void pile("pile_reveal", { p_item: item.id, p_slots: endKey.split(","), p_keep: true }, { quiet: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endKey]);

  // ---------------------------------------------------------------------------
  // What to show
  // ---------------------------------------------------------------------------

  const roleOf = (chair: string): Role | undefined =>
    state.players[chair]?.role ?? (state.revealed?.[roleSlot(chair)] as Role[] | undefined)?.[0] ?? (mine[roleSlot(chair)] as Role[] | undefined)?.[0];

  // Whose hand this screen shows: the one being waited on, if held here; the
  // turn's, if held here; otherwise your own.
  const shownChair =
    (answering && owns(answering) ? answering : null) ?? (owns(state.turn) ? state.turn : null) ?? (myChair && owns(myChair) ? myChair : ownedChairs[0] ?? null);
  const gated = ownedChairs.length > 1 && shownChair !== myChair && looking !== shownChair;
  const hand = shownChair ? (handOf(shownChair) ?? []) : [];
  const myTurn = playing && owns(state.turn) && shownChair === state.turn && !state.pending && !state.check;
  const pickedTargets = picked ? targetsFor(state, state.turn, picked) : null;
  const over = myTurn && state.step === "main" ? mustDiscard(state, hand.length) : 0;
  const store = state.pending?.kind === "store" ? storeLeft(state) : [];

  const prompt = (() => {
    const p = state.pending;
    if (state.check) return `${label(state.check.who)} draws! for ${state.check.why === "blackjack" ? "Black Jack" : `the ${state.check.why}`}`;
    if (!p) return null;
    switch (p.kind) {
      case "shot":
        return `${label(p.targets[0])}: ${p.card === "gatling" ? "the Gatling" : `${label(p.from)}'s BANG!`}${p.need > 1 ? ` (needs ${p.need - p.got} Missed!)` : ""}`;
      case "indians":
        return `${label(p.targets[0])}: Indians!`;
      case "duel":
        return `duel: ${label(p.turnOf)} to fire back`;
      case "store":
        return `general store: ${label(p.order[0])} picks`;
      case "dying":
        return `${label(p.who)} is at death's door`;
    }
  })();

  const button = "min-h-9 rounded-lg px-2.5 text-[11px] font-medium transition disabled:opacity-40";

  return (
    <div className="surface grain relative flex size-full flex-col gap-2 overflow-hidden rounded-2xl p-2.5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-muted/70">
        <span className="flex items-center gap-0.5">
          <button type="button" disabled={!canEdit || playing || state.seatCount <= MIN_SEATS} onClick={() => void write({ ...state, seatCount: state.seatCount - 1 })} aria-label="one chair fewer" className="grid size-7 place-items-center rounded hover:bg-white/10 disabled:opacity-30">
            <Minus className="size-3" strokeWidth={2.6} />
          </button>
          <span className="tabular-nums text-chalk">{state.seatCount}</span> chairs
          <button type="button" disabled={!canEdit || playing || state.seatCount >= MAX_SEATS} onClick={() => void write({ ...state, seatCount: state.seatCount + 1 })} aria-label="one chair more" className="grid size-7 place-items-center rounded hover:bg-white/10 disabled:opacity-30">
            <Plus className="size-3" strokeWidth={2.6} />
          </button>
        </span>
        {playing && (
          <span>
            <span className="tabular-nums text-chalk">{sizeOf(piles, DECK_PILE)}</span> in the deck
          </span>
        )}
        <button type="button" onClick={() => setManual(true)} className="ml-auto flex min-h-8 items-center gap-1 rounded-lg px-1.5 hover:bg-white/8 hover:text-chalk">
          <BookOpen className="size-3" /> rules
        </button>
      </div>

      {/* Round the table */}
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
        {chairs.map((chair, index) => {
          const p = state.players[chair];
          const role = roleOf(chair);
          const isTurn = playing && state.turn === chair;
          const d = playing && shownChair && shownChair !== chair && p && !p.dead ? distance(state, shownChair, chair) : null;
          const aimable = Boolean(picked && pickedTargets?.includes(chair));
          return (
            <div
              key={chair}
              className={clsx(
                "flex min-w-0 flex-col gap-0.5 rounded-xl p-1.5 transition",
                p?.dead ? "bg-white/3 opacity-50" : isTurn ? "bg-white/10 ring-1 ring-warm/50" : "bg-white/5",
                aimable && "ring-2 ring-[#e0655c]",
              )}
            >
              <button
                type="button"
                disabled={!canEdit || !me || playing}
                onClick={() => me && void write({ ...state, ...claimChair(state.seats, holders, chair, me) })}
                className="flex min-h-6 items-center gap-1 text-left text-[11px] disabled:cursor-default"
              >
                {role === "sheriff" && <Star className="size-3 shrink-0 fill-warm text-warm" />}
                {p?.dead && <Skull className="size-3 shrink-0 text-muted" />}
                <span className={clsx("min-w-0 flex-1 truncate", chair === myChair ? "text-chalk" : "text-muted")}>
                  {state.seats[chair] ?? <span className="text-muted/50">seat {index + 1}</span>}
                </span>
                {d !== null && <span className="shrink-0 text-[9px] text-muted/60" title="distance">{d}</span>}
              </button>
              {p && (
                <>
                  <p className="truncate text-[10px] text-glow/80" title={CHARACTERS[p.character].text}>
                    {CHARACTERS[p.character].name}
                    {role && role !== "sheriff" && (p.dead || state.phase === "over" || chair === myChair) ? <span className="text-muted"> · {ROLE_NAME[role]}</span> : null}
                  </p>
                  <div className="flex items-center gap-1">
                    <span className="flex flex-wrap" aria-label={`${p.life} of ${p.max} lives`}>
                      {Array.from({ length: p.max }, (_, i) => (
                        <Heart key={i} className={clsx("size-2.5", i < p.life ? "fill-[#e0655c] text-[#e0655c]" : "text-white/15")} />
                      ))}
                    </span>
                    <span className="ml-auto text-[9px] tabular-nums text-muted/70">{sizeOf(piles, handSlot(chair))} in hand</span>
                  </div>
                  {p.inPlay.length > 0 && (
                    <div className="flex flex-wrap gap-0.5">
                      {p.inPlay.map((id) => (
                        <Card
                          key={id}
                          id={id}
                          small
                          onClick={
                            picked && aimable && (nameOf(picked) === "panic" || nameOf(picked) === "catbalou")
                              ? () => void playCard(picked, chair, id)
                              : undefined
                          }
                        />
                      ))}
                    </div>
                  )}
                  {aimable && (
                    <button type="button" disabled={busy} onClick={() => void playCard(picked as string, chair)} className={clsx(button, "mt-0.5 bg-[#e0655c]/20 text-[#f2a4b8]")}>
                      {nameOf(picked as string) === "panic" || nameOf(picked as string) === "catbalou" ? "blind from the hand" : "this one"}
                    </button>
                  )}
                  {myTurn && state.step === "draw" && turnChar === "jesse" && chair !== state.turn && !p.dead && sizeOf(piles, handSlot(chair)) > 0 && (
                    <button type="button" disabled={busy} onClick={() => void jesseDraws(chair)} className={clsx(button, "mt-0.5 bg-white/8 text-chalk")}>
                      take from them
                    </button>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>

      {/* The middle of the table */}
      <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto rounded-xl bg-[radial-gradient(ellipse_at_center,#3a2a1f_0%,#1c1512_85%)] p-2 inset-ring inset-ring-white/6">
        {!playing ? (
          <div className="my-auto flex flex-col items-center gap-2 text-center">
            {state.winner && <p className="text-sm font-semibold text-warm">{WINNER_TEXT[state.winner]}</p>}
            <p className="text-[11px] text-muted/70">four to seven chairs; empty ones play from whoever deals</p>
            <button type="button" disabled={!canEdit || busy} onClick={() => void deal()} className="min-h-10 rounded-xl bg-chalk px-4 text-[12px] font-semibold text-ink-950 disabled:opacity-40">
              {state.winner ? "deal again" : "deal"}
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2">
              {state.discard[0] ? <Card id={state.discard[0]} small /> : <span className="h-10 w-8 rounded-md border border-dashed border-white/15" />}
              <p className="min-w-0 flex-1 text-[11px] text-chalk">{prompt ?? `${label(state.turn)}'s turn`}</p>
            </div>
            {store.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {store.map((id) => (
                  <Card key={id} id={id} onClick={answering && owns(answering) && !busy ? () => void takeFromStore(id) : undefined} />
                ))}
              </div>
            )}
            <p className="truncate text-[10px] text-muted/60">{state.log.at(-1)}</p>
          </>
        )}
      </div>

      {/* The hand on this screen */}
      {playing && shownChair && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2 text-[10px] text-muted/70">
            <span>
              {shownChair === myChair ? "your hand" : `${label(shownChair)}'s hand`}
              {roleOf(shownChair) && !gated && <> · you are the <b className="text-chalk">{ROLE_NAME[roleOf(shownChair) as Role]}</b></>}
            </span>
            {ownedChairs.length > 1 && shownChair !== myChair && (
              <button type="button" onClick={() => setLooking(gated ? shownChair : null)} className="ml-auto flex min-h-8 items-center gap-1 rounded-lg px-2 text-chalk">
                {gated ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
                {gated ? `pass it to ${label(shownChair)}, then look` : "hide"}
              </button>
            )}
          </div>
          {!gated && (
            <>
              {roleOf(shownChair) && <p className="text-[10px] text-muted/60">goal: {ROLE_GOAL[roleOf(shownChair) as Role]}</p>}
              <div className="flex gap-1 overflow-x-auto pb-1">
                {hand.map((id) => {
                  const canPlay = myTurn && state.step === "main" && !state.kitBack && over === 0 && playable(state, state.turn, id);
                  const discarding = myTurn && (over > 0 || state.kitBack);
                  const answeringHere = answering === shownChair && owns(shownChair);
                  return (
                    <Card
                      key={id}
                      id={id}
                      active={picked === id || chosen.includes(id)}
                      dim={!canPlay && !discarding && !answeringHere}
                      onClick={
                        busy
                          ? undefined
                          : state.kitBack && myTurn
                            ? () => void kitPutsBack(id)
                            : discarding || (answeringHere && state.pending?.kind === "dying")
                              ? () => setChosen((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]))
                              : canPlay
                                ? () => {
                                    const aimed = targetsFor(state, state.turn, id);
                                    if (aimed) setPicked(picked === id ? null : id);
                                    else void playCard(id, null);
                                  }
                                : undefined
                      }
                    />
                  );
                })}
              </div>

              {/* Your move */}
              <div className="flex flex-wrap gap-1">
                {myTurn && state.step === "draw" && (
                  <>
                    <button type="button" disabled={busy} onClick={() => void drawTwo()} className={clsx(button, "bg-chalk text-ink-950")}>
                      {turnChar === "kit" ? "draw three" : "draw two"}
                    </button>
                    {turnChar === "pedro" && state.discard.length > 0 && (
                      <button type="button" disabled={busy} onClick={() => void pedroDraws()} className={clsx(button, "bg-white/8 text-chalk")}>
                        first from the discards
                      </button>
                    )}
                    {turnChar === "jesse" && <span className="self-center text-[10px] text-muted/60">or take the first from someone above</span>}
                  </>
                )}
                {myTurn && state.kitBack && <span className="self-center text-[11px] text-warm">tap a card to put it back on the deck</span>}
                {myTurn && state.step === "main" && !state.kitBack && (
                  <>
                    {picked && <span className="self-center text-[11px] text-warm">now pick who, above</span>}
                    {over > 0 ? (
                      <button type="button" disabled={busy || chosen.length !== over} onClick={() => void discardAndEnd()} className={clsx(button, "bg-chalk text-ink-950")}>
                        throw away {over} and end the turn ({chosen.length}/{over})
                      </button>
                    ) : (
                      <button type="button" disabled={busy} onClick={() => void discardAndEnd()} className={clsx(button, "ml-auto bg-white/10 text-chalk")}>
                        end the turn
                      </button>
                    )}
                  </>
                )}

                {/* Answering */}
                {answering === shownChair && owns(shownChair) && state.pending && !state.check && (() => {
                  const p = state.pending;
                  const calamity = state.players[shownChair].character === "calamity";
                  if (p.kind === "shot") {
                    const dodgers = hand.filter((id) => nameOf(id) === "missed" || (calamity && nameOf(id) === "bang"));
                    const barrel = (state.players[shownChair].inPlay.some((id) => nameOf(id) === "barrel") || state.players[shownChair].character === "jourdonnais") && !p.barrel;
                    return (
                      <>
                        {dodgers.slice(0, 1).map((id) => (
                          <button key={id} type="button" disabled={busy} onClick={() => void spendCard(id, dodge(latest(), label, id))} className={clsx(button, "bg-chalk text-ink-950")}>
                            play {CARD_TITLE[nameOf(id)]}
                          </button>
                        ))}
                        {barrel && (
                          <button type="button" disabled={busy} onClick={() => void tryBarrel()} className={clsx(button, "bg-[#4a78b8]/30 text-chalk")}>
                            try the barrel
                          </button>
                        )}
                        <button type="button" disabled={busy} onClick={() => void run(() => write(takeIt(latest(), label)))} className={clsx(button, "bg-[#e0655c]/20 text-[#f2a4b8]")}>
                          take it
                        </button>
                      </>
                    );
                  }
                  if (p.kind === "indians" || p.kind === "duel") {
                    const bangs = hand.filter((id) => nameOf(id) === "bang" || (calamity && nameOf(id) === "missed"));
                    return (
                      <>
                        {bangs.slice(0, 1).map((id) => (
                          <button key={id} type="button" disabled={busy} onClick={() => void spendCard(id, answerWithBang(latest(), id, label))} className={clsx(button, "bg-chalk text-ink-950")}>
                            throw down a {CARD_TITLE[nameOf(id)]}
                          </button>
                        ))}
                        <button type="button" disabled={busy} onClick={() => void run(() => write(takeIt(latest(), label)))} className={clsx(button, "bg-[#e0655c]/20 text-[#f2a4b8]")}>
                          lose a life
                        </button>
                      </>
                    );
                  }
                  if (p.kind === "dying") {
                    const beer = hand.find((id) => nameOf(id) === "beer");
                    const sid = state.players[shownChair].character === "sid";
                    return (
                      <>
                        {beer && canDrinkToLive(state) && (
                          <button type="button" disabled={busy} onClick={() => void spendCard(beer, drinkToLive(latest(), beer, label))} className={clsx(button, "bg-chalk text-ink-950")}>
                            drink a Beer
                          </button>
                        )}
                        {sid && hand.length >= 2 && (
                          <button type="button" disabled={busy || chosen.length !== 2} onClick={() => void sidTrade(shownChair)} className={clsx(button, "bg-white/8 text-chalk")}>
                            trade two cards for a life ({chosen.length}/2)
                          </button>
                        )}
                        <button type="button" disabled={busy} onClick={() => void fallDown()} className={clsx(button, "bg-[#e0655c]/20 text-[#f2a4b8]")}>
                          fall
                        </button>
                      </>
                    );
                  }
                  return null;
                })()}

                {/* Sid Ketchum can trade at any time on his own turn too */}
                {myTurn && state.step === "main" && state.players[state.turn]?.character === "sid" && hand.length >= 2 && state.players[state.turn].life < state.players[state.turn].max && (
                  <span className="self-center text-[10px] text-muted/60">Sid: pick two and</span>
                )}
                {myTurn && state.step === "main" && state.players[state.turn]?.character === "sid" && chosen.length === 2 && over === 0 && (
                  <button type="button" disabled={busy} onClick={() => void sidTrade(state.turn)} className={clsx(button, "bg-white/8 text-chalk")}>
                    trade them for a life
                  </button>
                )}
              </div>
              {myTurn && state.step === "main" && (
                <p className="text-[10px] text-muted/50">
                  reach {reach(state, state.turn)} · {alive(state).length} still standing
                </p>
              )}
            </>
          )}
        </div>
      )}

      {manual && <Manual onClose={() => setManual(false)} />}
    </div>
  );
}

function Manual({ onClose }: { onClose: () => void }) {
  return (
    <RulesSheet title="BANG!" onClose={onClose}>
      <p>
        Everyone gets a secret role. The <b>Sheriff</b> shows theirs and plays first. <b>Deputies</b> protect the Sheriff;{" "}
        <b>Outlaws</b> want the Sheriff dead; the <b>Renegade</b> wants to be the last one alive.
      </p>
      <p>
        On your turn: draw two, play as many cards as you like -- but only one BANG! -- then throw away down to as many cards
        as you have lives. You can shoot someone only if they are within your gun&apos;s reach; distance is counted round the
        table the short way.
      </p>
      <p>
        At no lives you are out, unless you drink a Beer (not when only two are left). Kill an Outlaw and draw three cards. A
        Sheriff who kills his own Deputy throws away everything he has.
      </p>
      <div className="space-y-1 border-t border-white/8 pt-2">
        <h4>the cards</h4>
        {(Object.keys(CARD_TITLE) as Array<keyof typeof CARD_TITLE>).map((k) => (
          <p key={k}>
            <b>{CARD_TITLE[k]}</b> -- {CARD_TEXT[k]}
          </p>
        ))}
      </div>
      <div className="space-y-1 border-t border-white/8 pt-2">
        <h4>the characters</h4>
        {Object.values(CHARACTERS).map((c) => (
          <p key={c.name}>
            <b>{c.name}</b> ({c.life}) -- {c.text}
          </p>
        ))}
      </div>
    </RulesSheet>
  );
}
