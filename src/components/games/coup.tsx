"use client";

import { useState } from "react";
import clsx from "clsx";
import { BookOpen, Coins, Eye, Minus, Plus, RotateCcw, ShieldQuestion, X } from "lucide-react";
import { useRoom } from "@/realtime/room-provider";
import { useRoomStore } from "@/state/room-store";
import {
  ASSASSIN_COST,
  CARDS,
  CLAIMS,
  COUP_COST,
  FORCED_COUP,
  MAX_SEATS,
  MIN_SEATS,
  advance,
  alive,
  blockers,
  challengeable,
  copiesFor,
  deckSize,
  isOut,
  judge,
  legalActions,
  loseInfluence,
  needsTarget,
  newGame,
  resolve,
  withSeats,
  type Action,
  type ActionKind,
  type Card,
  type CoupState,
} from "@/lib/coup";
import type { Item } from "@/lib/types";

const ACTION_LABEL: Record<ActionKind, string> = {
  income: "income",
  foreign_aid: "foreign aid",
  coup: `coup (${COUP_COST})`,
  tax: "tax",
  assassinate: `assassinate (${ASSASSIN_COST})`,
  steal: "steal",
  exchange: "exchange",
};

const CARD_TINT: Record<Card, string> = {
  duke: "#c4a7f0",
  assassin: "#e0655c",
  captain: "#6aa9e0",
  ambassador: "#a6d189",
  contessa: "#f6c177",
};

/** One character each, so a face-up card is never only a colour. */
const CARD_MARK: Record<Card, string> = {
  duke: "^",
  assassin: "+",
  captain: "<",
  ambassador: "~",
  contessa: "V",
};

/** The manual. A small drawn sigil, then what the card is actually for. */
const CARD_GUIDE: Record<Card, { art: string[]; does: string; stops: string }> = {
  duke: {
    art: ["^ v ^", "|$$$|", "|___|"],
    does: "tax: take 3 coins from the bank.",
    stops: "stops anyone taking foreign aid.",
  },
  assassin: {
    art: ["=|=|=", "  |  ", "  v  "],
    does: "pay 3 coins to make somebody lose a card.",
    stops: "blocks nothing.",
  },
  captain: {
    art: [" $ $ ", "  |  ", "<----"],
    does: "steal 2 coins from another player.",
    stops: "stops someone stealing from you.",
  },
  ambassador: {
    art: [" --> ", " >-< ", " <-- "],
    does: "draw 2 from the deck, keep your usual number, put the rest back.",
    stops: "stops someone stealing from you.",
  },
  contessa: {
    art: ["|---|", " |:| ", "  v  "],
    does: "nothing on its own.",
    stops: "stops an assassination dead.",
  },
};

/**
 * Coup. Two cards each, face down, and everyone is free to claim whatever suits
 * them; the only brake is that doubting someone costs one of you a card.
 *
 * Hands travel in the same shared state as the rest of a room, so they are
 * hidden by the interface rather than kept from anyone -- the same honesty this
 * takes at a real table.
 */
export default function Coup({ item, state }: { item: Item<"game">; state: CoupState }) {
  const { updateData, canEdit } = useRoom();
  const me = useRoomStore((s) => s.me);
  const name = me?.name ?? "someone";
  const [target, setTarget] = useState<number | null>(null);
  const [manual, setManual] = useState(false);
  /** Which empty chair's hand is being looked at, when the device is passed around. */
  const [peek, setPeek] = useState<number | null>(null);

  const write = (next: CoupState) => {
    // Whatever was on show belonged to the position that just changed.
    setPeek(null);
    void updateData(item.id, { game: "coup", state: next });
  };

  /** A chair nobody has claimed still carries its generated id. */
  const unclaimed = (seat: string, i: number) => seat === `s${i}`;

  const seatOfMine = state.players.findIndex((p) => p.seat === name);
  const isFree = (i: number) => unclaimed(state.players[i]?.seat ?? "", i);

  /** Sit down, or stand up again. One person, one chair. */
  const claim = (i: number) => {
    if (!canEdit) return;
    const players = state.players.map((p, at) => {
      if (at === i) return { ...p, seat: p.seat === name ? `s${at}` : p.seat };
      return p;
    });
    if (state.players[i].seat === name) {
      write({ ...state, players });
      return;
    }
    if (!unclaimed(state.players[i].seat, i)) return;

    write({
      ...state,
      players: state.players.map((p, at) =>
        at === i ? { ...p, seat: name } : p.seat === name ? { ...p, seat: `s${at}` } : p,
      ),
    });
  };
  /**
   * Whose decisions this device may make: your own chair, plus any chair nobody
   * has sat in -- which is how one phone runs the whole table, and also stops a
   * half-claimed game stalling on an empty seat's turn.
   */
  const actingAs = (who: number) => seatOfMine === who || isFree(who);

  const living = alive(state);
  const phase = state.phase;

  /** The chair the game is waiting on right now. */
  const spotlight =
    phase.kind === "discard" || phase.kind === "exchange" ? phase.who : state.turn;

  // ---------------------------------------------------------------------------
  // Moving the game along
  // ---------------------------------------------------------------------------

  const declare = (kind: ActionKind, at: number | null) => {
    const by = state.turn;
    const action: Action = { kind, by, ...(at !== null ? { target: at } : {}) };

    // A coup and an assassination are paid for on declaration, whatever follows.
    const players = state.players.map((p, i) => {
      if (i !== by) return p;
      if (kind === "coup") return { ...p, coins: p.coins - COUP_COST };
      if (kind === "assassinate") return { ...p, coins: p.coins - ASSASSIN_COST };
      return p;
    });

    const paid = { ...state, players };
    setTarget(null);

    // Nothing to doubt and nothing to block: it simply happens.
    if (!challengeable(kind) && blockers(action, paid).seats.length === 0) {
      write(resolve(paid, action));
      return;
    }
    write({ ...paid, phase: { kind: "respond", action, passed: [] } });
  };

  /** After somebody gives a card up, carry on with whatever was waiting. */
  const afterDiscard = (next: CoupState, plan: "turn" | "action", action?: Action): CoupState => {
    if (plan === "action" && action) {
      // The target may have been knocked out by the discard itself.
      if (action.target !== undefined && isOut(next.players[action.target])) return advance(next);
      return resolve(next, action);
    }
    return advance(next);
  };

  const discard = (index: number) => {
    if (phase.kind !== "discard") return;
    const dropped = loseInfluence(state, phase.who, index);
    write(afterDiscard(dropped, phase.next, phase.action));
  };

  const doubt = (challenger: number) => {
    if (phase.kind === "respond") {
      const claimed = CLAIMS[phase.action.kind];
      if (!claimed) return;
      const { state: judged, honest } = judge(state, phase.action.by, claimed, challenger);

      write({
        ...judged,
        phase: honest
          ? // The claim was real: the doubter pays, then it goes ahead.
            { kind: "discard", who: challenger, next: "action", action: phase.action }
          : // Caught out: the bluffer pays and the action dies with it.
            { kind: "discard", who: phase.action.by, next: "turn" },
      });
      return;
    }

    if (phase.kind === "blocked") {
      const { state: judged, honest } = judge(state, phase.blocker, phase.card, challenger);
      write({
        ...judged,
        phase: honest
          ? // The block was real: the doubter pays and the action is stopped.
            { kind: "discard", who: challenger, next: "turn" }
          : // The blocker was bluffing: they pay and the action goes through.
            { kind: "discard", who: phase.blocker, next: "action", action: phase.action },
      });
    }
  };

  const block = (blocker: number, card: Card) => {
    if (phase.kind !== "respond") return;
    write({ ...state, phase: { kind: "blocked", action: phase.action, blocker, card, passed: [] } });
  };

  const pass = (who: number) => {
    if (phase.kind === "respond") {
      const passed = [...new Set([...phase.passed, who])];
      const waiting = living.filter((i) => i !== phase.action.by);
      if (waiting.every((i) => passed.includes(i))) {
        write(resolve(state, phase.action));
        return;
      }
      write({ ...state, phase: { ...phase, passed } });
      return;
    }

    if (phase.kind === "blocked") {
      const passed = [...new Set([...phase.passed, who])];
      const waiting = living.filter((i) => i !== phase.blocker);
      if (waiting.every((i) => passed.includes(i))) {
        // Nobody doubted the block, so the action never happens.
        write(advance(state));
        return;
      }
      write({ ...state, phase: { ...phase, passed } });
    }
  };

  const keepFromExchange = (keep: Card[]) => {
    if (phase.kind !== "exchange") return;
    const player = state.players[phase.who];
    const pool = [...player.cards, ...phase.drawn];
    // Whatever is not kept goes back under the deck.
    const back = [...pool];
    for (const card of keep) {
      const at = back.indexOf(card);
      if (at !== -1) back.splice(at, 1);
    }
    const players = state.players.map((p, i) => (i === phase.who ? { ...p, cards: keep } : p));
    write(advance({ ...state, players, deck: [...state.deck, ...back] }));
  };

  const restart = () => {
    setTarget(null);
    write(newGame(state.players.map((p) => p.seat)));
  };

  /** More or fewer chairs. The deck is sized to the table, so this deals again. */
  const resize = (by: number) => {
    setTarget(null);
    write(withSeats(state, state.players.length + by));
  };

  // ---------------------------------------------------------------------------
  // What to show
  // ---------------------------------------------------------------------------

  const nameOf = (i: number) => {
    const seat = state.players[i]?.seat;
    return seat && seat !== `s${i}` ? seat : `seat ${i + 1}`;
  };

  const describe = (action: Action) => {
    const who = nameOf(action.by);
    const claim = CLAIMS[action.kind];
    const at =
      action.target !== undefined
        ? ` on ${nameOf(action.target)}`
        : "";
    return `${who}: ${ACTION_LABEL[action.kind]}${at}${claim ? ` · claiming the ${claim}` : ""}`;
  };

  return (
    <div className="surface grain relative flex size-full flex-col gap-2 overflow-hidden rounded-2xl p-2.5">
      {/* How big the table is, and what is left to draw from */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-muted/70">
        <span className="flex items-center gap-0.5">
          <button
            type="button"
            disabled={!canEdit || state.players.length <= MIN_SEATS}
            onClick={() => resize(-1)}
            aria-label="one chair fewer"
            title="one chair fewer (deals again)"
            className="grid size-5 place-items-center rounded text-muted transition hover:bg-white/10 hover:text-chalk disabled:opacity-30"
          >
            <Minus className="size-3" strokeWidth={2.6} />
          </button>
          <span className="tabular-nums text-chalk">{state.players.length}</span>
          <span>chairs</span>
          <button
            type="button"
            disabled={!canEdit || state.players.length >= MAX_SEATS}
            onClick={() => resize(1)}
            aria-label="one chair more"
            title="one chair more (deals again)"
            className="grid size-5 place-items-center rounded text-muted transition hover:bg-white/10 hover:text-chalk disabled:opacity-30"
          >
            <Plus className="size-3" strokeWidth={2.6} />
          </button>
        </span>

        <span className="h-3 w-px bg-white/12" />

        <span title="cards nobody is holding, face down in the middle">
          <span className="tabular-nums text-chalk">{state.deck.length}</span> asleep
        </span>
        <span title={`${copiesFor(state.players.length)} of each of the five characters`}>
          <span className="tabular-nums text-chalk">{deckSize(state.players.length)}</span> in the
          box
        </span>

        <button
          type="button"
          onClick={() => setManual(true)}
          title="what the cards do"
          className="ml-auto flex items-center gap-1 rounded-lg px-1.5 py-1 text-muted transition hover:bg-white/8 hover:text-chalk"
        >
          <BookOpen className="size-3" strokeWidth={2.2} />
          cards
        </button>
      </div>

      {/* Everyone at the table */}
      <div className="flex flex-wrap gap-1.5">
        {state.players.map((player, i) => {
          const out = isOut(player);
          const mine = seatOfMine === i;
          const free = unclaimed(player.seat, i);
          // Your own hand, or one you have asked to see on a passed-around
          // device. An empty chair is not an open book.
          const faceUp = mine || peek === i;
          return (
            <button
              key={i}
              type="button"
              disabled={!canEdit}
              onClick={() => claim(i)}
              title={mine ? "stand up" : free ? "sit here" : player.seat}
              className={clsx(
                "flex min-h-9 min-w-0 flex-1 basis-24 items-center gap-1.5 rounded-xl px-2 py-1.5 text-left transition disabled:opacity-50",
                out
                  ? "bg-white/4 opacity-50"
                  : state.turn === i
                    ? "bg-white/12 ring-1 ring-glow/45"
                    : "bg-white/5 hover:bg-white/9",
              )}
            >
              <span className="min-w-0 flex-1 truncate text-[11px]">
                {free ? (
                  <span className="text-muted/55">seat {i + 1}</span>
                ) : (
                  <span className={mine ? "text-chalk" : "text-muted"}>{player.seat}</span>
                )}
              </span>
              <span className="flex shrink-0 items-center gap-0.5 text-[10px] tabular-nums text-muted">
                <Coins className="size-3" strokeWidth={2.2} />
                {player.coins}
              </span>
              <span className="flex shrink-0 gap-0.5">
                {player.cards.map((card, c) => (
                  <span
                    key={c}
                    title={faceUp ? card : "face down"}
                    className="grid h-4 w-3.5 place-items-center rounded-[2px] font-mono text-[8px] leading-none font-bold text-ink-950 ring-1 ring-white/25"
                    style={{ background: faceUp ? CARD_TINT[card] : "#3b3357" }}
                  >
                    {faceUp ? CARD_MARK[card] : ""}
                  </span>
                ))}
                {player.lost.map((card, c) => (
                  <span
                    key={`lost-${c}`}
                    title={`lost the ${card}`}
                    className="grid h-4 w-3.5 place-items-center rounded-[2px] font-mono text-[8px] leading-none font-bold text-ink-950/70 opacity-35 ring-1 ring-white/15"
                    style={{ background: CARD_TINT[card] }}
                  >
                    {CARD_MARK[card]}
                  </span>
                ))}
              </span>
            </button>
          );
        })}
      </div>

      {/* Whatever the table is waiting on */}
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto rounded-xl bg-ink-950/25 p-2 inset-ring inset-ring-white/6">
        {/* One screen between everybody: the chair that is up gets to look at
            its own cards, and only while it asks to. */}
        {canEdit && phase.kind !== "over" && isFree(spotlight) && (
          <button
            type="button"
            onClick={() => setPeek(peek === spotlight ? null : spotlight)}
            className={clsx(
              "flex min-h-7 shrink-0 items-center gap-1.5 self-start rounded-lg px-2 py-1 text-[10px] transition",
              peek === spotlight
                ? "bg-glow/20 text-glow"
                : "bg-white/6 text-muted hover:bg-white/10 hover:text-chalk",
            )}
          >
            <Eye className="size-3" strokeWidth={2.2} />
            {peek === spotlight ? "hide" : `look at ${nameOf(spotlight)}'s cards`}
          </button>
        )}
        {phase.kind === "over" && (
          <p className="my-auto text-center text-sm font-semibold text-chalk">
            {nameOf(phase.winner)} is the last one standing
          </p>
        )}

        {phase.kind === "act" && (
          <>
            <p className="text-[11px] text-muted">
              {nameOf(state.turn)} to move
            </p>
            {actingAs(state.turn) && canEdit && (
              <>
                <div className="flex flex-wrap gap-1">
                  {legalActions(state, state.turn).map((kind) => (
                    <button
                      key={kind}
                      type="button"
                      onClick={() => {
                        if (needsTarget(kind)) setTarget(target === null ? -1 : target);
                        if (!needsTarget(kind)) declare(kind, null);
                        else if (target !== null && target >= 0) declare(kind, target);
                        else setTarget(-1);
                      }}
                      className="min-h-8 rounded-lg bg-white/8 px-2.5 py-1.5 text-[11px] font-medium text-chalk transition hover:bg-white/14"
                    >
                      {ACTION_LABEL[kind]}
                    </button>
                  ))}
                </div>

                {target === -1 && (
                  <div className="flex flex-wrap items-center gap-1">
                    <span className="text-[10px] text-muted/70">on whom?</span>
                    {living
                      .filter((i) => i !== state.turn)
                      .map((i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => setTarget(i)}
                          className="min-h-8 rounded-lg bg-glow/20 px-2.5 py-1.5 text-[11px] text-glow"
                        >
                          {nameOf(i)}
                        </button>
                      ))}
                  </div>
                )}

                {target !== null && target >= 0 && (
                  <div className="flex flex-wrap items-center gap-1">
                    <span className="text-[10px] text-muted/70">
                      on {nameOf(target)}:
                    </span>
                    {legalActions(state, state.turn)
                      .filter(needsTarget)
                      .map((kind) => (
                        <button
                          key={kind}
                          type="button"
                          onClick={() => declare(kind, target)}
                          className="min-h-8 rounded-lg bg-white/10 px-2.5 py-1.5 text-[11px] text-chalk"
                        >
                          {ACTION_LABEL[kind]}
                        </button>
                      ))}
                    <button
                      type="button"
                      onClick={() => setTarget(null)}
                      className="min-h-8 rounded-lg px-2 py-1.5 text-[11px] text-muted"
                    >
                      cancel
                    </button>
                  </div>
                )}
              </>
            )}
          </>
        )}

        {phase.kind === "respond" && (
          <>
            <p className="text-[11px] text-chalk">{describe(phase.action)}</p>
            <p className="text-[10px] text-muted/60">
              {living.filter((i) => i !== phase.action.by && !phase.passed.includes(i)).length} still
              deciding
            </p>
            {canEdit && (
              <div className="flex flex-wrap gap-1">
                {living
                  .filter((i) => i !== phase.action.by && !phase.passed.includes(i))
                  .filter(actingAs)
                  .map((i) => (
                    <div key={i} className="flex flex-wrap items-center gap-1">
                      <span className="text-[10px] text-muted/70">{nameOf(i)}:</span>
                      {challengeable(phase.action.kind) && (
                        <button
                          type="button"
                          onClick={() => doubt(i)}
                          className="flex min-h-8 items-center gap-1 rounded-lg bg-warm/20 px-2.5 py-1.5 text-[11px] font-medium text-warm"
                        >
                          <ShieldQuestion className="size-3.5" strokeWidth={2.2} />
                          doubt it
                        </button>
                      )}
                      {blockers(phase.action, state).seats.includes(i) &&
                        blockers(phase.action, state).cards.map((card) => (
                          <button
                            key={card}
                            type="button"
                            onClick={() => block(i, card)}
                            className="min-h-8 rounded-lg bg-white/10 px-2.5 py-1.5 text-[11px] text-chalk"
                          >
                            block ({card})
                          </button>
                        ))}
                      <button
                        type="button"
                        onClick={() => pass(i)}
                        className="min-h-8 rounded-lg px-2 py-1.5 text-[11px] text-muted"
                      >
                        allow
                      </button>
                    </div>
                  ))}
              </div>
            )}
          </>
        )}

        {phase.kind === "blocked" && (
          <>
            <p className="text-[11px] text-chalk">
              {nameOf(phase.blocker)} blocks with the {phase.card}
            </p>
            {canEdit && (
              <div className="flex flex-wrap gap-1">
                {living
                  .filter((i) => i !== phase.blocker && !phase.passed.includes(i))
                  .filter(actingAs)
                  .map((i) => (
                    <div key={i} className="flex items-center gap-1">
                      <span className="text-[10px] text-muted/70">{nameOf(i)}:</span>
                      <button
                        type="button"
                        onClick={() => doubt(i)}
                        className="min-h-8 rounded-lg bg-warm/20 px-2.5 py-1.5 text-[11px] font-medium text-warm"
                      >
                        doubt the block
                      </button>
                      <button
                        type="button"
                        onClick={() => pass(i)}
                        className="min-h-8 rounded-lg px-2 py-1.5 text-[11px] text-muted"
                      >
                        allow
                      </button>
                    </div>
                  ))}
              </div>
            )}
          </>
        )}

        {phase.kind === "discard" && (
          <>
            <p className="text-[11px] text-chalk">
              {nameOf(phase.who)} gives a card up
            </p>
            {canEdit && actingAs(phase.who) && (
              <div className="flex flex-wrap gap-1">
                {state.players[phase.who].cards.map((card, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => discard(i)}
                    className="min-h-8 rounded-lg px-2.5 py-1.5 text-[11px] font-medium text-ink-950"
                    style={{ background: CARD_TINT[card] }}
                  >
                    {card}
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        {phase.kind === "exchange" && (
          <ExchangePicker
            hand={state.players[phase.who].cards}
            drawn={phase.drawn}
            enabled={canEdit && actingAs(phase.who)}
            who={nameOf(phase.who)}
            onKeep={keepFromExchange}
          />
        )}
      </div>

      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 truncate text-[10px] text-muted/60">
          {state.log[state.log.length - 1] ?? "two cards each, and nobody has to tell the truth"}
        </p>
        <button
          type="button"
          disabled={!canEdit}
          onClick={restart}
          aria-label="new game"
          title="new game"
          className="grid size-8 shrink-0 place-items-center rounded-lg text-muted transition hover:bg-white/8 hover:text-chalk disabled:opacity-40 sm:size-7"
        >
          <RotateCcw className="size-3.5" strokeWidth={2.2} />
        </button>
      </div>

      {manual && <Manual onClose={() => setManual(false)} />}
    </div>
  );
}

/**
 * What the five characters are. Worth having to hand: the cards themselves are
 * five coloured slivers, which tells a newcomer nothing.
 */
function Manual({ onClose }: { onClose: () => void }) {
  return (
    <div className="absolute inset-0 z-10 flex flex-col rounded-2xl bg-ink-950/94 p-2.5 backdrop-blur-sm">
      <div className="mb-2 flex shrink-0 items-center justify-between">
        <h3 className="text-[11px] font-semibold text-chalk">the five characters</h3>
        <button
          type="button"
          onClick={onClose}
          aria-label="close"
          className="grid size-7 place-items-center rounded-lg text-muted transition hover:bg-white/8 hover:text-chalk"
        >
          <X className="size-3.5" strokeWidth={2.4} />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
        {CARDS.map((card) => {
          const guide = CARD_GUIDE[card];
          return (
            <div key={card} className="flex items-start gap-2">
              <div
                aria-hidden
                className="shrink-0 rounded-md px-1.5 py-1 font-mono text-[9px] leading-[1.15] font-bold whitespace-pre text-ink-950"
                style={{ background: CARD_TINT[card] }}
              >
                {guide.art.map((line, i) => (
                  <div key={i}>{line}</div>
                ))}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold" style={{ color: CARD_TINT[card] }}>
                  {card} <span className="font-mono text-muted/60">{CARD_MARK[card]}</span>
                </p>
                <p className="text-[10px] text-muted">{guide.does}</p>
                <p className="text-[10px] text-muted/60">{guide.stops}</p>
              </div>
            </div>
          );
        })}

        <div className="mt-1 border-t border-white/8 pt-2 text-[10px] text-muted/70">
          <p className="mb-1 font-semibold text-muted">and the moves nobody can deny</p>
          <p>income: take 1 coin. Cannot be doubted or blocked.</p>
          <p>foreign aid: take 2 coins. A duke can stop it.</p>
          <p>
            coup: pay {COUP_COST} coins, someone loses a card. Nothing stops it, and at{" "}
            {FORCED_COUP} coins it is all you may do.
          </p>
          <p className="mt-1.5">
            You may claim any card at any time, whether or not you hold it. The only cost of lying
            is that somebody doubts you -- if they are right you lose a card, if they are wrong they
            do.
          </p>
        </div>
      </div>
    </div>
  );
}

/** The ambassador keeps as many as they started with, from a bigger pool. */
function ExchangePicker({
  hand,
  drawn,
  enabled,
  who,
  onKeep,
}: {
  hand: Card[];
  drawn: Card[];
  enabled: boolean;
  who: string;
  onKeep: (keep: Card[]) => void;
}) {
  const pool = [...hand, ...drawn];
  const [chosen, setChosen] = useState<number[]>([]);
  const need = hand.length;

  const toggle = (i: number) =>
    setChosen((current) =>
      current.includes(i)
        ? current.filter((c) => c !== i)
        : current.length >= need
          ? current
          : [...current, i],
    );

  return (
    <>
      <p className="text-[11px] text-chalk">
        {who} keeps {need} of {pool.length}
      </p>
      {enabled && (
        <>
          <div className="flex flex-wrap gap-1">
            {pool.map((card, i) => (
              <button
                key={i}
                type="button"
                onClick={() => toggle(i)}
                className={clsx(
                  "min-h-8 rounded-lg px-2.5 py-1.5 text-[11px] font-medium text-ink-950 transition",
                  chosen.includes(i) ? "ring-2 ring-chalk" : "opacity-70",
                )}
                style={{ background: CARD_TINT[card] }}
              >
                {card}
              </button>
            ))}
          </div>
          <button
            type="button"
            disabled={chosen.length !== need}
            onClick={() => onKeep(chosen.map((i) => pool[i]))}
            className="min-h-8 self-start rounded-lg bg-chalk px-3 py-1.5 text-[11px] font-semibold text-ink-950 disabled:opacity-40"
          >
            keep these
          </button>
        </>
      )}
    </>
  );
}
