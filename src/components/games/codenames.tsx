"use client";

import { useMemo, useState } from "react";
import clsx from "clsx";
import { Eye, EyeOff, RotateCcw, SkipForward } from "lucide-react";
import { useRoom } from "@/realtime/room-provider";
import { useRoomStore } from "@/state/room-store";
import { seatOf, takeSeat } from "@/lib/seats";
import {
  GRID,
  PACK_NAME,
  guessResult,
  newSetup,
  outcome,
  remaining,
  type Pack,
  type Slot,
  type Team,
} from "@/lib/codenames";
import type { CodenamesState, Item } from "@/lib/types";

const MASTERS = ["redMaster", "blueMaster"] as const;
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
 * The key travels in the same shared state as everything else in a room, so it
 * is hidden by the interface rather than kept from anyone. Sit in a spymaster
 * chair and turn it on; that is the honest version of the secret.
 */
export default function Codenames({
  item,
  state,
}: {
  item: Item<"game">;
  state: CodenamesState;
}) {
  const { updateData, canEdit } = useRoom();
  const me = useRoomStore((s) => s.me);
  const name = me?.name ?? "someone";
  const [showKey, setShowKey] = useState(false);

  const write = (next: CodenamesState) =>
    void updateData(item.id, { game: "codenames", state: next });

  const key = state.key as Slot[];
  const result = useMemo(
    () => outcome(key, state.revealed, state.turn),
    [key, state.revealed, state.turn],
  );
  const over = result.kind === "won";

  const mySeat = seatOf(state.seats, name);
  const isMaster = mySeat !== null;
  // Nobody in a spymaster chair means one device is being passed around, and
  // whoever holds it can look at the key.
  const openTable = MASTERS.every((chair) => !state.seats[chair]);
  const mayPeek = isMaster || openTable;
  const keyVisible = mayPeek && showKey;

  const reveal = (index: number) => {
    if (!canEdit || over || state.revealed[index]) return;
    // A spymaster knows the answers, so they do not get to do the guessing.
    if (isMaster) return;

    const revealed = state.revealed.map((was, i) => (i === index ? true : was));
    const what = guessResult(key[index], state.turn);
    const after = outcome(key, revealed, state.turn);

    const wins =
      after.kind === "won"
        ? { ...state.wins, [after.winner]: state.wins[after.winner] + 1 }
        : state.wins;

    write({
      ...state,
      revealed,
      wins,
      clue: what === "continue" ? state.clue : null,
      turn: what === "continue" ? state.turn : state.turn === "red" ? "blue" : "red",
    });
  };

  const endTurn = () => {
    if (!canEdit || over) return;
    write({ ...state, clue: null, turn: state.turn === "red" ? "blue" : "red" });
  };

  const deal = (pack: Pack) => {
    const setup = newSetup(pack);
    setShowKey(false);
    write({
      ...state,
      pack,
      words: setup.words,
      key: setup.key,
      revealed: Array(GRID).fill(false),
      turn: setup.first,
      clue: null,
    });
  };

  const status = over
    ? `${result.winner} wins · ${result.reason === "assassin" ? "the assassin" : "all of them"}`
    : isMaster
      ? `${state.turn} is guessing`
      : `${state.turn} to guess`;

  return (
    <div className="surface grain flex size-full flex-col gap-2 overflow-hidden rounded-2xl p-2.5">
      {/* Spymaster chairs and what each side has left */}
      <div className="flex items-center gap-1.5">
        {MASTERS.map((chair) => {
          const team: Team = chair === "redMaster" ? "red" : "blue";
          const who = state.seats[chair];
          const mine = who === name;
          const left = remaining(key, state.revealed, team);
          return (
            <button
              key={chair}
              type="button"
              disabled={!canEdit}
              onClick={() => write({ ...state, seats: takeSeat(state.seats, chair, name) })}
              title={who ? (mine ? "stand up" : who) : `become the ${team} spymaster`}
              className={clsx(
                "flex min-h-9 min-w-0 flex-1 items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-left transition disabled:opacity-50",
                state.turn === team && !over
                  ? "bg-white/12 ring-1 ring-glow/45"
                  : "bg-white/5 hover:bg-white/9",
              )}
            >
              <span
                className="size-3 shrink-0 rounded-full ring-1 ring-white/25"
                style={{ background: TEAM_TINT[team] }}
              />
              <span className="min-w-0 flex-1 truncate text-[11px]">
                {who ? (
                  <span className={mine ? "text-chalk" : "text-muted"}>{who}</span>
                ) : (
                  <span className="text-muted/55">{team} spymaster</span>
                )}
              </span>
              <span className="shrink-0 text-[11px] font-semibold tabular-nums text-muted">
                {left}
              </span>
            </button>
          );
        })}
      </div>

      {/* The table */}
      <div className="grid min-h-0 flex-1 grid-cols-5 gap-1">
        {state.words.map((word, i) => {
          const slot = key[i];
          const face = state.revealed[i];
          const hinted = keyVisible && !face;
          return (
            <button
              key={`${word}-${i}`}
              type="button"
              onClick={() => reveal(i)}
              disabled={!canEdit || over || face || isMaster}
              aria-label={face ? `${word}, ${slot}` : word}
              className={clsx(
                "grid touch-manipulation place-items-center overflow-hidden rounded-md px-0.5 text-center text-[clamp(7px,1.7vw,11px)] leading-tight font-semibold transition",
                face
                  ? SLOT_FACE[slot]
                  : "bg-[#f6f2e8] text-[#1a1420] hover:ring-2 hover:ring-glow/70",
                hinted && "ring-2 ring-inset",
              )}
              style={
                hinted
                  ? {
                      boxShadow: `inset 0 0 0 3px ${
                        slot === "assassin"
                          ? "#1a1420"
                          : slot === "neutral"
                            ? "#b8ab8d"
                            : TEAM_TINT[slot as Team]
                      }`,
                    }
                  : undefined
              }
            >
              <span className="line-clamp-2 break-words">{word}</span>
            </button>
          );
        })}
      </div>

      {/* Clue and controls */}
      <div className="flex items-center gap-1.5">
        <p className="min-w-0 flex-1 truncate text-xs font-medium text-muted">
          {state.clue ? (
            <span className="text-chalk">
              {state.clue.word} <span className="text-muted">for {state.clue.count}</span>
            </span>
          ) : (
            status
          )}
        </p>

        {mayPeek && (
          <button
            type="button"
            onClick={() => setShowKey((v) => !v)}
            title={showKey ? "hide the key" : "show the key"}
            className={clsx(
              "grid size-8 shrink-0 place-items-center rounded-lg transition sm:size-7",
              showKey ? "bg-glow/22 text-glow" : "text-muted hover:bg-white/8 hover:text-chalk",
            )}
          >
            {showKey ? (
              <Eye className="size-3.5" strokeWidth={2.2} />
            ) : (
              <EyeOff className="size-3.5" strokeWidth={2.2} />
            )}
          </button>
        )}

        {!over && (
          <button
            type="button"
            disabled={!canEdit}
            onClick={endTurn}
            title="hand the turn over"
            aria-label="hand the turn over"
            className="grid size-8 shrink-0 place-items-center rounded-lg text-muted transition hover:bg-white/8 hover:text-chalk disabled:opacity-40 sm:size-7"
          >
            <SkipForward className="size-3.5" strokeWidth={2.2} />
          </button>
        )}

        <button
          type="button"
          disabled={!canEdit}
          onClick={() => deal(state.pack === "en" ? "pt" : "en")}
          title={`switch to ${PACK_NAME[state.pack === "en" ? "pt" : "en"]} and deal`}
          className="shrink-0 rounded-lg px-2 py-1.5 text-[10px] font-medium text-muted transition hover:bg-white/8 hover:text-chalk disabled:opacity-40"
        >
          {PACK_NAME[state.pack]}
        </button>

        <button
          type="button"
          disabled={!canEdit}
          onClick={() => deal(state.pack)}
          aria-label="new board"
          title="new board"
          className="grid size-8 shrink-0 place-items-center rounded-lg text-muted transition hover:bg-white/8 hover:text-chalk disabled:opacity-40 sm:size-7"
        >
          <RotateCcw className="size-3.5" strokeWidth={2.2} />
        </button>
      </div>

      {/* The spymaster's line */}
      {isMaster && !over && state.seats[state.turn === "red" ? "redMaster" : "blueMaster"] === name && (
        <ClueBox onGive={(word, count) => write({ ...state, clue: { word, count } })} />
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
        placeholder="your one word"
        spellCheck={false}
        className="min-w-0 flex-1 rounded-lg bg-white/8 px-2.5 py-1.5 text-xs ring-1 ring-white/12 outline-none placeholder:text-muted/55 focus:ring-glow/50"
      />
      <input
        type="number"
        min={0}
        max={9}
        value={count}
        onChange={(event) => setCount(Number(event.target.value))}
        onKeyDown={(event) => event.stopPropagation()}
        aria-label="how many"
        className="w-12 rounded-lg bg-white/8 px-2 py-1.5 text-center text-xs tabular-nums ring-1 ring-white/12 outline-none focus:ring-glow/50"
      />
      <button
        type="submit"
        className="shrink-0 rounded-lg bg-glow/25 px-2.5 py-1.5 text-[11px] font-medium text-glow transition hover:bg-glow/35"
      >
        give
      </button>
    </form>
  );
}
