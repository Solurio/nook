"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { BookOpen, Check, Crown, Minus, PenLine, Plus, X } from "lucide-react";
import { useRoom } from "@/realtime/room-provider";
import { usePiles } from "@/realtime/use-piles";
import { useHandOver } from "@/realtime/use-hand-over";
import { useRoomStore } from "@/state/room-store";
import { chairOf, claimChair } from "@/lib/seats";
import { randomBelow } from "@/lib/dice";
import { sizeOf } from "@/lib/piles";
import { PACKS, type PackId } from "@/lib/cah-packs";
import {
  GOALS,
  HAND,
  MAX_SEATS,
  MIN_SEATS,
  SAT_OUT,
  WHITE_PILE,
  addBlacks,
  allRevealed,
  answerOf,
  answering,
  deckProblem,
  decksFor,
  emptyCah,
  fill,
  handSlot,
  judgeable,
  nextRound,
  parseCards,
  pickOf,
  pickWinner,
  playSlot,
  promptOf,
  startGame,
  usedAnswers,
  type CahState,
} from "@/lib/cah";
import type { Item } from "@/lib/types";
import RulesSheet from "./rules-sheet";

function BlackCard({ prompt, answers, small }: { prompt: string; answers?: string[]; small?: boolean }) {
  return (
    <div
      className={clsx(
        "flex flex-col justify-between rounded-xl bg-[#121014] font-semibold text-[#f4efe6] shadow-[0_6px_18px_rgba(0,0,0,0.45)] ring-1 ring-white/10",
        small ? "min-h-20 p-2.5 text-[12px]" : "min-h-28 p-3.5 text-[14px] leading-snug",
      )}
    >
      <p>
        {fill(prompt, answers ?? []).map((part, i) =>
          part.answer ? (
            <span key={i} className="text-warm underline decoration-warm/40 underline-offset-2">
              {part.text}
            </span>
          ) : (
            <span key={i}>{part.text}</span>
          ),
        )}
      </p>
      {pickOf(prompt) > 1 && <p className="mt-2 self-end text-[10px] font-bold tracking-wide text-muted">PICK {pickOf(prompt)}</p>}
    </div>
  );
}

function WhiteCard({
  text,
  order,
  chosen,
  dim,
  onClick,
  className,
}: {
  text: string;
  order?: number;
  chosen?: boolean;
  dim?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  const look = clsx(
    "relative flex min-h-16 flex-col rounded-lg bg-[#f4efe6] p-1.5 text-left text-[10.5px] leading-tight font-semibold text-[#141117] shadow-[0_3px_8px_rgba(0,0,0,0.35)] transition",
    onClick && "hover:-translate-y-0.5",
    chosen && "-translate-y-1 ring-3 ring-warm",
    dim && "opacity-50",
    className,
  );
  const badge = order !== undefined && (
    <span className="absolute -top-1.5 -right-1.5 grid size-5 place-items-center rounded-full bg-warm text-[10px] font-bold text-ink-950">{order}</span>
  );
  // Only a card you can play is a button; one sitting inside an answer the czar taps is not.
  if (!onClick) {
    return (
      <div className={look}>
        {text}
        {badge}
      </div>
    );
  }
  return (
    <button type="button" onClick={onClick} className={look}>
      {text}
      {badge}
    </button>
  );
}

/**
 * Cards Against Humanity, with the starter cards, the table's own, or both.
 * Hands are secret; answers go in face down and sealed, and the database
 * turns them over together once the last one is in -- in an order that says
 * nothing about who played what.
 */
export default function Cah({ item, state: raw }: { item: Item<"game">; state: unknown }) {
  const { updateData, pile, canEdit } = useRoom();
  const me = useRoomStore((s) => s.me);
  const state = useMemo<CahState>(() => ({ ...emptyCah(), ...(raw as Partial<CahState>) }) as CahState, [raw]);

  const [busy, setBusy] = useState(false);
  const [manual, setManual] = useState(false);
  const [editing, setEditing] = useState(false);
  const [blackText, setBlackText] = useState("");
  const [whiteText, setWhiteText] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [holding, setHolding] = useState<string | null>(null);
  const [chosen, setChosen] = useState<{ key: string; cards: string[] }>({ key: "", cards: [] });
  const [preview, setPreview] = useState<{ key: string; chair: string | null }>({ key: "", chair: null });

  const chairs = useMemo(
    () => Array.from({ length: Math.max(MIN_SEATS, Math.min(MAX_SEATS, state.seatCount)) }, (_, i) => `s${i}`),
    [state.seatCount],
  );
  const holders = useMemo(() => state.holders ?? {}, [state.holders]);
  const myChair = chairOf(state.seats, holders, me);
  const mine = usePiles(item.id, state.piles);
  useHandOver(item.id, state.piles, holders);

  const label = (chair: string) => state.seats[chair] ?? `seat ${chairs.indexOf(chair) + 1}`;
  const plays = (chair: string) => canEdit && (holders[chair] ? holders[chair] === me?.userId : true);
  const playing = state.phase === "play";
  const prompt = promptOf(state);
  const pick = pickOf(prompt);

  const publicState = (next: CahState) => ({ game: "cah", state: clean(next) });
  const write = (next: CahState) => updateData(item.id, publicState(next) as never);
  const latest = (): CahState => {
    const data = useRoomStore.getState().items[item.id]?.data as { state?: CahState } | undefined;
    return { ...emptyCah(), ...(data?.state ?? state) };
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

  // ---------------------------------------------------------------------------
  // Dealing, and the table's own cards
  // ---------------------------------------------------------------------------

  const deal = () =>
    run(async () => {
      if (!me) return;
      const started = startGame(clean(state), chairs, randomBelow, label);
      if ("problem" in started) {
        setProblem(started.problem);
        return;
      }
      setProblem(null);
      const set = await pile("pile_setup", {
        p_item: item.id,
        p_piles: [{ slot: WHITE_PILE, cards: started.whites, shuffle: true }],
        p_public: publicState(started.state),
      });
      if (set.error) return;
      await pile("pile_deal", {
        p_item: item.id,
        p_from: WHITE_PILE,
        p_targets: chairs.map((c) => ({ slot: handSlot(c), owner: holders[c] ?? me.userId, count: HAND })),
      });
    });

  const openEditor = () => {
    setBlackText(state.custom.black.join("\n"));
    setWhiteText(state.custom.white.join("\n"));
    setEditing(true);
  };

  const saveCards = () =>
    run(async () => {
      const now = latest();
      const custom = { black: parseCards(blackText, true), white: parseCards(whiteText) };
      setEditing(false);
      if (now.phase !== "play") {
        await write({ ...now, custom });
        return;
      }
      // A game already going: new cards join it -- black ones among those still to come,
      // white ones shuffled into the deck.
      const newBlack = custom.black.filter((c) => !now.custom.black.includes(c));
      const newWhite = custom.white.filter((c) => !now.custom.white.includes(c) && !decksFor(now).white.includes(c));
      // The state is written on its own: a pile call carrying it would replace the
      // answers the database has turned over this round.
      if (newWhite.length) await pile("pile_put", { p_item: item.id, p_to: WHITE_PILE, p_cards: newWhite, p_shuffle: true });
      await write({ ...addBlacks(latest(), newBlack, randomBelow), custom });
    });

  const togglePack = (id: PackId) => {
    const packs = state.packs.includes(id) ? state.packs.filter((p) => p !== id) : [...state.packs, id];
    void write({ ...state, packs });
  };

  // ---------------------------------------------------------------------------
  // Answering
  // ---------------------------------------------------------------------------

  const answeredIn = (chair: string) => sizeOf(state.piles, playSlot(state.round, chair)) > 0 || Boolean(answerOf(state, chair));
  const waitingOn = playing && state.step === "answer" ? answering(state).filter((c) => !answeredIn(c)) : [];
  const handsHere = answering(state).filter((c) => mine[handSlot(c)] && plays(c));
  // The hand on screen: your own when you are sitting down; otherwise whichever
  // one the phone was handed over for.
  const shownChair =
    myChair && mine[handSlot(myChair)] ? myChair : holding && mine[handSlot(holding)] ? holding : null;
  const shownHand = shownChair ? ((mine[handSlot(shownChair)] as string[] | undefined) ?? []) : [];
  const canAnswer =
    playing && state.step === "answer" && shownChair !== null && shownChair !== state.czar && plays(shownChair) && !answeredIn(shownChair);
  const chooseKey = `${state.round}:${shownChair}`;
  const current = chosen.key === chooseKey ? chosen.cards.filter((c) => shownHand.includes(c)) : [];

  const choose = (card: string) => {
    if (!canAnswer) return;
    const cards = current.includes(card) ? current.filter((c) => c !== card) : [...current, card].slice(-pick);
    setChosen({ key: chooseKey, cards });
  };

  /** Back up to a full hand, sending used answers back into the deck if it has run dry. */
  const refill = async (chair: string, count: number) => {
    if (!me) return;
    const now = latest();
    if (sizeOf(now.piles, WHITE_PILE) < count) {
      const used = usedAnswers(now);
      if (used.length) {
        // Written apart from the cards, for the same reason as above: this can land
        // just as the round's answers are being turned over.
        await pile("pile_put", { p_item: item.id, p_to: WHITE_PILE, p_cards: used, p_shuffle: true });
        await write({ ...latest(), recycled: now.round - 1 });
      }
    }
    await pile("pile_move", {
      p_item: item.id,
      p_from: WHITE_PILE,
      p_to: handSlot(chair),
      p_count: count,
      p_to_owner: holders[chair] ?? me.userId,
    });
  };

  const answer = () =>
    run(async () => {
      const chair = shownChair;
      const now = latest();
      if (!chair || current.length !== pickOf(promptOf(now))) return;
      const slot = playSlot(now.round, chair);
      if (sizeOf(now.piles, slot) > 0) return;
      // Face down, sealed to everyone else's answer this round.
      const opened = await pile("pile_put", {
        p_item: item.id,
        p_to: slot,
        p_cards: [],
        p_seal: answering(now).map((c) => playSlot(now.round, c)),
      });
      if (opened.error) return;
      const moved = await pile("pile_move", { p_item: item.id, p_from: handSlot(chair), p_to: slot, p_cards: current });
      if (moved.error) return;
      setChosen({ key: "", cards: [] });
      setHolding(null);
      await refill(chair, current.length);
    });

  /** Someone who is not coming back to answer: a stand-in, so the round can go on. */
  const skip = (chair: string) =>
    run(async () => {
      const now = latest();
      const slot = playSlot(now.round, chair);
      if (sizeOf(now.piles, slot) > 0) return;
      await pile("pile_put", { p_item: item.id, p_to: slot, p_cards: [SAT_OUT] });
    });

  // Everyone is in: the answers turn over together. The czar's screen does it;
  // anyone else's a moment later, in case the czar has wandered off.
  const everyoneIn = playing && state.step === "answer" && answering(state).every((c) => sizeOf(state.piles, playSlot(state.round, c)) > 0);
  const revealKey = everyoneIn && !allRevealed(state) ? String(state.round) : "";
  const revealing = useRef("");
  const czarHere = plays(state.czar);
  useEffect(() => {
    if (!revealKey || revealing.current === revealKey || !canEdit) return;
    const t = window.setTimeout(
      () => {
        const now = latest();
        if (allRevealed(now) || String(now.round) !== revealKey) return;
        revealing.current = revealKey;
        void pile("pile_reveal", { p_item: item.id, p_slots: answering(now).map((c) => playSlot(now.round, c)) }, { quiet: true });
      },
      czarHere ? 0 : 2500,
    );
    return () => window.clearTimeout(t);
    // Keyed on the round waiting to be turned over; the rest is read fresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealKey, czarHere]);

  // ---------------------------------------------------------------------------
  // Judging
  // ---------------------------------------------------------------------------

  const judging = playing && state.step === "answer" && allRevealed(state);
  const answers = judging || (state.step === "picked" && (playing || state.phase === "over")) ? judgeable(state) : [];
  const previewKey = `${state.round}`;
  const previewing = preview.key === previewKey ? preview.chair : null;
  const czarPicks = judging && czarHere;
  const choice = state.picked ?? previewing;

  const decide = (chair: string) => run(() => write(pickWinner(latest(), chair, label)));
  const onward = () => run(() => write(nextRound(latest(), randomBelow, label)));

  const decks = decksFor(state);
  const deckIssue = state.phase !== "play" ? deckProblem(state, chairs.length) : null;

  return (
    <div className="surface grain relative flex size-full flex-col gap-2 overflow-hidden rounded-2xl p-2.5">
      {/* The table */}
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
            <span className="tabular-nums text-chalk">{state.seatCount}</span> chairs
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
          const czar = playing && state.czar === chair;
          const done = playing && state.step === "answer" && chair !== state.czar && answeredIn(chair);
          return (
            <button
              key={chair}
              type="button"
              disabled={!canEdit || !me || playing}
              onClick={() => me && void write({ ...state, ...claimChair(state.seats, holders, chair, me) })}
              className={clsx(
                "flex min-h-7 items-center gap-1 rounded-lg px-1.5 disabled:cursor-default",
                czar ? "bg-white/12 ring-1 ring-warm/60" : "bg-white/5",
              )}
              title={czar ? "the czar this round" : "sit here"}
            >
              {czar && <Crown className="size-3 text-warm" />}
              {done && <Check className="size-3 text-glow" />}
              <span className={clsx("max-w-24 truncate", chair === myChair ? "text-chalk" : "text-muted")}>
                {state.seats[chair] ?? <span className="text-muted/50">seat {index + 1}</span>}
              </span>
              {(playing || state.phase === "over") && <span className="tabular-nums text-warm">{state.points[chair] ?? 0}</span>}
            </button>
          );
        })}
        <span className="ml-auto flex items-center gap-0.5">
          <button type="button" disabled={!canEdit} onClick={openEditor} className="flex min-h-7 items-center gap-1 rounded-lg px-1.5 hover:bg-white/8 hover:text-chalk disabled:opacity-40">
            <PenLine className="size-3" /> your cards
          </button>
          <button type="button" onClick={() => setManual(true)} className="flex min-h-7 items-center gap-1 rounded-lg px-1.5 hover:bg-white/8 hover:text-chalk">
            <BookOpen className="size-3" /> rules
          </button>
        </span>
      </div>

      {!playing ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 overflow-y-auto text-center">
          {state.phase === "over" && state.champion && (
            <div className="flex flex-col items-center gap-2">
              <p className="text-sm font-semibold text-warm">{label(state.champion)} wins, {state.points[state.champion]} to the goal of {state.goal}</p>
              {state.picked && answerOf(state, state.picked) && (
                <div className="w-64">
                  <BlackCard prompt={prompt} answers={answerOf(state, state.picked) ?? []} small />
                </div>
              )}
            </div>
          )}
          <div className="flex flex-col gap-1.5 text-[11px]">
            {(Object.keys(PACKS) as PackId[]).map((id) => (
              <label key={id} className="flex min-h-8 items-center gap-2 text-muted">
                <input type="checkbox" checked={state.packs.includes(id)} disabled={!canEdit} onChange={() => togglePack(id)} className="size-4 accent-warm" />
                <span className="text-chalk">{PACKS[id].name}</span>
                <span className="text-muted/60">
                  {PACKS[id].black.length} black, {PACKS[id].white.length} white
                </span>
              </label>
            ))}
            <p className="text-muted">
              your own: {state.custom.black.length} black, {state.custom.white.length} white ·{" "}
              <button type="button" disabled={!canEdit} onClick={openEditor} className="text-glow underline-offset-2 hover:underline">
                write some
              </button>
            </p>
            <p className="text-muted/60">
              in play: {decks.black.length} black, {decks.white.length} white
            </p>
          </div>
          <div className="flex items-center gap-1 text-[11px] text-muted">
            first to
            {GOALS.map((g) => (
              <button
                key={g}
                type="button"
                disabled={!canEdit}
                onClick={() => void write({ ...state, goal: g })}
                className={clsx("min-h-8 min-w-8 rounded-lg tabular-nums", state.goal === g ? "bg-warm/25 text-warm" : "bg-white/6 text-chalk")}
              >
                {g}
              </button>
            ))}
          </div>
          {(problem || deckIssue) && <p className="max-w-72 text-[11px] text-[#f2a4b8]">{problem ?? deckIssue}</p>}
          <button
            type="button"
            disabled={!canEdit || busy || Boolean(deckIssue)}
            onClick={() => void deal()}
            className="min-h-10 rounded-xl bg-chalk px-5 text-[12px] font-semibold text-ink-950 disabled:opacity-40"
          >
            {state.phase === "over" ? "deal again" : "deal"}
          </button>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
          {/* The question, and what is going on */}
          <div className="grid grid-cols-[minmax(0,15rem)_1fr] items-start gap-2.5 max-sm:grid-cols-1">
            <BlackCard prompt={prompt} answers={choice ? (answerOf(state, choice) ?? []) : undefined} />
            <div className="flex flex-col gap-1.5 text-[11px] text-muted">
              <p>
                <Crown className="mr-1 inline size-3 text-warm" />
                <b className="text-chalk">{label(state.czar)}</b> is the czar
                {czarHere && myChair === state.czar ? " -- that's you" : ""}
              </p>
              {state.step === "answer" && !judging && (
                <>
                  {waitingOn.length ? (
                    <p>
                      waiting for {waitingOn.map(label).join(", ")}
                      {pick > 1 && ` · pick ${pick}`}
                    </p>
                  ) : (
                    <p className="text-chalk">everyone&apos;s in, turning them over...</p>
                  )}
                  {canEdit && waitingOn.length > 0 && waitingOn.length < answering(state).length && (
                    <span className="flex flex-wrap gap-1">
                      {waitingOn.map((c) => (
                        <button key={c} type="button" disabled={busy} onClick={() => void skip(c)} className="min-h-7 rounded-lg bg-white/6 px-2 text-[10px] text-muted hover:text-chalk">
                          go on without {label(c)}
                        </button>
                      ))}
                    </span>
                  )}
                </>
              )}
              {judging && <p className="text-chalk">{czarPicks ? "tap the one you like best, then pick it" : `${label(state.czar)} is choosing...`}</p>}
              {state.step === "picked" && state.picked && (
                <p className="text-chalk">
                  <b className="text-warm">{label(state.picked)}</b> takes the round
                </p>
              )}
              {czarPicks && previewing && (
                <button type="button" disabled={busy} onClick={() => void decide(previewing)} className="min-h-9 self-start rounded-xl bg-chalk px-4 text-[12px] font-semibold text-ink-950">
                  pick this one
                </button>
              )}
              {state.step === "picked" && canEdit && (
                <button type="button" disabled={busy} onClick={() => void onward()} className="min-h-9 self-start rounded-xl bg-chalk px-4 text-[12px] font-semibold text-ink-950">
                  next round
                </button>
              )}
            </div>
          </div>

          {/* The answers, face down until they are all in */}
          {state.step === "answer" && !judging && answering(state).some(answeredIn) && (
            <div className="flex flex-wrap gap-1.5">
              {answering(state)
                .filter(answeredIn)
                .map((c) => (
                  <div key={c} className="grid h-14 w-11 place-items-center rounded-lg bg-[#f4efe6]/90 text-[8px] font-bold text-[#141117]/40 shadow">
                    nook
                  </div>
                ))}
            </div>
          )}
          {answers.length > 0 && (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))] gap-1.5">
              {answers.map((c) => {
                const cards = answerOf(state, c) ?? [];
                const won = state.picked === c;
                return (
                  <div key={c} className="flex flex-col gap-1">
                    <button
                      type="button"
                      disabled={!czarPicks}
                      onClick={() => setPreview({ key: previewKey, chair: previewing === c ? null : c })}
                      className={clsx(
                        "flex flex-col gap-1 rounded-xl p-1 text-left transition disabled:cursor-default",
                        (previewing === c && judging) || won ? "bg-warm/20 ring-2 ring-warm" : "bg-white/4",
                        czarPicks && "hover:bg-white/10",
                      )}
                    >
                      {cards.map((card, i) => (
                        <WhiteCard key={i} text={card} order={cards.length > 1 ? i + 1 : undefined} />
                      ))}
                    </button>
                    {state.step === "picked" && <span className={clsx("px-1 text-[10px]", won ? "text-warm" : "text-muted")}>{label(c)}</span>}
                  </div>
                );
              })}
            </div>
          )}

          {/* Your hand */}
          {shownChair ? (
            <div className="mt-auto flex flex-col gap-1.5 rounded-xl bg-white/4 p-2">
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted">
                <span>
                  {shownChair === myChair ? "your hand" : `${label(shownChair)}'s hand`}
                  {shownChair === state.czar && " -- you're the czar this round"}
                  {shownChair !== state.czar && answeredIn(shownChair) && state.step === "answer" && " -- answered"}
                </span>
                {canAnswer && (
                  <span className="text-muted/70">
                    {current.length}/{pick} chosen
                  </span>
                )}
                {canAnswer && (
                  <button
                    type="button"
                    disabled={busy || current.length !== pick}
                    onClick={() => void answer()}
                    className="ml-auto min-h-9 rounded-xl bg-chalk px-4 text-[12px] font-semibold text-ink-950 disabled:opacity-35"
                  >
                    play {pick > 1 ? "these" : "this"}
                  </button>
                )}
                {!myChair && holding && (
                  <button type="button" onClick={() => setHolding(null)} className="ml-auto grid size-8 place-items-center rounded-lg text-muted hover:text-chalk" aria-label="hide the hand">
                    <X className="size-3.5" />
                  </button>
                )}
              </div>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(5.6rem,1fr))] gap-1.5">
                {shownHand.map((card) => (
                  <WhiteCard
                    key={card}
                    text={card}
                    chosen={current.includes(card)}
                    order={current.includes(card) && pick > 1 ? current.indexOf(card) + 1 : undefined}
                    dim={!canAnswer}
                    onClick={canAnswer ? () => choose(card) : undefined}
                  />
                ))}
              </div>
            </div>
          ) : (
            handsHere.length > 0 &&
            state.step === "answer" &&
            !judging && (
              <div className="mt-auto flex flex-wrap items-center gap-1 rounded-xl bg-white/4 p-2 text-[11px] text-muted">
                pass the phone, then open a hand:
                {handsHere
                  .filter((c) => !answeredIn(c))
                  .map((c) => (
                    <button key={c} type="button" onClick={() => setHolding(c)} className="min-h-8 rounded-lg bg-white/8 px-2 text-chalk">
                      {label(c)}
                    </button>
                  ))}
              </div>
            )
          )}
        </div>
      )}

      {editing && (
        <div className="absolute inset-0 z-30 flex flex-col gap-2 rounded-2xl bg-ink-950/95 p-3 backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <h3 className="text-[12px] font-semibold text-chalk">your own cards</h3>
            <button type="button" onClick={() => setEditing(false)} aria-label="close" className="grid size-9 place-items-center rounded-lg text-muted hover:bg-white/8 hover:text-chalk">
              <X className="size-4" />
            </button>
          </div>
          <p className="text-[10px] text-muted">
            One card a line. On a black card, underscores make a blank -- two blanks ask for two answers, none asks for one at the end.
            {playing && " New cards join the game going on now; anything taken away stays in it until the next deal."}
          </p>
          <label className="flex min-h-0 flex-1 flex-col gap-1 text-[11px] text-muted">
            black cards (questions)
            <textarea
              value={blackText}
              onChange={(event) => setBlackText(event.target.value)}
              placeholder={"What did the intern do this time? ___.\n___ and ___: a love story."}
              className="min-h-0 flex-1 resize-none rounded-lg bg-[#121014] p-2 text-[12px] text-chalk outline-none ring-1 ring-white/10 focus:ring-warm/60"
            />
          </label>
          <label className="flex min-h-0 flex-1 flex-col gap-1 text-[11px] text-muted">
            white cards (answers)
            <textarea
              value={whiteText}
              onChange={(event) => setWhiteText(event.target.value)}
              placeholder={"The group chat at 3am.\nOur landlord's cat."}
              className="min-h-0 flex-1 resize-none rounded-lg bg-[#f4efe6] p-2 text-[12px] text-[#141117] outline-none focus:ring-2 focus:ring-warm/60"
            />
          </label>
          <div className="flex items-center gap-2 text-[10px] text-muted">
            {parseCards(blackText, true).length} black, {parseCards(whiteText).length} white
            <button type="button" disabled={busy} onClick={() => void saveCards()} className="ml-auto min-h-9 rounded-xl bg-chalk px-4 text-[12px] font-semibold text-ink-950">
              save
            </button>
          </div>
        </div>
      )}

      {manual && (
        <RulesSheet title="Cards Against Humanity" onClose={() => setManual(false)}>
          <p>
            Everyone holds ten white cards. Each round one player is the <b>czar</b>: a black card comes up, and everybody else
            answers it with the funniest white card in their hand -- two, when it has two blanks.
          </p>
          <p>
            Answers go in face down. Once the last one is in, they all turn over together, mixed up, so the czar has no idea whose
            is whose. The czar picks a favourite; whoever played it gets the point. Hands fill back up to ten, the next player is
            czar, and the first to the goal wins.
          </p>
          <p>
            <b>Your own cards</b>: write as many as you like, before or during a game. Mix them with the starter cards, or play
            with nothing but yours.
          </p>
          <p>
            Somebody gone quiet? Anyone can go on without them for the round, once the others have answered.
          </p>
        </RulesSheet>
      )}
    </div>
  );
}

/** The state without what only the database writes. */
function clean(state: CahState): CahState {
  const out = { ...state } as CahState & Record<string, unknown>;
  delete out.piles;
  delete out.revealed;
  return out;
}
