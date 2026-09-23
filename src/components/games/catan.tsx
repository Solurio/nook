"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { BookOpen, Minus, Plus, Shield, Star, Swords, Waypoints } from "lucide-react";
import { useRoom } from "@/realtime/room-provider";
import { usePiles } from "@/realtime/use-piles";
import { useHandOver } from "@/realtime/use-hand-over";
import { useRoomStore } from "@/state/room-store";
import { chairOf, claimChair } from "@/lib/seats";
import { randomBelow } from "@/lib/dice";
import { sizeOf } from "@/lib/piles";
import { HEXES } from "@/lib/catan-board";
import {
  COST,
  DEV_DECK,
  DEV_NAME,
  DEV_PILE,
  DEV_TEXT,
  MAX_SEATS,
  MIN_SEATS,
  PLAYED_PILE,
  RESOURCES,
  WIN,
  acceptTrade,
  bank,
  bankTrade,
  buildCity,
  buildRoad,
  buildSettlement,
  buyDev,
  canPay,
  cancelOffer,
  citySpots,
  claimWin,
  devKind,
  devSlot,
  discard,
  emptyCatan,
  emptyHand,
  endTurn,
  handSize,
  longestRoadOf,
  moveRobber,
  newSlot,
  offerTrade,
  piecesLeft,
  playKnight,
  playMonopoly,
  playRoadBuilding,
  playYearOfPlenty,
  publicPoints,
  roadSpots,
  roll,
  settleSpots,
  setupRoad,
  setupSettlement,
  startGame,
  steal,
  tradeRate,
  type CatanState,
  type Hand,
  type Resource,
} from "@/lib/catan";
import type { Item } from "@/lib/types";
import CatanBoardView, { PLAYER_COLOR } from "./catan-board-view";
import { RESOURCE_NAME, ResourceChip } from "./catan-icons";
import DieFace from "./die-face";
import RulesSheet from "./rules-sheet";
import { t } from "@/lib/i18n";

type Build = "road" | "settlement" | "city";

const COLOR_NAME: Record<string, string> = { s0: "red", s1: "blue", s2: "white", s3: "orange" };

function Cost({ hand }: { hand: Hand }) {
  return (
    <span className="flex gap-0.5">
      {RESOURCES.flatMap((r) => Array.from({ length: hand[r] }, (_, i) => <ResourceChip key={`${r}${i}`} r={r} size={11} />))}
    </span>
  );
}

/** A row of resources to count some out: tap to add one, the minus to take one back. */
function Counter({ value, max, onChange }: { value: Hand; max?: Hand; onChange: (h: Hand) => void }) {
  return (
    <span className="flex flex-wrap gap-1">
      {RESOURCES.map((r) => (
        <span key={r} className="flex items-center gap-0.5 rounded-lg bg-white/5 p-0.5">
          <button
            type="button"
            disabled={max !== undefined && value[r] >= max[r]}
            onClick={() => onChange({ ...value, [r]: value[r] + 1 })}
            aria-label={t(`one more ${r}`)}
            className="disabled:opacity-40"
          >
            <ResourceChip r={r} n={value[r]} size={18} dim={value[r] === 0} />
          </button>
          <button
            type="button"
            disabled={value[r] === 0}
            onClick={() => onChange({ ...value, [r]: value[r] - 1 })}
            aria-label={t(`one less ${r}`)}
            className="grid size-5 place-items-center rounded text-muted hover:text-chalk disabled:opacity-25"
          >
            <Minus className="size-3" />
          </button>
        </span>
      ))}
    </span>
  );
}

/**
 * Catan on the table: the island in the middle, everyone's pieces on it, the
 * dice for everyone to watch. Development cards come from a deck the database
 * shuffled and are yours alone until played.
 */
export default function Catan({ item, state: raw }: { item: Item<"game">; state: unknown }) {
  const { updateData, pile, canEdit } = useRoom();
  const me = useRoomStore((s) => s.me);
  const state = useMemo<CatanState>(() => ({ ...emptyCatan(), ...(raw as Partial<CatanState>) }) as CatanState, [raw]);

  const [busy, setBusy] = useState(false);
  const [manual, setManual] = useState(false);
  const [build, setBuild] = useState<{ key: string; what: Build | null }>({ key: "", what: null });
  const [giving, setGiving] = useState<Resource | null>(null);
  const [offerDraft, setOfferDraft] = useState<{ give: Hand; want: Hand } | null>(null);
  const [discards, setDiscards] = useState<Record<string, Hand>>({});
  const [choosing, setChoosing] = useState<{ card: string; picks: Resource[] } | null>(null);

  const chairs = useMemo(
    () => Array.from({ length: Math.max(MIN_SEATS, Math.min(MAX_SEATS, state.seatCount)) }, (_, i) => `s${i}`),
    [state.seatCount],
  );
  const holders = useMemo(() => state.holders ?? {}, [state.holders]);
  const myChair = chairOf(state.seats, holders, me);
  const mine = usePiles(item.id, state.piles);
  useHandOver(item.id, state.piles, holders);

  const label = (chair: string) => state.seats[chair] ?? COLOR_NAME[chair] ?? chair;
  const plays = (chair: string) => canEdit && (holders[chair] ? holders[chair] === me?.userId : true);
  const playing = state.phase === "play";
  const turn = state.turn;
  const myTurn = playing && plays(turn);

  const publicState = (next: CatanState) => ({ game: "catan", state: clean(next) });
  const write = (next: CatanState) => updateData(item.id, publicState(next) as never);
  const latest = (): CatanState => {
    const data = useRoomStore.getState().items[item.id]?.data as { state?: CatanState } | undefined;
    return { ...emptyCatan(), ...(data?.state ?? state) };
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
  /** A move worked out from the latest state; nothing is written if it changed nothing. */
  const move = (fn: (s: CatanState) => CatanState) =>
    run(async () => {
      const now = latest();
      const next = fn(now);
      if (next !== now) await write(next);
    });

  const buildKey = `${state.rolls}:${turn}:${state.step}`;
  const building = build.key === buildKey ? build.what : null;
  const choose = (what: Build | null) => setBuild({ key: buildKey, what: building === what ? null : what });

  // ---------------------------------------------------------------------------
  // Dealing
  // ---------------------------------------------------------------------------

  const deal = () =>
    run(async () => {
      const game = startGame(clean(state), chairs, randomBelow, label);
      await pile("pile_setup", {
        p_item: item.id,
        p_piles: [{ slot: DEV_PILE, cards: DEV_DECK, shuffle: true }],
        p_public: publicState(game),
      });
    });

  // ---------------------------------------------------------------------------
  // The board answers taps
  // ---------------------------------------------------------------------------

  const spots = { vertices: [] as number[], edges: [] as number[], hexes: [] as number[], roadColor: PLAYER_COLOR[turn]?.fill };
  if (myTurn) {
    if (state.step === "setup-settlement") spots.vertices = settleSpots(state, turn, true);
    else if (state.step === "setup-road" || state.step === "roads") spots.edges = roadSpots(state, turn);
    else if (state.step === "robber") spots.hexes = HEXES.map((_, h) => h).filter((h) => h !== state.robber);
    else if (state.step === "main" && building === "road" && piecesLeft(state, turn, "road") > 0) spots.edges = roadSpots(state, turn);
    else if (state.step === "main" && building === "settlement" && piecesLeft(state, turn, "settlement") > 0) spots.vertices = settleSpots(state, turn);
    else if (state.step === "main" && building === "city" && piecesLeft(state, turn, "city") > 0) spots.vertices = citySpots(state, turn);
  }

  const onVertex = (v: number) =>
    move((s) => (s.step === "setup-settlement" ? setupSettlement(s, v, label) : building === "city" ? buildCity(s, v, label) : buildSettlement(s, v, label)));
  const onEdge = (e: number) => move((s) => (s.step === "setup-road" ? setupRoad(s, e, label) : buildRoad(s, e, label)));
  const onHex = (h: number) =>
    move((s) => {
      const next = moveRobber(s, h, label);
      // Only one person to rob: no need to ask.
      return next.step === "steal" && next.victims.length === 1 ? steal(next, next.victims[0], randomBelow, label) : next;
    });

  // ---------------------------------------------------------------------------
  // Development cards
  // ---------------------------------------------------------------------------

  const devChair = plays(turn) && (mine[devSlot(turn)] || mine[newSlot(turn)]) ? turn : myChair;
  const devCards = devChair ? ((mine[devSlot(devChair)] as string[] | undefined) ?? []) : [];
  const freshCards = devChair ? ((mine[newSlot(devChair)] as string[] | undefined) ?? []) : [];
  const deckLeft = sizeOf(state.piles, DEV_PILE);

  const canPlayCard = (card: string) => {
    const kind = devKind(card);
    if (!myTurn || devChair !== turn || state.devPlayed || kind === "vp") return false;
    return state.step === "main" || (kind === "knight" && state.step === "roll");
  };

  const playCard = (card: string, picks: Resource[] = []) =>
    run(async () => {
      const now = latest();
      const kind = devKind(card);
      const next =
        kind === "knight"
          ? playKnight(now, label)
          : kind === "roads"
            ? playRoadBuilding(now, label)
            : kind === "plenty"
              ? playYearOfPlenty(now, picks[0], picks[1], label)
              : kind === "monopoly"
                ? playMonopoly(now, picks[0], label)
                : now;
      if (next === now) return;
      setChoosing(null);
      await pile("pile_move", { p_item: item.id, p_from: devSlot(now.turn), p_to: PLAYED_PILE, p_cards: [card], p_public: publicState(next) });
    });

  const buyCard = () =>
    run(async () => {
      if (!me) return;
      const now = latest();
      const next = buyDev(now, sizeOf(now.piles, DEV_PILE), label);
      if (next === now) return;
      await pile("pile_move", {
        p_item: item.id,
        p_from: DEV_PILE,
        p_to: newSlot(now.turn),
        p_count: 1,
        p_to_owner: holders[now.turn] ?? me.userId,
        p_public: publicState(next),
      });
    });

  const finishTurn = () =>
    run(async () => {
      if (!me) return;
      const now = latest();
      const next = endTurn(now, label);
      if (next === now) return;
      setOfferDraft(null);
      setGiving(null);
      // Cards bought this turn become playable from the next.
      const fresh = sizeOf(now.piles, newSlot(now.turn));
      if (fresh > 0 && mine[newSlot(now.turn)]) {
        await pile("pile_move", {
          p_item: item.id,
          p_from: newSlot(now.turn),
          p_to: devSlot(now.turn),
          p_count: fresh,
          p_to_owner: holders[now.turn] ?? me.userId,
          p_public: publicState(next),
        });
      } else {
        await write(next);
      }
    });

  // Hidden victory points: only the screen holding them knows. On your own
  // turn, the moment they take you to ten, they are shown and the game is won.
  const vpOf = (chair: string) =>
    [...((mine[devSlot(chair)] as string[] | undefined) ?? []), ...((mine[newSlot(chair)] as string[] | undefined) ?? [])].filter(
      (c) => devKind(c) === "vp",
    );
  const hiddenVp = playing && plays(turn) ? vpOf(turn) : [];
  const claimKey = hiddenVp.length && publicPoints(state, turn) + hiddenVp.length >= WIN ? `${turn}:${state.rolls}:${publicPoints(state, turn)}` : "";
  const claimed = useRef("");
  useEffect(() => {
    if (!claimKey || claimed.current === claimKey || !canEdit) return;
    claimed.current = claimKey;
    void (async () => {
      const now = latest();
      const chair = now.turn;
      const fresh = ((mine[newSlot(chair)] as string[] | undefined) ?? []).filter((c) => devKind(c) === "vp");
      if (fresh.length) await pile("pile_move", { p_item: item.id, p_from: newSlot(chair), p_to: devSlot(chair), p_cards: fresh });
      const cards = vpOf(chair);
      const won = claimWin(latest(), chair, cards.length, label);
      if (won.phase !== "over") return;
      await pile("pile_take", { p_item: item.id, p_from: devSlot(chair), p_cards: cards, p_public: publicState(won) });
    })();
    // Keyed on the moment it became true; the rest is read fresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claimKey]);

  // ---------------------------------------------------------------------------
  // What this screen shows
  // ---------------------------------------------------------------------------

  const viewer = plays(turn) ? turn : myChair;
  const hand = viewer ? (state.hands[viewer] ?? emptyHand()) : null;
  const [arrivedAt] = useState(() => state.rolls);
  const tumble = state.rolls > arrivedAt;
  const myDiscards = Object.keys(state.discards).filter((c) => plays(c));
  const left = bank(state);

  const prompt = (): string => {
    if (state.phase === "over" && state.winner) return `${label(state.winner)} wins with ${publicPoints(state, state.winner)} points`;
    if (!playing) return "";
    const who = label(turn);
    switch (state.step) {
      case "setup-settlement":
        return myTurn ? "put down a settlement" : `${who} is choosing where to settle`;
      case "setup-road":
        return myTurn ? "and a road next to it" : `${who} is placing a road`;
      case "roll":
        return myTurn ? "roll the dice" : `${who} to roll`;
      case "discard":
        return `a 7 -- waiting for ${Object.keys(state.discards).map(label).join(", ")} to discard half`;
      case "robber":
        return myTurn ? "move the robber: tap a hex" : `${who} is moving the robber`;
      case "steal":
        return myTurn ? "steal from whom?" : `${who} is stealing`;
      case "roads":
        return myTurn ? `${state.freeRoads} free road${state.freeRoads === 1 ? "" : "s"} to place` : `${who} is building roads`;
      default:
        return myTurn ? (building ? `tap where the ${building} goes` : "build, trade or play a card") : `${who}'s turn`;
    }
  };

  return (
    <div className="surface grain relative flex size-full flex-col gap-1.5 overflow-hidden rounded-2xl p-2">
      {/* The players */}
      <div className="flex flex-wrap items-center gap-1 text-[10px] text-muted/70">
        {!playing && (
          <span className="flex items-center gap-0.5">
            <button
              type="button"
              disabled={!canEdit || state.seatCount <= MIN_SEATS}
              onClick={() => void write({ ...state, seatCount: state.seatCount - 1 })}
              aria-label={t("one chair fewer")}
              className="grid size-7 place-items-center rounded hover:bg-white/10 disabled:opacity-30"
            >
              <Minus className="size-3" strokeWidth={2.6} />
            </button>
            <span className="tabular-nums text-chalk">{state.seatCount}</span>{" "}{t("players")}<button
              type="button"
              disabled={!canEdit || state.seatCount >= MAX_SEATS}
              onClick={() => void write({ ...state, seatCount: state.seatCount + 1 })}
              aria-label={t("one chair more")}
              className="grid size-7 place-items-center rounded hover:bg-white/10 disabled:opacity-30"
            >
              <Plus className="size-3" strokeWidth={2.6} />
            </button>
          </span>
        )}
        {chairs.map((chair) => {
          const inGame = state.order.includes(chair);
          return (
            <button
              key={chair}
              type="button"
              disabled={!canEdit || !me}
              onClick={() => me && void write({ ...state, ...claimChair(state.seats, holders, chair, me) })}
              className={clsx(
                "flex min-h-7 items-center gap-1 rounded-lg px-1.5 disabled:cursor-default",
                playing && turn === chair ? "bg-white/12 ring-1 ring-warm/60" : "bg-white/5",
              )}
              title={inGame ? t(`longest road ${longestRoadOf(state, chair)}, knights ${state.knights[chair] ?? 0}`) : t("sit here")}
            >
              <span className="size-2.5 rounded-full ring-1 ring-black/30" style={{ background: PLAYER_COLOR[chair].fill }} />
              <span className={clsx("max-w-20 truncate", chair === myChair ? "text-chalk" : "text-muted")}>
                {state.seats[chair] ?? <span className="text-muted/50">{COLOR_NAME[chair]}</span>}
              </span>
              {inGame && (
                <>
                  <span className="flex items-center gap-0.5 text-warm tabular-nums">
                    <Star className="size-2.5 fill-warm" />
                    {publicPoints(state, chair)}
                  </span>
                  <span className="tabular-nums" title={t("resource cards")}>
                    {handSize(state.hands[chair] ?? emptyHand())}c
                  </span>
                  {(state.devCount[chair] ?? 0) > 0 && (
                    <span className="tabular-nums text-glow/80" title={t("development cards")}>
                      {state.devCount[chair]}d
                    </span>
                  )}
                  {state.longestRoad === chair && <Waypoints className="size-3 text-warm" aria-label={t("longest road")} />}
                  {state.largestArmy === chair && <Shield className="size-3 text-warm" aria-label={t("largest army")} />}
                </>
              )}
              {(state.wins[chair] ?? 0) > 0 && <span className="text-warm">{state.wins[chair]}</span>}
            </button>
          );
        })}
        <button type="button" onClick={() => setManual(true)} className="ml-auto flex min-h-7 items-center gap-1 rounded-lg px-1.5 hover:bg-white/8 hover:text-chalk">
          <BookOpen className="size-3" />{" "}{t("rules")}</button>
      </div>

      {!state.board ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <p className="max-w-80 text-[11px] text-muted/75">{t("Two to four players. A new island every game. Empty chairs play from whoever deals; sit down to keep your development cards to yourself.")}</p>
          <button type="button" disabled={!canEdit || busy} onClick={() => void deal()} className="min-h-10 rounded-xl bg-chalk px-5 text-[12px] font-semibold text-ink-950 disabled:opacity-40">{t("deal")}</button>
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_15.5rem] gap-2 max-md:grid-cols-1 max-md:grid-rows-[minmax(0,1fr)_auto]">
          <div className="relative min-h-0 overflow-hidden rounded-xl">
            <CatanBoardView state={state} spots={spots} onVertex={onVertex} onEdge={onEdge} onHex={onHex} />
          </div>

          {/* What to do */}
          <div className="flex min-h-0 flex-col gap-1.5 overflow-y-auto text-[11px]">
            <div className="flex items-center gap-2 rounded-xl bg-white/4 p-1.5">
              <span className="flex gap-1">
                {(state.dice ?? [null, null]).map((d, i) =>
                  d ? (
                    <DieFace key={`${state.rolls}:${i}`} sides={6} value={d} size={30} tumble={tumble} delay={i * 90} tint={i ? "#f2d86b" : "#f4efe6"} />
                  ) : (
                    <span key={i} className="size-[30px] rounded-md bg-white/6" />
                  ),
                )}
              </span>
              <span className="min-w-0 flex-1 leading-tight text-chalk">
                <span className="mr-1 inline-block size-2 rounded-full" style={{ background: PLAYER_COLOR[state.winner ?? turn]?.fill }} />
                {prompt()}
              </span>
            </div>

            {state.phase === "over" && (
              <button type="button" disabled={!canEdit || busy} onClick={() => void deal()} className="min-h-9 rounded-xl bg-chalk px-4 text-[12px] font-semibold text-ink-950">{t("a new island")}</button>
            )}

            {myTurn && state.step === "roll" && (
              <button type="button" disabled={busy} onClick={() => void move((s) => roll(s, randomBelow, label))} className="min-h-10 rounded-xl bg-chalk text-[12px] font-semibold text-ink-950 active:scale-95">{t("roll")}</button>
            )}

            {/* Discarding after a 7 */}
            {state.step === "discard" &&
              myDiscards.map((chair) => {
                const draft = discards[chair] ?? emptyHand();
                const owed = state.discards[chair];
                return (
                  <div key={chair} className="flex flex-col gap-1 rounded-xl bg-[#e0655c]/10 p-1.5">
                    <span className="text-[#f2a4b8]">
                      {label(chair)}{" "}{t("discards")}{" "}{owed} ({handSize(draft)}{" "}{t("chosen)")}</span>
                    <Counter value={draft} max={state.hands[chair]} onChange={(h) => setDiscards({ ...discards, [chair]: h })} />
                    <button
                      type="button"
                      disabled={busy || handSize(draft) !== owed}
                      onClick={() => {
                        setDiscards({ ...discards, [chair]: emptyHand() });
                        void move((s) => discard(s, chair, draft));
                      }}
                      className="min-h-8 rounded-lg bg-chalk font-semibold text-ink-950 disabled:opacity-35"
                    >{t("discard these")}</button>
                  </div>
                );
              })}

            {myTurn && state.step === "steal" && (
              <div className="flex flex-wrap gap-1">
                {state.victims.map((v) => (
                  <button key={v} type="button" disabled={busy} onClick={() => void move((s) => steal(s, v, randomBelow, label))} className="flex min-h-8 items-center gap-1 rounded-lg bg-white/8 px-2 text-chalk">
                    <span className="size-2.5 rounded-full" style={{ background: PLAYER_COLOR[v].fill }} />
                    {label(v)} ({handSize(state.hands[v])})
                  </button>
                ))}
              </div>
            )}

            {/* Building */}
            {myTurn && state.step === "main" && hand && (
              <div className="grid grid-cols-2 gap-1">
                {(
                  [
                    ["road", COST.road, roadSpots(state, turn).length > 0 && piecesLeft(state, turn, "road") > 0],
                    ["settlement", COST.settlement, settleSpots(state, turn).length > 0 && piecesLeft(state, turn, "settlement") > 0],
                    ["city", COST.city, citySpots(state, turn).length > 0 && piecesLeft(state, turn, "city") > 0],
                  ] as Array<[Build, Hand, boolean]>
                ).map(([what, cost, room]) => (
                  <button
                    key={what}
                    type="button"
                    disabled={busy || !room || !canPay(hand, cost)}
                    onClick={() => choose(what)}
                    className={clsx(
                      "flex min-h-9 flex-col items-start gap-0.5 rounded-lg px-1.5 py-1 text-left disabled:opacity-35",
                      building === what ? "bg-warm/25 text-warm ring-1 ring-warm/60" : "bg-white/6 text-chalk",
                    )}
                  >
                    {what} <Cost hand={cost} />
                  </button>
                ))}
                <button
                  type="button"
                  disabled={busy || deckLeft <= 0 || !canPay(hand, COST.dev)}
                  onClick={() => void buyCard()}
                  className="flex min-h-9 flex-col items-start gap-0.5 rounded-lg bg-white/6 px-1.5 py-1 text-left text-chalk disabled:opacity-35"
                >{t("card (")}{deckLeft}{" "}{t("left)")}{" "}<Cost hand={COST.dev} />
                </button>
              </div>
            )}

            {/* Trading */}
            {myTurn && state.step === "main" && hand && (
              <div className="flex flex-col gap-1 rounded-xl bg-white/4 p-1.5">
                <span className="text-muted">
                  {giving ? t(`give ${tradeRate(state, turn, giving)} ${giving} for...`) : t("trade with the bank: give")}
                </span>
                <span className="flex flex-wrap gap-1">
                  {RESOURCES.map((r) =>
                    giving ? (
                      <button
                        key={r}
                        type="button"
                        disabled={busy || r === giving || left[r] < 1}
                        onClick={() => {
                          const g = giving;
                          setGiving(null);
                          void move((s) => bankTrade(s, g, r));
                        }}
                        className="disabled:opacity-30"
                        aria-label={t(`get ${r}`)}
                      >
                        <ResourceChip r={r} size={20} />
                      </button>
                    ) : (
                      <button
                        key={r}
                        type="button"
                        disabled={hand[r] < tradeRate(state, turn, r)}
                        onClick={() => setGiving(r)}
                        className="flex flex-col items-center disabled:opacity-30"
                        aria-label={t(`give ${r}`)}
                      >
                        <ResourceChip r={r} size={20} />
                        <span className="text-[8px] tabular-nums">{tradeRate(state, turn, r)}:1</span>
                      </button>
                    ),
                  )}
                  {giving && (
                    <button type="button" onClick={() => setGiving(null)} className="px-1 text-muted hover:text-chalk">{t("cancel")}</button>
                  )}
                </span>
                {!state.offer &&
                  (offerDraft ? (
                    <div className="flex flex-col gap-1 border-t border-white/8 pt-1">
                      <span className="text-muted">{t("you give")}</span>
                      <Counter value={offerDraft.give} max={hand} onChange={(g) => setOfferDraft({ ...offerDraft, give: g })} />
                      <span className="text-muted">{t("you want")}</span>
                      <Counter value={offerDraft.want} onChange={(w) => setOfferDraft({ ...offerDraft, want: w })} />
                      <span className="flex gap-1">
                        <button
                          type="button"
                          disabled={busy || !handSize(offerDraft.give) || !handSize(offerDraft.want)}
                          onClick={() => {
                            const d = offerDraft;
                            setOfferDraft(null);
                            void move((s) => offerTrade(s, d.give, d.want));
                          }}
                          className="min-h-8 flex-1 rounded-lg bg-chalk font-semibold text-ink-950 disabled:opacity-35"
                        >{t("offer it")}</button>
                        <button type="button" onClick={() => setOfferDraft(null)} className="min-h-8 rounded-lg px-2 text-muted hover:text-chalk">{t("never mind")}</button>
                      </span>
                    </div>
                  ) : (
                    <button type="button" onClick={() => setOfferDraft({ give: emptyHand(), want: emptyHand() })} className="min-h-8 self-start rounded-lg bg-white/6 px-2 text-chalk">{t("offer the table a trade")}</button>
                  ))}
              </div>
            )}

            {/* An offer on the table, for everyone to see */}
            {playing && state.offer && (
              <div className="flex flex-col gap-1 rounded-xl bg-glow/10 p-1.5">
                <span className="text-chalk">{label(state.offer.from)}{" "}{t("offers")}</span>
                <span className="flex items-center gap-1">
                  <Cost hand={state.offer.give} />
                  <span className="text-muted">{t("for")}</span>
                  <Cost hand={state.offer.want} />
                </span>
                <span className="flex flex-wrap gap-1">
                  {state.order
                    .filter((c) => c !== state.offer?.from && plays(c))
                    .map((c) => (
                      <button
                        key={c}
                        type="button"
                        disabled={busy || !canPay(state.hands[c], state.offer!.want)}
                        onClick={() => void move((s) => acceptTrade(s, c, label))}
                        className="min-h-8 rounded-lg bg-chalk px-2 font-semibold text-ink-950 disabled:opacity-35"
                      >
                        {label(c)}{" "}{t("takes it")}</button>
                    ))}
                  {plays(state.offer.from) && (
                    <button type="button" disabled={busy} onClick={() => void move(cancelOffer)} className="min-h-8 rounded-lg px-2 text-muted hover:text-chalk">{t("withdraw")}</button>
                  )}
                </span>
              </div>
            )}

            {myTurn && (state.step === "main" || state.step === "roads") && (
              <button type="button" disabled={busy} onClick={() => void finishTurn()} className="min-h-9 rounded-xl bg-white/10 text-[12px] text-chalk">{t("end turn")}</button>
            )}

            {/* Your hand and your cards */}
            {hand && playing && (
              <div className="mt-auto flex flex-col gap-1 rounded-xl bg-white/4 p-1.5">
                <span className="text-muted">{viewer === myChair ? t("your hand") : t(`${label(viewer as string)}'s hand`)}</span>
                <span className="flex flex-wrap gap-1.5">
                  {RESOURCES.map((r) => (
                    <ResourceChip key={r} r={r} n={hand[r]} size={22} dim={!hand[r]} />
                  ))}
                </span>
                {(devCards.length > 0 || freshCards.length > 0) && (
                  <span className="flex flex-col gap-1 border-t border-white/8 pt-1">
                    {[...devCards.map((c) => ({ c, fresh: false })), ...freshCards.map((c) => ({ c, fresh: true }))].map(({ c, fresh }) => {
                      const kind = devKind(c);
                      const playable = !fresh && canPlayCard(c);
                      return (
                        <span key={c} className="flex items-center gap-1.5" title={DEV_TEXT[kind]}>
                          {kind === "knight" ? <Swords className="size-3 text-glow" /> : <Star className="size-3 text-warm" />}
                          <span className={clsx("min-w-0 flex-1 truncate", fresh ? "text-muted" : "text-chalk")}>
                            {DEV_NAME[kind]}
                            {fresh && t(" (new)")}
                          </span>
                          {playable &&
                            (kind === "plenty" || kind === "monopoly" ? (
                              <button type="button" onClick={() => setChoosing(choosing?.card === c ? null : { card: c, picks: [] })} className="min-h-7 rounded-md bg-white/10 px-2 text-chalk">{t("play")}</button>
                            ) : (
                              <button type="button" disabled={busy} onClick={() => void playCard(c)} className="min-h-7 rounded-md bg-white/10 px-2 text-chalk">{t("play")}</button>
                            ))}
                        </span>
                      );
                    })}
                    {choosing && (
                      <span className="flex flex-col gap-1 rounded-lg bg-white/5 p-1">
                        <span className="text-muted">
                          {devKind(choosing.card) === "plenty" ? t(`take two (${choosing.picks.map((p) => RESOURCE_NAME[p]).join(", ") || "none yet"})`) : t("everyone gives you all their...")}
                        </span>
                        <span className="flex gap-1">
                          {RESOURCES.map((r) => (
                            <button
                              key={r}
                              type="button"
                              disabled={busy || (devKind(choosing.card) === "plenty" && left[r] < choosing.picks.filter((p) => p === r).length + 1)}
                              onClick={() => {
                                if (devKind(choosing.card) === "monopoly") {
                                  void playCard(choosing.card, [r]);
                                  return;
                                }
                                const picks = [...choosing.picks, r];
                                if (picks.length === 2) void playCard(choosing.card, picks);
                                else setChoosing({ ...choosing, picks });
                              }}
                              className="disabled:opacity-30"
                            >
                              <ResourceChip r={r} size={20} />
                            </button>
                          ))}
                        </span>
                      </span>
                    )}
                  </span>
                )}
              </div>
            )}
            {!myTurn && playing && <p className="truncate text-[10px] text-muted/60">{state.log.at(-1)}</p>}
          </div>
        </div>
      )}

      {manual && (
        <RulesSheet title={t("Catan")} onClose={() => setManual(false)}>
          <p>
            <b>{t("Setup")}</b>{t(": everyone puts down a settlement and a road, round the table and then back again. Your second settlement gives you one of each resource around it.")}</p>
          <p>
            <b>{t("Your turn")}</b>{t(": roll. Every hex with that number pays each settlement on its corners one card, each city two. Then build, trade and play a development card, in any order.")}</p>
          <p>
            <b>{t("Building")}</b>{t(": a road (wood, brick) joins your road or town. A settlement (wood, brick, sheep, wheat) goes on your road, never right next to another town. A city (two wheat, three ore) replaces your settlement. A development card costs sheep, wheat and ore.")}</p>
          <p>
            <b>A 7</b>{t(": anyone holding more than seven cards throws away half. Then the robber moves to another hex -- it stops that hex paying -- and you steal a card from someone with a town on it.")}</p>
          <p>
            <b>{t("Trading")}</b>{t(": four of one kind to the bank for any one card; three at any harbour you have a town on; two at a harbour of that kind. Or offer the table a trade -- whoever takes it first gets it.")}</p>
          <p>
            <b>{t("Points")}</b>{t(": settlement 1, city 2, the Longest Road (five or more) 2, the Largest Army (three knights or more) 2, and victory point cards 1 each, kept hidden. First to")}{" "}{WIN}{" "}{t("on their own turn wins.")}</p>
          <div className="space-y-1 border-t border-white/8 pt-2">
            <h4>{t("development cards")}</h4>
            {(["knight", "roads", "plenty", "monopoly", "vp"] as const).map((k) => (
              <p key={k}>
                <b>{DEV_NAME[k]}</b> -- {DEV_TEXT[k]}
              </p>
            ))}
            <p>{t("One a turn, and never one you bought this turn. A knight can be played before you roll.")}</p>
          </div>
        </RulesSheet>
      )}
    </div>
  );
}

/** The state without what only the database writes. */
function clean(state: CatanState): CatanState {
  const out = { ...state } as CatanState & Record<string, unknown>;
  delete out.piles;
  delete out.revealed;
  return out;
}
