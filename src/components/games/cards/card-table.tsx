"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import {
  AlignLeft,
  ArrowDownWideNarrow,
  Eye,
  EyeOff,
  Hand as HandIcon,
  Layers,
  Plus,
  RotateCcw,
  Settings2,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import { useRoom } from "@/realtime/room-provider";
import { usePiles } from "@/realtime/use-piles";
import { useHandOver, useScrub } from "@/realtime/use-hand-over";
import { useRoomStore } from "@/state/room-store";
import { chairOf, claimChair } from "@/lib/seats";
import { TAKES_PUBLIC, sizeOf } from "@/lib/piles";
import { fractionIn } from "@/lib/pointer";
import {
  addPlace,
  arrangeHand,
  chairsFor,
  cutStack,
  dealFrom,
  drawToHand,
  flipStack,
  gather,
  giveCards,
  handSlot,
  mergeStacks,
  moveStacks,
  playCards,
  readFace,
  removeIfEmpty,
  renameStack,
  reorderHand,
  setLayout,
  setTable,
  settle,
  showHand,
  shuffleStack,
  sortHand,
  splitStack,
  stackSize,
  stackSlot,
  swapCards,
  takeCards,
  tally,
  turnStack,
  turnTopUp,
  upgrade,
  type Layout,
  type SortBy,
  type Stack,
  type Step,
  type TableState,
} from "@/lib/table";
import type { Item } from "@/lib/types";
import PlayingCard from "@/components/cards/playing-card";
import TableSetup from "../table-setup";
import StackView from "./stack-view";
import Hand, { handGap } from "./hand";
import { Counter, HandActions, StackActions, TrayButton } from "./trays";

const TEAM_TINT = ["#6aa9e0", "#e0655c", "#a6d189", "#f6c177"];
const LAYOUTS: Layout[] = ["stack", "fan", "row"];
const SORTS: Array<{ by: SortBy; name: string }> = [
  { by: "suit", name: "by suit" },
  { by: "rank", name: "by rank" },
  { by: "deck", name: "by deck" },
];

type Drag =
  | {
      kind: "stacks";
      pointerId: number;
      ids: string[];
      primary: string;
      fromX: number;
      fromY: number;
      startX: number;
      startY: number;
      dx: number;
      dy: number;
      moved: boolean;
    }
  | {
      kind: "hand";
      pointerId: number;
      at: number[];
      startX: number;
      startY: number;
      x: number;
      y: number;
      moved: boolean;
      gap: number | null;
    };

const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

/** Where the local order of each chair's hand is kept, per board. */
const orderKey = (itemId: string) => `nook.hand.${itemId}`;

function readOrders(itemId: string): Record<string, string[]> {
  try {
    const raw = window.localStorage.getItem(orderKey(itemId));
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, string[]>) : {};
  } catch {
    return {};
  }
}

/**
 * A card table with nothing decided for you. Decks lie face down on the felt;
 * everything you do to them is what you would do with your hands -- pick one
 * up, put it down face up or face down wherever you like, drop a stack on
 * another to square them up, fan a pile out to read it, deal round the table.
 *
 * What is face down stays unread by anyone, the database included in the sense
 * that it never hands it out: face-down stacks and hands are secret piles (see
 * lib/table.ts), and turning a card over happens in front of everyone at once.
 *
 * Every move is worked out from the table as it is at that moment and refuses
 * to land on a newer one, because two people moving cards at once used to end
 * with a card in two places -- or in none.
 */
export default function CardTable({ item, state }: { item: Item<"game">; state: unknown }) {
  const { updateData, updateDataIf, pile, canEdit, setNotice } = useRoom();
  const me = useRoomStore((s) => s.me);

  const table = useMemo(() => upgrade(state), [state]);
  const view = useMemo(() => settle(table)?.table ?? table, [table]);
  const piles = table.piles;
  const mine = usePiles(item.id, piles);
  const chairs = chairsFor(table.seatCount);
  const holders = useMemo(() => table.holders ?? {}, [table.holders]);
  const myChair = chairOf(table.seats, holders, me);
  useHandOver(item.id, piles, holders);
  useScrub((state as { version?: number } | null)?.version !== 2, () =>
    void updateData(item.id, { game: "cards", state: table as never }),
  );

  const [stackPick, setStackPick] = useState<string[]>([]);
  const [handPick, setHandPick] = useState<number[]>([]);
  const [spreadPick, setSpreadPick] = useState<number[]>([]);
  const [grouping, setGrouping] = useState(false);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [setupOpen, setSetupOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dealEach, setDealEach] = useState(table.dealEach);
  const [wideHand, setWideHand] = useState(false);
  const [orders, setOrders] = useState<Record<string, string[]>>(() => readOrders(item.id));
  // On a phone passed round, which chair's hand is being held, and whether it
  // has been turned towards whoever is holding it.
  const [handChair, setHandChair] = useState<string | null>(null);
  const [peeking, setPeeking] = useState(false);
  const [peekOwned, setPeekOwned] = useState<string | null>(null);

  const rootRef = useRef<HTMLDivElement>(null);
  const feltRef = useRef<HTMLDivElement>(null);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const [feltWidth, setFeltWidth] = useState(360);
  useLayoutEffect(() => {
    const node = feltRef.current;
    if (!node) return;
    const observe = new ResizeObserver(([entry]) => setFeltWidth(entry.contentRect.width));
    observe.observe(node);
    return () => observe.disconnect();
  }, []);
  const cardW = Math.round(Math.max(34, Math.min(78, feltWidth * 0.1)));

  // ---------------------------------------------------------------------------
  // Hands
  // ---------------------------------------------------------------------------

  const ownedHands = chairs.filter((chair) => handSlot(chair) in mine);
  const heldChair = myChair ?? (handChair && ownedHands.includes(handChair) ? handChair : (ownedHands[0] ?? null));
  const passedRound = !myChair && ownedHands.length > 1;
  const rawHand = heldChair ? ((mine[handSlot(heldChair)] as string[] | undefined) ?? []) : [];
  const hand = arrangeHand(rawHand, heldChair ? orders[heldChair] : null);
  // A read hands back a new array every time; what it holds is what matters.
  // A card's own name has a bar in it, so the join uses something it cannot.
  const dealt = rawHand.join("");
  const handHidden = passedRound && !peeking;

  const setOrder = (next: string[]) => {
    if (!heldChair) return;
    const all = { ...orders, [heldChair]: next };
    setOrders(all);
    try {
      window.localStorage.setItem(orderKey(item.id), JSON.stringify(all));
    } catch {
      // A browser that refuses to remember is no reason to stop playing.
    }
  };

  // Cards picked up out of a hand that has since changed are no longer picked.
  const lastHand = useRef(dealt);
  useEffect(() => {
    if (lastHand.current === dealt) return;
    lastHand.current = dealt;
    setHandPick([]);
  }, [dealt]);

  // ---------------------------------------------------------------------------
  // Doing things
  // ---------------------------------------------------------------------------

  const strip = (next: TableState) => {
    const out = { ...next } as TableState;
    delete out.piles;
    return out;
  };

  const liveTable = (): { table: TableState; since: string } | null => {
    const live = useRoomStore.getState().items[item.id];
    if (!live) return null;
    return { table: upgrade((live.data as { state?: unknown }).state), since: live.updated_at };
  };

  /** Tidies whatever the database has just turned over into the stack it came from. */
  const settleNow = async () => {
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const live = liveTable();
      const settled = live && settle(live.table);
      if (settled) {
        await pile("pile_drop", {
          p_item: item.id,
          p_slots: settled.drop,
          p_public: { game: "cards", state: strip(settled.table) },
        });
        return;
      }
      await sleep(250);
    }
  };

  const run = async (make: (fresh: TableState) => Step | null) => {
    if (!canEdit) return;
    setBusy(true);
    try {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const live = liveTable();
        if (!live) return;
        let step: Step | null;
        try {
          step = make(live.table);
        } catch {
          // The stack it was about to touch is gone; there is nothing to do.
          return;
        }
        if (!step) return;
        const changed = step.table !== live.table;

        if (step.call) {
          const args: Record<string, unknown> = { ...step.call.args, p_item: item.id };
          if (TAKES_PUBLIC.has(step.call.fn)) {
            args.p_public = { game: "cards", state: strip(step.table) };
          } else if (changed && !(await updateDataIf(item.id, { game: "cards", state: strip(step.table) as never }, live.since))) {
            await sleep(40 + attempt * 60);
            continue;
          }
          const first = await pile(step.call.fn, args);
          if (first.error) return;
          if (step.then) {
            const second = await pile(step.then.fn, { ...step.then.args, p_item: item.id });
            if (second.error && step.undo) {
              // The second half never landed: put back what the first took.
              const after = liveTable();
              if (after) {
                await updateDataIf(item.id, { game: "cards", state: strip(step.undo(after.table)) as never }, after.since);
              }
            }
          }
          if (step.call.fn === "pile_reveal" || step.then?.fn === "pile_reveal") void settleNow();
          return;
        }

        if (!changed) return;
        if (await updateDataIf(item.id, { game: "cards", state: strip(step.table) as never }, live.since)) return;
        await sleep(40 + attempt * 60);
      }
      setNotice("somebody else was moving those cards. have another go.");
    } finally {
      setBusy(false);
    }
  };

  /** Moves go one after another, each worked out from where the last one left the table. */
  const act = (make: (fresh: TableState) => Step | null) => {
    queue.current = queue.current.then(() => run(make)).catch(() => {});
    return queue.current;
  };

  const write = (make: (fresh: TableState) => TableState) => act((fresh) => ({ table: make(fresh) }));

  // A table made ready to use (tarot, from the games menu) lays its deck out
  // the first time anyone who can edit opens it.
  const laid = useRef(false);
  const autoSet = Boolean(table.autoSet && canEdit && table.stacks.length === 0);
  useEffect(() => {
    if (!autoSet || laid.current) return;
    laid.current = true;
    void act((fresh) => {
      const next = { ...fresh };
      delete next.autoSet;
      return setTable(next);
    });
    // Once, when the table first shows up.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSet]);

  const sit = (chair: string) => {
    if (!me) return;
    write((fresh) => ({ ...fresh, ...claimChair(fresh.seats, fresh.holders ?? {}, chair, me) }));
  };

  const selectedStack = stackPick.length === 1 ? view.stacks.find((s) => s.id === stackPick[0]) : undefined;
  const owner = heldChair ? (holders[heldChair] ?? me?.userId ?? "") : "";
  const handCards = handPick.map((i) => hand[i]).filter((card): card is string => Boolean(card));

  const clearPicks = () => {
    setStackPick([]);
    setHandPick([]);
    setSpreadPick([]);
  };

  // ---------------------------------------------------------------------------
  // Where things are
  // ---------------------------------------------------------------------------

  const fraction = (event: { clientX: number; clientY: number }) => {
    const root = rootRef.current;
    const felt = feltRef.current;
    if (!root || !felt) return null;
    return fractionIn(root, felt, event, item.rotation);
  };

  const stackAt = (x: number, y: number, except: string[]) => {
    const rect = feltRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const reach = (cardW * 0.8) / rect.width;
    let best: Stack | null = null;
    let bestDist = Infinity;
    for (const stack of view.stacks) {
      if (except.includes(stack.id)) continue;
      const d = Math.hypot(stack.x - x, ((stack.y - y) * rect.height) / rect.width);
      if (d < reach && d < bestDist) {
        best = stack;
        bestDist = d;
      }
    }
    return best;
  };

  /** Somewhere to put a card down that is not on top of something else. */
  const freeSpot = (fresh: TableState): { x: number; y: number } => {
    const spots: Array<[number, number]> = [
      [0.5, 0.68], [0.62, 0.68], [0.38, 0.68], [0.5, 0.84], [0.74, 0.68],
      [0.26, 0.68], [0.62, 0.84], [0.38, 0.84], [0.5, 0.2], [0.8, 0.84],
    ];
    for (const [x, y] of spots) {
      if (!fresh.stacks.some((s) => Math.hypot(s.x - x, s.y - y) < 0.09)) return { x, y };
    }
    return { x: 0.5, y: 0.68 };
  };

  // ---------------------------------------------------------------------------
  // Dragging
  // ---------------------------------------------------------------------------

  /** Follows the pointer even when it leaves the card it started on. */
  const grab = (event: React.PointerEvent) => {
    try {
      rootRef.current?.setPointerCapture(event.pointerId);
    } catch {
      // A pointer the browser has already let go of; the drag still works.
    }
  };

  const onStackDown = (event: React.PointerEvent, stack: Stack) => {
    if (!canEdit || event.button > 0) return;
    event.stopPropagation();
    // Captured on the whole board, so the felt's own coordinates keep working
    // wherever the pointer wanders -- and through the tilt every item has.
    grab(event);
    const at = fraction(event.nativeEvent);
    const ids = stackPick.includes(stack.id) && stackPick.length > 1 ? stackPick : [stack.id];
    setDrag({
      kind: "stacks",
      pointerId: event.pointerId,
      ids,
      primary: stack.id,
      fromX: at?.x ?? stack.x,
      fromY: at?.y ?? stack.y,
      startX: event.clientX,
      startY: event.clientY,
      dx: 0,
      dy: 0,
      moved: false,
    });
  };

  const onHandDown = (event: React.PointerEvent, index: number) => {
    if (!canEdit || event.button > 0 || handHidden || !heldChair) return;
    event.stopPropagation();
    grab(event);
    // Dragging one of the cards you picked up carries all of them.
    const at = handPick.includes(index) ? handPick : [index];
    setDrag({
      kind: "hand",
      pointerId: event.pointerId,
      at,
      startX: event.clientX,
      startY: event.clientY,
      x: event.clientX,
      y: event.clientY,
      moved: false,
      gap: null,
    });
  };

  const onMove = (event: React.PointerEvent) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    const moved = drag.moved || Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 6;
    if (drag.kind === "stacks") {
      const at = fraction(event.nativeEvent);
      if (!at) return;
      setDrag({ ...drag, moved, dx: at.x - drag.fromX, dy: at.y - drag.fromY });
      return;
    }
    const root = rootRef.current;
    const gap = moved && root ? handGap(root, event.nativeEvent, item.rotation) : null;
    setDrag({ ...drag, moved, x: event.clientX, y: event.clientY, gap });
  };

  const onUp = (event: React.PointerEvent) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    const done = drag;
    setDrag(null);

    if (done.kind === "stacks") {
      if (!done.moved) {
        // What is held in the hand stays held: that is how cards go onto a
        // stack, or get swapped for the ones lying on it.
        setSpreadPick([]);
        setStackPick((current) =>
          grouping
            ? current.includes(done.primary)
              ? current.filter((id) => id !== done.primary)
              : [...current, done.primary]
            : current.length === 1 && current[0] === done.primary
              ? []
              : [done.primary],
        );
        return;
      }
      const primary = view.stacks.find((s) => s.id === done.primary);
      if (!primary) return;
      const landing = { x: primary.x + done.dx, y: primary.y + done.dy };
      const target = done.ids.length === 1 ? stackAt(landing.x, landing.y, done.ids) : null;
      if (target) {
        void act((fresh) => mergeStacks(fresh, done.primary, target.id, piles));
        setStackPick([]);
      } else {
        write((fresh) => moveStacks(fresh, done.ids, done.dx, done.dy));
      }
      return;
    }

    // A card from the hand.
    if (!done.moved) {
      setHandPick((current) =>
        current.includes(done.at[0]) ? current.filter((i) => i !== done.at[0]) : [...current, done.at[0]],
      );
      return;
    }
    if (!heldChair) return;

    const root = rootRef.current;
    const gap = root ? handGap(root, event.nativeEvent, item.rotation) : null;
    if (gap !== null) {
      // Put back in a different place: the order of a hand is nobody else's business.
      setOrder(reorderHand(hand, done.at, gap));
      setHandPick([]);
      return;
    }

    const at = fraction(event.nativeEvent);
    if (!at || at.x < 0 || at.x > 1 || at.y < 0 || at.y > 1) return;
    const cards = done.at.map((i) => hand[i]).filter((card): card is string => Boolean(card));
    if (cards.length === 0) return;
    const target = stackAt(at.x, at.y, []);
    void act((fresh) =>
      playCards(
        fresh,
        heldChair,
        cards,
        target ? { kind: "onto", id: target.id } : { kind: "new", x: at.x, y: at.y, face: "up" },
      ),
    );
    setHandPick([]);
  };

  // A stack whose owner is me may be looked at; its cards come from my piles.
  const ownedCards = (stack: Stack) =>
    stack.face === "down" ? ((mine[stackSlot(stack.id)] as string[] | undefined) ?? null) : null;

  const displayed = (stack: Stack): Stack => {
    if (!drag || drag.kind !== "stacks" || !drag.ids.includes(stack.id)) return stack;
    return { ...stack, x: stack.x + drag.dx, y: stack.y + drag.dy };
  };

  const play = (where: "up" | "down" | "mine") => {
    if (!heldChair || handCards.length === 0) return;
    void act((fresh) => {
      const spot = freeSpot(fresh);
      return playCards(fresh, heldChair, handCards, {
        kind: "new",
        x: spot.x,
        y: spot.y,
        face: where === "up" ? "up" : "down",
        mine: where === "mine" ? { chair: heldChair, owner } : undefined,
      });
    });
    setHandPick([]);
  };

  // ---------------------------------------------------------------------------
  // Picture
  // ---------------------------------------------------------------------------

  const label = (chair: string) => table.seats[chair] ?? `seat ${chairs.indexOf(chair) + 1}`;
  const empty = view.stacks.length === 0;
  const count = tally(view, piles);
  const astray = !empty && count.held !== count.expected;
  const dragged = drag?.kind === "hand" && drag.moved ? drag.at.map((i) => hand[i]).filter(Boolean) : [];

  return (
    <div
      ref={rootRef}
      className="surface grain relative flex size-full flex-col gap-1.5 overflow-hidden rounded-2xl p-2"
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={() => setDrag(null)}
    >
      {/* Chairs round the table */}
      <div className="flex items-center gap-1 overflow-x-auto pb-0.5">
        {chairs.map((chair, index) => {
          const who = table.seats[chair];
          const isMine = chair === myChair;
          const held = sizeOf(piles, handSlot(chair));
          const team = table.teams >= 2 ? index % table.teams : null;
          return (
            <button
              key={chair}
              type="button"
              disabled={!canEdit || !me}
              onClick={() => sit(chair)}
              title={who ? (isMine ? "stand up" : who) : "sit here"}
              className={clsx(
                "flex min-h-9 shrink-0 items-center gap-1.5 rounded-xl px-2 text-[11px] transition disabled:opacity-60",
                isMine ? "bg-glow/18 ring-1 ring-glow/45" : "bg-white/5 hover:bg-white/9",
              )}
            >
              {team !== null && <span className="size-2 rounded-full" style={{ background: TEAM_TINT[team % TEAM_TINT.length] }} />}
              <span className={clsx("max-w-20 truncate", who ? (isMine ? "text-chalk" : "text-muted") : "text-muted/50")}>
                {who ?? `seat ${index + 1}`}
              </span>
              {held > 0 && (
                <span className="flex items-center gap-0.5 text-[10px] text-muted/80 tabular-nums">
                  <span className="h-3 w-2 rounded-[2px] bg-gradient-to-b from-[#7a2e3b] to-[#4d1c25] ring-1 ring-white/20" />
                  {held}
                </span>
              )}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setSetupOpen(true)}
          disabled={!canEdit}
          aria-label="decks and chairs"
          title="decks and chairs"
          className="ml-auto grid size-9 shrink-0 place-items-center rounded-xl text-muted transition hover:bg-white/8 hover:text-chalk disabled:opacity-40"
        >
          <Settings2 className="size-4" strokeWidth={2.2} />
        </button>
      </div>

      {/* The felt */}
      <div
        ref={feltRef}
        className="relative min-h-0 flex-1 touch-none overflow-hidden rounded-[18px] bg-[radial-gradient(ellipse_at_50%_40%,#2f6a4c_0%,#1f4a36_62%,#173a2a_100%)] shadow-[inset_0_0_0_3px_#5b3b22,inset_0_0_0_5px_#3a2413,inset_0_10px_30px_rgba(0,0,0,0.45)]"
        onPointerDown={(event) => {
          if (event.target === event.currentTarget) clearPicks();
        }}
      >
        {empty && (
          <div className="absolute inset-0 grid place-items-center p-4">
            <button
              type="button"
              disabled={!canEdit || busy}
              onClick={() => void act((fresh) => setTable(fresh))}
              className="flex min-h-11 items-center gap-2 rounded-xl bg-[#f3ead7] px-4 text-[13px] font-semibold text-[#2a2118] shadow-lg transition active:scale-95 disabled:opacity-50"
            >
              <Layers className="size-4" strokeWidth={2.2} />
              set the table
            </button>
          </div>
        )}

        {view.stacks
          .slice()
          .sort((a, b) => a.z - b.z)
          .map((raw) => {
            const stack = displayed(raw);
            const isSelected = stackPick.includes(raw.id);
            return (
              <StackView
                key={raw.id}
                stack={stack}
                decks={view.decks}
                size={stackSize(raw, piles)}
                cardW={cardW}
                selected={isSelected}
                owned={ownedCards(raw)}
                showOwned={peekOwned === raw.id}
                ownerName={raw.owner ? label(raw.owner) : null}
                dragging={Boolean(drag?.kind === "stacks" && drag.ids.includes(raw.id) && drag.moved)}
                chosen={isSelected && raw.face === "up" ? spreadPick : []}
                onPointerDown={(event) => onStackDown(event, raw)}
                onCardTap={
                  isSelected && raw.face === "up" && raw.layout !== "stack" && canEdit
                    ? (index) =>
                        setSpreadPick((current) =>
                          current.includes(index) ? current.filter((i) => i !== index) : [...current, index],
                        )
                    : undefined
                }
              />
            );
          })}

        {astray && canEdit && (
          <button
            type="button"
            onClick={() => void act((fresh) => gather(fresh))}
            title="gather everything up and deal again"
            className="absolute top-1.5 left-1.5 flex items-center gap-1 rounded-lg bg-amber-500/20 px-1.5 py-1 text-[9px] text-amber-200 ring-1 ring-amber-400/40"
          >
            <TriangleAlert className="size-3" />
            {count.held} of {count.expected} cards -- put it right
          </button>
        )}
      </div>

      {/* Your hand */}
      <div className="relative flex items-end gap-1.5">
        {heldChair ? (
          <>
            <div className="flex shrink-0 flex-col gap-1">
              {passedRound && (
                <>
                  <select
                    value={heldChair}
                    onChange={(event) => {
                      setHandChair(event.target.value);
                      setPeeking(false);
                      setHandPick([]);
                    }}
                    aria-label="whose hand"
                    className="h-8 rounded-lg bg-white/8 px-1.5 text-[11px] text-chalk ring-1 ring-white/10"
                  >
                    {ownedHands.map((chair) => (
                      <option key={chair} value={chair} className="bg-ink-900">
                        {label(chair)}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => setPeeking((v) => !v)}
                    className="flex h-8 items-center justify-center gap-1 rounded-lg bg-white/8 px-2 text-[11px] text-chalk"
                  >
                    {peeking ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                    {peeking ? "hide" : "look"}
                  </button>
                </>
              )}
              {!handHidden && hand.length > 1 && (
                <div className="flex items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => setOrder(sortHand(hand, view.decks, SORTS[0].by))}
                    onDoubleClick={() => setOrder(sortHand(hand, view.decks, SORTS[1].by))}
                    title="put the hand in order -- double tap for by rank"
                    aria-label="sort the hand"
                    className="grid size-8 place-items-center rounded-lg bg-white/8 text-muted hover:text-chalk"
                  >
                    <ArrowDownWideNarrow className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setWideHand((v) => !v)}
                    title={wideHand ? "hold it fanned" : "spread it out"}
                    aria-label="how the hand is laid out"
                    className={clsx("grid size-8 place-items-center rounded-lg", wideHand ? "bg-glow/22 text-glow" : "bg-white/8 text-muted hover:text-chalk")}
                  >
                    <AlignLeft className="size-3.5" />
                  </button>
                </div>
              )}
            </div>
            <Hand
              cards={hand}
              decks={view.decks}
              hidden={handHidden}
              picked={handPick}
              dragging={drag?.kind === "hand" && drag.moved ? drag.at : []}
              gap={drag?.kind === "hand" ? drag.gap : null}
              wide={wideHand}
              onPointerDown={onHandDown}
            />
          </>
        ) : (
          <p className="w-full px-1 py-2 text-center text-[11px] text-muted/60">
            {me ? "sit in a chair to be dealt a hand" : "you are watching"}
          </p>
        )}
      </div>

      {/* What you can do with what you picked up */}
      {canEdit && (
        <div className="flex min-h-10 items-center gap-1 overflow-x-auto">
          {handPick.length > 0 && heldChair ? (
            <HandActions
              count={handPick.length}
              chairs={chairs.filter((c) => c !== heldChair)}
              label={label}
              target={selectedStack}
              targetName={selectedStack?.label ?? "that stack"}
              swapCount={selectedStack && selectedStack.face === "up" ? spreadPick.length : 0}
              onFaceUp={() => play("up")}
              onFaceDown={() => play("down")}
              onKeep={() => play("mine")}
              onOnto={(id) => {
                void act((fresh) => playCards(fresh, heldChair, handCards, { kind: "onto", id }));
                setHandPick([]);
              }}
              onSwap={() => {
                if (!selectedStack) return;
                const stackId = selectedStack.id;
                const picked = [...spreadPick];
                void act((fresh) => swapCards(fresh, heldChair, handCards, stackId, picked, owner));
                setHandPick([]);
                setSpreadPick([]);
              }}
              onGive={(chair) => {
                void act((fresh) => giveCards(fresh, heldChair, chair, handCards, me?.userId ?? ""));
                setHandPick([]);
              }}
              onClear={() => setHandPick([])}
            />
          ) : selectedStack ? (
            <StackActions
              stack={selectedStack}
              size={stackSize(selectedStack, piles)}
              dealEach={dealEach}
              setDealEach={setDealEach}
              canDraw={Boolean(heldChair)}
              owned={ownedCards(selectedStack) !== null}
              peeking={peekOwned === selectedStack.id}
              chosen={spreadPick.length}
              onTake={() => {
                if (!heldChair) return;
                const id = selectedStack.id;
                const picked = [...spreadPick];
                void act((fresh) => takeCards(fresh, id, picked, heldChair, owner));
                setSpreadPick([]);
              }}
              onPeek={() => setPeekOwned((v) => (v === selectedStack.id ? null : selectedStack.id))}
              onDraw={() => heldChair && void act((fresh) => drawToHand(fresh, selectedStack.id, heldChair, owner, dealEach))}
              onFlip={() => void act((fresh) => flipStack(fresh, selectedStack.id))}
              onTurnTop={() => void act((fresh) => turnTopUp(fresh, selectedStack.id))}
              onShuffle={() => void act((fresh) => shuffleStack(fresh, selectedStack.id))}
              onCut={() => void act((fresh) => cutStack(fresh, selectedStack.id, null))}
              onDeal={() => me && void act((fresh) => dealFrom(fresh, selectedStack.id, dealEach, me.userId))}
              onSplit={() => void act((fresh) => splitStack(fresh, selectedStack.id, Math.ceil(stackSize(selectedStack, piles) / 2)))}
              onLayout={() => {
                const next = LAYOUTS[(LAYOUTS.indexOf(selectedStack.layout) + 1) % LAYOUTS.length];
                write((fresh) => setLayout(fresh, selectedStack.id, next));
                setSpreadPick([]);
              }}
              onTurn={() => write((fresh) => turnStack(fresh, selectedStack.id))}
              onRename={(name) => write((fresh) => renameStack(fresh, selectedStack.id, name))}
              onRemove={() => {
                write((fresh) => removeIfEmpty(fresh, selectedStack.id));
                setStackPick([]);
              }}
            />
          ) : (
            <>
              <TrayButton
                label={grouping ? "done gathering" : "pick up several"}
                active={grouping}
                onClick={() => {
                  setGrouping((v) => !v);
                  if (grouping) setStackPick([]);
                }}
              >
                <HandIcon className="size-4" />
              </TrayButton>
              <TrayButton label="a new place" onClick={() => write((fresh) => addPlace(fresh, "place", 0.5, 0.25))}>
                <Plus className="size-4" />
              </TrayButton>
              {heldChair && hand.length > 0 && (
                <TrayButton label="show my hand" onClick={() => void act((fresh) => showHand(fresh, heldChair, hand, { x: 0.5, y: 0.8 }))}>
                  <Sparkles className="size-4" />
                </TrayButton>
              )}
              <TrayButton label="gather and reshuffle" onClick={() => !empty && void act((fresh) => gather(fresh))} disabled={empty}>
                <RotateCcw className="size-4" />
              </TrayButton>
              {stackPick.length > 1 && <span className="shrink-0 px-2 text-[10px] text-glow">{stackPick.length} picked up</span>}
              <span className="ml-auto shrink-0 px-2 text-[10px] text-muted/55">
                {grouping ? "tap the stacks to carry together" : "tap to pick up · drag to move · drop on a stack to join them"}
              </span>
              <Counter value={dealEach} onChange={setDealEach} />
            </>
          )}
        </div>
      )}

      {/* Cards following the finger, on their way from the hand to the felt */}
      {dragged.length > 0 && drag?.kind === "hand" && (
        <div className="pointer-events-none fixed z-[80] -translate-x-1/2 -translate-y-1/2" style={{ left: drag.x, top: drag.y }}>
          <div className="relative" style={{ width: cardW + (dragged.length - 1) * 14 }}>
            {dragged.map((card, i) => (
              <div key={i} className="absolute top-0" style={{ left: i * 14, transform: `rotate(${(i - (dragged.length - 1) / 2) * 4}deg)` }}>
                <PlayingCard {...readFace(card, view.decks)} width={cardW} />
              </div>
            ))}
          </div>
        </div>
      )}

      {setupOpen && (
        <TableSetup
          table={table}
          onClose={() => setSetupOpen(false)}
          onSave={(next) => {
            write(() => next);
            setSetupOpen(false);
          }}
          onSetTable={(next) => {
            void act(() => setTable(next));
            setSetupOpen(false);
          }}
        />
      )}
    </div>
  );
}
