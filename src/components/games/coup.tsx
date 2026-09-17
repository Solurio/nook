"use client";

import { useState } from "react";
import clsx from "clsx";
import { Coins, RotateCcw, ShieldQuestion } from "lucide-react";
import { useRoom } from "@/realtime/room-provider";
import { useRoomStore } from "@/state/room-store";
import {
  ASSASSIN_COST,
  CLAIMS,
  COUP_COST,
  advance,
  alive,
  blockers,
  challengeable,
  isOut,
  judge,
  legalActions,
  loseInfluence,
  needsTarget,
  newGame,
  resolve,
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

  const write = (next: CoupState) => void updateData(item.id, { game: "coup", state: next });

  /** A chair nobody has claimed still carries its generated id. */
  const unclaimed = (seat: string, i: number) => seat === `s${i}`;

  const seatOfMine = state.players.findIndex((p) => p.seat === name);
  const openTable = state.players.every((p, i) => unclaimed(p.seat, i));

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
  /** On an open table the device speaks for whoever is due. */
  const actingAs = (who: number) => openTable || seatOfMine === who;

  const living = alive(state);
  const phase = state.phase;

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
    <div className="surface grain flex size-full flex-col gap-2 overflow-hidden rounded-2xl p-2.5">
      {/* Everyone at the table */}
      <div className="flex flex-wrap gap-1.5">
        {state.players.map((player, i) => {
          const out = isOut(player);
          const mine = seatOfMine === i;
          const free = unclaimed(player.seat, i);
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
                    title={mine || openTable ? card : "face down"}
                    className="h-4 w-3 rounded-[2px] ring-1 ring-white/25"
                    style={{
                      background: mine || openTable ? CARD_TINT[card] : "#3b3357",
                    }}
                  />
                ))}
                {player.lost.map((card, c) => (
                  <span
                    key={`lost-${c}`}
                    title={`lost the ${card}`}
                    className="h-4 w-3 rounded-[2px] opacity-30 ring-1 ring-white/15"
                    style={{ background: CARD_TINT[card] }}
                  />
                ))}
              </span>
            </button>
          );
        })}
      </div>

      {/* Whatever the table is waiting on */}
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto rounded-xl bg-ink-950/25 p-2 inset-ring inset-ring-white/6">
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
