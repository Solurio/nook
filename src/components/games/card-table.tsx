"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import {
  ArrowDownToLine,
  Eye,
  EyeOff,
  FlipVertical2,
  Hand,
  Layers,
  Plus,
  RotateCcw,
  Scissors,
  Send,
  Settings2,
  Shuffle,
  SplitSquareHorizontal,
  Sparkles,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import { useRoom } from "@/realtime/room-provider";
import { usePiles } from "@/realtime/use-piles";
import { useHandOver, useScrub } from "@/realtime/use-hand-over";
import { useRoomStore } from "@/state/room-store";
import { chairOf, claimChair } from "@/lib/seats";
import { TAKES_PUBLIC, sizeOf } from "@/lib/piles";
import {
  chairsFor,
  cutStack,
  dealFrom,
  drawToHand,
  faceName,
  flipStack,
  gather,
  giveCard,
  handSlot,
  mergeStacks,
  moveStacks,
  playFromHand,
  readFace,
  removeIfEmpty,
  setLayout,
  setTable,
  settle,
  showHand,
  shuffleStack,
  splitStack,
  stackSize,
  stackSlot,
  takeCard,
  turnStack,
  turnTopUp,
  upgrade,
  addPlace,
  renameStack,
  type Layout,
  type Stack,
  type Step,
  type TableState,
} from "@/lib/table";
import type { Item } from "@/lib/types";
import PlayingCard from "@/components/cards/playing-card";
import TableSetup from "./table-setup";

const TEAM_TINT = ["#6aa9e0", "#e0655c", "#a6d189", "#f6c177"];
const LAYOUTS: Layout[] = ["stack", "fan", "row"];

type Drag =
  | {
      kind: "stacks";
      pointerId: number;
      ids: string[];
      startX: number;
      startY: number;
      dx: number;
      dy: number;
      moved: boolean;
      primary: string;
    }
  | {
      kind: "card";
      pointerId: number;
      card: string;
      startX: number;
      startY: number;
      x: number;
      y: number;
      moved: boolean;
    };

/**
 * A card table with nothing decided for you. Decks lie face down on the felt;
 * everything you do to them is what you would do with your hands -- pick one
 * up, put it down face up or face down wherever you like, drop a stack on
 * another to square them up, fan a pile out to read it, deal round the table.
 *
 * What is face down stays unread by anyone, the database included in the
 * sense that it never hands it out: face-down stacks and hands are secret
 * piles (see lib/table.ts), and turning a card over happens in front of
 * everyone at once.
 */
export default function CardTable({ item, state }: { item: Item<"game">; state: unknown }) {
  const { updateData, pile, canEdit } = useRoom();
  const me = useRoomStore((s) => s.me);

  const table = useMemo(() => upgrade(state), [state]);
  const view = useMemo(() => settle(table)?.table ?? table, [table]);
  const piles = table.piles;
  const mine = usePiles(item.id, piles);
  const chairs = chairsFor(table.seatCount);
  const holders = useMemo(() => table.holders ?? {}, [table.holders]);
  const myChair = chairOf(table.seats, holders, me);
  useHandOver(item.id, piles, holders);
  // A table saved before stacks existed kept every hand and the deck in the open.
  useScrub((state as { version?: number } | null)?.version !== 2, () =>
    void updateData(item.id, { game: "cards", state: table as never }),
  );

  const [selected, setSelected] = useState<string[]>([]);
  const [grouping, setGrouping] = useState(false);
  const [pickedCard, setPickedCard] = useState<string | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [setupOpen, setSetupOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dealEach, setDealEach] = useState(table.dealEach);
  // On a phone passed round, which chair's hand is being held, and whether it
  // has been turned towards whoever is holding it.
  const [handChair, setHandChair] = useState<string | null>(null);
  const [peeking, setPeeking] = useState(false);
  const [peekOwned, setPeekOwned] = useState<string | null>(null);

  const feltRef = useRef<HTMLDivElement>(null);
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
  const heldChair = myChair ?? (handChair && ownedHands.includes(handChair) ? handChair : ownedHands[0] ?? null);
  const passedRound = !myChair && ownedHands.length > 1;
  const hand = heldChair ? ((mine[handSlot(heldChair)] as string[] | undefined) ?? []) : [];
  const handHidden = passedRound && !peeking;

  // ---------------------------------------------------------------------------
  // Doing things
  // ---------------------------------------------------------------------------

  const strip = (next: TableState) => {
    const out = { ...next } as TableState;
    delete out.piles;
    return out;
  };

  /**
   * Tidies whatever was just turned over into the stack it came from. Only the
   * person who turned it does this -- everyone else already sees it face up,
   * and one writer means nobody's stale copy of the table overwrites a newer
   * move. Waits for the turned cards to arrive rather than guessing how long
   * that takes.
   */
  const settleNow = async () => {
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const live = useRoomStore.getState().items[item.id];
      const fresh = upgrade((live?.data as { state?: unknown } | undefined)?.state);
      const settled = settle(fresh);
      if (settled) {
        await pile("pile_drop", {
          p_item: item.id,
          p_slots: settled.drop,
          p_public: { game: "cards", state: strip(settled.table) },
        });
        return;
      }
      await new Promise((resolve) => window.setTimeout(resolve, 250));
    }
  };

  const exec = async (step: Step) => {
    if (busy || !canEdit) return;
    setBusy(true);
    try {
      const changed = step.table !== table;
      if (step.call) {
        const args: Record<string, unknown> = { ...step.call.args, p_item: item.id };
        if (TAKES_PUBLIC.has(step.call.fn)) {
          args.p_public = { game: "cards", state: strip(step.table) };
        } else if (changed) {
          await updateData(item.id, { game: "cards", state: strip(step.table) as never });
        }
        const first = await pile(step.call.fn, args);
        if (first.error) return;
        if (step.then) {
          const second = await pile(step.then.fn, { ...step.then.args, p_item: item.id });
          if (second.error) return;
        }
        if (step.call.fn === "pile_reveal" || step.then?.fn === "pile_reveal") {
          void settleNow();
        }
      } else if (changed) {
        await updateData(item.id, { game: "cards", state: strip(step.table) as never });
      }
    } finally {
      setBusy(false);
    }
  };

  const write = (next: TableState) => void exec({ table: next });

  // A table made ready to use (tarot, from the games menu) lays its deck out
  // the first time anyone who can edit opens it.
  const laid = useRef(false);
  const autoSet = Boolean(table.autoSet && canEdit && table.stacks.length === 0);
  useEffect(() => {
    if (!autoSet || laid.current) return;
    laid.current = true;
    const next = { ...table };
    delete next.autoSet;
    void exec(setTable(next));
    // Once, when the table first shows up.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSet]);

  const sit = (chair: string) => {
    if (!me) return;
    write({ ...table, ...claimChair(table.seats, holders, chair, me) });
  };

  const selectedStack = selected.length === 1 ? view.stacks.find((s) => s.id === selected[0]) : undefined;

  // ---------------------------------------------------------------------------
  // Dragging
  // ---------------------------------------------------------------------------

  const fraction = (clientX: number, clientY: number) => {
    const rect = feltRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return null;
    return { x: (clientX - rect.left) / rect.width, y: (clientY - rect.top) / rect.height };
  };

  const stackAt = (x: number, y: number, except: string[]) => {
    const rect = feltRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const reach = (cardW * 0.7) / rect.width;
    let best: Stack | null = null;
    let bestDist = Infinity;
    for (const stack of view.stacks) {
      if (except.includes(stack.id)) continue;
      const d = Math.hypot((stack.x - x) * 1, ((stack.y - y) * rect.height) / rect.width);
      if (d < reach && d < bestDist) {
        best = stack;
        bestDist = d;
      }
    }
    return best;
  };

  const onStackDown = (event: React.PointerEvent, stack: Stack) => {
    if (!canEdit || event.button > 0) return;
    event.stopPropagation();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    const ids = selected.includes(stack.id) && selected.length > 1 ? selected : [stack.id];
    setDrag({
      kind: "stacks",
      pointerId: event.pointerId,
      ids,
      primary: stack.id,
      startX: event.clientX,
      startY: event.clientY,
      dx: 0,
      dy: 0,
      moved: false,
    });
  };

  const onCardDown = (event: React.PointerEvent, card: string) => {
    if (!canEdit || event.button > 0 || handHidden) return;
    event.stopPropagation();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    setDrag({
      kind: "card",
      pointerId: event.pointerId,
      card,
      startX: event.clientX,
      startY: event.clientY,
      x: event.clientX,
      y: event.clientY,
      moved: false,
    });
  };

  const onMove = (event: React.PointerEvent) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    const moved = drag.moved || Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 6;
    if (drag.kind === "stacks") {
      const rect = feltRef.current?.getBoundingClientRect();
      if (!rect) return;
      setDrag({
        ...drag,
        moved,
        dx: (event.clientX - drag.startX) / rect.width,
        dy: (event.clientY - drag.startY) / rect.height,
      });
    } else {
      setDrag({ ...drag, moved, x: event.clientX, y: event.clientY });
    }
  };

  const onUp = (event: React.PointerEvent) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    const done = drag;
    setDrag(null);

    if (done.kind === "stacks") {
      if (!done.moved) {
        // A tap picks a stack up, or adds it to the handful when gathering.
        setPickedCard(null);
        setSelected((current) =>
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
        void exec(mergeStacks(table, done.primary, target.id, piles));
        setSelected([]);
      } else {
        write(moveStacks(table, done.ids, done.dx, done.dy));
      }
      return;
    }

    if (!done.moved) {
      setSelected([]);
      setPickedCard((current) => (current === done.card ? null : done.card));
      return;
    }
    const at = fraction(done.x, done.y);
    if (!at || !heldChair || at.x < 0 || at.x > 1 || at.y < 0 || at.y > 1) return;
    const target = stackAt(at.x, at.y, []);
    void exec(
      playFromHand(
        table,
        heldChair,
        done.card,
        target ? { kind: "onto", id: target.id } : { kind: "new", x: at.x, y: at.y, face: "up" },
      ),
    );
    setPickedCard(null);
  };

  // A stack whose owner is me may be looked at; its cards come from my piles.
  const ownedCards = (stack: Stack) =>
    stack.face === "down" ? ((mine[stackSlot(stack.id)] as string[] | undefined) ?? null) : null;

  const displayed = (stack: Stack): Stack => {
    if (!drag || drag.kind !== "stacks" || !drag.ids.includes(stack.id)) return stack;
    return { ...stack, x: stack.x + drag.dx, y: stack.y + drag.dy, z: 9999 };
  };

  // ---------------------------------------------------------------------------
  // Picture
  // ---------------------------------------------------------------------------

  const label = (chair: string) => table.seats[chair] ?? `seat ${chairs.indexOf(chair) + 1}`;
  const empty = view.stacks.length === 0;

  return (
    <div
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
          const count = sizeOf(piles, handSlot(chair));
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
              {team !== null && (
                <span className="size-2 rounded-full" style={{ background: TEAM_TINT[team % TEAM_TINT.length] }} />
              )}
              <span className={clsx("max-w-20 truncate", who ? (isMine ? "text-chalk" : "text-muted") : "text-muted/50")}>
                {who ?? `seat ${index + 1}`}
              </span>
              {count > 0 && (
                <span className="flex items-center gap-0.5 text-[10px] text-muted/80 tabular-nums">
                  <span className="h-3 w-2 rounded-[2px] bg-gradient-to-b from-[#7a2e3b] to-[#4d1c25] ring-1 ring-white/20" />
                  {count}
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
          if (event.target === event.currentTarget) {
            setSelected([]);
            setPickedCard(null);
          }
        }}
      >
        {empty && (
          <div className="absolute inset-0 grid place-items-center p-4">
            <button
              type="button"
              disabled={!canEdit || busy}
              onClick={() => void exec(setTable(table))}
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
            const owned = ownedCards(raw);
            const isSelected = selected.includes(raw.id);
            return (
              <StackView
                key={raw.id}
                stack={stack}
                decks={view.decks}
                size={stackSize(raw, piles)}
                cardW={cardW}
                selected={isSelected}
                owned={owned}
                showOwned={peekOwned === raw.id}
                ownerName={raw.owner ? label(raw.owner) : null}
                dragging={Boolean(drag?.kind === "stacks" && drag.ids.includes(raw.id) && drag.moved)}
                onPointerDown={(event) => onStackDown(event, raw)}
                onTakeCard={
                  isSelected && canEdit && heldChair
                    ? (index) => void exec(takeCard(table, raw.id, index, heldChair, holders[heldChair] ?? me?.userId ?? ""))
                    : undefined
                }
              />
            );
          })}
      </div>

      {/* Your hand, fanned */}
      <div className="relative">
        {heldChair ? (
          <div className="flex items-end gap-2">
            {passedRound && (
              <div className="flex shrink-0 flex-col gap-1">
                <select
                  value={heldChair}
                  onChange={(event) => {
                    setHandChair(event.target.value);
                    setPeeking(false);
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
              </div>
            )}
            <HandFan
              cards={hand}
              decks={view.decks}
              hidden={handHidden}
              picked={pickedCard}
              draggingCard={drag?.kind === "card" && drag.moved ? drag.card : null}
              onPointerDown={onCardDown}
            />
          </div>
        ) : (
          <p className="px-1 py-2 text-center text-[11px] text-muted/60">
            {me ? "sit in a chair to be dealt a hand" : "you are watching"}
          </p>
        )}
      </div>

      {/* What you can do with what you picked up */}
      {canEdit && (
        <div className="flex min-h-10 items-center gap-1 overflow-x-auto">
          {pickedCard && heldChair ? (
            <CardActions
              card={pickedCard}
              decks={view.decks}
              chairs={chairs.filter((c) => c !== heldChair)}
              label={label}
              target={selectedStack}
              onFaceUp={() => {
                void exec(playFromHand(table, heldChair, pickedCard, { kind: "new", x: 0.5, y: 0.66, face: "up" }));
                setPickedCard(null);
              }}
              onFaceDown={() => {
                void exec(playFromHand(table, heldChair, pickedCard, { kind: "new", x: 0.5, y: 0.66, face: "down" }));
                setPickedCard(null);
              }}
              onKeep={() => {
                void exec(
                  playFromHand(table, heldChair, pickedCard, {
                    kind: "new",
                    x: 0.5,
                    y: 0.8,
                    face: "down",
                    mine: { chair: heldChair, owner: holders[heldChair] ?? me?.userId ?? "" },
                  }),
                );
                setPickedCard(null);
              }}
              onOnto={(id) => {
                void exec(playFromHand(table, heldChair, pickedCard, { kind: "onto", id }));
                setPickedCard(null);
              }}
              onGive={(chair) => {
                void exec(giveCard(table, heldChair, chair, pickedCard, me?.userId ?? ""));
                setPickedCard(null);
              }}
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
              onPeek={() => setPeekOwned((v) => (v === selectedStack.id ? null : selectedStack.id))}
              onDraw={() =>
                heldChair &&
                void exec(drawToHand(table, selectedStack.id, heldChair, holders[heldChair] ?? me?.userId ?? ""))
              }
              onFlip={() => void exec(flipStack(table, selectedStack.id))}
              onTurnTop={() => void exec(turnTopUp(table, selectedStack.id))}
              onShuffle={() => void exec(shuffleStack(table, selectedStack.id))}
              onCut={() => void exec(cutStack(table, selectedStack.id, null))}
              onDeal={() => me && void exec(dealFrom(table, selectedStack.id, dealEach, me.userId))}
              onSplit={() => void exec(splitStack(table, selectedStack.id, Math.ceil(stackSize(selectedStack, piles) / 2)))}
              onLayout={() => {
                const next = LAYOUTS[(LAYOUTS.indexOf(selectedStack.layout) + 1) % LAYOUTS.length];
                write(setLayout(table, selectedStack.id, next));
              }}
              onTurn={() => write(turnStack(table, selectedStack.id))}
              onRename={(name) => write(renameStack(table, selectedStack.id, name))}
              onRemove={() => {
                write(removeIfEmpty(table, selectedStack.id));
                setSelected([]);
              }}
            />
          ) : (
            <>
              <TrayButton
                label={grouping ? "done gathering" : "pick up several"}
                active={grouping}
                onClick={() => {
                  setGrouping((v) => !v);
                  if (grouping) setSelected([]);
                }}
              >
                <Hand className="size-4" />
              </TrayButton>
              <TrayButton label="a new place" onClick={() => write(addPlace(table, "place", 0.5, 0.25))}>
                <Plus className="size-4" />
              </TrayButton>
              {heldChair && hand.length > 0 && (
                <TrayButton
                  label="show my hand"
                  onClick={() => void exec(showHand(table, heldChair, hand, { x: 0.5, y: 0.78 }))}
                >
                  <Sparkles className="size-4" />
                </TrayButton>
              )}
              <TrayButton
                label="gather and reshuffle"
                onClick={() => !empty && void exec(gather(table))}
                disabled={empty}
              >
                <RotateCcw className="size-4" />
              </TrayButton>
              <span className="ml-auto shrink-0 px-2 text-[10px] text-muted/55">
                {grouping
                  ? `${selected.length} picked up -- drag any of them`
                  : "tap a stack or a card · drag to move · drop on a stack to join them"}
              </span>
            </>
          )}
        </div>
      )}

      {/* A card following the finger, on its way from the hand to the felt */}
      {drag?.kind === "card" && drag.moved && (
        <div
          className="pointer-events-none fixed z-[80] -translate-x-1/2 -translate-y-1/2 rotate-[-4deg]"
          style={{ left: drag.x, top: drag.y }}
        >
          <PlayingCard {...readFace(drag.card, view.decks)} width={cardW} />
        </div>
      )}

      {setupOpen && (
        <TableSetup
          table={table}
          onClose={() => setSetupOpen(false)}
          onSave={(next) => {
            write(next);
            setSetupOpen(false);
          }}
          onSetTable={(next) => {
            void exec(setTable(next));
            setSetupOpen(false);
          }}
        />
      )}

    </div>
  );
}

// ---------------------------------------------------------------------------
// A stack on the felt
// ---------------------------------------------------------------------------

function StackView({
  stack,
  decks,
  size,
  cardW,
  selected,
  owned,
  showOwned,
  ownerName,
  dragging,
  onPointerDown,
  onTakeCard,
}: {
  stack: Stack;
  decks: TableState["decks"];
  size: number;
  cardW: number;
  selected: boolean;
  owned: string[] | null;
  showOwned: boolean;
  ownerName: string | null;
  dragging: boolean;
  onPointerDown: (event: React.PointerEvent) => void;
  onTakeCard?: (index: number) => void;
}) {
  const faceUp = stack.face === "up";
  const cards = faceUp ? (stack.cards ?? []) : showOwned && owned ? owned : [];
  const reveal = faceUp || (showOwned && owned !== null);
  // Which deck to draw the backs of a face-down stack with: the first one.
  const backDeck = decks[0] ?? null;

  const spread = stack.layout !== "stack" && size > 1;
  const step = stack.layout === "fan" ? cardW * 0.26 : cardW * 0.62;
  const shown = Math.min(size, spread ? 13 : 1);
  const width = spread ? cardW + step * (shown - 1) : cardW;

  return (
    <div
      onPointerDown={onPointerDown}
      className={clsx(
        "absolute touch-none select-none",
        dragging ? "cursor-grabbing" : "cursor-grab",
      )}
      style={{
        left: `${stack.x * 100}%`,
        top: `${stack.y * 100}%`,
        zIndex: stack.z,
        transform: `translate(-50%, -50%) ${stack.turned ? "rotate(180deg)" : ""} ${dragging ? "scale(1.06)" : ""}`,
        transition: dragging ? "none" : "transform 120ms ease-out",
        width,
      }}
    >
      {size === 0 ? (
        <div
          className="grid place-items-center rounded-[6px] border-2 border-dashed border-white/25 text-[9px] text-white/45"
          style={{ width: cardW, height: cardW * 1.4 }}
        >
          {stack.label ?? "empty"}
        </div>
      ) : spread ? (
        <div className="relative" style={{ height: cardW * 1.45 }}>
          {Array.from({ length: shown }, (_, i) => {
            const card = cards[shown - 1 - i];
            const angle = stack.layout === "fan" ? (i - (shown - 1) / 2) * 4 : 0;
            const parsed = card ? readFace(card, decks) : { deck: backDeck, face: null };
            return (
              <div
                key={i}
                className="absolute top-0"
                style={{
                  left: i * step,
                  transform: `rotate(${angle}deg)`,
                  transformOrigin: "50% 120%",
                }}
                onClick={
                  onTakeCard && faceUp
                    ? (event) => {
                        event.stopPropagation();
                        onTakeCard(shown - 1 - i);
                      }
                    : undefined
                }
              >
                <PlayingCard
                  face={reveal ? parsed.face : null}
                  deck={parsed.deck ?? backDeck}
                  down={!reveal}
                  width={cardW}
                />
              </div>
            );
          })}
        </div>
      ) : (
        <div className="relative" style={{ paddingTop: Math.min(size, 10) * 0.7 }}>
          {/* The depth of the pile, a card's edge at a time. */}
          {Array.from({ length: Math.min(size - 1, 9) }, (_, i) => (
            <div
              key={i}
              className="absolute left-0 rounded-[6px] bg-[#e9e2d0] shadow-[0_0_0_0.5px_rgba(0,0,0,0.3)]"
              style={{ top: (Math.min(size, 10) - 1 - i) * 0.7, width: cardW, height: cardW * 1.4 }}
            />
          ))}
          <div className="relative">
            {(() => {
              const top = cards[0];
              const parsed = top ? readFace(top, decks) : { deck: backDeck, face: null };
              return (
                <PlayingCard
                  face={reveal ? parsed.face : null}
                  deck={parsed.deck ?? backDeck}
                  down={!reveal}
                  width={cardW}
                />
              );
            })()}
          </div>
        </div>
      )}

      {size > 1 && (
        <span className="absolute -right-1.5 -bottom-1.5 grid min-w-5 place-items-center rounded-full bg-ink-950/85 px-1 text-[9px] font-semibold text-chalk tabular-nums ring-1 ring-white/20">
          {size}
        </span>
      )}
      {(stack.label || ownerName) && size > 0 && (
        <span className="absolute top-full left-1/2 mt-1 -translate-x-1/2 rounded bg-black/35 px-1.5 py-px text-[9px] whitespace-nowrap text-white/75">
          {stack.label ?? `${ownerName}'s`}
        </span>
      )}
      {selected && (
        <span className="pointer-events-none absolute -inset-1.5 rounded-[9px] ring-2 ring-glow shadow-[0_0_14px_rgba(196,167,240,0.6)]" />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The hand
// ---------------------------------------------------------------------------

function HandFan({
  cards,
  decks,
  hidden,
  picked,
  draggingCard,
  onPointerDown,
}: {
  cards: string[];
  decks: TableState["decks"];
  hidden: boolean;
  picked: string | null;
  draggingCard: string | null;
  onPointerDown: (event: React.PointerEvent, card: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(320);
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observe = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observe.observe(node);
    return () => observe.disconnect();
  }, []);

  const cardW = Math.round(Math.max(40, Math.min(64, width / 6)));
  const n = cards.length;
  const step = n > 1 ? Math.min(cardW * 0.62, (width - cardW) / (n - 1)) : 0;
  const total = cardW + step * Math.max(0, n - 1);

  return (
    <div ref={ref} className="relative min-w-0 flex-1" style={{ height: cardW * 1.4 + 14 }}>
      {n === 0 && <p className="pt-4 text-center text-[11px] text-muted/50">your hand is empty</p>}
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2" style={{ width: total, height: cardW * 1.4 + 14 }}>
        {cards.map((card, i) => {
          const angle = n > 1 ? (i - (n - 1) / 2) * Math.min(4, 40 / n) : 0;
          const lift = Math.abs(i - (n - 1) / 2) * Math.min(2, 16 / n);
          const isPicked = picked === card && !hidden;
          return (
            <div
              key={`${card}-${i}`}
              onPointerDown={(event) => onPointerDown(event, card)}
              className={clsx(
                "absolute bottom-0 cursor-grab touch-none transition-transform",
                draggingCard === card && "opacity-30",
              )}
              style={{
                left: i * step,
                transform: `translateY(${isPicked ? -12 : lift}px) rotate(${angle}deg)`,
                transformOrigin: "50% 140%",
                zIndex: i,
              }}
            >
              <PlayingCard
                {...(hidden ? { face: null, deck: decks[0] ?? null } : readFace(card, decks))}
                down={hidden}
                width={cardW}
                className={isPicked ? "rounded-[6px] ring-2 ring-glow" : undefined}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Trays
// ---------------------------------------------------------------------------

function TrayButton({
  children,
  label,
  onClick,
  active,
  disabled,
  danger,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        "flex min-h-10 shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl px-2 text-[9px] font-medium transition disabled:opacity-35",
        active
          ? "bg-glow/22 text-glow"
          : danger
            ? "text-muted hover:bg-red-500/15 hover:text-red-300"
            : "text-muted hover:bg-white/8 hover:text-chalk active:bg-white/12",
      )}
    >
      {children}
      <span className="whitespace-nowrap">{label}</span>
    </button>
  );
}

function StackActions({
  stack,
  size,
  dealEach,
  setDealEach,
  canDraw,
  owned,
  peeking,
  onPeek,
  onDraw,
  onFlip,
  onTurnTop,
  onShuffle,
  onCut,
  onDeal,
  onSplit,
  onLayout,
  onTurn,
  onRename,
  onRemove,
}: {
  stack: Stack;
  size: number;
  dealEach: number;
  setDealEach: (n: number) => void;
  canDraw: boolean;
  owned: boolean;
  peeking: boolean;
  onPeek: () => void;
  onDraw: () => void;
  onFlip: () => void;
  onTurnTop: () => void;
  onShuffle: () => void;
  onCut: () => void;
  onDeal: () => void;
  onSplit: () => void;
  onLayout: () => void;
  onTurn: () => void;
  onRename: (name: string) => void;
  onRemove: () => void;
}) {
  const down = stack.face === "down";
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState(stack.label ?? "");

  if (naming) {
    return (
      <form
        className="flex min-w-0 flex-1 items-center gap-1"
        onSubmit={(event) => {
          event.preventDefault();
          onRename(name);
          setNaming(false);
        }}
      >
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => event.stopPropagation()}
          autoFocus
          maxLength={24}
          placeholder="draw, discard, meld..."
          className="h-9 min-w-0 flex-1 rounded-lg bg-white/8 px-2 text-[12px] ring-1 ring-white/12 outline-none focus:ring-glow/50"
        />
        <button type="submit" className="h-9 rounded-lg bg-glow/22 px-3 text-[11px] text-glow">
          name it
        </button>
      </form>
    );
  }

  return (
    <>
      {canDraw && size > 0 && (
        <TrayButton label="to my hand" onClick={onDraw}>
          <ArrowDownToLine className="size-4" />
        </TrayButton>
      )}
      {size > 0 && (
        <TrayButton label={down ? "turn over" : "turn down"} onClick={onFlip}>
          <FlipVertical2 className="size-4" />
        </TrayButton>
      )}
      {down && size > 1 && (
        <TrayButton label="top card up" onClick={onTurnTop}>
          <Undo2 className="size-4" />
        </TrayButton>
      )}
      {owned && (
        <TrayButton label={peeking ? "stop looking" : "look"} active={peeking} onClick={onPeek}>
          <Eye className="size-4" />
        </TrayButton>
      )}
      {size > 1 && (
        <>
          <TrayButton label="shuffle" onClick={onShuffle}>
            <Shuffle className="size-4" />
          </TrayButton>
          <TrayButton label="cut" onClick={onCut}>
            <Scissors className="size-4" />
          </TrayButton>
          <TrayButton label="split" onClick={onSplit}>
            <SplitSquareHorizontal className="size-4" />
          </TrayButton>
          <TrayButton label={`spread: ${stack.layout}`} onClick={onLayout}>
            <Layers className="size-4" />
          </TrayButton>
        </>
      )}
      {down && size > 0 && (
        <div className="flex shrink-0 items-center gap-0.5 rounded-xl bg-white/5 px-1">
          <button
            type="button"
            onClick={() => setDealEach(Math.max(1, dealEach - 1))}
            className="grid size-7 place-items-center text-muted"
            aria-label="fewer each"
          >
            -
          </button>
          <TrayButton label={`deal ${dealEach} each`} onClick={onDeal}>
            <Send className="size-4" />
          </TrayButton>
          <button
            type="button"
            onClick={() => setDealEach(Math.min(26, dealEach + 1))}
            className="grid size-7 place-items-center text-muted"
            aria-label="more each"
          >
            +
          </button>
        </div>
      )}
      <TrayButton label="turn round" onClick={onTurn}>
        <RotateCcw className="size-4" />
      </TrayButton>
      <TrayButton label="name" onClick={() => setNaming(true)}>
        <Settings2 className="size-4" />
      </TrayButton>
      {size === 0 && (
        <TrayButton label="remove" danger onClick={onRemove}>
          <Trash2 className="size-4" />
        </TrayButton>
      )}
    </>
  );
}

function CardActions({
  card,
  decks,
  chairs,
  label,
  target,
  onFaceUp,
  onFaceDown,
  onKeep,
  onOnto,
  onGive,
}: {
  card: string;
  decks: TableState["decks"];
  chairs: string[];
  label: (chair: string) => string;
  target: Stack | undefined;
  onFaceUp: () => void;
  onFaceDown: () => void;
  onKeep: () => void;
  onOnto: (id: string) => void;
  onGive: (chair: string) => void;
}) {
  const [giving, setGiving] = useState(false);
  const name = faceName(readFace(card, decks).face);

  if (giving) {
    return (
      <>
        <span className="shrink-0 px-1 text-[10px] text-muted/70">give the {name} to</span>
        {chairs.map((chair) => (
          <button
            key={chair}
            type="button"
            onClick={() => onGive(chair)}
            className="min-h-9 shrink-0 rounded-lg bg-white/8 px-2.5 text-[11px] text-chalk"
          >
            {label(chair)}
          </button>
        ))}
        <button type="button" onClick={() => setGiving(false)} className="grid size-9 place-items-center text-muted">
          <X className="size-4" />
        </button>
      </>
    );
  }

  return (
    <>
      <span className="max-w-28 shrink-0 truncate px-1 text-[10px] text-muted/70">{name}</span>
      <TrayButton label="face up" onClick={onFaceUp}>
        <Eye className="size-4" />
      </TrayButton>
      <TrayButton label="face down" onClick={onFaceDown}>
        <EyeOff className="size-4" />
      </TrayButton>
      <TrayButton label="down, mine" onClick={onKeep}>
        <Hand className="size-4" />
      </TrayButton>
      {target && (
        <TrayButton label={`onto ${target.label ?? "that stack"}`} onClick={() => onOnto(target.id)}>
          <Layers className="size-4" />
        </TrayButton>
      )}
      {chairs.length > 0 && (
        <TrayButton label="give" onClick={() => setGiving(true)}>
          <Send className="size-4" />
        </TrayButton>
      )}
    </>
  );
}

