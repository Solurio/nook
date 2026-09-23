"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { BookOpen, Coins, Eye, EyeOff, Minus, Plus, RotateCcw, Settings2, ShieldQuestion } from "lucide-react";
import { useRoom } from "@/realtime/room-provider";
import { usePiles } from "@/realtime/use-piles";
import { useHandOver, useScrub } from "@/realtime/use-hand-over";
import { useRoomStore } from "@/state/room-store";
import { chairOf, claimChair } from "@/lib/seats";
import { sizeOf } from "@/lib/piles";
import {
  ACTION_LABEL,
  COURT,
  MAX_SEATS,
  MIN_SEATS,
  PRESETS,
  PRESET_NAME,
  afterGuess,
  afterLoss,
  aliveFrom,
  block,
  blockers,
  chairsFor,
  challenge,
  challengeable,
  characters,
  claimOf,
  copiesFor,
  deckFor,
  deckSize,
  declare,
  emptyCoup,
  handSlot,
  legalActions,
  needsTarget,
  pass,
  settleChallenge,
  shownSlot,
  startRound,
  targetsFor,
  advance,
  type Action,
  type ActionKind,
  type Card,
  type CoupRules,
  type CoupState,
  type Preset,
} from "@/lib/coup";
import type { Item } from "@/lib/types";
import RulesSheet from "./rules-sheet";
import { t } from "@/lib/i18n";

const CARD_TINT: Record<Card, string> = {
  duke: "#c4a7f0",
  assassin: "#e0655c",
  captain: "#6aa9e0",
  ambassador: "#a6d189",
  contessa: "#f6c177",
  inquisitor: "#8fd3c8",
};

/** One character each, so a card is never only a colour. */
const CARD_MARK: Record<Card, string> = {
  duke: "^",
  assassin: "+",
  captain: "<",
  ambassador: "~",
  contessa: "V",
  inquisitor: "?",
};

/** The manual. A small drawn sigil, then what the card is actually for. */
const CARD_GUIDE: Record<Card, { art: string[]; does: string; stops: string }> = {
  duke: { art: ["^ v ^", "|$$$|", "|___|"], does: "tax: take 3 coins from the bank.", stops: "stops anyone taking foreign aid." },
  assassin: { art: ["=|=|=", "  |  ", "  v  "], does: "pay 3 coins to make somebody lose a card.", stops: "blocks nothing." },
  captain: { art: [" $ $ ", "  |  ", "<----"], does: "steal 2 coins from another player.", stops: "stops someone stealing from you." },
  ambassador: {
    art: [" --> ", " >-< ", " <-- "],
    does: "draw 2 from the court, then send 2 back -- keeping whichever you like.",
    stops: "stops someone stealing from you.",
  },
  contessa: { art: ["|---|", " |:| ", "  v  "], does: "nothing on its own.", stops: "stops an assassination dead." },
  inquisitor: {
    art: [" (o) ", " -|- ", " / \\ "],
    does: "exchange: draw 1 and send 1 back. Or examine: someone shows you a card of their choosing, and you may make them swap it.",
    stops: "stops someone stealing from you.",
  },
};

/**
 * Coup. Two cards each, face down, and everyone is free to claim whatever suits
 * them; the only brake is that doubting someone costs one of you a card.
 *
 * Each hand is a secret pile only its owner can read, and the court deck is
 * read by nobody. So a challenge cannot be settled by looking: whoever was
 * challenged answers it, by showing the card -- the database refuses unless
 * they really hold it -- or by giving a card up.
 */
export default function Coup({ item, state: raw }: { item: Item<"game">; state: unknown }) {
  const { updateData, pile, canEdit } = useRoom();
  const me = useRoomStore((s) => s.me);
  const [target, setTarget] = useState<ActionKind | null>(null);
  const [manual, setManual] = useState(false);
  const [setup, setSetup] = useState(false);
  const [looking, setLooking] = useState<string | null>(null);
  const [chosen, setChosen] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const legacy = (raw as { version?: number } | null)?.version !== 2;
  const state = useMemo<CoupState>(() => {
    if (!legacy) return raw as CoupState;
    const old = (raw ?? {}) as { players?: Array<{ seat: string }>; seatCount?: number };
    const fresh = emptyCoup(Math.max(MIN_SEATS, old.players?.length ?? old.seatCount ?? 4));
    return fresh;
  }, [raw, legacy]);
  // A game from before hands were private had every hand and the court in the open.
  useScrub(legacy, () => void updateData(item.id, { game: "coup", state: clean(state) } as never));

  const chairs = chairsFor(state.seatCount);
  const holders = useMemo(() => state.holders ?? {}, [state.holders]);
  const myChair = chairOf(state.seats, holders, me);
  const piles = state.piles;
  const mine = usePiles(item.id, piles);
  useHandOver(item.id, piles, holders);

  const dealt = Boolean(piles?.[COURT]);
  /** How many are in the game: whoever was dealt in, or every chair before the deal. */
  const tableSize = Object.keys(state.players).length || chairs.length;
  const alive = dealt ? aliveFrom(chairs, piles) : [];
  const phase = state.phase;
  const label = (chair: string) => state.seats[chair] ?? t(`seat ${chairs.indexOf(chair) + 1}`);
  const handOf = (chair: string) => (mine[handSlot(chair)] as Card[] | undefined) ?? null;
  const owns = (chair: string) => handOf(chair) !== null;
  const ownedChairs = chairs.filter(owns);

  const write = (next: CoupState) => updateData(item.id, { game: "coup", state: clean(next) } as never);
  const run = async (work: () => Promise<unknown>) => {
    if (busy || !canEdit) return;
    setBusy(true);
    try {
      await work();
    } finally {
      setBusy(false);
      setChosen([]);
    }
  };
  /** Alive, once this chair has given up a card. */
  const aliveAfterLoss = (who: string) =>
    alive.filter((c) => c !== who || sizeOf(piles, handSlot(c)) > 1);

  // ---------------------------------------------------------------------------
  // Dealing
  // ---------------------------------------------------------------------------

  const deal = () =>
    run(async () => {
      if (!me) return;
      // With two or more people sitting down, the game is theirs: empty chairs
      // are not dealt in, so nobody waits on a seat with nobody in it. With
      // fewer, every chair plays, from whichever phone is passed round.
      const seated = chairs.filter((c) => holders[c]);
      const players = seated.length >= 2 ? seated : chairs;
      const first = players[state.round % players.length];
      const fresh = startRound(clean(state), players, first);
      delete fresh.revealed;
      delete fresh.tested;
      const set = await pile("pile_setup", {
        p_item: item.id,
        p_piles: [{ slot: COURT, cards: deckFor(state.rules, players.length), shuffle: true }],
        p_public: { game: "coup", state: fresh },
      });
      if (set.error) return;
      await pile("pile_deal", {
        p_item: item.id,
        p_from: COURT,
        p_targets: players.map((chair) => ({ slot: handSlot(chair), owner: holders[chair] ?? me.userId, count: 2 })),
      });
    });

  const resize = (by: number) => {
    const count = Math.max(MIN_SEATS, Math.min(MAX_SEATS, state.seatCount + by));
    const keep = chairsFor(count);
    void write({
      ...state,
      seatCount: count,
      phase: { kind: "idle" },
      seats: Object.fromEntries(keep.map((c) => [c, state.seats[c] ?? null])),
      holders: Object.fromEntries(keep.map((c) => [c, holders[c] ?? null])),
    });
  };

  // ---------------------------------------------------------------------------
  // Doing things
  // ---------------------------------------------------------------------------

  const act = (kind: ActionKind, at?: string) =>
    run(async () => {
      const action: Action = { kind, by: state.turn, ...(at && kind !== "convert" ? { target: at } : {}) };
      const next = declare(state, action, alive, label, kind === "convert" ? at : undefined);
      setTarget(null);
      await write(next.state);
    });

  const respondPass = (who: string) => run(() => write(pass(state, who, alive, label).state));
  const respondBlock = (who: string, card: Card) => run(() => write(block(state, who, card, label)));
  /**
   * Embezzling claims there is no Duke in a hand. The database checks, in front
   * of everyone -- the answer is logged on the item -- and that settles it.
   */
  const checkForDuke = async (current: CoupState) => {
    if (current.phase.kind !== "prove" || current.phase.card !== "not-duke") return;
    const tested = await pile<boolean>("pile_test", {
      p_item: item.id,
      p_slot: handSlot(current.phase.claimant),
      p_card: "duke",
    });
    if (tested.error) return;
    await write(settleChallenge(current, tested.data === false, label));
  };

  const respondChallenge = (who: string) =>
    run(async () => {
      const challenged = challenge(state, who, label);
      await write(challenged);
      await checkForDuke(challenged);
    });

  /** The claimant shows the card: out of the hand, back into the court, a new one drawn. */
  const proveIt = (card: Card) =>
    run(async () => {
      if (phase.kind !== "prove") return;
      const settled = settleChallenge(state, true, label);
      const shown = { ...settled, log: [...settled.log.slice(-24), `${label(phase.claimant)} shows the ${card}`] };
      const taken = await pile("pile_take", {
        p_item: item.id,
        p_from: handSlot(phase.claimant),
        p_cards: [card],
        p_public: { game: "coup", state: clean(shown) },
      });
      if (taken.error) return;
      await pile("pile_put", { p_item: item.id, p_to: COURT, p_cards: [card], p_shuffle: true });
      await pile("pile_draw", { p_item: item.id, p_from: COURT, p_to: handSlot(phase.claimant), p_count: 1 });
    });

  const concede = () => run(() => write(settleChallenge(state, false, label)));

  /** Giving up a card, face up for good. */
  const loseCard = (card: Card) =>
    run(async () => {
      if (phase.kind !== "lose") return;
      if (phase.forced && card !== phase.forced) return;
      const next = afterLoss(state, phase.who, card, aliveAfterLoss(phase.who), label);
      await pile("pile_take", {
        p_item: item.id,
        p_from: handSlot(phase.who),
        p_cards: [card],
        p_public: { game: "coup", state: clean(next.state) },
      });
    });

  const guess = (card: Card) =>
    run(async () => {
      if (phase.kind !== "guess" || !phase.action.target) return;
      const tested = await pile<boolean>("pile_test", {
        p_item: item.id,
        p_slot: handSlot(phase.action.target),
        p_card: card,
      });
      if (tested.error) return;
      await write(afterGuess(state, card, Boolean(tested.data), alive, label));
    });

  // The exchange draws into the hand of whoever made it -- which only their
  // own device can do -- so it happens here, on that device.
  const drawing = useRef("");
  const pendingDraw = phase.kind === "exchange" && phase.pending && owns(phase.who) ? `${state.round}:${state.log.length}` : "";
  useEffect(() => {
    if (!pendingDraw || drawing.current === pendingDraw || phase.kind !== "exchange") return;
    drawing.current = pendingDraw;
    void pile("pile_draw", {
      p_item: item.id,
      p_from: COURT,
      p_to: handSlot(phase.who),
      p_count: phase.drawn,
      p_public: { game: "coup", state: clean({ ...state, phase: { ...phase, pending: false } }) },
    });
    // The key says when to draw; the rest is read fresh from this render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingDraw]);

  const finishExchange = () =>
    run(async () => {
      if (phase.kind !== "exchange" || chosen.length !== phase.drawn) return;
      const hand = handOf(phase.who) ?? [];
      const back = chosen.map((i) => hand[Number(i)]);
      await pile("pile_move", {
        p_item: item.id,
        p_from: handSlot(phase.who),
        p_to: COURT,
        p_cards: back,
        p_public: { game: "coup", state: clean(advance(state, alive)) },
      });
      await pile("pile_shuffle", { p_item: item.id, p_slot: COURT });
    });

  /** The target picks a card and shows it to the inquisitor, and only them. */
  const showToInquisitor = (card: Card) =>
    run(async () => {
      if (phase.kind !== "examine") return;
      const viewer = piles?.[handSlot(phase.who)]?.owner;
      if (!viewer) return;
      const shown = await pile("pile_show", {
        p_item: item.id,
        p_from: handSlot(phase.target),
        p_cards: [card],
        p_viewer: viewer,
        p_to: shownSlot(phase.who),
      });
      if (shown.error) return;
      await write({ ...state, phase: { kind: "judge", who: phase.who, target: phase.target } });
    });

  const judge = (swap: boolean) =>
    run(async () => {
      if (phase.kind !== "judge") return;
      await pile("pile_drop", { p_item: item.id, p_slots: [shownSlot(phase.who)] });
      await write(
        swap
          ? { ...state, phase: { kind: "swap", who: phase.target }, log: [...state.log.slice(-24), `${label(phase.who)} makes ${label(phase.target)} swap it`] }
          : advance({ ...state, log: [...state.log.slice(-24), `${label(phase.who)} lets ${label(phase.target)} keep it`] }, alive),
      );
    });

  const swapCard = (card: Card) =>
    run(async () => {
      if (phase.kind !== "swap") return;
      await pile("pile_move", { p_item: item.id, p_from: handSlot(phase.who), p_to: COURT, p_cards: [card] });
      await pile("pile_shuffle", { p_item: item.id, p_slot: COURT });
      await pile("pile_draw", {
        p_item: item.id,
        p_from: COURT,
        p_to: handSlot(phase.who),
        p_count: 1,
        p_public: { game: "coup", state: clean(advance(state, alive)) },
      });
    });

  // ---------------------------------------------------------------------------
  // Whose move, on this device
  // ---------------------------------------------------------------------------

  /** The chair the game is waiting on, if it is one hand's decision. */
  const actor =
    phase.kind === "act"
      ? state.turn
      : phase.kind === "prove"
        ? phase.claimant
        : phase.kind === "lose" || phase.kind === "exchange" || phase.kind === "swap"
          ? phase.who
          : phase.kind === "examine"
            ? phase.target
            : phase.kind === "judge"
              ? phase.who
              : phase.kind === "guess"
                ? phase.action.by
                : null;
  const myMove = actor !== null && owns(actor);
  // The hand on show is the one the game is waiting on, if this device holds
  // it; otherwise your own. A phone holding more than one hand -- passed round
  // the table -- asks before showing anybody's but the person sitting there.
  const shownChair = myMove ? actor : myChair && owns(myChair) ? myChair : (ownedChairs[0] ?? null);
  const gated = ownedChairs.length > 1 && shownChair !== myChair && looking !== shownChair;
  const shownHand = shownChair ? (handOf(shownChair) ?? []) : [];
  const settled = phase.kind === "idle" || phase.kind === "over";

  const responders =
    phase.kind === "respond"
      ? alive.filter((c) => c !== phase.action.by && !phase.passed.includes(c) && owns(c))
      : phase.kind === "blocked"
        ? alive.filter((c) => c !== phase.blocker && !phase.passed.includes(c) && owns(c))
        : [];

  const describe = (action: Action) => {
    const claim = claimOf(action.kind, state.rules);
    return `${label(action.by)}: ${ACTION_LABEL[action.kind]}${action.target ? ` on ${label(action.target)}` : ""}${
      claim ? ` · claiming the ${claim}` : action.kind === "embezzle" ? " · claiming no duke" : ""
    }`;
  };

  const card = (c: Card, faded?: boolean) => (
    <span
      className={clsx(
        "grid h-5 w-4 place-items-center rounded-[3px] font-mono text-[9px] leading-none font-bold text-ink-950 ring-1 ring-white/25",
        faded && "opacity-35",
      )}
      style={{ background: CARD_TINT[c] }}
      title={c}
    >
      {CARD_MARK[c]}
    </span>
  );

  const button = "min-h-9 rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition disabled:opacity-40";

  return (
    <div className="surface grain relative flex size-full flex-col gap-2 overflow-hidden rounded-2xl p-2.5">
      {/* The table's shape, the deck, the rules */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-muted/70">
        <span className="flex items-center gap-0.5">
          <button type="button" disabled={!canEdit || !settled || state.seatCount <= MIN_SEATS} onClick={() => resize(-1)} aria-label={t("one chair fewer")} className="grid size-7 place-items-center rounded transition hover:bg-white/10 hover:text-chalk disabled:opacity-30">
            <Minus className="size-3" strokeWidth={2.6} />
          </button>
          <span className="tabular-nums text-chalk">{state.seatCount}</span>{" "}{t("chairs")}<button type="button" disabled={!canEdit || !settled || state.seatCount >= MAX_SEATS} onClick={() => resize(1)} aria-label={t("one chair more")} className="grid size-7 place-items-center rounded transition hover:bg-white/10 hover:text-chalk disabled:opacity-30">
            <Plus className="size-3" strokeWidth={2.6} />
          </button>
        </span>
        <span title={t("cards face down in the court")}>
          <span className="tabular-nums text-chalk">{sizeOf(piles, COURT)}</span>{" "}{t("asleep")}</span>
        <span title={t(`${copiesFor(tableSize)} of each of the five characters`)}>
          <span className="tabular-nums text-chalk">{deckSize(tableSize)}</span>{" "}{t("in the box")}</span>
        {state.rules.reformation && dealt && (
          <span title={t("the treasury reserve")}>
            <Coins className="mr-0.5 inline size-3" />
            <span className="tabular-nums text-chalk">{state.treasury}</span>{" "}{t("in the treasury")}</span>
        )}
        <span className="ml-auto flex items-center gap-0.5">
          <button type="button" onClick={() => setSetup(true)} disabled={!canEdit} className="flex min-h-8 items-center gap-1 rounded-lg px-1.5 hover:bg-white/8 hover:text-chalk disabled:opacity-40">
            <Settings2 className="size-3" /> {ruleName(state.rules)}
          </button>
          <button type="button" onClick={() => setManual(true)} className="flex min-h-8 items-center gap-1 rounded-lg px-1.5 hover:bg-white/8 hover:text-chalk">
            <BookOpen className="size-3" />{" "}{t("cards")}</button>
        </span>
      </div>

      {/* Everyone at the table */}
      <div className="flex flex-wrap gap-1.5">
        {chairs.map((chair, index) => {
          const who = state.seats[chair];
          const isMine = chair === myChair;
          const player = state.players[chair];
          const held = sizeOf(piles, handSlot(chair));
          const out = dealt && held === 0;
          return (
            <button
              key={chair}
              type="button"
              disabled={!canEdit || !me}
              onClick={() => me && void write({ ...state, ...claimChair(state.seats, holders, chair, me) })}
              title={who ? (isMine ? t("stand up") : who) : t("sit here")}
              className={clsx(
                "flex min-h-10 min-w-0 flex-1 basis-28 items-center gap-1.5 rounded-xl px-2 py-1.5 text-left transition disabled:opacity-60",
                out ? "bg-white/4 opacity-50" : state.turn === chair && dealt ? "bg-white/12 ring-1 ring-glow/45" : "bg-white/5 hover:bg-white/9",
              )}
            >
              <span className="min-w-0 flex-1 truncate text-[11px]">
                {who ? <span className={isMine ? "text-chalk" : "text-muted"}>{who}</span> : <span className="text-muted/55">{t("seat")}{" "}{index + 1}</span>}
                {(state.wins[chair] ?? 0) > 0 && <span className="ml-1 text-warm">{state.wins[chair]}</span>}
              </span>
              {player?.allegiance && (
                <span className={clsx("shrink-0 rounded px-1 text-[9px] font-bold", player.allegiance === "loyalist" ? "bg-[#6aa9e0]/25 text-[#8bc7e8]" : "bg-[#e0655c]/25 text-[#f2a4b8]")} title={player.allegiance}>
                  {player.allegiance === "loyalist" ? "L" : "R"}
                </span>
              )}
              {player && (
                <span className="flex shrink-0 items-center gap-0.5 text-[10px] tabular-nums text-muted">
                  <Coins className="size-3" strokeWidth={2.2} />
                  {player.coins}
                </span>
              )}
              <span className="flex shrink-0 gap-0.5">
                {Array.from({ length: held }, (_, i) => (
                  <span key={i} className="h-5 w-4 rounded-[3px] bg-[#3b3357] ring-1 ring-white/25" title={t("face down")} />
                ))}
                {player?.lost.map((c, i) => <span key={`l${i}`}>{card(c, true)}</span>)}
              </span>
            </button>
          );
        })}
      </div>

      {/* Your cards, and only yours */}
      {shownChair && shownHand.length > 0 && (
        <div className="flex items-center gap-2 rounded-xl bg-white/4 px-2 py-1.5">
          <span className="text-[10px] tracking-wide text-muted/70 uppercase">
            {shownChair === myChair ? t("your cards") : t(`${label(shownChair)}'s cards`)}
          </span>
          {gated ? (
            <button type="button" onClick={() => setLooking(shownChair)} className="flex min-h-8 items-center gap-1.5 rounded-lg bg-white/8 px-2.5 text-[11px] text-chalk">
              <Eye className="size-3.5" />{" "}{t("pass the phone to")}{" "}{label(shownChair)}{t(", then tap to look")}</button>
          ) : (
            <>
              <div className="flex gap-1">
                {shownHand.map((c, i) => (
                  <span key={i} className="flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-semibold text-ink-950" style={{ background: CARD_TINT[c] }}>
                    <span className="font-mono">{CARD_MARK[c]}</span> {c}
                  </span>
                ))}
              </div>
              {ownedChairs.length > 1 && shownChair !== myChair && (
                <button type="button" onClick={() => setLooking(null)} className="ml-auto grid size-8 place-items-center rounded-lg text-muted" aria-label={t("hide")}>
                  <EyeOff className="size-3.5" />
                </button>
              )}
            </>
          )}
        </div>
      )}

      {/* Whatever the table is waiting on */}
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto rounded-xl bg-ink-950/25 p-2 inset-ring inset-ring-white/6">
        {phase.kind === "idle" && (
          <div className="my-auto flex flex-col items-center gap-2">
            <p className="text-center text-[11px] text-muted/60">{t("everyone sits down, then deal -- a chair taken later is dealt nothing")}</p>
            <button type="button" disabled={!canEdit || busy} onClick={() => void deal()} className="min-h-10 rounded-xl bg-chalk px-4 text-[12px] font-semibold text-ink-950 disabled:opacity-40">{t("deal two each")}</button>
          </div>
        )}

        {phase.kind === "over" && (
          <div className="my-auto text-center">
            <p className="text-sm font-semibold text-chalk">{label(phase.winner)}{" "}{t("is the last one standing")}</p>
            <button type="button" disabled={!canEdit || busy} onClick={() => void deal()} className="mt-2 min-h-9 rounded-lg bg-white/8 px-3 text-[11px] text-chalk">{t("deal again")}</button>
          </div>
        )}

        {phase.kind === "act" && (
          <>
            <p className="text-[11px] text-muted">{label(state.turn)}{" "}{t("to move")}</p>
            {myMove && canEdit && (
              <>
                <div className="flex flex-wrap gap-1">
                  {legalActions(state, state.turn, alive).map((kind) => (
                    <button
                      key={kind}
                      type="button"
                      disabled={busy}
                      onClick={() => (needsTarget(kind) || kind === "convert" ? setTarget(target === kind ? null : kind) : void act(kind))}
                      className={clsx(button, target === kind ? "bg-glow/25 text-glow" : "bg-white/8 text-chalk hover:bg-white/14")}
                    >
                      {ACTION_LABEL[kind]}
                    </button>
                  ))}
                </div>
                {target && (
                  <div className="flex flex-wrap items-center gap-1">
                    <span className="text-[10px] text-muted/70">{target === "convert" ? t("whose side?") : t("on whom?")}</span>
                    {target === "convert" && (
                      <button type="button" onClick={() => void act("convert")} className={clsx(button, "bg-glow/20 text-glow")}>{t("my own (1)")}</button>
                    )}
                    {(target === "convert" ? alive.filter((c) => c !== state.turn && state.players[state.turn].coins >= 2) : targetsFor(state, target, state.turn, alive)).map((c) => (
                      <button key={c} type="button" onClick={() => void act(target, c)} className={clsx(button, "bg-glow/20 text-glow")}>
                        {label(c)}
                        {target === "convert" ? " (2)" : ""}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </>
        )}

        {(phase.kind === "respond" || phase.kind === "blocked") && (
          <>
            <p className="text-[12px] text-chalk">
              {phase.kind === "respond" ? describe(phase.action) : t(`${label(phase.blocker)} blocks with the ${phase.card}`)}
            </p>
            <p className="text-[10px] text-muted/60">{t("waiting on")}{" "}{alive.filter((c) => c !== (phase.kind === "respond" ? phase.action.by : phase.blocker) && !phase.passed.includes(c)).length}
            </p>
            {canEdit &&
              responders.map((c) => (
                <div key={c} className="flex flex-wrap items-center gap-1">
                  <span className="text-[10px] text-muted/70">{label(c)}:</span>
                  {(phase.kind === "blocked" || challengeable(phase.action.kind, state.rules)) && (
                    <button type="button" disabled={busy} onClick={() => void respondChallenge(c)} className={clsx(button, "flex items-center gap-1 bg-warm/20 text-warm")}>
                      <ShieldQuestion className="size-3.5" /> {phase.kind === "blocked" ? t("doubt the block") : t("doubt it")}
                    </button>
                  )}
                  {phase.kind === "respond" &&
                    blockers(state, phase.action, alive).chairs.includes(c) &&
                    blockers(state, phase.action, alive).cards.map((b) => (
                      <button key={b} type="button" disabled={busy} onClick={() => void respondBlock(c, b)} className={clsx(button, "bg-white/10 text-chalk")}>{t("block (")}{b})
                      </button>
                    ))}
                  <button type="button" disabled={busy} onClick={() => void respondPass(c)} className={clsx(button, "text-muted")}>{t("allow")}</button>
                </div>
              ))}
          </>
        )}

        {phase.kind === "prove" && (
          <>
            <p className="text-[12px] text-chalk">
              {label(phase.challenger)}{" "}{t("doubts")}{" "}{label(phase.claimant)}
              {phase.card === "not-duke" ? t(" has no duke") : t(` has the ${phase.card}`)}
            </p>
            {phase.card === "not-duke" ? (
              <div className="flex items-center gap-2">
                <p className="text-[10px] text-muted/60">{t("the table checks the hand for a duke")}</p>
                {canEdit && (
                  <button type="button" disabled={busy} onClick={() => void run(() => checkForDuke(state))} className={clsx(button, "bg-white/8 text-chalk")}>{t("check")}</button>
                )}
              </div>
            ) : myMove && !gated && canEdit ? (
              <div className="flex flex-wrap gap-1">
                <button
                  type="button"
                  disabled={busy || !shownHand.includes(phase.card)}
                  onClick={() => void proveIt(phase.card as Card)}
                  className={clsx(button, "text-ink-950")}
                  style={{ background: CARD_TINT[phase.card] }}
                  title={shownHand.includes(phase.card) ? t("show it") : t("you do not hold one")}
                >{t("show the")}{" "}{phase.card}
                </button>
                <button type="button" disabled={busy} onClick={() => void concede()} className={clsx(button, "bg-white/8 text-chalk")}>{t("give a card up")}</button>
              </div>
            ) : (
              <p className="text-[10px] text-muted/60">{t("waiting on")}{" "}{label(phase.claimant)}</p>
            )}
          </>
        )}

        {phase.kind === "lose" && (
          <>
            <p className="text-[12px] text-chalk">
              {label(phase.who)}{" "}{t("gives")}{" "}{phase.forced ? t(`up the ${phase.forced}`) : t("a card up")}
            </p>
            {myMove && !gated && canEdit && (
              <div className="flex flex-wrap gap-1">
                {shownHand.map((c, i) => (
                  <button key={i} type="button" disabled={busy || (phase.forced !== undefined && c !== phase.forced)} onClick={() => void loseCard(c)} className={clsx(button, "text-ink-950")} style={{ background: CARD_TINT[c] }}>
                    {c}
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        {phase.kind === "guess" && (
          <>
            <p className="text-[12px] text-chalk">
              {label(phase.action.by)}{" "}{t("names a card")}{" "}{label(phase.action.target ?? "")}{" "}{t("holds")}</p>
            {myMove && canEdit && (
              <div className="flex flex-wrap gap-1">
                {characters(state.rules).map((c) => (
                  <button key={c} type="button" disabled={busy} onClick={() => void guess(c)} className={clsx(button, "text-ink-950")} style={{ background: CARD_TINT[c] }}>
                    {c}
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        {phase.kind === "exchange" && (
          <>
            <p className="text-[12px] text-chalk">
              {label(phase.who)} {phase.pending ? t("draws from the court") : t(`sends ${phase.drawn} back`)}
            </p>
            {myMove && !gated && !phase.pending && canEdit && (
              <>
                <div className="flex flex-wrap gap-1">
                  {shownHand.map((c, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() =>
                        setChosen((now) => (now.includes(String(i)) ? now.filter((x) => x !== String(i)) : now.length >= phase.drawn ? now : [...now, String(i)]))
                      }
                      className={clsx(button, "text-ink-950", chosen.includes(String(i)) ? "ring-2 ring-chalk" : "opacity-80")}
                      style={{ background: CARD_TINT[c] }}
                    >
                      {c}
                    </button>
                  ))}
                </div>
                <button type="button" disabled={busy || chosen.length !== phase.drawn} onClick={() => void finishExchange()} className={clsx(button, "self-start bg-chalk text-ink-950")}>{t("send these back")}</button>
              </>
            )}
          </>
        )}

        {phase.kind === "examine" && (
          <>
            <p className="text-[12px] text-chalk">
              {label(phase.who)}{" "}{t("examines")}{" "}{label(phase.target)}{t(": pick a card to show them, and only them")}</p>
            {myMove && !gated && canEdit && (
              <div className="flex flex-wrap gap-1">
                {shownHand.map((c, i) => (
                  <button key={i} type="button" disabled={busy} onClick={() => void showToInquisitor(c)} className={clsx(button, "text-ink-950")} style={{ background: CARD_TINT[c] }}>{t("show the")}{" "}{c}
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        {phase.kind === "judge" && (
          <>
            <p className="text-[12px] text-chalk">{label(phase.who)}{" "}{t("has seen one of")}{" "}{label(phase.target)}{t("'s cards")}</p>
            {owns(phase.who) && canEdit && (
              <>
                {(mine[shownSlot(phase.who)] as Card[] | undefined)?.[0] && (
                  <p className="text-[11px] text-muted">{t("they showed you the")}{" "}<b className="text-chalk">{(mine[shownSlot(phase.who)] as Card[])[0]}</b>
                  </p>
                )}
                <div className="flex flex-wrap gap-1">
                  <button type="button" disabled={busy} onClick={() => void judge(false)} className={clsx(button, "bg-white/8 text-chalk")}>{t("let them keep it")}</button>
                  <button type="button" disabled={busy} onClick={() => void judge(true)} className={clsx(button, "bg-warm/20 text-warm")}>{t("make them swap it")}</button>
                </div>
              </>
            )}
          </>
        )}

        {phase.kind === "swap" && (
          <>
            <p className="text-[12px] text-chalk">{label(phase.who)}{" "}{t("swaps the card they showed for one from the court")}</p>
            {myMove && !gated && canEdit && (
              <div className="flex flex-wrap gap-1">
                {shownHand.map((c, i) => (
                  <button key={i} type="button" disabled={busy} onClick={() => void swapCard(c)} className={clsx(button, "text-ink-950")} style={{ background: CARD_TINT[c] }}>{t("swap the")}{" "}{c}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 truncate text-[10px] text-muted/60">{state.log.at(-1) ?? t("two cards each, and nobody has to tell the truth")}</p>
        <button type="button" disabled={!canEdit || busy} onClick={() => void deal()} aria-label={t("new game")} title={t("new game")} className="grid size-9 shrink-0 place-items-center rounded-lg text-muted transition hover:bg-white/8 hover:text-chalk disabled:opacity-40 sm:size-8">
          <RotateCcw className="size-3.5" strokeWidth={2.2} />
        </button>
      </div>

      {setup && (
        <RulesSetup
          rules={state.rules}
          onClose={() => setSetup(false)}
          onPick={(rules, seatCount) => {
            setSetup(false);
            const keep = chairsFor(seatCount ?? state.seatCount);
            void write({
              ...state,
              rules,
              seatCount: seatCount ?? state.seatCount,
              phase: { kind: "idle" },
              seats: Object.fromEntries(keep.map((c) => [c, state.seats[c] ?? null])),
              holders: Object.fromEntries(keep.map((c) => [c, holders[c] ?? null])),
            });
          }}
        />
      )}

      {manual && <Manual rules={state.rules} onClose={() => setManual(false)} />}
    </div>
  );
}

function ruleName(rules: CoupRules): string {
  const bits: string[] = [];
  if (rules.mode === "duel") bits.push("two players");
  if (rules.inquisitor) bits.push("inquisitor");
  if (rules.reformation) bits.push("reformation");
  if (rules.guess && rules.mode !== "duel") bits.push("guessing");
  return bits.length ? bits.join(" · ") : "standard";
}

/** Choosing the way this table plays: a preset, then any of the variants. */
function RulesSetup({
  rules,
  onClose,
  onPick,
}: {
  rules: CoupRules;
  onClose: () => void;
  onPick: (rules: CoupRules, seatCount?: number) => void;
}) {
  const [draft, setDraft] = useState<CoupRules>(rules);
  const toggle = (key: "inquisitor" | "reformation" | "guess") => setDraft((d) => ({ ...d, [key]: !d[key] }));

  return (
    <RulesSheet title={t("how this table plays")} onClose={onClose}>
      <div className="grid grid-cols-3 gap-1">
        {(Object.keys(PRESETS) as Preset[]).map((preset) => (
          <button
            key={preset}
            type="button"
            onClick={() => setDraft({ ...PRESETS[preset] })}
            className={clsx(
              "min-h-10 rounded-xl px-2 text-[11px] font-medium",
              JSON.stringify(draft) === JSON.stringify(PRESETS[preset]) ? "bg-chalk text-ink-950" : "bg-white/8 text-chalk",
            )}
          >
            {PRESET_NAME[preset]}
          </button>
        ))}
      </div>
      <div className="space-y-1">
        {(
          [
            ["inquisitor", "the Inquisitor (expansion)", "replaces the Ambassador: exchange one card, or examine someone else's"],
            ["reformation", "the Reformation (expansion)", "everyone is on one of two sides and cannot attack their own; paying to change sides, and a treasury to steal"],
            ["guess", "guess to eliminate", "a coup or an assassination must name the card; a wrong guess misses"],
          ] as const
        ).map(([key, title, hint]) => (
          <button
            key={key}
            type="button"
            onClick={() => toggle(key)}
            className={clsx("flex w-full items-start gap-2 rounded-xl p-2 text-left", draft[key] ? "bg-glow/15" : "bg-white/5")}
          >
            <span className={clsx("mt-0.5 size-4 shrink-0 rounded border", draft[key] ? "border-glow bg-glow" : "border-white/30")} />
            <span>
              <b>{title}</b>
              <br />
              <span className="text-[10px]">{t(hint)}</span>
            </span>
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={() => onPick(draft, draft.mode === "duel" ? 2 : undefined)}
        className="min-h-10 w-full rounded-xl bg-chalk text-[12px] font-semibold text-ink-950"
      >{t("play it this way")}</button>
    </RulesSheet>
  );
}

/**
 * What the characters are. Worth having to hand: the cards on the table are
 * coloured slivers, which tells a newcomer nothing.
 */
function Manual({ rules, onClose }: { rules: CoupRules; onClose: () => void }) {
  return (
    <RulesSheet title={t("the five characters")} onClose={onClose}>
      {characters(rules).map((c) => {
        const guide = CARD_GUIDE[c];
        return (
          <div key={c} className="flex items-start gap-2">
            <div aria-hidden className="shrink-0 rounded-md px-1.5 py-1 font-mono text-[9px] leading-[1.15] font-bold whitespace-pre text-ink-950" style={{ background: CARD_TINT[c] }}>
              {guide.art.map((line, i) => (
                <div key={i}>{t(line)}</div>
              ))}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold" style={{ color: CARD_TINT[c] }}>
                {c} <span className="font-mono text-muted/60">{CARD_MARK[c]}</span>
              </p>
              <p className="text-[10px]">{guide.does}</p>
              <p className="text-[10px] text-muted/60">{guide.stops}</p>
            </div>
          </div>
        );
      })}
      <div className="border-t border-white/8 pt-2">
        <h4>{t("the moves nobody can deny")}</h4>
        <p>{t("income: take 1 coin. foreign aid: take 2 -- a Duke can stop it. coup: pay 7, someone loses a card; nothing stops it, and at 10 coins it is all you may do.")}</p>
        <p>{t("You may claim any card, held or not. If somebody doubts you,")}{" "}<b>{t("show it")}</b>{" "}{t("-- it goes back into the court and you draw a new one, and the doubter loses a card -- or give a card up yourself.")}</p>
      </div>
      {rules.reformation && (
        <div className="border-t border-white/8 pt-2">
          <h4>{t("the reformation")}</h4>
          <p>{t("Everyone is a")}{" "}<b>{t("Loyalist")}</b>{" "}{t("or a")}{" "}<b>{t("Reformist")}</b>. You cannot coup, assassinate, steal from, or block the foreign
            aid of your own side -- unless everyone is on one side. <b>{t("Convert")}</b>{t(": pay 1 to change your side, or 2 to change someone else's; the coins go to the treasury.")}{" "}<b>{t("Embezzle")}</b>{t(": take the whole treasury by claiming you do not hold the Duke. Doubt it, and the table checks.")}</p>
        </div>
      )}
      {rules.guess && (
        <div className="border-t border-white/8 pt-2">
          <h4>{t("guessing")}</h4>
          <p>{t("To knock a card out with a coup or an assassination, name the character you think they hold. Right, and they lose that card; wrong, and the action is spent for nothing.")}{rules.mode === "duel" && t(" At a table of two, whoever goes first starts with one coin.")}
          </p>
        </div>
      )}
    </RulesSheet>
  );
}

/** The state without what the database owns, or what the old version kept. */
function clean(state: CoupState): CoupState {
  const out = { ...state } as CoupState & Record<string, unknown>;
  delete out.piles;
  delete out.deck;
  return out;
}
