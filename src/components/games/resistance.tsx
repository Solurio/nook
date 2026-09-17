"use client";

import { useState } from "react";
import clsx from "clsx";
import { Check, Eye, Minus, Plus, RotateCcw, ShieldAlert, X } from "lucide-react";
import { useRoom } from "@/realtime/room-provider";
import { useRoomStore } from "@/state/room-store";
import { seatIds } from "@/lib/cards";
import { seatOf, takeSeat } from "@/lib/seats";
import {
  MAX_REJECTIONS,
  MAX_SEATS,
  MIN_SEATS,
  MISSIONS,
  dealSpies,
  firstLeader,
  missionSucceeded,
  needsTwoFails,
  spyCount,
  teamSize,
  verdict,
  voteCarries,
  voteIsIn,
} from "@/lib/resistance";
import type { Item, ResistanceState } from "@/lib/types";

/**
 * The Resistance. A cell with spies planted in it sends out five missions; the
 * rebels need three to come back clean and the spies need three to go wrong.
 *
 * Everything hangs on who gets sent, so the game is really the argument: the
 * leader proposes a team, the table votes it up or down, and only then do the
 * people on it quietly decide whether it works.
 */
export default function Resistance({
  item,
  state,
}: {
  item: Item<"game">;
  state: ResistanceState;
}) {
  const { updateData, canEdit } = useRoom();
  const me = useRoomStore((s) => s.me);
  const name = me?.name ?? "someone";
  const [peek, setPeek] = useState<string | null>(null);

  const write = (next: ResistanceState) => {
    setPeek(null);
    void updateData(item.id, { game: "resistance", state: next });
  };

  const chairs = seatIds(state.seatCount);
  const mySeat = seatOf(state.seats, name);
  const leader = chairs[state.leader % chairs.length];
  const size = teamSize(state.seatCount, state.mission);
  const label = (chair: string) => state.seats[chair] ?? `seat ${chairs.indexOf(chair) + 1}`;

  /** Chairs this device may answer for: your own, or any nobody has claimed. */
  const mine = (chair: string) => (mySeat ? chair === mySeat : !state.seats[chair]);

  const resize = (by: number) => {
    const count = Math.max(MIN_SEATS, Math.min(MAX_SEATS, state.seatCount + by));
    if (count === state.seatCount) return;
    const seats = Object.fromEntries(
      seatIds(count).map((chair) => [chair, state.seats[chair] ?? null]),
    );
    write({ ...blank(state), seatCount: count, seats });
  };

  const newRound = () =>
    write({
      ...blank(state),
      spies: dealSpies(chairs),
      leader: firstLeader(chairs.length),
      stage: "propose",
    });

  const toggleOnTeam = (chair: string) => {
    const on = state.team.includes(chair);
    if (!on && state.team.length >= size) return;
    write({
      ...state,
      team: on ? state.team.filter((c) => c !== chair) : [...state.team, chair],
    });
  };

  const castVote = (chair: string, approve: boolean) => {
    const votes = { ...state.votes, [chair]: approve };
    if (!voteIsIn(votes, chairs)) {
      write({ ...state, votes });
      return;
    }

    // Everyone has spoken. A majority sends the team; anything less passes the
    // proposal along, and five refusals in a row hands it to the spies.
    if (voteCarries(votes, chairs)) {
      write({ ...state, votes, stage: "mission", rejections: 0 });
      return;
    }

    const rejections = state.rejections + 1;
    const done = verdict(state.results, rejections);
    write({
      ...state,
      votes: {},
      team: [],
      rejections,
      leader: (state.leader + 1) % chairs.length,
      stage: done ? "over" : "propose",
      revealed: done !== null,
      wins: done === "spies" ? { ...state.wins, spies: state.wins.spies + 1 } : state.wins,
    });
  };

  const play = (chair: string, succeed: boolean) => {
    const plays = { ...state.plays, [chair]: succeed };
    if (!state.team.every((c) => c in plays)) {
      write({ ...state, plays });
      return;
    }

    const fails = state.team.filter((c) => plays[c] === false).length;
    const ok = missionSucceeded(state.seatCount, state.mission, fails);
    const results = [...state.results, ok];
    const done = verdict(results, 0);

    write({
      ...state,
      plays: {},
      votes: {},
      team: [],
      results,
      mission: state.mission + 1,
      leader: (state.leader + 1) % chairs.length,
      stage: done ? "over" : "propose",
      revealed: done !== null,
      wins: done
        ? done === "spies"
          ? { ...state.wins, spies: state.wins.spies + 1 }
          : { ...state.wins, resistance: state.wins.resistance + 1 }
        : state.wins,
    });
  };

  const outcome = verdict(state.results, state.rejections);
  const waitingOn =
    state.stage === "vote"
      ? chairs.filter((chair) => !(chair in state.votes))
      : state.stage === "mission"
        ? state.team.filter((chair) => !(chair in state.plays))
        : [];

  return (
    <div className="surface grain flex size-full flex-col gap-2 overflow-hidden rounded-2xl p-2.5">
      {/* The table, and how the missions have gone */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-muted/70">
        <span className="flex items-center gap-0.5">
          <button
            type="button"
            disabled={!canEdit || state.seatCount <= MIN_SEATS}
            onClick={() => resize(-1)}
            aria-label="one chair fewer"
            className="grid size-5 place-items-center rounded transition hover:bg-white/10 hover:text-chalk disabled:opacity-30"
          >
            <Minus className="size-3" strokeWidth={2.6} />
          </button>
          <span className="tabular-nums text-chalk">{state.seatCount}</span>
          <span>chairs · {spyCount(state.seatCount)} spies</span>
          <button
            type="button"
            disabled={!canEdit || state.seatCount >= MAX_SEATS}
            onClick={() => resize(1)}
            aria-label="one chair more"
            className="grid size-5 place-items-center rounded transition hover:bg-white/10 hover:text-chalk disabled:opacity-30"
          >
            <Plus className="size-3" strokeWidth={2.6} />
          </button>
        </span>

        <span className="ml-auto flex items-center gap-1">
          {Array.from({ length: MISSIONS }, (_, i) => {
            const done = state.results[i];
            return (
              <span
                key={i}
                title={
                  done === undefined
                    ? `mission ${i + 1}: ${teamSize(state.seatCount, i)} go${
                        needsTwoFails(state.seatCount, i) ? ", two fails to sink it" : ""
                      }`
                    : done
                      ? `mission ${i + 1} came back clean`
                      : `mission ${i + 1} was sabotaged`
                }
                className={clsx(
                  "grid size-5 place-items-center rounded-full text-[9px] font-bold tabular-nums ring-1",
                  done === undefined
                    ? i === state.mission
                      ? "text-chalk ring-glow/60"
                      : "text-muted/50 ring-white/12"
                    : done
                      ? "bg-[#a6d189]/25 text-[#a6d189] ring-[#a6d189]/45"
                      : "bg-[#e0655c]/25 text-[#e0655c] ring-[#e0655c]/45",
                )}
              >
                {teamSize(state.seatCount, i)}
              </span>
            );
          })}
        </span>
      </div>

      {/* Everyone in the cell */}
      <div className="flex flex-wrap gap-1.5">
        {chairs.map((chair, index) => {
          const who = state.seats[chair];
          const isMe = who === name;
          const onTeam = state.team.includes(chair);
          const caught = state.revealed && state.spies.includes(chair);
          const picking = state.stage === "propose" && mine(leader) && canEdit;
          return (
            <button
              key={chair}
              type="button"
              disabled={!canEdit}
              onClick={() =>
                picking
                  ? toggleOnTeam(chair)
                  : write({ ...state, seats: takeSeat(state.seats, chair, name) })
              }
              title={
                picking
                  ? onTeam
                    ? "take them off the team"
                    : "send them"
                  : who
                    ? isMe
                      ? "stand up"
                      : who
                    : "sit here"
              }
              className={clsx(
                "flex min-h-9 min-w-0 flex-1 basis-24 items-center gap-1.5 rounded-xl px-2 py-1.5 text-left transition disabled:opacity-50",
                caught
                  ? "bg-[#e0655c]/20 ring-1 ring-[#e0655c]/50"
                  : onTeam
                    ? "bg-glow/18 ring-1 ring-glow/45"
                    : "bg-white/5 hover:bg-white/9",
              )}
            >
              {chair === leader && (
                <span
                  title="proposes this mission"
                  className="size-2 shrink-0 rounded-full bg-glow"
                />
              )}
              <span className="min-w-0 flex-1 truncate text-[11px]">
                {who ? (
                  <span className={isMe ? "text-chalk" : "text-muted"}>{who}</span>
                ) : (
                  <span className="text-muted/55">seat {index + 1}</span>
                )}
              </span>
              {state.stage === "vote" && chair in state.votes && (
                <span className="shrink-0 text-[9px] text-muted/60">voted</span>
              )}
              {state.revealed && (
                <span className="shrink-0 text-[9px] text-muted/70">
                  {state.spies.includes(chair) ? "spy" : "rebel"}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Whatever the cell is waiting on */}
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto rounded-xl bg-ink-950/25 p-2 inset-ring inset-ring-white/6">
        {state.stage === "lobby" && (
          <p className="my-auto text-center text-[11px] text-muted/50">
            take a chair, then deal to plant the spies
          </p>
        )}

        {state.stage === "over" && (
          <div className="my-auto text-center">
            <p className="text-sm font-semibold text-chalk">
              {outcome === "spies" ? "the spies had it all along" : "the resistance holds"}
            </p>
            <p className="mt-1 text-[11px] text-muted">
              {state.spies.map(label).join(", ")} {state.spies.length === 1 ? "was" : "were"}{" "}
              working for them
            </p>
          </div>
        )}

        {(state.stage === "propose" || state.stage === "vote" || state.stage === "mission") && (
          <>
            {/* Whose side you are on. Shown only when asked for. */}
            <div className="flex flex-wrap items-center gap-1">
              {chairs.filter(mine).map((chair) => (
                <button
                  key={chair}
                  type="button"
                  onClick={() => setPeek(peek === chair ? null : chair)}
                  className={clsx(
                    "flex min-h-7 items-center gap-1.5 rounded-lg px-2 py-1 text-[10px] transition",
                    peek === chair
                      ? "bg-glow/20 text-glow"
                      : "bg-white/6 text-muted hover:bg-white/10 hover:text-chalk",
                  )}
                >
                  <Eye className="size-3" strokeWidth={2.2} />
                  {mySeat ? "your card" : label(chair)}
                </button>
              ))}
              {state.rejections > 0 && (
                <span className="ml-auto text-[10px] text-warm">
                  {state.rejections} of {MAX_REJECTIONS} refused
                </span>
              )}
            </div>

            {peek && (
              <div className="rounded-xl bg-ink-950/60 p-2.5 text-center inset-ring inset-ring-white/8">
                {state.spies.includes(peek) ? (
                  <>
                    <p className="text-[11px] font-semibold text-[#e0655c]">you are a spy</p>
                    <p className="mt-0.5 text-[10px] text-muted">
                      with {state.spies.filter((s) => s !== peek).map(label).join(", ") || "nobody"}
                    </p>
                  </>
                ) : (
                  <p className="text-[11px] font-semibold text-[#a6d189]">
                    you are loyal, and on your own
                  </p>
                )}
              </div>
            )}

            {state.stage === "propose" && (
              <>
                <p className="text-[11px] text-chalk">
                  {label(leader)} sends {size} on mission {state.mission + 1}
                  {needsTwoFails(state.seatCount, state.mission) && (
                    <span className="text-warm"> · this one takes two to sink</span>
                  )}
                </p>
                <p className="text-[10px] text-muted/60">
                  {state.team.length === 0
                    ? "tap the chairs to pick a team"
                    : `${state.team.map(label).join(", ")} (${state.team.length}/${size})`}
                </p>
                {canEdit && mine(leader) && state.team.length === size && (
                  <button
                    type="button"
                    onClick={() => write({ ...state, stage: "vote", votes: {} })}
                    className="min-h-8 self-start rounded-lg bg-chalk px-3 py-1.5 text-[11px] font-semibold text-ink-950"
                  >
                    put it to the table
                  </button>
                )}
              </>
            )}

            {state.stage === "vote" && (
              <>
                <p className="text-[11px] text-chalk">
                  send {state.team.map(label).join(", ")}?
                </p>
                <p className="text-[10px] text-muted/60">
                  waiting on {waitingOn.length} · nobody sees a vote until they are all in
                </p>
                {canEdit &&
                  chairs.filter((chair) => mine(chair) && !(chair in state.votes)).map((chair) => (
                    <div key={chair} className="flex flex-wrap items-center gap-1">
                      <span className="text-[10px] text-muted/70">{label(chair)}:</span>
                      <button
                        type="button"
                        onClick={() => castVote(chair, true)}
                        className="flex min-h-8 items-center gap-1 rounded-lg bg-[#a6d189]/18 px-2.5 py-1.5 text-[11px] text-[#a6d189]"
                      >
                        <Check className="size-3.5" strokeWidth={2.4} />
                        send them
                      </button>
                      <button
                        type="button"
                        onClick={() => castVote(chair, false)}
                        className="flex min-h-8 items-center gap-1 rounded-lg bg-[#e0655c]/18 px-2.5 py-1.5 text-[11px] text-[#e0655c]"
                      >
                        <X className="size-3.5" strokeWidth={2.4} />
                        not them
                      </button>
                    </div>
                  ))}
              </>
            )}

            {state.stage === "mission" && (
              <>
                <p className="text-[11px] text-chalk">
                  {state.team.map(label).join(", ")} are out there
                </p>
                <p className="text-[10px] text-muted/60">
                  waiting on {waitingOn.length} · only the count comes back, never who
                </p>
                {canEdit &&
                  state.team
                    .filter((chair) => mine(chair) && !(chair in state.plays))
                    .map((chair) => (
                      <div key={chair} className="flex flex-wrap items-center gap-1">
                        <span className="text-[10px] text-muted/70">{label(chair)}:</span>
                        <button
                          type="button"
                          onClick={() => play(chair, true)}
                          className="flex min-h-8 items-center gap-1 rounded-lg bg-[#a6d189]/18 px-2.5 py-1.5 text-[11px] text-[#a6d189]"
                        >
                          <Check className="size-3.5" strokeWidth={2.4} />
                          carry it out
                        </button>
                        {/* Only a spy may sabotage, and the button is hidden
                            rather than disabled -- a greyed out button would
                            tell the room who is loyal. */}
                        {state.spies.includes(chair) && (
                          <button
                            type="button"
                            onClick={() => play(chair, false)}
                            className="flex min-h-8 items-center gap-1 rounded-lg bg-[#e0655c]/18 px-2.5 py-1.5 text-[11px] text-[#e0655c]"
                          >
                            <ShieldAlert className="size-3.5" strokeWidth={2.4} />
                            sink it
                          </button>
                        )}
                      </div>
                    ))}
              </>
            )}
          </>
        )}
      </div>

      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 truncate text-[10px] text-muted/60">
          rebels {state.wins.resistance} · spies {state.wins.spies}
        </p>
        <button
          type="button"
          disabled={!canEdit}
          onClick={newRound}
          aria-label="deal a new game"
          title="deal a new game"
          className="grid size-8 shrink-0 place-items-center rounded-lg text-muted transition hover:bg-white/8 hover:text-chalk disabled:opacity-40 sm:size-7"
        >
          <RotateCcw className="size-3.5" strokeWidth={2.2} />
        </button>
      </div>
    </div>
  );
}

/** Everything a fresh game throws away, keeping the chairs and the score. */
function blank(state: ResistanceState): ResistanceState {
  return {
    ...state,
    spies: [],
    mission: 0,
    results: [],
    rejections: 0,
    team: [],
    votes: {},
    plays: {},
    stage: "lobby",
    revealed: false,
  };
}
