"use client";

import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { BookOpen, Eye, Layers, Megaphone, Minus, Plus, RotateCcw, RotateCw, Settings2, Shuffle, Swords } from "lucide-react";
import { useRoom } from "@/realtime/room-provider";
import { usePiles } from "@/realtime/use-piles";
import { useHandOver } from "@/realtime/use-hand-over";
import { waitForItem } from "@/realtime/wait-for-item";
import { useRoomStore } from "@/state/room-store";
import { chairOf, claimChair } from "@/lib/seats";
import { sizeOf } from "@/lib/piles";
import {
  CHAOS_TEXT,
  COLORS,
  COLOR_HEX,
  COLOR_NAME,
  DRAW_PILE,
  MAX_SEATS,
  MERCY_LIMIT,
  MIN_SEATS,
  PRESETS,
  afterChallenge,
  afterChoosing,
  afterDraw,
  afterMercy,
  afterPass,
  afterPlay,
  afterRoulette,
  afterTaking,
  cardsOfColor,
  chairsFor,
  chaosAfter,
  companions,
  decksFor,
  describe,
  emptyUno,
  fullDeck,
  houseRules,
  handSlot,
  isWild,
  jumpable,
  openWith,
  parse,
  playable,
  presetOf,
  reshuffle,
  roundOver,
  rulesOf,
  seatAfter,
  swapDone,
  swapWork,
  tally,
  transitSlot,
  type Color,
  type UnoRules,
  type UnoState,
} from "@/lib/uno";
import type { Item } from "@/lib/types";
import UnoCard from "@/components/cards/uno-card";
import RulesSheet from "./rules-sheet";
import UnoHouse from "./uno-house";
import { t } from "@/lib/i18n";

const upgrade = (raw: unknown): UnoState => ({ ...emptyUno(), ...(raw as Partial<UnoState>) }) as UnoState;

/** How long this go has left, as a bar running down. Remounted for every go. */
function Clock({ turnAt, seconds }: { turnAt: number; seconds: number }) {
  const [mountedAt] = useState(() => Date.now());
  const total = seconds * 1000;
  const left = Math.max(0, Math.min(total, turnAt + total - mountedAt));
  return (
    <div className="h-1 w-full overflow-hidden rounded-full bg-white/8">
      <div
        className="h-full origin-left rounded-full bg-warm"
        style={{ animation: `uno-clock ${left}ms linear forwards`, ["--from" as string]: String(left / total) }}
      />
    </div>
  );
}

/**
 * Uno, round the table, with whatever house rules the table likes. Your hand
 * is yours alone -- a secret pile the database deals and only you can read --
 * and the draw pile is read by nobody. Everyone sees the discard pile, whose
 * go it is, which way play runs, and how many cards each player is holding,
 * which is all you would see at a table.
 */
export default function Uno({ item, state: raw }: { item: Item<"game">; state: unknown }) {
  const { updateDataIf, pile, canEdit, setNotice } = useRoom();
  const me = useRoomStore((s) => s.me);
  const state = useMemo(() => upgrade(raw), [raw]);
  const rules = rulesOf(state);
  const house = houseRules(state);

  const [busy, setBusy] = useState(false);
  const [wildFor, setWildFor] = useState<{ cards: string[]; actor: string } | null>(null);
  const [drawn, setDrawn] = useState<string | null>(null);
  const [sheet, setSheet] = useState<"rules" | "house" | null>(null);
  const [lookingAt, setLookingAt] = useState<string | null>(null);
  /** Several of a number going down together: the card tapped, and which of its matches go with it. */
  const [picking, setPicking] = useState<{ card: string; with: number[] } | null>(null);

  const chairs = chairsFor(state.seatCount);
  const holders = useMemo(() => state.holders ?? {}, [state.holders]);
  const myChair = chairOf(state.seats, holders, me);
  const piles = state.piles;
  const mine = usePiles(item.id, piles);
  useHandOver(item.id, piles, holders);
  const out = useMemo(() => state.out ?? [], [state.out]);
  const dealt = Boolean(piles && DRAW_PILE in piles) && state.discard.length > 0;
  const over = roundOver(state);
  const round = String(state.round);
  const winner = state.results[round];
  const loser = state.losers?.[round];
  const pending = state.pending ?? null;
  const choosing = state.choosing ?? null;
  const swapping = dealt && !swapDone(state.swap, piles);

  const turnSlot = handSlot(state.turn);
  const actingHand = (mine[turnSlot] as string[] | undefined) ?? null;
  const myTurn = dealt && !over && actingHand !== null;
  const passedRound = Object.keys(mine).filter((s) => s.startsWith("hand:")).length > 1;
  const shownChair = myChair ?? (myTurn ? state.turn : null);
  const hand = useMemo(() => (shownChair ? ((mine[handSlot(shownChair)] as string[] | undefined) ?? []) : []), [shownChair, mine]);
  const gated = passedRound && !myChair && lookingAt !== state.turn;
  const acting = myTurn && shownChair === state.turn && !gated;

  const top = state.discard[0];
  const legal = useMemo(() => {
    if (!acting || state.color === null || swapping || choosing) return new Set<string>();
    const options = playable(hand, top, state.color, rules, pending);
    // Having drawn, only the card just drawn may still go down.
    if (state.drew === state.turn) return new Set(drawn && options.includes(drawn) ? [drawn] : []);
    return new Set(options);
  }, [acting, state.color, state.drew, state.turn, swapping, choosing, hand, top, rules, pending, drawn]);

  // Cutting in: out of turn, with the very card that is on top.
  const jumps = useMemo(() => {
    if (!myChair || myChair === state.turn || !dealt || over || pending || choosing || swapping || !state.color || out.includes(myChair)) return new Set<string>();
    return new Set(jumpable(hand, top, rules));
  }, [myChair, state.turn, state.color, dealt, over, pending, choosing, swapping, out, hand, top, rules]);

  const label = (chair: string) => state.seats[chair] ?? t("seat {n}", { n: chairs.indexOf(chair) + 1 });
  const wins = tally(state.results);
  const drawLeft = sizeOf(piles, DRAW_PILE);
  const sizes = Object.fromEntries(chairs.map((c) => [c, sizeOf(piles, handSlot(c))]));

  // ---------------------------------------------------------------------------
  // Saving: every change is worked out again from the freshest copy, and only
  // lands if nobody changed the table in the meantime.
  // ---------------------------------------------------------------------------

  const strip = (next: UnoState): UnoState => {
    const copy = { ...next };
    delete copy.piles;
    delete copy.revealed;
    delete copy.tested;
    return copy;
  };
  const live = () => upgrade((useRoomStore.getState().items[item.id]?.data as { state?: unknown } | undefined)?.state);

  const save = async (make: (fresh: UnoState) => UnoState | null): Promise<boolean> => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const row = useRoomStore.getState().items[item.id];
      if (!row) return false;
      const next = make(upgrade((row.data as { state?: unknown }).state));
      if (!next) return false;
      if (await updateDataIf(item.id, { game: "uno", state: strip(next) } as never, row.updated_at)) return true;
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

  /** Makes sure the draw pile has at least `need` cards, turning the discards under if not. */
  const ensureDraw = async (need: number) => {
    const meta = live().piles;
    if (sizeOf(meta, DRAW_PILE) >= need) return;
    let back: string[] = [];
    const ok = await save((fresh) => {
      if (fresh.discard.length <= 1) return null;
      const turned = reshuffle(fresh);
      back = turned.back;
      return { ...turned.state, log: [...turned.state.log.slice(-19), "the discards went back under"] };
    });
    if (!ok || back.length === 0) return;
    await pile("pile_put", { p_item: item.id, p_to: DRAW_PILE, p_cards: back, p_shuffle: true, p_bottom: true });
  };

  /** Cards from the draw pile into someone's hand, without anyone seeing them. */
  const give = async (chair: string, count: number) => {
    if (count <= 0) return;
    await ensureDraw(count);
    await pile("pile_move", { p_item: item.id, p_from: DRAW_PILE, p_to: handSlot(chair), p_count: count });
  };

  /** Draws into a hand this device owns, and says what came. */
  const drawInto = async (chair: string, count: number): Promise<string[]> => {
    await ensureDraw(count);
    const got = await pile<string[]>("pile_draw", { p_item: item.id, p_from: DRAW_PILE, p_to: handSlot(chair), p_count: count });
    return got.data ?? [];
  };

  // ---------------------------------------------------------------------------
  // Dealing and opening a round
  // ---------------------------------------------------------------------------

  const deal = () =>
    run(async () => {
      if (!me) return;
      const nextRound = state.round + 1;
      const dealer = chairs[(nextRound - 1) % chairs.length];
      const fresh: UnoState = {
        ...state,
        discard: [],
        color: null,
        turn: dealer,
        direction: 1,
        round: nextRound,
        called: {},
        exposed: null,
        drew: null,
        pending: null,
        choosing: null,
        swap: null,
        out: [],
        chaos: null,
        playing: house,
        dealer,
        log: [`round ${nextRound}: ${label(dealer)} deals`],
      };
      delete fresh.revealed;
      const setup = await pile("pile_setup", {
        p_item: item.id,
        p_piles: [{ slot: DRAW_PILE, cards: fullDeck(house, decksFor(chairs.length, house)), shuffle: true }],
        p_public: { game: "uno", state: strip(fresh) },
      });
      if (setup.error) return;
      const dealtOut = await pile("pile_deal", {
        p_item: item.id,
        p_from: DRAW_PILE,
        p_targets: chairs.map((chair) => ({ slot: handSlot(chair), owner: holders[chair] ?? me.userId, count: house.hand })),
      });
      if (dealtOut.error) return;

      // Turn a card up to start on. Anything that asks for more than a colour goes back.
      for (let attempt = 0; attempt < 12; attempt += 1) {
        const turned = await pile("pile_reveal", { p_item: item.id, p_slots: [DRAW_PILE], p_count: 1 });
        if (turned.error) return;
        const card = await waitForItem(item.id, (s) => (s.revealed as Record<string, string[]> | undefined)?.[DRAW_PILE]?.[0] ?? null);
        if (!card) return;
        const cleared = { ...live(), revealed: {} };
        const opened = openWith(cleared, chairs, card);
        if (opened === "again") {
          await pile("pile_put", { p_item: item.id, p_to: DRAW_PILE, p_cards: [card], p_shuffle: true, p_public: { game: "uno", state: strip(cleared) } });
          continue;
        }
        let penalty: { chair: string; count: number } | null = null;
        const ok = await save((now) => {
          const again = openWith({ ...now, revealed: {} }, chairs, card);
          if (again === "again") return null;
          penalty = again.penalty;
          return again.state;
        });
        const due = penalty as { chair: string; count: number } | null;
        if (ok && due) await give(due.chair, due.count);
        return;
      }
    });

  // ---------------------------------------------------------------------------
  // Playing
  // ---------------------------------------------------------------------------

  /** Puts cards down for `actor`: whoever's go it is, or someone cutting in. */
  const play = (cards: string[], chosen: Color | null, actor: string) =>
    run(async () => {
      const card = cards[cards.length - 1];
      if (isWild(card) && !chosen) {
        setWildFor({ cards, actor });
        return;
      }
      setWildFor(null);
      setPicking(null);
      const handNow = (mine[handSlot(actor)] as string[] | undefined) ?? [];
      const cutting = actor !== state.turn;
      const seen = { top, color: state.color, pending: state.pending?.count ?? 0 };
      let penalty: { chair: string; count: number } | null = null;
      let draws: Array<{ chair: string; count: number }> = [];

      const ok = await save((fresh) => {
        if (roundOver(fresh) || fresh.choosing || fresh.discard[0] !== seen.top || fresh.color !== seen.color) return null;
        if ((fresh.pending?.count ?? 0) !== seen.pending) return null;
        if (cutting ? fresh.turn === actor || fresh.pending || fresh.discard[0] !== card : fresh.turn !== actor) return null;
        const res = afterPlay(fresh, chairs, cards, chosen, handNow.length - cards.length, label, { actor });
        penalty = res.penalty;
        draws = [];
        let next = res.state;
        if (rulesOf(fresh).chaos && !roundOver(next)) {
          const event = chaosAfter(next, chairs, actor, Math.random(), sizes);
          if (event) {
            next = event.state;
            draws = event.draws;
          }
        }
        return next;
      });
      if (!ok) {
        if (cutting) setNotice("too slow -- the table moved on");
        return;
      }
      setDrawn(null);
      // The card leaves the hand in the same breath as the table, as it now stands, is written again.
      await pile("pile_take", { p_item: item.id, p_from: handSlot(actor), p_cards: cards, p_public: { game: "uno", state: strip(live()) } });
      const owed = [...(penalty ? [penalty] : []), ...draws] as Array<{ chair: string; count: number }>;
      for (const d of owed) await give(d.chair, d.count);
    });

  /** A card tapped in the hand: straight down, or first a word about what goes with it. */
  const tap = (card: string, actor: string) => {
    if (picking) return;
    const value = parse(card).value;
    if (value === "DA") {
      // Discard all: every card of its colour goes with it.
      const color = parse(card).color;
      const rest = [...hand];
      rest.splice(rest.indexOf(card), 1);
      void play([...rest.filter((c) => !isWild(c) && parse(c).color === color), card], null, actor);
      return;
    }
    const others = actor === state.turn && !pending ? companions(hand, card, rules) : [];
    if (others.length > 0) setPicking({ card, with: [] });
    else void play([card], null, actor);
  };

  const choose = (target: string) =>
    run(async () => {
      await save((fresh) => (fresh.choosing && fresh.choosing.chair === state.turn ? afterChoosing(fresh, chairs, target, label) : null));
    });

  const draw = () =>
    run(async () => {
      if (!acting || state.drew === state.turn || pending) return;
      const chair = state.turn;
      let last: string | null = null;
      let count = 0;
      // One card, or with draw-until, as many as it takes.
      for (let i = 0; i < (rules.drawUntil ? 40 : 1); i += 1) {
        const got = await drawInto(chair, 1);
        last = got[0] ?? null;
        count += 1;
        if (!last || playable([last], top, state.color, rules).includes(last)) break;
      }
      setDrawn(last);
      const fits = last !== null && playable([last], top, state.color, rules).includes(last);
      await save((fresh) => {
        if (fresh.turn !== chair) return null;
        const drew = afterDraw(fresh);
        const logged = count > 1 ? { ...drew, log: [...drew.log.slice(-19), `${label(chair)} drew ${count}`] } : drew;
        // Nothing to do with it: the turn simply moves on.
        return fits ? logged : afterPass(logged, chairs, label);
      });
      if (!fits) setDrawn(null);
    });

  const pass = () =>
    run(async () => {
      await save((fresh) => (fresh.turn === state.turn ? afterPass(fresh, chairs, label) : null));
      setDrawn(null);
    });

  /** Taking the draw that came your way. */
  const take = () =>
    run(async () => {
      if (!pending || !acting) return;
      const chair = state.turn;
      const count = pending.count;
      const ok = await save((fresh) => (fresh.turn === chair && fresh.pending?.count === count ? afterTaking(fresh, chairs, label) : null));
      if (ok) await drawInto(chair, count);
    });

  /** Colour roulette: draw until the colour turns up. */
  const spin = () =>
    run(async () => {
      if (!pending?.roulette || !acting) return;
      const chair = state.turn;
      const want = pending.roulette;
      let count = 0;
      for (let i = 0; i < 60; i += 1) {
        const [card] = await drawInto(chair, 1);
        count += 1;
        if (!card || (!isWild(card) && parse(card).color === want)) break;
      }
      await save((fresh) => (fresh.turn === chair && fresh.pending?.roulette ? afterRoulette(fresh, chairs, count, label) : null));
    });

  /** Calling a wild draw four a bluff: the database looks in their hand for the colour. */
  const challenge = () =>
    run(async () => {
      if (!pending?.challenge || !acting) return;
      const by = pending.by;
      let guilty = false;
      for (const card of cardsOfColor(pending.challenge, rules)) {
        const answer = await pile<boolean>("pile_test", { p_item: item.id, p_slot: handSlot(by), p_card: card });
        if (answer.data) {
          guilty = true;
          break;
        }
      }
      let owed: { chair: string; count: number } | null = null;
      const ok = await save((fresh) => {
        if (fresh.turn !== state.turn || !fresh.pending?.challenge) return null;
        const res = afterChallenge(fresh, chairs, guilty, label);
        owed = res.penalty;
        return res.state;
      });
      const due = owed as { chair: string; count: number } | null;
      if (ok && due) await give(due.chair, due.count);
    });

  const callUno = (chair: string) =>
    run(() =>
      save((fresh) => ({
        ...fresh,
        called: { ...fresh.called, [chair]: true },
        exposed: fresh.exposed === chair ? null : fresh.exposed,
        log: [...fresh.log.slice(-19), `${label(chair)}: uno!`],
      })),
    );

  const catchOut = (chair: string) =>
    run(async () => {
      const ok = await save((fresh) =>
        fresh.exposed === chair
          ? { ...fresh, exposed: null, log: [...fresh.log.slice(-19), `${label(chair)} was caught without calling uno, and draws ${rules.unoPenalty}`] }
          : null,
      );
      if (ok) await give(chair, rules.unoPenalty);
    });

  const chooseOpeningColor = (color: Color) =>
    run(() => save((fresh) => (fresh.color === null ? { ...fresh, color, turnAt: Date.now(), log: [...fresh.log.slice(-19), `${label(fresh.turn)} calls ${COLOR_NAME[color]}`] } : null)));

  const resize = (by: number) => {
    const count = Math.max(MIN_SEATS, Math.min(MAX_SEATS, state.seatCount + by));
    const keep = chairsFor(count);
    void save((fresh) => ({
      ...fresh,
      seatCount: count,
      seats: Object.fromEntries(keep.map((c) => [c, fresh.seats[c] ?? null])),
      holders: Object.fromEntries(keep.map((c) => [c, (fresh.holders ?? {})[c] ?? null])),
    }));
  };

  const setRules = (next: UnoRules) => void save((fresh) => ({ ...fresh, rules: next }));

  // ---------------------------------------------------------------------------
  // Things this device does on its own, for the hands it holds
  // ---------------------------------------------------------------------------

  // Hands changing places: send ours off, then take in what was sent to us.
  const swapJobs = useRef(new Set<string>());
  const swapTodo = swapWork(state.swap, piles, (chair) => Boolean(me) && piles?.[handSlot(chair)]?.owner === me?.userId);
  const swapKey = swapTodo.map((j) => `${j.kind}:${j.chair}`).join(",");
  useEffect(() => {
    if (!canEdit || !state.swap || !swapKey) return;
    const id = state.swap.id;
    for (const job of swapKey.split(",")) {
      const [kind, chair] = job.split(":");
      const key = `${id}:${job}`;
      if (swapJobs.current.has(key)) continue;
      swapJobs.current.add(key);
      const to = state.swap.moves[chair];
      if (kind === "send") void pile("pile_move", { p_item: item.id, p_from: handSlot(chair), p_to: transitSlot(id, to), p_count: 999 });
      else void pile("pile_move", { p_item: item.id, p_from: transitSlot(id, chair), p_to: handSlot(chair), p_count: 999 });
    }
  }, [swapKey, canEdit, state.swap, item.id, pile]);

  // No mercy: a hand at the limit is out, and its cards go back under the draw pile.
  const mercyDue = rules.mercy && dealt && !over && me
    ? chairs.filter((c) => !out.includes(c) && piles?.[handSlot(c)]?.owner === me.userId && sizeOf(piles, handSlot(c)) >= MERCY_LIMIT).join(",")
    : "";
  const mercyDone = useRef(new Set<string>());
  const eliminate = useEffectEvent((chair: string) => {
    void (async () => {
      const ok = await save((fresh) => ((fresh.out ?? []).includes(chair) ? null : afterMercy(fresh, chairs, chair, label)));
      if (ok) await pile("pile_move", { p_item: item.id, p_from: handSlot(chair), p_to: DRAW_PILE, p_count: 999, p_bottom: true });
    })();
  });
  useEffect(() => {
    if (!mercyDue || !canEdit) return;
    for (const chair of mercyDue.split(",")) {
      const key = `${state.round}:${chair}`;
      if (mercyDone.current.has(key)) continue;
      mercyDone.current.add(key);
      eliminate(chair);
    }
  }, [mercyDue, canEdit, state.round]);

  // The clock: when a go runs out, the device holding that hand does the least it can.
  const timeUp = useEffectEvent(() => {
    if (busy) return;
    if (pending?.roulette) void spin();
    else if (pending) void take();
    else if (choosing) void choose(seatAfter(chairs, state.turn, state.direction, 1, out));
    else if (state.color === null) void chooseOpeningColor(COLORS[(state.turnAt ?? 0) % 4]);
    else if (state.drew === state.turn) void pass();
    else
      void run(async () => {
        const chair = state.turn;
        await drawInto(chair, 1);
        await save((fresh) =>
          fresh.turn === chair ? { ...afterPass(fresh, chairs, label), log: [...fresh.log.slice(-19), `${label(chair)} ran out of time`] } : null,
        );
        setDrawn(null);
      });
  });
  useEffect(() => {
    if (!rules.timer || !myTurn || over || swapping || !state.turnAt || !canEdit) return;
    const wait = state.turnAt + rules.timer * 1000 - Date.now();
    const id = window.setTimeout(() => timeUp(), Math.max(0, wait) + 150);
    return () => window.clearTimeout(id);
  }, [rules.timer, myTurn, over, swapping, state.turnAt, canEdit]);

  // ---------------------------------------------------------------------------

  const whoTurn = label(state.turn);
  const headline = over
    ? rules.end === "last" && loser
      ? t("{loser} is left holding cards -- deal again", { loser: label(loser) })
      : t("{winner} is out -- deal again", { winner: label(winner) })
    : !dealt
      ? t("pick the house rules, sit down, then deal")
      : swapping
        ? t("hands changing places...")
        : choosing
          ? acting
            ? t("pick whose hand you get")
            : t("{turn} is picking whose hand to take", { turn: whoTurn })
          : state.color === null
            ? t("{turn} calls the colour", { turn: whoTurn })
            : pending?.roulette
              ? acting
                ? t("draw until a {color} turns up", { color: t(COLOR_NAME[pending.roulette]) })
                : t("{turn} is spinning the roulette", { turn: whoTurn })
              : pending
                ? acting
                  ? t("{count} coming at you", { count: pending.count })
                  : t("{turn} faces {count}", { turn: whoTurn, count: pending.count })
                : acting
                  ? state.drew === state.turn
                    ? t("play what you drew, or keep it")
                    : t("your go")
                  : t("{turn} to play", { turn: whoTurn });

  const preset = presetOf(house);
  const presetName = preset ? PRESETS.find((p) => p.id === preset)?.name ?? "" : "house rules";
  const canDraw = acting && !pending && state.drew !== state.turn && !swapping && !choosing && state.color !== null && !(rules.forcePlay && legal.size > 0);
  const unoWindow = rules.multiples ? 4 : 2;
  const canCall = (chair: string | null, size: number) => Boolean(chair) && size >= 2 && size <= unoWindow && !state.called[chair as string] && dealt && !over;
  const pickOptions = picking ? companions(hand, picking.card, rules) : [];
  const pickedCards = picking ? [...picking.with.map((i) => pickOptions[i]).filter(Boolean), picking.card] : [];

  return (
    <div className="surface grain relative flex size-full flex-col gap-2 overflow-hidden rounded-2xl p-2.5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-muted/70">
        <span className="flex items-center gap-0.5">
          <button type="button" disabled={!canEdit || state.seatCount <= MIN_SEATS} onClick={() => resize(-1)} aria-label={t("one chair fewer")} className="grid size-7 place-items-center rounded disabled:opacity-30">
            <Minus className="size-3" />
          </button>
          <span>{t("{n} chairs", { n: state.seatCount })}</span>
          <button type="button" disabled={!canEdit || state.seatCount >= MAX_SEATS} onClick={() => resize(1)} aria-label={t("one chair more")} className="grid size-7 place-items-center rounded disabled:opacity-30">
            <Plus className="size-3" />
          </button>
        </span>
        <button
          type="button"
          onClick={() => setSheet("house")}
          className="flex min-h-7 items-center gap-1 rounded-lg bg-white/6 px-2 text-chalk/85 hover:bg-white/10"
        >
          <Settings2 className="size-3" />
          {t(presetName)}
        </button>
        <button type="button" onClick={() => setSheet("rules")} className="ml-auto flex min-h-7 items-center gap-1 rounded-lg px-1.5 hover:bg-white/8 hover:text-chalk">
          <BookOpen className="size-3" />
          {t("rules")}
        </button>
      </div>

      {/* Chairs */}
      <div className="flex flex-wrap gap-1.5">
        {chairs.map((chair, i) => {
          const who = state.seats[chair];
          const isMine = chair === myChair;
          const count = sizes[chair];
          const gone = out.includes(chair);
          return (
            <div
              key={chair}
              className={clsx(
                "flex min-h-10 min-w-0 flex-1 basis-28 items-center gap-1.5 rounded-xl px-2 py-1",
                gone ? "bg-white/3 opacity-55" : state.turn === chair && dealt && !over ? "bg-white/12 ring-1 ring-glow/45" : "bg-white/5",
              )}
            >
              <button
                type="button"
                disabled={!canEdit || !me}
                onClick={() => me && void save((fresh) => ({ ...fresh, ...claimChair(fresh.seats, fresh.holders ?? {}, chair, me) }))}
                className="min-w-0 flex-1 truncate text-left text-[11px]"
              >
                <span className={who ? (isMine ? "text-chalk" : "text-muted") : "text-muted/50"}>{who ?? t("seat {n}", { n: i + 1 })}</span>
                {(wins[chair] ?? 0) > 0 && <span className="ml-1 text-warm">{wins[chair]}</span>}
              </button>
              {gone ? (
                <span className="text-[9px] text-muted">{loser === chair ? t("lost") : winner === chair ? t("first out") : t("out")}</span>
              ) : (
                count > 0 && (
                  <span className={clsx("flex items-center gap-0.5 text-[10px] tabular-nums", rules.mercy && count >= MERCY_LIMIT - 5 ? "text-[#f2a4b8]" : "text-muted")}>
                    <span className="h-3.5 w-2.5 rounded-[2px] bg-[#1b1a22] ring-1 ring-[#d63a3a]/60" />
                    {count}
                  </span>
                )
              )}
              {state.called[chair] && count === 1 && <span className="rounded-full bg-[#d63a3a] px-1.5 text-[9px] font-bold text-white">{t("uno")}</span>}
              {state.exposed === chair && !isMine && canEdit && (
                <button type="button" onClick={() => void catchOut(chair)} className="rounded-lg bg-warm/25 px-1.5 py-1 text-[10px] font-semibold text-warm">
                  {t("catch!")}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {rules.timer > 0 && dealt && !over && state.turnAt ? <Clock key={`${state.turnAt}:${state.turn}`} turnAt={state.turnAt} seconds={rules.timer} /> : null}

      {/* The middle of the table */}
      <div className="relative flex min-h-0 flex-1 items-center justify-center gap-6 rounded-xl bg-[radial-gradient(ellipse_at_center,#3a2e57_0%,#231c36_70%)] p-3 inset-ring inset-ring-black/30">
        {dealt ? (
          <>
            <button
              type="button"
              disabled={!canDraw || busy}
              onClick={() => void draw()}
              title={rules.forcePlay && legal.size > 0 ? t("you have something to play") : t("draw a card")}
              className="relative transition active:scale-95 disabled:cursor-default"
            >
              <UnoCard card={null} down width={60} />
              <span className="absolute -right-2 -bottom-2 rounded-full bg-ink-950/85 px-1.5 text-[10px] text-chalk tabular-nums ring-1 ring-white/20">{drawLeft}</span>
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
              {pending && !pending.roulette && pending.count > 0 && (
                <span className="absolute -top-3 -right-4 rotate-6 rounded-lg bg-[#d63a3a] px-2 py-0.5 text-[15px] font-black text-white shadow-lg ring-2 ring-white/70">
                  +{pending.count}
                </span>
              )}
            </div>
            <div className="flex flex-col items-center gap-1 text-[10px] text-muted">
              {state.direction === 1 ? <RotateCw className="size-5 text-chalk/70" /> : <RotateCcw className="size-5 text-chalk/70" />}
              {state.color && <span className="size-4 rounded-full ring-2 ring-white/40" style={{ background: COLOR_HEX[state.color] }} title={t(COLOR_NAME[state.color])} />}
            </div>
            {state.chaos && !over && (
              <p className="pointer-events-none absolute inset-x-2 bottom-1.5 text-center text-[10px] font-semibold text-warm/90">{t(CHAOS_TEXT[state.chaos as keyof typeof CHAOS_TEXT] ?? "")}</p>
            )}
          </>
        ) : (
          <button
            type="button"
            disabled={!canEdit || busy}
            onClick={() => void deal()}
            className="flex min-h-11 items-center gap-2 rounded-xl bg-[#f7f4ee] px-4 text-[13px] font-semibold text-[#1b1a22] shadow-lg active:scale-95 disabled:opacity-50"
          >
            <Layers className="size-4" />
            {t("deal {n} each", { n: house.hand })}
          </button>
        )}

        {/* Calling a colour: for a wild just played, or a round that opened on one */}
        {(wildFor || (dealt && state.color === null && acting)) && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-xl bg-ink-950/80">
            <p className="text-[12px] text-chalk">{t("call a colour")}</p>
            <div className="grid grid-cols-2 gap-2">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => (wildFor ? void play(wildFor.cards, c, wildFor.actor) : void chooseOpeningColor(c))}
                  className="size-14 rounded-2xl shadow-lg ring-2 ring-white/30 transition active:scale-95"
                  style={{ background: COLOR_HEX[c] }}
                  aria-label={t(COLOR_NAME[c])}
                />
              ))}
            </div>
            {wildFor && (
              <button type="button" onClick={() => setWildFor(null)} className="min-h-8 text-[11px] text-muted">
                {t("keep the wild")}
              </button>
            )}
          </div>
        )}

        {/* A 7 or a swap wild: whose hand to take */}
        {choosing && acting && !wildFor && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-xl bg-ink-950/85 p-3">
            <p className="flex items-center gap-1.5 text-[12px] text-chalk">
              <Shuffle className="size-3.5" />
              {t("swap hands with")}
            </p>
            <div className="flex max-w-full flex-wrap justify-center gap-1.5">
              {chairs
                .filter((c) => c !== choosing.chair && !out.includes(c))
                .map((c) => (
                  <button key={c} type="button" disabled={busy} onClick={() => void choose(c)} className="flex min-h-10 items-center gap-1.5 rounded-xl bg-white/10 px-3 text-[12px] text-chalk hover:bg-white/16">
                    {label(c)}
                    <span className="text-[10px] text-muted tabular-nums">{sizes[c]}</span>
                  </button>
                ))}
            </div>
          </div>
        )}
      </div>

      {/* Several of a number going down together */}
      {picking && (
        <div className="flex flex-wrap items-center gap-1.5 rounded-xl bg-white/6 p-1.5">
          <span className="text-[10px] text-muted">{t("play with it:")}</span>
          {pickOptions.map((c, i) => {
            const on = picking.with.includes(i);
            return (
              <button
                key={`${c}-${i}`}
                type="button"
                onClick={() => setPicking({ ...picking, with: on ? picking.with.filter((j) => j !== i) : [...picking.with, i] })}
                className={clsx("rounded-md transition", on ? "-translate-y-1 ring-2 ring-glow" : "opacity-70")}
              >
                <UnoCard card={c} width={30} />
              </button>
            );
          })}
          <span className="flex-1" />
          <button type="button" onClick={() => setPicking(null)} className="min-h-8 rounded-lg px-2 text-[11px] text-muted hover:text-chalk">
            {t("cancel")}
          </button>
          <button type="button" disabled={busy} onClick={() => void play(pickedCards, null, state.turn)} className="min-h-8 rounded-lg bg-chalk px-3 text-[11px] font-semibold text-ink-950">
            {pickedCards.length > 1 ? t("play {n}", { n: pickedCards.length }) : t("play just this")}
          </button>
        </div>
      )}

      {/* Your hand */}
      <div className="min-h-[5.5rem]">
        {gated && hand.length > 0 ? (
          <button type="button" onClick={() => setLookingAt(state.turn)} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-white/8 text-[12px] text-chalk">
            <Eye className="size-4" />
            {t("pass the phone to {turn}, then tap to look", { turn: whoTurn })}
          </button>
        ) : hand.length > 0 ? (
          <div className="flex gap-1 overflow-x-auto px-1 pt-3 pb-1">
            {hand.map((card, i) => {
              const ok = legal.has(card);
              const cut = jumps.has(card);
              const chosen = picking?.card === card;
              return (
                <button
                  key={`${card}-${i}`}
                  type="button"
                  disabled={(!ok && !cut) || busy || !canEdit}
                  onClick={() => (cut ? void play([card], null, myChair as string) : tap(card, state.turn))}
                  className={clsx(
                    "relative shrink-0 transition",
                    ok || cut ? "-translate-y-2 hover:-translate-y-3" : "opacity-55",
                    chosen && "-translate-y-3",
                    drawn === card && state.drew === state.turn && "rounded-[9px] ring-2 ring-glow",
                    cut && "rounded-[9px] ring-2 ring-warm",
                  )}
                  aria-label={t(describe(card, null))}
                >
                  <UnoCard card={card} width={52} />
                  {cut && <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full bg-warm px-1.5 text-[9px] font-bold whitespace-nowrap text-ink-950">{t("cut in!")}</span>}
                </button>
              );
            })}
          </div>
        ) : (
          <p className="pt-6 text-center text-[11px] text-muted/50">
            {myChair && out.includes(myChair) ? t("you are out of this round") : myChair ? (dealt ? t("no cards") : t("waiting for the deal")) : t("sit down to be dealt in")}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <p className="min-w-0 flex-1 basis-40 truncate text-[11px] text-muted">
          {headline}
          <span className="text-muted/50"> · {t(state.log.at(-1) ?? "")}</span>
        </p>
        {acting && pending && !pending.roulette && (
          <>
            {pending.challenge && (
              <button type="button" disabled={busy} onClick={() => void challenge()} className="flex min-h-9 items-center gap-1 rounded-lg bg-white/8 px-2.5 text-[11px] text-chalk">
                <Swords className="size-3.5" />
                {t("challenge")}
              </button>
            )}
            <button type="button" disabled={busy} onClick={() => void take()} className="min-h-9 rounded-lg bg-[#d63a3a] px-2.5 text-[11px] font-semibold text-white">
              {t("take {n}", { n: pending.count })}
            </button>
          </>
        )}
        {acting && pending?.roulette && (
          <button type="button" disabled={busy} onClick={() => void spin()} className="min-h-9 rounded-lg px-2.5 text-[11px] font-semibold text-white" style={{ background: COLOR_HEX[pending.roulette] }}>
            {t("draw until {color}", { color: t(COLOR_NAME[pending.roulette]) })}
          </button>
        )}
        {canCall(shownChair, hand.length) && (acting || myChair) && (
          <button type="button" onClick={() => void callUno(shownChair as string)} className="flex min-h-9 items-center gap-1 rounded-lg bg-[#d63a3a] px-2.5 text-[11px] font-bold text-white">
            <Megaphone className="size-3.5" />
            {t("uno!")}
          </button>
        )}
        {myChair && state.exposed === myChair && (
          <button type="button" onClick={() => void callUno(myChair)} className="flex min-h-9 items-center gap-1 rounded-lg bg-[#d63a3a] px-2.5 text-[11px] font-bold text-white">
            <Megaphone className="size-3.5" />
            {t("uno!")}
          </button>
        )}
        {acting && state.drew === state.turn && !(rules.forcePlay && drawn && legal.has(drawn)) && (
          <button type="button" onClick={() => void pass()} className="min-h-9 rounded-lg bg-white/8 px-2.5 text-[11px] text-chalk">
            {t("keep it")}
          </button>
        )}
        <button type="button" disabled={!canEdit || busy} onClick={() => void deal()} aria-label={t("deal a new round")} title={t("deal a new round")} className="grid size-9 place-items-center rounded-lg text-muted hover:bg-white/8 hover:text-chalk disabled:opacity-40">
          <RotateCcw className="size-3.5" />
        </button>
      </div>

      {sheet === "house" && <UnoHouse rules={house} later={dealt && !over && JSON.stringify(house) !== JSON.stringify(rules)} onChange={setRules} onClose={() => setSheet(null)} />}

      {sheet === "rules" && (
        <RulesSheet title={t("how uno goes")} onClose={() => setSheet(null)}>
          <p>{t("Everyone starts with {n}. On your go, put down a card that matches the one on top of the pile by colour, or by number or symbol. A wild goes on anything and you call the colour that follows.", { n: rules.hand })}</p>
          <p>{rules.drawUntil ? t("Nothing you can play? Draw until something fits; you may put that one straight down.") : t("Nothing you can play, or would rather not? Draw one. If it fits you may put it straight down; otherwise play moves on.")}</p>
          <h4>{t("the special cards")}</h4>
          <p>{t("Skip -- the next player misses their go. Reverse -- play turns round (with two players, it is a skip). Draw two -- the next player draws two and misses their go. Wild draw four -- call a colour; the next player draws four and misses their go.")}</p>
          {rules.mercy && <p>{t("No mercy adds a draw four in each colour, wild draw six and ten, the wild reverse draw four, colour roulette (the next player draws until your colour turns up), skip everyone (you go again) and discard all (every card of its colour goes with it). Reach 25 cards and you are out of the round.")}</p>}
          {rules.chaos && <p>{t("Chaos adds swap-hands wilds, and after some plays something happens by itself: everyone draws, the hands move along, the colour changes, play turns round, or the biggest and smallest hands swap.")}</p>}
          <h4>{t("this table's house rules")}</h4>
          <ul className="list-disc space-y-1 pl-4">
            {rules.stack !== "off" && <li>{t("Draw cards stack: instead of drawing, put a draw card on it and the whole lot moves on to the next player.")}</li>}
            {rules.reflect && <li>{t("With a draw coming at you, a reverse sends it back and a skip passes it along.")}</li>}
            {rules.jumpIn && <li>{t("Hold the exact card on top? Cut in with it out of turn -- play carries on from you.")}</li>}
            {rules.multiples && <li>{t("Several cards of the same number can go down together.")}</li>}
            {rules.sevenO && <li>{t("A 7 swaps your hand with anyone's; a 0 passes every hand one seat along.")}</li>}
            {rules.forcePlay && <li>{t("If you can play, you must.")}</li>}
            {rules.freeW4 && <li>{t("The wild draw four goes down whenever you like.")}</li>}
            {rules.challenge && <li>{t("A wild draw four may be a bluff. Challenge it: if they held the colour, they draw four; if not, you draw six.")}</li>}
            {rules.noActionFinish && <li>{t("Nobody goes out on an action card or a wild: the last card has to be a number.")}</li>}
            {rules.end === "last" && <li>{t("The round goes on until one player is left holding cards.")}</li>}
            {rules.timer > 0 && <li>{t("Each go has {n} seconds; when time runs out, you draw and play moves on.", { n: rules.timer })}</li>}
            {presetOf(rules) === "classic" && <li>{t("None -- the box rules.")}</li>}
          </ul>
          <h4>{t("uno")}</h4>
          <p>{t("When you are about to go down to one card, press uno! first. Get down to one without calling it and anyone can catch you before the next card is played: you draw {n}.", { n: rules.unoPenalty })}</p>
          <p className="text-muted/60">{t("Your hand is private to you -- not hidden on screen, but never sent to anyone else at all.")}</p>
        </RulesSheet>
      )}
    </div>
  );
}
