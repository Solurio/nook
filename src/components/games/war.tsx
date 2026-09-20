"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { BookOpen, Eye, EyeOff, Map as MapIcon, Minus, Plus, Skull, Undo2 } from "lucide-react";
import { useRoom } from "@/realtime/room-provider";
import { usePiles } from "@/realtime/use-piles";
import { useHandOver } from "@/realtime/use-hand-over";
import { useRoomStore } from "@/state/room-store";
import { chairOf, claimChair } from "@/lib/seats";
import { randomBelow } from "@/lib/dice";
import { sizeOf } from "@/lib/piles";
import {
  COLORS,
  COLOR_HEX,
  CONTINENTS,
  DECK,
  DECK_PILE,
  DISCARD_PILE,
  MAX_SEATS,
  MIN_SEATS,
  MUST_TRADE_AT,
  OBJECTIVES_PILE,
  SEALED_PILE,
  SHAPE_OF,
  TERRITORIES,
  adjacent,
  alive,
  attack,
  attackDice,
  canAttackFrom,
  canPlaceOn,
  claimWin,
  colorOf,
  emptyWar,
  endTurn,
  handSlot,
  held,
  inheritance,
  isJoker,
  lastStanding,
  moveArmies,
  movable,
  objectiveMet,
  objectiveSlot,
  objectiveText,
  occupy,
  place,
  placementProblem,
  sealedSlot,
  startGame,
  stillToPlace,
  stopAttacking,
  targetsFrom,
  trade,
  tradeValue,
  validSet,
  type Card,
  type Objective,
  type Shape,
  type Territory,
  type WarState,
} from "@/lib/war";
import type { Item } from "@/lib/types";
import { keepMap, neighborsOf, readMap, withMap, type WarMapData } from "@/lib/war-map";
import DieFace from "./die-face";
import RulesSheet from "./rules-sheet";
import WarBoard from "./war-board";
import WarMapEditor from "./war-map-editor";

type Placed = Partial<Record<Territory, number>>;

function ShapeMark({ shape, size = 10, color = "currentColor" }: { shape: Shape; size?: number; color?: string }) {
  return (
    <svg viewBox="0 0 10 10" width={size} height={size} aria-hidden>
      {shape === "square" ? (
        <rect x="1.5" y="1.5" width="7" height="7" rx="1" fill={color} />
      ) : shape === "circle" ? (
        <circle cx="5" cy="5" r="3.8" fill={color} />
      ) : (
        <polygon points="5,1 9.2,9 0.8,9" fill={color} />
      )}
    </svg>
  );
}

/** One territory card, as its holder sees it. */
function TerritoryCard({ card, picked, onClick }: { card: Card; picked?: boolean; onClick?: () => void }) {
  const joker = isJoker(card);
  const info = joker ? null : TERRITORIES[card as Territory];
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={clsx(
        "flex h-16 w-12 shrink-0 flex-col items-center justify-between rounded-lg border bg-[#1d2436] px-1 py-1.5 text-center transition disabled:cursor-default",
        picked ? "-translate-y-1.5 border-warm shadow-[0_0_12px_rgba(246,193,119,0.35)]" : "border-white/12",
      )}
      style={info ? { borderTopColor: CONTINENTS[info.continent].tint, borderTopWidth: 3 } : undefined}
      title={info ? `${info.name}, ${CONTINENTS[info.continent].name}` : "joker: any figure"}
    >
      <span className="line-clamp-2 text-[8.5px] leading-tight text-chalk">{info ? info.name : "joker"}</span>
      {joker ? (
        <span className="flex gap-px text-warm">
          <ShapeMark shape="square" size={7} />
          <ShapeMark shape="circle" size={7} />
          <ShapeMark shape="triangle" size={7} />
        </span>
      ) : (
        <span className="text-[#e0655c]">
          <ShapeMark shape={SHAPE_OF[card as Territory]} size={11} />
        </span>
      )}
    </button>
  );
}

/**
 * WAR. Forty-two territories, armies in six colours, dice for every battle --
 * and a secret objective each, which is the only way to win. The board and
 * every roll are there for everyone; the objectives and the cards in each hand
 * belong to the database until they are shown.
 */
export default function War({ item, state: raw }: { item: Item<"game">; state: unknown }) {
  const { updateData, pile, canEdit } = useRoom();
  const me = useRoomStore((s) => s.me);
  const state = useMemo<WarState>(() => ({ ...emptyWar(), ...(raw as Partial<WarState>) }) as WarState, [raw]);
  const map = useMemo(() => readMap(state), [state]);

  const [busy, setBusy] = useState(false);
  const [manual, setManual] = useState(false);
  const [mapping, setMapping] = useState(false);
  const [looking, setLooking] = useState<string | null>(null);
  const [picked, setPicked] = useState<Card[]>([]);
  const [dice, setDice] = useState(3);
  const [count, setCount] = useState(1);

  const chairs = useMemo(
    () => Array.from({ length: Math.max(MIN_SEATS, Math.min(MAX_SEATS, state.seatCount)) }, (_, i) => `s${i}`),
    [state.seatCount],
  );
  const holders = useMemo(() => state.holders ?? {}, [state.holders]);
  const myChair = chairOf(state.seats, holders, me);
  const mine = usePiles(item.id, state.piles);
  useHandOver(item.id, state.piles, holders);

  const label = (chair: string) => state.seats[chair] ?? `seat ${chairs.indexOf(chair) + 1}`;
  /** This device plays for its own chair, and for any chair nobody is sitting in. */
  const plays = (chair: string) => canEdit && (holders[chair] ? holders[chair] === me?.userId : true);
  const playing = state.phase === "play";
  const myTurn = playing && plays(state.turn);

  const write = (next: WarState) => updateData(item.id, { game: "war", state: clean(next) } as never);
  const publicState = (next: WarState) => ({ game: "war", state: clean(next) });
  const latest = (): WarState => {
    const data = useRoomStore.getState().items[item.id]?.data as { state?: WarState } | undefined;
    return { ...emptyWar(), ...(data?.state ?? state) };
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
  const saveMap = (next: WarMapData) => void write(withMap(latest(), next));

  // What is being chosen on the board belongs to this turn and this step only.
  const stepKey = `${state.round}:${state.turn}:${state.step}`;
  const [selection, setSelection] = useState<{ key: string; from: Territory | null; to: Territory | null }>({ key: "", from: null, to: null });
  const sel = selection.key === stepKey ? selection : { key: stepKey, from: null, to: null };
  const select = (from: Territory | null, to: Territory | null = null) => setSelection({ key: stepKey, from, to });

  const placeKey = `${state.round}:${state.turn}`;
  const [draft, setDraft] = useState<{ key: string; placed: Placed; history: Territory[] }>({ key: "", placed: {}, history: [] });
  const current = draft.key === placeKey && state.step === "place" ? draft : { key: placeKey, placed: {} as Placed, history: [] as Territory[] };

  // ---------------------------------------------------------------------------
  // Dealing
  // ---------------------------------------------------------------------------

  const deal = () =>
    run(async () => {
      if (!me) return;
      const { state: game, objectives } = startGame(clean(state), chairs, randomBelow, label);
      const set = await pile("pile_setup", {
        p_item: item.id,
        p_piles: [
          { slot: OBJECTIVES_PILE, cards: objectives, shuffle: true, copies: [{ slot: SEALED_PILE }] },
          { slot: DECK_PILE, cards: DECK, shuffle: true },
        ],
        p_public: publicState(keepMap(state, game)),
      });
      if (set.error) return;
      // The same order into both: each player's objective, and its sealed copy.
      await pile("pile_deal", {
        p_item: item.id,
        p_from: OBJECTIVES_PILE,
        p_targets: chairs.map((c) => ({ slot: objectiveSlot(c), owner: holders[c] ?? me.userId, count: 1 })),
      });
      await pile("pile_deal", {
        p_item: item.id,
        p_from: SEALED_PILE,
        p_targets: chairs.map((c) => ({ slot: sealedSlot(c), count: 1 })),
      });
    });

  // ---------------------------------------------------------------------------
  // Placing and trading
  // ---------------------------------------------------------------------------

  const handOf = (chair: string) => (mine[handSlot(chair)] as Card[] | undefined) ?? null;
  const turnHand = handOf(state.turn);
  const mustTrade = playing && state.step === "place" && sizeOf(state.piles, handSlot(state.turn)) >= MUST_TRADE_AT && turnHand !== null;
  const left = stillToPlace(state, current.placed);
  const toPlace = left.free + Object.values(left.continent).reduce((s, n) => s + (n ?? 0), 0);
  const problem = playing && state.step === "place" ? placementProblem(state, current.placed) : null;

  const addArmy = (t: Territory) => {
    if (!canPlaceOn(state, current.placed, t)) return;
    setDraft({ key: placeKey, placed: { ...current.placed, [t]: (current.placed[t] ?? 0) + 1 }, history: [...current.history, t] });
  };
  const undoArmy = () => {
    const t = current.history.at(-1);
    if (!t) return;
    const placed = { ...current.placed, [t]: (current.placed[t] ?? 1) - 1 };
    if (!placed[t]) delete placed[t];
    setDraft({ key: placeKey, placed, history: current.history.slice(0, -1) });
  };
  const commitPlacement = () =>
    run(async () => {
      const now = latest();
      const next = place(now, current.placed, label);
      if (next === now) return;
      setDraft({ key: "", placed: {}, history: [] });
      await write(next);
    });

  const tradeCards = () =>
    run(async () => {
      const now = latest();
      const cards = picked.filter((c) => turnHand?.includes(c));
      if (!validSet(cards)) return;
      const next = trade(now, cards, label);
      if (next === now) return;
      setPicked([]);
      await pile("pile_move", {
        p_item: item.id,
        p_from: handSlot(now.turn),
        p_to: DISCARD_PILE,
        p_cards: cards,
        p_public: publicState(next),
      });
    });

  // ---------------------------------------------------------------------------
  // Attacking, marching in, moving, and the card at the end
  // ---------------------------------------------------------------------------

  /** A fallen player's cards go to whoever took them out: up to five, blind; the rest to the discards. */
  const inherit = async (victim: string, heir: string) => {
    if (!me) return;
    const piles = latest().piles;
    const { take, discard } = inheritance(sizeOf(piles, handSlot(heir)), sizeOf(piles, handSlot(victim)));
    if (take) {
      await pile("pile_move", {
        p_item: item.id,
        p_from: handSlot(victim),
        p_to: handSlot(heir),
        p_count: take,
        p_random: true,
        p_to_owner: holders[heir] ?? me.userId,
      });
    }
    if (discard) {
      await pile("pile_move", { p_item: item.id, p_from: handSlot(victim), p_to: DISCARD_PILE, p_count: discard, p_random: true });
    }
  };

  const fire = (allIn: boolean) =>
    run(async () => {
      const now = latest();
      if (!sel.from || !sel.to) return;
      const next = attack(now, sel.from, sel.to, dice, randomBelow, label, allIn);
      if (next === now) return;
      await write(next);
      for (const victim of next.out.filter((c) => !now.out.includes(c))) await inherit(victim, now.turn);
    });

  const marchIn = (n: number) =>
    run(async () => {
      const now = latest();
      const to = now.occupy?.to ?? null;
      const next = occupy(now, n);
      if (next === now) return;
      await write(next);
      // Carry on from the land just taken, if it can.
      if (to && canAttackFrom(next, to)) setSelection({ key: `${next.round}:${next.turn}:${next.step}`, from: to, to: null });
    });

  const doneAttacking = () => run(() => write(stopAttacking(latest())));

  const march = () =>
    run(async () => {
      if (!sel.from || !sel.to) return;
      const now = latest();
      const next = moveArmies(now, sel.from, sel.to, count);
      if (next === now) return;
      await write(next);
      select(null);
    });

  const finishTurn = () =>
    run(async () => {
      if (!me) return;
      const now = latest();
      const next = endTurn(now, label);
      if (next === now) return;
      if (!now.conquered || now.round <= 1) {
        await write(next);
        return;
      }
      // A card for taking a territory, drawn blind with the turn passing on.
      const piles = now.piles;
      if (sizeOf(piles, DECK_PILE) === 0 && sizeOf(piles, DISCARD_PILE) > 0) {
        await pile("pile_move", { p_item: item.id, p_from: DISCARD_PILE, p_to: DECK_PILE, p_count: sizeOf(piles, DISCARD_PILE) });
        await pile("pile_shuffle", { p_item: item.id, p_slot: DECK_PILE });
      }
      const drawn = await pile("pile_move", {
        p_item: item.id,
        p_from: DECK_PILE,
        p_to: handSlot(now.turn),
        p_count: 1,
        p_to_owner: holders[now.turn] ?? me.userId,
        p_public: publicState(next),
      });
      if (drawn.error) await write(next);
    });

  // ---------------------------------------------------------------------------
  // Winning: only the screen holding an objective can tell it has been reached
  // ---------------------------------------------------------------------------

  const objectiveOf = (chair: string): Objective | undefined =>
    (mine[objectiveSlot(chair)] as Objective[] | undefined)?.[0] ??
    (state.revealed?.[objectiveSlot(chair)] as Objective[] | undefined)?.[0] ??
    (state.revealed?.[sealedSlot(chair)] as Objective[] | undefined)?.[0];

  const claiming = useRef("");
  const reached = playing
    ? (alive(state).find((c) => {
        const objective = (mine[objectiveSlot(c)] as Objective[] | undefined)?.[0];
        return objective && objectiveMet(state, c, objective);
      }) ?? (lastStanding(state) && plays(lastStanding(state) as string) ? lastStanding(state) : null))
    : null;
  useEffect(() => {
    if (!reached || !canEdit || claiming.current === `${reached}:${state.round}`) return;
    claiming.current = `${reached}:${state.round}`;
    void (async () => {
      if (mine[objectiveSlot(reached)]) {
        await pile("pile_reveal", { p_item: item.id, p_slots: [objectiveSlot(reached)], p_keep: true }, { quiet: true });
      }
      const now = latest();
      if (now.phase !== "play") return;
      await write(claimWin(now, reached, label));
    })();
    // Keyed on who has made it; the rest is read fresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reached]);

  // At the end, every objective comes out.
  const endKey = state.phase === "over" ? state.order.filter((c) => !state.revealed?.[sealedSlot(c)]).join(",") : "";
  const ended = useRef("");
  useEffect(() => {
    if (!endKey || ended.current === endKey || !canEdit) return;
    ended.current = endKey;
    void pile("pile_reveal", { p_item: item.id, p_slots: endKey.split(",").map(sealedSlot), p_keep: true }, { quiet: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endKey]);

  // ---------------------------------------------------------------------------
  // The board
  // ---------------------------------------------------------------------------

  const attackTargets = myTurn && state.step === "attack" && sel.from ? targetsFrom(state, sel.from) : [];
  const moveTargets =
    myTurn && state.step === "move" && sel.from ? neighborsOf(map, sel.from).filter((n) => state.owner[n] === state.turn) : [];
  const chosenTo = sel.to && (attackTargets.includes(sel.to) || moveTargets.includes(sel.to)) ? sel.to : null;
  const maxDice = sel.from ? attackDice(state, sel.from) : 0;
  const maxMove = sel.from && state.step === "move" ? movable(state, sel.from) : 0;

  const tap = (t: Territory) => {
    if (!myTurn || busy) return;
    const mineHere = state.owner[t] === state.turn;
    if (state.step === "place") {
      if (!mustTrade) addArmy(t);
    } else if (state.step === "attack") {
      if (mineHere) {
        if (canAttackFrom(state, t)) {
          select(sel.from === t ? null : t);
          setDice(Math.min(3, attackDice(state, t)));
        }
      } else if (sel.from && targetsFrom(state, sel.from).includes(t)) {
        select(sel.from, t);
      }
    } else if (state.step === "move" && mineHere) {
      if (sel.from && sel.from !== t && adjacent(sel.from, t)) {
        select(sel.from, t);
        setCount(movable(state, sel.from));
      } else if (movable(state, t) > 0) select(sel.from === t ? null : t);
      else select(null);
    }
  };

  const tappable = (t: Territory): boolean => {
    if (!myTurn) return false;
    if (state.step === "place") return !mustTrade && canPlaceOn(state, current.placed, t);
    if (state.step === "attack") return canAttackFrom(state, t) || attackTargets.includes(t);
    if (state.step === "move") return (state.owner[t] === state.turn && movable(state, t) > 0) || moveTargets.includes(t);
    return false;
  };

  const battle = state.battle && state.battle.chair === state.turn && playing ? state.battle : null;
  const [arrivedAt] = useState(() => state.battle?.n ?? 0);
  const freshBattle = Boolean(battle && battle.n > arrivedAt);
  const arrow = battle ?? (chosenTo && sel.from && state.step === "attack" ? { from: sel.from, to: chosenTo } : null);
  const seaId = `war-sea-${item.id}`;

  const ownedObjectives = state.order.filter((c) => mine[objectiveSlot(c)]);
  const shownObjectiveChair = myChair && mine[objectiveSlot(myChair)] ? myChair : ownedObjectives.length === 1 ? ownedObjectives[0] : null;
  const handChair = turnHand ? state.turn : myChair && handOf(myChair) ? myChair : null;
  const hand = handChair ? (handOf(handChair) ?? []) : [];
  const canTrade = myTurn && state.step === "place" && handChair === state.turn;
  const tradeReady = canTrade && validSet(picked.filter((c) => hand.includes(c)));

  const statusLine = (): string => {
    if (!playing) return "";
    const who = label(state.turn);
    if (state.step === "place") {
      if (state.round <= 1) return `${who} places their first armies`;
      return `${who} is placing reinforcements`;
    }
    if (state.step === "attack") return `${who} is on the attack`;
    if (state.step === "occupy") return `${who} took ${TERRITORIES[state.occupy?.to ?? "brazil"].name}`;
    return `${who} is moving armies`;
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
              aria-label="one chair fewer"
              className="grid size-7 place-items-center rounded hover:bg-white/10 disabled:opacity-30"
            >
              <Minus className="size-3" strokeWidth={2.6} />
            </button>
            <span className="tabular-nums text-chalk">{state.seatCount}</span> armies
            <button
              type="button"
              disabled={!canEdit || state.seatCount >= MAX_SEATS}
              onClick={() => void write({ ...state, seatCount: state.seatCount + 1 })}
              aria-label="one chair more"
              className="grid size-7 place-items-center rounded hover:bg-white/10 disabled:opacity-30"
            >
              <Plus className="size-3" strokeWidth={2.6} />
            </button>
          </span>
        )}
        {chairs.map((chair, index) => {
          const color = playing || state.phase === "over" ? colorOf(state, chair) : COLORS[index];
          const out = state.out.includes(chair);
          const turn = playing && state.turn === chair;
          const cards = sizeOf(state.piles, handSlot(chair));
          return (
            <button
              key={chair}
              type="button"
              disabled={!canEdit || !me || playing}
              onClick={() => me && void write({ ...state, ...claimChair(state.seats, holders, chair, me) })}
              className={clsx(
                "flex min-h-7 items-center gap-1 rounded-lg px-1.5 text-left disabled:cursor-default",
                turn ? "bg-white/12 ring-1 ring-warm/60" : "bg-white/5",
                out && "opacity-40",
              )}
              title={playing ? `${held(state, chair).length} territories, ${cards} cards` : "sit here"}
            >
              <span className="size-2.5 shrink-0 rounded-full ring-1 ring-white/30" style={{ background: COLOR_HEX[color].fill }} />
              {out && <Skull className="size-3" />}
              <span className={clsx("max-w-24 truncate", chair === myChair ? "text-chalk" : "text-muted")}>
                {state.seats[chair] ?? <span className="text-muted/50">seat {index + 1}</span>}
              </span>
              {playing && !out && (
                <span className="tabular-nums text-muted/70">
                  {held(state, chair).length}
                  {cards > 0 && <span className="ml-1 text-glow/80">{cards}c</span>}
                </span>
              )}
              {(state.wins[chair] ?? 0) > 0 && <span className="text-warm">{state.wins[chair]}</span>}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setMapping(true)}
          className="ml-auto flex min-h-7 items-center gap-1 rounded-lg px-1.5 hover:bg-white/8 hover:text-chalk"
        >
          <MapIcon className="size-3" /> map
        </button>
        <button type="button" onClick={() => setManual(true)} className="flex min-h-7 items-center gap-1 rounded-lg px-1.5 hover:bg-white/8 hover:text-chalk">
          <BookOpen className="size-3" /> rules
        </button>
      </div>

      {/* The map */}
      <div className="relative min-h-0 flex-1 overflow-hidden rounded-xl inset-ring inset-ring-white/8">
        <WarBoard
          state={state}
          map={map}
          placed={current.placed}
          from={sel.from}
          to={chosenTo}
          attackTargets={attackTargets}
          moveTargets={moveTargets}
          arrow={arrow}
          battle={battle}
          freshBattle={freshBattle}
          tappable={tappable}
          onTap={tap}
          seaId={seaId}
        />

        {/* The dice, for everyone */}
        {battle && (
          <div className="pointer-events-none absolute bottom-1.5 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-xl bg-ink-950/75 px-2 py-1 backdrop-blur-sm">
            <span className="flex gap-1">
              {battle.attack.map((v, i) => (
                <DieFace
                  key={`${battle.n}:a${i}`}
                  sides={6}
                  value={v}
                  size={26}
                  tint="#e0524a"
                  tumble={freshBattle}
                  delay={i * 60}
                  kept={i >= battle.defend.length || v > battle.defend[i]}
                />
              ))}
            </span>
            <span className="text-[10px] text-muted">vs</span>
            <span className="flex gap-1">
              {battle.defend.map((v, i) => (
                <DieFace
                  key={`${battle.n}:d${i}`}
                  sides={6}
                  value={v}
                  size={26}
                  tint="#e6c143"
                  tumble={freshBattle}
                  delay={i * 60 + 120}
                  kept={i >= battle.attack.length || v >= battle.attack[i]}
                />
              ))}
            </span>
            <span className="text-[10px] leading-tight text-muted">
              -{battle.lost[0]} / -{battle.lost[1]}
              {battle.throws > 1 && <span className="block">{battle.throws} throws</span>}
            </span>
          </div>
        )}
      </div>

      {/* What happens now */}
      <div className="flex min-h-11 flex-wrap items-center gap-1.5 rounded-xl bg-white/4 px-2 py-1.5 text-[11px]">
        {!playing ? (
          <>
            {state.phase === "over" && state.winner && (
              <span className="text-warm">
                <b>{label(state.winner)}</b> wins
                {objectiveOf(state.winner) ? `: ${objectiveText(objectiveOf(state.winner) as Objective)}` : ""}
              </span>
            )}
            {state.phase !== "over" && <span className="text-muted/75">three to six armies. Empty chairs play from whoever deals; sit down to keep your own objective.</span>}
            <button type="button" disabled={!canEdit || busy} onClick={() => void deal()} className="ml-auto min-h-9 rounded-xl bg-chalk px-4 text-[12px] font-semibold text-ink-950 disabled:opacity-40">
              {state.phase === "over" ? "deal again" : "deal"}
            </button>
          </>
        ) : (
          <>
            <span className="flex items-center gap-1 text-chalk">
              <span className="size-2.5 rounded-full" style={{ background: COLOR_HEX[colorOf(state, state.turn)].fill }} />
              {statusLine()}
              <span className="text-muted/60">· round {state.round}</span>
            </span>

            {myTurn && state.step === "place" && (
              <>
                <span className="text-muted">
                  {mustTrade
                    ? "five cards: trade three first"
                    : toPlace > 0
                      ? `${toPlace} to place${Object.entries(left.continent)
                          .filter(([, n]) => n)
                          .map(([c, n]) => ` · ${n} in ${CONTINENTS[c as keyof typeof CONTINENTS].name}`)
                          .join("")} -- tap your territories`
                      : "all placed"}
                </span>
                <span className="ml-auto flex gap-1">
                  <button
                    type="button"
                    disabled={!current.history.length}
                    onClick={undoArmy}
                    aria-label="take the last one back"
                    className="grid size-9 place-items-center rounded-lg bg-white/8 text-chalk disabled:opacity-30"
                  >
                    <Undo2 className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    disabled={busy || Boolean(problem) || mustTrade}
                    onClick={() => void commitPlacement()}
                    className="min-h-9 rounded-xl bg-chalk px-4 text-[12px] font-semibold text-ink-950 disabled:opacity-40"
                  >
                    {state.round <= 1 ? "place and pass" : "place them"}
                  </button>
                </span>
              </>
            )}

            {myTurn && state.step === "attack" && (
              <>
                <span className="text-muted">
                  {!sel.from
                    ? "tap one of yours with two or more armies"
                    : !chosenTo
                      ? `from ${TERRITORIES[sel.from].name}: tap a neighbour to attack`
                      : `${TERRITORIES[sel.from].name} -> ${TERRITORIES[chosenTo].name}`}
                </span>
                <span className="ml-auto flex flex-wrap items-center gap-1">
                  {chosenTo && (
                    <>
                      <span className="flex rounded-lg bg-white/6 p-0.5">
                        {[1, 2, 3].map((n) => (
                          <button
                            key={n}
                            type="button"
                            disabled={n > maxDice}
                            onClick={() => setDice(n)}
                            className={clsx(
                              "min-h-8 min-w-8 rounded-md text-[11px] tabular-nums disabled:opacity-25",
                              Math.min(dice, maxDice) === n ? "bg-[#e0524a] text-white" : "text-chalk",
                            )}
                            aria-label={`${n} dice`}
                          >
                            {n}
                          </button>
                        ))}
                      </span>
                      <button type="button" disabled={busy} onClick={() => void fire(false)} className="min-h-9 rounded-xl bg-[#e0524a] px-3 text-[12px] font-semibold text-white active:scale-95">
                        attack
                      </button>
                      <button type="button" disabled={busy} onClick={() => void fire(true)} className="min-h-9 rounded-xl bg-white/10 px-3 text-[11px] text-chalk" title="throw after throw until it falls or you run out">
                        all in
                      </button>
                    </>
                  )}
                  <button type="button" disabled={busy} onClick={() => void doneAttacking()} className="min-h-9 rounded-xl bg-white/10 px-3 text-[11px] text-chalk">
                    done attacking
                  </button>
                </span>
              </>
            )}

            {myTurn && state.step === "occupy" && state.occupy && (
              <>
                <span className="text-muted">how many march in?</span>
                <span className="ml-auto flex gap-1">
                  {Array.from({ length: state.occupy.max }, (_, i) => i + 1).map((n) => (
                    <button key={n} type="button" disabled={busy} onClick={() => void marchIn(n)} className="min-h-9 min-w-10 rounded-xl bg-chalk px-3 text-[12px] font-semibold text-ink-950">
                      {n}
                    </button>
                  ))}
                </span>
              </>
            )}

            {myTurn && state.step === "move" && (
              <>
                <span className="text-muted">
                  {!sel.from ? "move between your neighbours, or end the turn" : !chosenTo ? `from ${TERRITORIES[sel.from].name} to...` : ""}
                </span>
                <span className="ml-auto flex flex-wrap items-center gap-1">
                  {sel.from && chosenTo && (
                    <>
                      <span className="flex items-center gap-0.5 rounded-lg bg-white/6 px-0.5">
                        <button type="button" onClick={() => setCount(Math.max(1, Math.min(count, maxMove) - 1))} aria-label="fewer" className="grid size-8 place-items-center text-chalk">
                          <Minus className="size-3" />
                        </button>
                        <span className="min-w-5 text-center tabular-nums text-chalk">{Math.min(count, maxMove)}</span>
                        <button type="button" onClick={() => setCount(Math.min(maxMove, count + 1))} aria-label="more" className="grid size-8 place-items-center text-chalk">
                          <Plus className="size-3" />
                        </button>
                      </span>
                      <button type="button" disabled={busy} onClick={() => void march()} className="min-h-9 rounded-xl bg-chalk px-3 text-[12px] font-semibold text-ink-950">
                        move to {TERRITORIES[chosenTo].name}
                      </button>
                    </>
                  )}
                  <button type="button" disabled={busy} onClick={() => void finishTurn()} className="min-h-9 rounded-xl bg-white/10 px-3 text-[11px] text-chalk">
                    end turn{state.conquered ? " and draw" : ""}
                  </button>
                </span>
              </>
            )}

            {!myTurn && <span className="ml-auto truncate text-[10px] text-muted/60">{state.log.at(-1)}</span>}
            {state.traded && state.step === "place" && (
              <span className="flex w-full items-center gap-1 text-[10px] text-muted/80">
                {label(state.traded.chair)} traded
                {state.traded.cards.map((c) => (
                  <span key={c} className="flex items-center gap-0.5 rounded bg-white/6 px-1 text-chalk">
                    {isJoker(c) ? "joker" : TERRITORIES[c as Territory].name}
                    {!isJoker(c) && <ShapeMark shape={SHAPE_OF[c as Territory]} size={7} color="#e0655c" />}
                  </span>
                ))}
                for {state.traded.armies}
              </span>
            )}
          </>
        )}
      </div>

      {/* Yours alone: the objective, and the cards */}
      {playing && (shownObjectiveChair || ownedObjectives.length > 1 || hand.length > 0) && (
        <div className="flex flex-wrap items-end gap-2 rounded-xl bg-white/4 px-2 py-1.5 text-[11px]">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            {shownObjectiveChair ? (
              <button
                type="button"
                onClick={() => setLooking(looking === shownObjectiveChair ? null : shownObjectiveChair)}
                className="flex min-h-8 items-center gap-1.5 text-left text-muted"
              >
                {looking === shownObjectiveChair ? <EyeOff className="size-3.5 shrink-0" /> : <Eye className="size-3.5 shrink-0" />}
                {looking === shownObjectiveChair ? (
                  <span>
                    {shownObjectiveChair === myChair ? "your objective" : `${label(shownObjectiveChair)}'s objective`}:{" "}
                    <b className="text-chalk">{objectiveText(objectiveOf(shownObjectiveChair) as Objective)}</b>
                  </span>
                ) : (
                  <span>{shownObjectiveChair === myChair ? "your objective" : `${label(shownObjectiveChair)}'s objective`} (tap to look)</span>
                )}
              </button>
            ) : (
              ownedObjectives.length > 1 && (
                <span className="flex flex-wrap items-center gap-1 text-muted">
                  pass the phone, then look:
                  {ownedObjectives.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setLooking(looking === c ? null : c)}
                      className="flex min-h-8 items-center gap-1 rounded-lg bg-white/8 px-2 text-chalk"
                    >
                      {looking === c ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
                      {label(c)}
                    </button>
                  ))}
                  {looking && ownedObjectives.includes(looking) && (
                    <b className="w-full text-chalk">{objectiveText(objectiveOf(looking) as Objective)}</b>
                  )}
                </span>
              )
            )}
            {canTrade && hand.length >= 3 && (
              <span className="text-[10px] text-muted/70">
                three alike or one of each ({tradeValue(state.trades)} armies, +2 on any pictured land you hold)
              </span>
            )}
          </div>
          {hand.length > 0 && (
            <div className="flex items-end gap-1">
              {handChair !== myChair && <span className="self-center text-[10px] text-muted">{label(handChair as string)}:</span>}
              {hand.map((card) => (
                <TerritoryCard
                  key={card}
                  card={card}
                  picked={picked.includes(card)}
                  onClick={canTrade ? () => setPicked(picked.includes(card) ? picked.filter((c) => c !== card) : [...picked, card].slice(-3)) : undefined}
                />
              ))}
              {canTrade && (
                <button
                  type="button"
                  disabled={busy || !tradeReady}
                  onClick={() => void tradeCards()}
                  className="min-h-9 self-center rounded-xl bg-chalk px-3 text-[12px] font-semibold text-ink-950 disabled:opacity-35"
                >
                  trade
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {mapping && <WarMapEditor map={map} canEdit={canEdit} onSave={saveMap} onClose={() => setMapping(false)} />}

      {manual && (
        <RulesSheet title="WAR" onClose={() => setManual(false)}>
          <p>
            Every player gets a secret <b>objective</b>. The territories are dealt out, one army on each. Reach your objective and
            you win -- it is shown to the table the moment you do.
          </p>
          <p>
            The <b>first round</b> is only placing armies. From then on, a turn goes: <b>reinforce</b>, <b>attack</b> if you like,
            <b> move</b> if you like, and <b>draw a card</b> if you took at least one territory.
          </p>
          <h4>reinforcements</h4>
          <p>
            Half the territories you hold (three at least), plus every continent you hold whole -- those armies go inside that
            continent. North America and Europe 5, Asia 7, Africa 3, South America and Oceania 2.
          </p>
          <h4>cards</h4>
          <p>
            Three cards of the same figure, or one of each, trade for armies at the start of your turn. The first trade in the game
            is worth 4, then 6, 8, 10, 12, 15, and five more each time after. A card showing a territory you hold puts two more
            armies there. Jokers are any figure. With five cards you have to trade.
          </p>
          <h4>attacking</h4>
          <p>
            From a territory with two or more armies, into a neighbour -- a shared border or a line across the sea. Up to three
            dice, never counting the army that has to stay behind. The defence rolls one for each army there, up to three.
            Highest against highest, then the next: whoever is lower loses an army, and a tie goes to the defence.
          </p>
          <p>
            Empty a territory and it is yours: march in at least one army, and no more than fought in the last throw. You can
            carry on attacking from there.
          </p>
          <h4>moving</h4>
          <p>
            After attacking, armies can move to neighbouring territories of yours. One always stays behind, and an army moves once
            a turn.
          </p>
          <h4>knocking someone out</h4>
          <p>
            Take someone&apos;s last territory and their cards are yours -- up to five in your hand, drawn blind. If your objective
            was to destroy a colour and someone else did it first (or it was your own), you need 24 territories instead.
          </p>
          <div className="space-y-1 border-t border-white/8 pt-2">
            <h4>the objectives</h4>
            {(["eu-oc-any", "eu-sa-any", "as-sa", "as-af", "na-af", "na-oc", "t24", "t18", "kill-blue"] as Objective[]).map((o) => (
              <p key={o}>{objectiveText(o)}{o === "kill-blue" ? " (one of these for each colour at the table)" : ""}</p>
            ))}
          </div>
        </RulesSheet>
      )}
    </div>
  );
}

/** The state without what only the database writes. */
function clean(state: WarState): WarState {
  const out = { ...state } as WarState & Record<string, unknown>;
  delete out.piles;
  delete out.revealed;
  return out;
}
