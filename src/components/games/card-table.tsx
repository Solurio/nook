"use client";

import { useState } from "react";
import clsx from "clsx";
import { Eye, EyeOff, Layers, RotateCcw, Settings2, Shuffle, X } from "lucide-react";
import { useRoom } from "@/realtime/room-provider";
import { useRoomStore } from "@/state/room-store";
import { seatOf, takeSeat } from "@/lib/seats";
import {
  RANKS,
  SUITS,
  SUIT_GLYPH,
  buildDeck,
  cardLabel,
  deal,
  isJoker,
  readCard,
  seatIds,
  shuffle,
  teamOf,
  type Rank,
  type Suit,
} from "@/lib/cards";
import type { CardTableState, Item } from "@/lib/types";

const TEAM_TINT = ["#6aa9e0", "#e0655c", "#a6d189", "#f6c177"];

/**
 * A table with a deck on it. Choose what is in the deck, how many chairs there
 * are and whether they play in teams, then shuffle and deal. What the cards
 * mean is left to whoever is sitting there, which is what makes one table
 * enough for truco, president, go fish and whatever else you agree on.
 *
 * Hands are shown only to the person in that chair, but everything in a room
 * travels through the same shared state, so this is a table you could peek
 * across rather than a dealer that can keep a secret.
 */
export default function CardTable({
  item,
  state,
}: {
  item: Item<"game">;
  state: CardTableState;
}) {
  const { updateData, canEdit } = useRoom();
  const me = useRoomStore((s) => s.me);
  const name = me?.name ?? "someone";

  const [setupOpen, setSetupOpen] = useState(false);
  const [peek, setPeek] = useState(false);

  const write = (next: CardTableState) =>
    void updateData(item.id, { game: "cards", state: next });

  const chairs = seatIds(state.seatCount);
  const mySeat = seatOf(state.seats, name);
  const myHand = mySeat ? (state.hands[mySeat] ?? []) : [];

  // With every chair empty, whoever is holding the device plays every hand.
  const openTable = chairs.every((chair) => !state.seats[chair]);

  const shuffleAndDeal = () => {
    const deck = shuffle(buildDeck(state.config));
    const { hands, rest } = deal(deck, chairs, state.dealEach);
    write({ ...state, deck: rest, hands, table: [], discard: [] });
  };

  const gather = () => {
    write({
      ...state,
      deck: shuffle(buildDeck(state.config)),
      hands: {},
      table: [],
      discard: [],
    });
  };

  const playFrom = (chair: string, card: string) => {
    const hand = (state.hands[chair] ?? []).filter((c) => c !== card);
    write({
      ...state,
      hands: { ...state.hands, [chair]: hand },
      table: [...state.table, { card, by: state.seats[chair] ?? `seat ${chair.slice(1)}` }],
    });
  };

  const drawCard = () => {
    const seat = mySeat ?? (openTable ? chairs[0] : null);
    if (!seat || state.deck.length === 0) return;
    const [top, ...rest] = state.deck;
    write({
      ...state,
      deck: rest,
      hands: { ...state.hands, [seat]: [...(state.hands[seat] ?? []), top] },
    });
  };

  const sweep = () => {
    write({
      ...state,
      discard: [...state.discard, ...state.table.map((t) => t.card)],
      table: [],
    });
  };

  return (
    <div className="surface grain relative flex size-full flex-col gap-2 overflow-hidden rounded-2xl p-2.5">
      {/* Chairs round the table */}
      <div className="flex flex-wrap gap-1.5">
        {chairs.map((chair, index) => {
          const team = teamOf(index, state.teams);
          const who = state.seats[chair];
          const mine = who === name;
          const count = (state.hands[chair] ?? []).length;
          return (
            <button
              key={chair}
              type="button"
              disabled={!canEdit}
              onClick={() => write({ ...state, seats: takeSeat(state.seats, chair, name) })}
              title={who ? (mine ? "stand up" : who) : "sit here"}
              className={clsx(
                "flex min-h-9 min-w-0 flex-1 basis-28 items-center gap-1.5 rounded-xl px-2 py-1.5 text-left transition disabled:opacity-50",
                mine ? "bg-white/14 ring-1 ring-glow/45" : "bg-white/5 hover:bg-white/9",
              )}
            >
              <span
                className="size-2.5 shrink-0 rounded-full ring-1 ring-white/25"
                style={{
                  background: team === null ? "#8a809c" : TEAM_TINT[team % TEAM_TINT.length],
                }}
              />
              <span className="min-w-0 flex-1 truncate text-[11px]">
                {who ? (
                  <span className={mine ? "text-chalk" : "text-muted"}>{who}</span>
                ) : (
                  <span className="text-muted/55">seat {index + 1}</span>
                )}
              </span>
              {count > 0 && (
                <span className="shrink-0 text-[10px] tabular-nums text-muted/70">{count}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* The middle: the deck, what has been played, the pile */}
      <div className="flex min-h-0 flex-1 flex-col rounded-xl bg-ink-950/25 p-2 inset-ring inset-ring-white/6">
        <div className="mb-1.5 flex items-center gap-1.5">
          <button
            type="button"
            disabled={!canEdit || state.deck.length === 0}
            onClick={drawCard}
            title="draw the top card"
            className="flex items-center gap-1.5 rounded-lg bg-white/8 px-2 py-1 text-[11px] font-medium text-chalk transition hover:bg-white/12 disabled:opacity-40"
          >
            <Layers className="size-3.5" strokeWidth={2.2} />
            deck {state.deck.length}
          </button>

          {state.table.length > 0 && canEdit && (
            <button
              type="button"
              onClick={sweep}
              title="sweep the table into the pile"
              className="rounded-lg bg-white/8 px-2 py-1 text-[11px] text-muted transition hover:bg-white/12 hover:text-chalk"
            >
              sweep
            </button>
          )}

          <div className="flex-1" />

          {state.discard.length > 0 && (
            <span className="text-[10px] text-muted/60">pile {state.discard.length}</span>
          )}
          <button
            type="button"
            onClick={() => setSetupOpen((v) => !v)}
            title="table setup"
            aria-label="table setup"
            className={clsx(
              "grid size-8 place-items-center rounded-lg transition sm:size-7",
              setupOpen ? "bg-glow/22 text-glow" : "text-muted hover:bg-white/8 hover:text-chalk",
            )}
          >
            <Settings2 className="size-3.5" strokeWidth={2.2} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {state.table.length === 0 ? (
            <p className="grid h-full place-items-center px-3 text-center text-[11px] text-muted/50">
              nothing on the table yet
            </p>
          ) : (
            <div className="flex flex-wrap gap-1">
              {state.table.map((played, i) => (
                <PlayingCard key={`${played.card}-${i}`} card={played.card} by={played.by} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Hands */}
      <div>
        <div className="mb-1 flex items-center gap-1.5">
          <span className="text-[10px] tracking-wide text-muted/70 uppercase">
            {mySeat ? "your hand" : openTable ? "hands" : "take a seat to be dealt in"}
          </span>
          <div className="flex-1" />
          {(mySeat || openTable) && (
            <button
              type="button"
              onClick={() => setPeek((v) => !v)}
              title={peek ? "turn them face down" : "look at them"}
              className="flex items-center gap-1 rounded-lg px-1.5 py-1 text-[10px] text-muted transition hover:bg-white/8 hover:text-chalk"
            >
              {peek ? (
                <Eye className="size-3" strokeWidth={2.2} />
              ) : (
                <EyeOff className="size-3" strokeWidth={2.2} />
              )}
              {peek ? "face up" : "face down"}
            </button>
          )}
        </div>

        <div className="flex min-h-12 flex-wrap gap-1">
          {openTable && !mySeat
            ? chairs.flatMap((chair) =>
                (state.hands[chair] ?? []).map((card, i) => (
                  <PlayingCard
                    key={`${chair}-${card}-${i}`}
                    card={card}
                    hidden={!peek}
                    onClick={canEdit ? () => playFrom(chair, card) : undefined}
                  />
                )),
              )
            : myHand.map((card, i) => (
                <PlayingCard
                  key={`${card}-${i}`}
                  card={card}
                  hidden={!peek}
                  onClick={canEdit && mySeat ? () => playFrom(mySeat, card) : undefined}
                />
              ))}

          {mySeat && myHand.length === 0 && (
            <p className="self-center text-[11px] text-muted/50">nothing dealt yet</p>
          )}
        </div>
      </div>

      {setupOpen && (
        <Setup
          state={state}
          canEdit={canEdit}
          onChange={write}
          onDeal={shuffleAndDeal}
          onGather={gather}
          onClose={() => setSetupOpen(false)}
        />
      )}
    </div>
  );
}

/** One card, face up or face down. */
function PlayingCard({
  card,
  by,
  hidden,
  onClick,
}: {
  card: string;
  by?: string;
  hidden?: boolean;
  onClick?: () => void;
}) {
  const read = readCard(card);
  const red = read?.suit === "H" || read?.suit === "D";

  if (hidden) {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={!onClick}
        aria-label="a face down card"
        className="h-12 w-9 shrink-0 rounded-md bg-[repeating-linear-gradient(45deg,#3b3357_0_4px,#2d2745_4px_8px)] ring-1 ring-white/15 transition hover:-translate-y-0.5"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      title={by ? `${cardLabel(card)} · ${by}` : cardLabel(card)}
      aria-label={cardLabel(card)}
      className={clsx(
        "grid h-12 w-9 shrink-0 place-items-center rounded-md bg-[#f6f2e8] font-semibold shadow-sm ring-1 ring-black/20 transition",
        onClick && "hover:-translate-y-0.5 hover:ring-2 hover:ring-glow/70",
        red ? "text-[#c0392b]" : "text-[#1a1420]",
      )}
    >
      {isJoker(card) ? (
        <span className="text-[10px] leading-none">JK</span>
      ) : (
        <span className="grid place-items-center leading-tight">
          <span className="text-[11px]">{read?.rank}</span>
          <span className="text-[12px]">{read ? SUIT_GLYPH[read.suit] : ""}</span>
        </span>
      )}
    </button>
  );
}

/** What is in the deck, how many chairs, and who is partnered with whom. */
function Setup({
  state,
  canEdit,
  onChange,
  onDeal,
  onGather,
  onClose,
}: {
  state: CardTableState;
  canEdit: boolean;
  onChange: (next: CardTableState) => void;
  onDeal: () => void;
  onGather: () => void;
  onClose: () => void;
}) {
  const size = buildDeck(state.config).length;

  const toggleRank = (rank: Rank) => {
    const ranks = state.config.ranks.includes(rank)
      ? state.config.ranks.filter((r) => r !== rank)
      : [...state.config.ranks, rank];
    onChange({ ...state, config: { ...state.config, ranks } });
  };

  const toggleSuit = (suit: Suit) => {
    const suits = state.config.suits.includes(suit)
      ? state.config.suits.filter((s) => s !== suit)
      : [...state.config.suits, suit];
    onChange({ ...state, config: { ...state.config, suits } });
  };

  return (
    <div className="surface-raised animate-drift-in absolute inset-2 z-10 flex flex-col overflow-hidden rounded-2xl shadow-2xl">
      <header className="flex items-center justify-between border-b border-white/8 px-3 py-2">
        <h3 className="text-xs font-semibold">table setup</h3>
        <button
          type="button"
          onClick={onClose}
          aria-label="close"
          className="grid size-8 place-items-center rounded-lg text-muted transition hover:bg-white/8 hover:text-chalk sm:size-7"
        >
          <X className="size-3.5" strokeWidth={2.4} />
        </button>
      </header>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        <Row label={`ranks · ${state.config.ranks.length} of 13`}>
          <div className="flex flex-wrap gap-1">
            {RANKS.map((rank) => (
              <Chip
                key={rank}
                on={state.config.ranks.includes(rank)}
                disabled={!canEdit}
                onClick={() => toggleRank(rank)}
              >
                {rank}
              </Chip>
            ))}
          </div>
        </Row>

        <Row label="suits">
          <div className="flex gap-1">
            {SUITS.map((suit) => (
              <Chip
                key={suit}
                on={state.config.suits.includes(suit)}
                disabled={!canEdit}
                onClick={() => toggleSuit(suit)}
              >
                {SUIT_GLYPH[suit]}
              </Chip>
            ))}
          </div>
        </Row>

        <Row label="jokers">
          <div className="flex gap-1">
            {[0, 1, 2].map((n) => (
              <Chip
                key={n}
                on={state.config.jokers === n}
                disabled={!canEdit}
                onClick={() => onChange({ ...state, config: { ...state.config, jokers: n } })}
              >
                {n}
              </Chip>
            ))}
          </div>
        </Row>

        <Row label="chairs">
          <div className="flex flex-wrap gap-1">
            {[2, 3, 4, 5, 6, 7, 8].map((n) => (
              <Chip
                key={n}
                on={state.seatCount === n}
                disabled={!canEdit}
                onClick={() => onChange({ ...state, seatCount: n })}
              >
                {n}
              </Chip>
            ))}
          </div>
        </Row>

        <Row label="teams">
          <div className="flex flex-wrap gap-1">
            {[0, 2, 3, 4].map((n) => (
              <Chip
                key={n}
                on={state.teams === n}
                disabled={!canEdit}
                onClick={() => onChange({ ...state, teams: n })}
              >
                {n === 0 ? "none" : n}
              </Chip>
            ))}
          </div>
          <p className="mt-1 text-[10px] leading-relaxed text-muted/60">
            partners sit across from each other, so the chairs alternate and a team takes the
            round together.
          </p>
        </Row>

        <Row label="cards each">
          <div className="flex flex-wrap gap-1">
            {[3, 5, 7, 10, 13].map((n) => (
              <Chip
                key={n}
                on={state.dealEach === n}
                disabled={!canEdit}
                onClick={() => onChange({ ...state, dealEach: n })}
              >
                {n}
              </Chip>
            ))}
          </div>
        </Row>

        <p className="text-[10px] text-muted/60">{size} cards in the deck</p>
      </div>

      <footer className="flex gap-1.5 border-t border-white/8 p-2">
        <button
          type="button"
          disabled={!canEdit}
          onClick={onDeal}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-chalk py-2.5 text-xs font-semibold text-ink-950 transition hover:bg-white disabled:opacity-40"
        >
          <Shuffle className="size-3.5" strokeWidth={2.4} />
          shuffle and deal
        </button>
        <button
          type="button"
          disabled={!canEdit}
          onClick={onGather}
          title="everything back into the deck"
          aria-label="gather everything back"
          className="grid size-10 place-items-center rounded-xl bg-white/8 text-muted transition hover:bg-white/12 hover:text-chalk disabled:opacity-40"
        >
          <RotateCcw className="size-3.5" strokeWidth={2.2} />
        </button>
      </footer>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="mb-1 block text-[10px] tracking-wide text-muted/70 uppercase">{label}</span>
      {children}
    </div>
  );
}

function Chip({
  children,
  on,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  on: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        "min-h-8 min-w-9 rounded-lg px-2 py-1.5 text-[11px] font-medium transition disabled:opacity-40",
        on ? "bg-glow/25 text-glow" : "bg-white/7 text-muted hover:bg-white/12 hover:text-chalk",
      )}
    >
      {children}
    </button>
  );
}
