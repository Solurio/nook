"use client";

import { useMemo, useState } from "react";
import clsx from "clsx";
import { BookOpen, Eye, EyeOff, RotateCcw, SkipForward } from "lucide-react";
import { useRoom } from "@/realtime/room-provider";
import { usePiles } from "@/realtime/use-piles";
import { useHandOver, useScrub } from "@/realtime/use-hand-over";
import { waitForItem } from "@/realtime/wait-for-item";
import { useRoomStore } from "@/state/room-store";
import { chairOf, claimChair } from "@/lib/seats";
import {
  KEY,
  MASTERS,
  PACK_NAME,
  guessResult,
  keyCards,
  keySlot,
  leftFor,
  newBoard,
  standing,
  turnedFrom,
  wordSlot,
  type Pack,
  type Slot,
  type Team,
} from "@/lib/codenames";
import type { CodenamesState, Item } from "@/lib/types";
import RulesSheet from "./rules-sheet";
import { t } from "@/lib/i18n";

const TEAM_TINT: Record<Team, string> = { red: "#e0655c", blue: "#6aa9e0" };

const SLOT_FACE: Record<Slot, string> = {
  red: "bg-[#e0655c] text-ink-950",
  blue: "bg-[#6aa9e0] text-ink-950",
  neutral: "bg-[#d8cdb4] text-ink-950",
  assassin: "bg-[#1a1420] text-chalk ring-1 ring-chalk/40",
};

/**
 * Codenames. Twenty five words on the table and two spymasters who can see
 * which belong to whom; everyone else is guessing from a one word clue.
 *
 * The key is a secret pile with a copy for each spymaster and nobody else --
 * not the guessers, not whoever dealt. A word's colour becomes public only
 * when it is guessed, and then it is the database that turns it over.
 */
export default function Codenames({
  item,
  state,
}: {
  item: Item<"game">;
  state: CodenamesState;
}) {
  const { updateData, pile, canEdit } = useRoom();
  const me = useRoomStore((s) => s.me);
  const [showKey, setShowKey] = useState(false);
  const [busy, setBusy] = useState(false);
  const [rules, setRules] = useState(false);

  const holders = useMemo(
    () => state.holders ?? { redMaster: null, blueMaster: null },
    [state.holders],
  );
  const piles = state.piles;
  const mine = usePiles(item.id, piles);
  useHandOver(item.id, piles, holders);

  const legacy = "key" in state || Array.isArray(state.revealed);
  useScrub(legacy, () => void updateData(item.id, { game: "codenames", state: clean(state) }));

  const myChair = chairOf(state.seats, holders, me);
  const isMaster = myChair !== null;
  // Both copies land here when nobody sits in a spymaster chair: one phone,
  // passed round, where whoever holds it can look.
  const myKey = (mine[keySlot("redMaster")] ?? mine[keySlot("blueMaster")]) as Slot[] | undefined;
  const keyVisible = Boolean(myKey) && showKey;

  const first: Team = state.first ?? "red";
  const turned = useMemo(() => turnedFrom(state.revealed), [state.revealed]);
  const result = standing(turned, first, state.assassin ?? null);
  const over = result.kind === "won";
  const dealt = state.words.length > 0 && Boolean(piles?.[KEY]);

  const write = (next: CodenamesState) =>
    updateData(item.id, { game: "codenames", state: clean(next) });

  const run = async (work: () => Promise<unknown>) => {
    if (busy || !canEdit) return;
    setBusy(true);
    try {
      await work();
    } finally {
      setBusy(false);
    }
  };

  const guess = (index: number) =>
    run(async () => {
      if (over || turned[index] !== undefined || isMaster || !dealt) return;
      const shown = await pile("pile_reveal", {
        p_item: item.id,
        p_slots: [KEY],
        p_at: index,
        p_keep: true,
        p_as: wordSlot(index),
      });
      if (shown.error) return;
      const slot = await waitForItem(
        item.id,
        (s) => ((s.revealed as Record<string, unknown[]> | undefined)?.[wordSlot(index)]?.[0] as Slot | undefined) ?? null,
      );
      if (!slot) return;

      const live = (useRoomStore.getState().items[item.id]?.data as { state: CodenamesState } | undefined)?.state ?? state;
      const what = guessResult(slot, live.turn);
      const assassin = slot === "assassin" ? live.turn : (live.assassin ?? null);
      const after = standing(turnedFrom(live.revealed), live.first ?? first, assassin);
      const round = String(live.round ?? 0);
      const won = after.kind === "won" && !live.results?.[round];

      await write({
        ...live,
        assassin,
        clue: what === "continue" ? live.clue : null,
        turn: what === "continue" ? live.turn : live.turn === "red" ? "blue" : "red",
        results: won ? { ...live.results, [round]: after.winner } : live.results,
        wins: won ? { ...live.wins, [after.winner]: live.wins[after.winner] + 1 } : live.wins,
      });
    });

  const endTurn = () =>
    run(() => write({ ...state, clue: null, turn: state.turn === "red" ? "blue" : "red" }));

  const deal = (pack: Pack) =>
    run(async () => {
      if (!me) return;
      const board = newBoard(pack);
      setShowKey(false);
      const fresh: CodenamesState = {
        ...clean(state),
        pack,
        words: board.words,
        first: board.first,
        turn: board.first,
        clue: null,
        assassin: null,
        round: (state.round ?? 0) + 1,
      };
      delete fresh.revealed;
      await pile("pile_setup", {
        p_item: item.id,
        p_piles: [
          {
            slot: KEY,
            cards: keyCards(board.first),
            shuffle: true,
            copies: MASTERS.map((master) => ({
              slot: keySlot(master),
              owner: holders[master] ?? me.userId,
            })),
          },
        ],
        p_public: { game: "codenames", state: fresh },
      });
    });

  const status = !dealt
    ? "spymasters sit down, then deal"
    : over
      ? `${result.winner} wins · ${result.reason === "assassin" ? "the assassin" : "all of them"}`
      : isMaster
        ? `${state.turn} is guessing`
        : `${state.turn} to guess`;

  return (
    <div className="surface grain relative flex size-full flex-col gap-2 overflow-hidden rounded-2xl p-2.5">
      {/* Spymaster chairs and what each side has left */}
      <div className="flex items-center gap-1.5">
        {MASTERS.map((chair) => {
          const team: Team = chair === "redMaster" ? "red" : "blue";
          const who = state.seats[chair];
          const isMine = chair === myChair;
          return (
            <button
              key={chair}
              type="button"
              disabled={!canEdit || !me}
              onClick={() => me && void write({ ...state, ...claimChair(state.seats, holders, chair, me) })}
              title={who ? (isMine ? t("stand up") : who) : t(`become the ${team} spymaster`)}
              className={clsx(
                "flex min-h-10 min-w-0 flex-1 items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-left transition disabled:opacity-50",
                state.turn === team && !over && dealt ? "bg-white/12 ring-1 ring-glow/45" : "bg-white/5 hover:bg-white/9",
              )}
            >
              <span className="size-3 shrink-0 rounded-full ring-1 ring-white/25" style={{ background: TEAM_TINT[team] }} />
              <span className="min-w-0 flex-1 truncate text-[11px]">
                {who ? <span className={isMine ? "text-chalk" : "text-muted"}>{who}</span> : <span className="text-muted/55">{t(`${team} spymaster`)}</span>}
              </span>
              {dealt && (
                <span className="shrink-0 text-[11px] font-semibold tabular-nums text-muted">
                  {leftFor(team, first, turned)}
                </span>
              )}
            </button>
          );
        })}
        <button type="button" onClick={() => setRules(true)} aria-label={t("rules")} className="grid size-10 shrink-0 place-items-center rounded-xl text-muted hover:bg-white/8 hover:text-chalk">
          <BookOpen className="size-4" />
        </button>
      </div>

      {/* The table */}
      <div className="grid min-h-0 flex-1 grid-cols-5 gap-1 [container-type:size]">
        {state.words.map((word, i) => {
          const face = turned[i];
          const hint = keyVisible && !face ? myKey?.[i] : undefined;
          return (
            <button
              key={`${word}-${i}`}
              type="button"
              onClick={() => void guess(i)}
              disabled={!canEdit || over || face !== undefined || isMaster || busy}
              aria-label={face ? `${word}, ${face}` : word}
              className={clsx(
                "grid touch-manipulation place-items-center overflow-hidden rounded-md px-0.5 text-center text-[clamp(7px,min(3cqw,5cqh),15px)] leading-tight font-semibold [overflow-wrap:anywhere] transition",
                face ? SLOT_FACE[face] : "bg-[#f6f2e8] text-[#1a1420] hover:ring-2 hover:ring-glow/70",
              )}
              style={
                hint
                  ? {
                      boxShadow: `inset 0 0 0 3px ${hint === "assassin" ? "#1a1420" : hint === "neutral" ? "#b8ab8d" : TEAM_TINT[hint as Team]}`,
                    }
                  : undefined
              }
            >
              <span className="line-clamp-2 break-words">{word}</span>
            </button>
          );
        })}
        {state.words.length === 0 && (
          <p className="col-span-5 my-auto text-center text-[11px] text-muted/50">{t("spymasters sit down first -- the key is dealt to whoever is in those chairs")}</p>
        )}
      </div>

      {/* Clue and controls */}
      <div className="flex items-center gap-1.5">
        <p className="min-w-0 flex-1 truncate text-xs font-medium text-muted">
          {state.clue && !over ? (
            <span className="text-chalk">
              {state.clue.word} <span className="text-muted">{t("for")}{" "}{state.clue.count}</span>
            </span>
          ) : (
            t(status)
          )}
        </p>

        {myKey && (
          <button
            type="button"
            onClick={() => setShowKey((v) => !v)}
            title={showKey ? t("hide the key") : t("show the key")}
            className={clsx(
              "grid size-9 shrink-0 place-items-center rounded-lg transition sm:size-8",
              showKey ? "bg-glow/22 text-glow" : "text-muted hover:bg-white/8 hover:text-chalk",
            )}
          >
            {showKey ? <Eye className="size-3.5" strokeWidth={2.2} /> : <EyeOff className="size-3.5" strokeWidth={2.2} />}
          </button>
        )}

        {!over && dealt && (
          <button type="button" disabled={!canEdit || busy} onClick={() => void endTurn()} title={t("hand the turn over")} aria-label={t("hand the turn over")} className="grid size-9 shrink-0 place-items-center rounded-lg text-muted transition hover:bg-white/8 hover:text-chalk disabled:opacity-40 sm:size-8">
            <SkipForward className="size-3.5" strokeWidth={2.2} />
          </button>
        )}

        <button
          type="button"
          disabled={!canEdit || busy}
          onClick={() => void deal(state.pack === "en" ? "pt" : "en")}
          title={t(`switch to ${PACK_NAME[state.pack === "en" ? "pt" : "en"]} and deal`)}
          className="min-h-9 shrink-0 rounded-lg px-2 py-1.5 text-[10px] font-medium text-muted transition hover:bg-white/8 hover:text-chalk disabled:opacity-40"
        >
          {PACK_NAME[state.pack]}
        </button>

        <button type="button" disabled={!canEdit || busy} onClick={() => void deal(state.pack)} aria-label={t("new board")} title={t("new board")} className="grid size-9 shrink-0 place-items-center rounded-lg text-muted transition hover:bg-white/8 hover:text-chalk disabled:opacity-40 sm:size-8">
          <RotateCcw className="size-3.5" strokeWidth={2.2} />
        </button>
      </div>

      {/* The spymaster's line */}
      {isMaster && !over && dealt && myChair === (state.turn === "red" ? "redMaster" : "blueMaster") && (
        <ClueBox onGive={(word, count) => void write({ ...state, clue: { word, count } })} />
      )}

      {rules && (
        <RulesSheet title={t("how codenames goes")} onClose={() => setRules(false)}>
          <p>{t("Two teams, red and blue. Each has a")}{" "}<b>{t("spymaster")}</b>{" "}{t("who can see which of the twenty five words belong to which side -- nobody else can, not even whoever dealt.")}</p>
          <p>{t("On your side's turn, the spymaster gives")}{" "}<b>{t("one word and a number")}</b>{t(": a clue linking that many of your words. Your team taps words to guess. Your own colour lets you keep going; a neutral word or the other side's ends the turn; the")}{" "}<b>{t("assassin")}</b>{" "}{t("loses you the game on the spot.")}</p>
          <p>{t("First to turn over all their words wins. The side going first has nine, the other eight.")}</p>
        </RulesSheet>
      )}
    </div>
  );
}

/** Where the spymaster types their one word and a number. */
function ClueBox({ onGive }: { onGive: (word: string, count: number) => void }) {
  const [word, setWord] = useState("");
  const [count, setCount] = useState(1);

  return (
    <form
      className="flex items-center gap-1.5"
      onSubmit={(event) => {
        event.preventDefault();
        const trimmed = word.trim();
        if (!trimmed) return;
        onGive(trimmed, count);
        setWord("");
      }}
    >
      <input
        value={word}
        onChange={(event) => setWord(event.target.value)}
        onKeyDown={(event) => event.stopPropagation()}
        placeholder={t("your one word")}
        spellCheck={false}
        className="min-h-9 min-w-0 flex-1 rounded-lg bg-white/8 px-2.5 py-1.5 text-xs ring-1 ring-white/12 outline-none placeholder:text-muted/55 focus:ring-glow/50"
      />
      <input
        type="number"
        min={0}
        max={9}
        value={count}
        onChange={(event) => setCount(Number(event.target.value))}
        onKeyDown={(event) => event.stopPropagation()}
        aria-label={t("how many")}
        className="min-h-9 w-12 rounded-lg bg-white/8 px-2 py-1.5 text-center text-xs tabular-nums ring-1 ring-white/12 outline-none focus:ring-glow/50"
      />
      <button type="submit" className="min-h-9 shrink-0 rounded-lg bg-glow/25 px-2.5 py-1.5 text-[11px] font-medium text-glow transition hover:bg-glow/35">{t("give")}</button>
    </form>
  );
}

/** The state without the old, leaky key, or what the database owns. */
function clean(state: CodenamesState): CodenamesState {
  const out = { ...state } as CodenamesState & Record<string, unknown>;
  delete out.key;
  delete out.piles;
  if (Array.isArray(out.revealed)) delete out.revealed;
  return out;
}
