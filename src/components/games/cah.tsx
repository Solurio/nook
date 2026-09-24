"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { BookOpen, Check, Crown, Layers, Minus, Plus, X } from "lucide-react";
import { useRoom } from "@/realtime/room-provider";
import { usePiles } from "@/realtime/use-piles";
import { useHandOver } from "@/realtime/use-hand-over";
import { useRoomStore } from "@/state/room-store";
import { chairOf, claimChair } from "@/lib/seats";
import { randomBelow } from "@/lib/dice";
import { sizeOf } from "@/lib/piles";
import type { PackId } from "@/lib/cah-packs";
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
  handSlot,
  judgeable,
  nextRound,
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
import { BlackCard, WhiteCard } from "./cah-cards";
import { DeckEditor, DeckPicker, fetchDeckCards, useSharedDecks } from "./cah-decks";
import type { DeckDraft } from "@/lib/decks";
import { t as tx } from "@/lib/i18n";

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
  const [problem, setProblem] = useState<string | null>(null);
  const [deckEdit, setDeckEdit] = useState<DeckDraft | { load: string; copy: boolean } | null>(null);
  const [showDecks, setShowDecks] = useState(false);
  const shared = useSharedDecks();
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

  const label = (chair: string) => state.seats[chair] ?? tx(`seat ${chairs.indexOf(chair) + 1}`);
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
      const extra = await fetchDeckCards(state.decks ?? []);
      if ("problem" in extra) {
        setProblem(extra.problem);
        return;
      }
      const started = startGame(clean(state), chairs, randomBelow, label, extra);
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

  const togglePack = (id: PackId) => {
    const packs = state.packs.includes(id) ? state.packs.filter((p) => p !== id) : [...state.packs, id];
    void write({ ...state, packs });
  };

  /**
   * Ticking a shared deck. Between games it is just a choice for the next deal;
   * in the middle of one, the deck joins the game going on -- its questions
   * among those still to come, its answers shuffled into the deck.
   */
  const toggleDeck = (id: string) =>
    run(async () => {
      const now = latest();
      const chosen = now.decks ?? [];
      if (now.phase !== "play") {
        await write({ ...now, decks: chosen.includes(id) ? chosen.filter((d) => d !== id) : [...chosen, id] });
        return;
      }
      if (chosen.includes(id)) return;
      const [before, added] = await Promise.all([fetchDeckCards(chosen), fetchDeckCards([id])]);
      if ("problem" in before || "problem" in added) {
        setProblem("problem" in before ? before.problem : "problem" in added ? added.problem : null);
        return;
      }
      const known = new Set(decksFor(now, before).white);
      const fresh = [...new Set(added.white)].filter((c) => !known.has(c));
      // The state is written on its own: a pile call carrying it would replace the
      // answers the database has turned over this round.
      if (fresh.length) await pile("pile_put", { p_item: item.id, p_to: WHITE_PILE, p_cards: fresh, p_shuffle: true });
      await write({ ...addBlacks(latest(), added.black, randomBelow), decks: [...chosen, id] });
    });

  /** A deck saved: the list reads again, and a new one is ticked for this table straight away. */
  const deckSaved = (id: string | null, wasNew: boolean) => {
    shared.reload();
    setDeckEdit(null);
    if (id && wasNew && latest().phase !== "play") void toggleDeck(id);
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

  // Counted before the shared decks' cards are fetched, so only roughly: a card
  // in two decks is counted twice. The deal counts properly.
  const builtIn = decksFor(state);
  const picked = shared.decks.filter((d) => (state.decks ?? []).includes(d.id));
  const counts = {
    black: builtIn.black.length + picked.reduce((n, d) => n + d.black_count, 0),
    white: builtIn.white.length + picked.reduce((n, d) => n + d.white_count, 0),
  };
  const deckIssue =
    state.phase === "play"
      ? null
      : picked.length
        ? counts.black < 1
          ? "there are no questions: pick a pack or a deck"
          : null
        : deckProblem(state, chairs.length);
  const picker = (
    <DeckPicker
      packs={state.packs}
      chosen={state.decks ?? []}
      decks={shared.decks}
      status={shared.status}
      userId={me?.userId ?? null}
      canEdit={canEdit && !busy}
      playing={playing}
      onPack={togglePack}
      onDeck={(id) => void toggleDeck(id)}
      onEdit={(start) => setDeckEdit(start)}
    />
  );

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
              aria-label={tx("one chair fewer")}
              className="grid size-7 place-items-center rounded hover:bg-white/10 disabled:opacity-30"
            >
              <Minus className="size-3" strokeWidth={2.6} />
            </button>
            <span className="tabular-nums text-chalk">{state.seatCount}</span>{" "}{tx("chairs")}<button
              type="button"
              disabled={!canEdit || state.seatCount >= MAX_SEATS}
              onClick={() => void write({ ...state, seatCount: state.seatCount + 1 })}
              aria-label={tx("one chair more")}
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
              title={czar ? tx("the czar this round") : tx("sit here")}
            >
              {czar && <Crown className="size-3 text-warm" />}
              {done && <Check className="size-3 text-glow" />}
              <span className={clsx("max-w-24 truncate", chair === myChair ? "text-chalk" : "text-muted")}>
                {state.seats[chair] ?? <span className="text-muted/50">{tx("seat {n}", { n: index + 1 })}</span>}
              </span>
              {(playing || state.phase === "over") && <span className="tabular-nums text-warm">{state.points[chair] ?? 0}</span>}
            </button>
          );
        })}
        <span className="ml-auto flex items-center gap-0.5">
          {playing && (
            <button type="button" onClick={() => setShowDecks(true)} className="flex min-h-7 items-center gap-1 rounded-lg px-1.5 hover:bg-white/8 hover:text-chalk">
              <Layers className="size-3" />{" "}{tx("decks")}</button>
          )}
          <button type="button" onClick={() => setManual(true)} className="flex min-h-7 items-center gap-1 rounded-lg px-1.5 hover:bg-white/8 hover:text-chalk">
            <BookOpen className="size-3" />{" "}{tx("rules")}</button>
        </span>
      </div>

      {!playing ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 overflow-y-auto text-center">
          {state.phase === "over" && state.champion && (
            <div className="flex flex-col items-center gap-2">
              <p className="text-sm font-semibold text-warm">{tx("{champion} wins, {points} to the goal of {goal}", { champion: label(state.champion), points: state.points[state.champion], goal: state.goal })}</p>
              {state.picked && answerOf(state, state.picked) && (
                <div className="w-64">
                  <BlackCard prompt={prompt} answers={answerOf(state, state.picked) ?? []} small />
                </div>
              )}
            </div>
          )}
          {picker}
          <div className="flex flex-col gap-0.5 text-[11px] text-muted/70">
            {(state.custom.black.length > 0 || state.custom.white.length > 0) && (
              <p>{tx("this table's own cards: {black} / {white} ·", { black: state.custom.black.length, white: state.custom.white.length })}{" "}
                <button type="button" disabled={!canEdit} onClick={() => void write({ ...state, custom: { black: [], white: [] } })} className="underline-offset-2 hover:underline">{tx("leave them out")}</button>
              </p>
            )}
            <p>{tx("playing with about {black} questions and {white} answers", { black: counts.black, white: counts.white })}</p>
          </div>
          <div className="flex items-center gap-1 text-[11px] text-muted">{tx("first to")}{GOALS.map((g) => (
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
          {(problem || deckIssue) && <p className="max-w-72 text-[11px] text-[#f2a4b8]">{tx(problem ?? deckIssue ?? "")}</p>}
          <button
            type="button"
            disabled={!canEdit || busy || Boolean(deckIssue)}
            onClick={() => void deal()}
            className="min-h-10 rounded-xl bg-chalk px-5 text-[12px] font-semibold text-ink-950 disabled:opacity-40"
          >
            {state.phase === "over" ? tx("deal again") : tx("deal")}
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
                <b className="text-chalk">{label(state.czar)}</b>{" "}{tx("is the czar{what}", { what: czarHere && myChair === state.czar ? tx(" -- that's you") : "" })}
              </p>
              {state.step === "answer" && !judging && (
                <>
                  {waitingOn.length ? (
                    <p>{tx("waiting for {waitingOn}{extra}", { waitingOn: waitingOn.map(label).join(", "), extra: pick > 1 ? tx(` · pick ${pick}`) : "" })}
                    </p>
                  ) : (
                    <p className="text-chalk">{tx("everyone's in, turning them over...")}</p>
                  )}
                  {canEdit && waitingOn.length > 0 && waitingOn.length < answering(state).length && (
                    <span className="flex flex-wrap gap-1">
                      {waitingOn.map((c) => (
                        <button key={c} type="button" disabled={busy} onClick={() => void skip(c)} className="min-h-7 rounded-lg bg-white/6 px-2 text-[10px] text-muted hover:text-chalk">{tx("go on without {v}", { v: label(c) })}
                        </button>
                      ))}
                    </span>
                  )}
                </>
              )}
              {judging && <p className="text-chalk">{czarPicks ? tx("tap the one you like best, then pick it") : tx(`${label(state.czar)} is choosing...`)}</p>}
              {state.step === "picked" && state.picked && (
                <p className="text-chalk">
                  <b className="text-warm">{label(state.picked)}</b>{" "}{tx("takes the round")}</p>
              )}
              {czarPicks && previewing && (
                <button type="button" disabled={busy} onClick={() => void decide(previewing)} className="min-h-9 self-start rounded-xl bg-chalk px-4 text-[12px] font-semibold text-ink-950">{tx("pick this one")}</button>
              )}
              {state.step === "picked" && canEdit && (
                <button type="button" disabled={busy} onClick={() => void onward()} className="min-h-9 self-start rounded-xl bg-chalk px-4 text-[12px] font-semibold text-ink-950">{tx("next round")}</button>
              )}
            </div>
          </div>

          {/* The answers, face down until they are all in */}
          {state.step === "answer" && !judging && answering(state).some(answeredIn) && (
            <div className="flex flex-wrap gap-1.5">
              {answering(state)
                .filter(answeredIn)
                .map((c) => (
                  <div key={c} className="grid h-14 w-11 place-items-center rounded-lg bg-[#f4efe6]/90 text-[8px] font-bold text-[#141117]/40 shadow">{tx("nook")}</div>
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
                  {shownChair === myChair ? tx("your hand") : tx(`${label(shownChair)}'s hand`)}
                  {shownChair === state.czar && tx(" -- you're the czar this round")}
                  {shownChair !== state.czar && answeredIn(shownChair) && state.step === "answer" && tx(" -- answered")}
                </span>
                {canAnswer && (
                  <span className="text-muted/70">
                    {tx("{current}/{pick} chosen", { current: current.length, pick })}</span>
                )}
                {canAnswer && (
                  <button
                    type="button"
                    disabled={busy || current.length !== pick}
                    onClick={() => void answer()}
                    className="ml-auto min-h-9 rounded-xl bg-chalk px-4 text-[12px] font-semibold text-ink-950 disabled:opacity-35"
                  >{tx("play {what}", { what: pick > 1 ? tx("these") : tx("this") })}
                  </button>
                )}
                {!myChair && holding && (
                  <button type="button" onClick={() => setHolding(null)} className="ml-auto grid size-8 place-items-center rounded-lg text-muted hover:text-chalk" aria-label={tx("hide the hand")}>
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
              <div className="mt-auto flex flex-wrap items-center gap-1 rounded-xl bg-white/4 p-2 text-[11px] text-muted">{tx("pass the phone, then open a hand:")}{handsHere
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

      {showDecks && playing && (
        <div className="absolute inset-0 z-20 flex flex-col items-center gap-2 overflow-y-auto rounded-2xl bg-ink-950/95 p-3 backdrop-blur-sm">
          <div className="flex w-full max-w-md items-center justify-between">
            <h3 className="text-[12px] font-semibold text-chalk">{tx("decks")}</h3>
            <button type="button" onClick={() => setShowDecks(false)} aria-label={tx("close")} className="grid size-9 place-items-center rounded-lg text-muted hover:bg-white/8 hover:text-chalk">
              <X className="size-4" />
            </button>
          </div>
          <p className="w-full max-w-md text-[10px] text-muted">{tx("A deck ticked now joins this game. Changes to a deck count from the next deal.")}</p>
          {picker}
        </div>
      )}

      {deckEdit && (
        <DeckEditor
          start={deckEdit}
          author={me?.name ?? ""}
          userId={me?.userId ?? null}
          onClose={() => setDeckEdit(null)}
          onSaved={(id) => deckSaved(id, !("load" in deckEdit) || deckEdit.copy)}
        />
      )}

      {manual && (
        <RulesSheet title={tx("Cards Against Humanity")} onClose={() => setManual(false)}>
          <p>{tx("Everyone holds ten white cards. Each round one player is the")}{" "}<b>{tx("czar")}</b>{tx(": a black card comes up, and everybody else answers it with the funniest white card in their hand -- two, when it has two blanks.")}</p>
          <p>{tx("Answers go in face down. Once the last one is in, they all turn over together, mixed up, so the czar has no idea whose is whose. The czar picks a favourite; whoever played it gets the point. Hands fill back up to ten, the next player is czar, and the first to the goal wins.")}</p>
          <p>
            <b>{tx("Your own cards")}</b>{tx(": write as many as you like, before or during a game. Mix them with the starter cards, or play with nothing but yours.")}</p>
          <p>{tx("Somebody gone quiet? Anyone can go on without them for the round, once the others have answered.")}</p>
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
