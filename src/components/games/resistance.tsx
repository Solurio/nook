"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { BookOpen, Check, Eye, Minus, Plus, RotateCcw, ShieldAlert, X } from "lucide-react";
import { useRoom } from "@/realtime/room-provider";
import { usePiles } from "@/realtime/use-piles";
import { useHandOver, useScrub } from "@/realtime/use-hand-over";
import { waitForItem } from "@/realtime/wait-for-item";
import { useRoomStore } from "@/state/room-store";
import { seatIds } from "@/lib/cards";
import { chairOf, claimChair } from "@/lib/seats";
import {
  MAX_REJECTIONS,
  MAX_SEATS,
  MIN_SEATS,
  MISSIONS,
  ROLES,
  SPY,
  allCommitted,
  firstLeader,
  missionPool,
  missionSucceeded,
  needsTwoFails,
  playSlot,
  readFails,
  readSpies,
  readVotes,
  roleSlot,
  rolePool,
  spyCount,
  teamSize,
  teamSlot,
  verdict,
  voteCarries,
  voteSlot,
} from "@/lib/resistance";
import type { Item, ResistanceState } from "@/lib/types";
import RulesSheet from "./rules-sheet";
import { t } from "@/lib/i18n";

/**
 * The Resistance. A cell with spies planted in it sends out five missions; the
 * rebels need three to come back clean and the spies need three to go wrong.
 *
 * Nobody at the table can see who the spies are -- not even whoever dealt.
 * Roles are secret piles; the spies learn each other and nobody else does.
 * Votes are sealed until everyone has voted, then turned over together. A
 * mission's cards are turned over shuffled together, so the table learns how
 * many failed and never who.
 */
export default function Resistance({
  item,
  state: raw,
}: {
  item: Item<"game">;
  state: ResistanceState;
}) {
  const { updateData, pile, canEdit } = useRoom();
  const me = useRoomStore((s) => s.me);
  const [peek, setPeek] = useState<string | null>(null);
  const [rules, setRules] = useState(false);
  const [busy, setBusy] = useState(false);

  const state = raw;
  const chairs = seatIds(state.seatCount);
  const holders = useMemo(() => state.holders ?? {}, [state.holders]);
  const myChair = chairOf(state.seats, holders, me);
  const piles = state.piles;
  const mine = usePiles(item.id, piles);
  useHandOver(item.id, piles, holders);

  const legacy = "spies" in state || "votes" in state || "plays" in state || typeof state.revealed === "boolean";
  useScrub(legacy, () => void updateData(item.id, { game: "resistance", state: clean(state) }));

  const leader = chairs[state.leader % chairs.length];
  const size = teamSize(state.seatCount, state.mission);
  const voteNo = state.voteNo ?? 0;
  const label = (chair: string) => state.seats[chair] ?? t(`seat ${chairs.indexOf(chair) + 1}`);

  /** Chairs this device answers for: your own, or empty chairs whose card it holds. */
  const mineToPlay = (chair: string) =>
    myChair ? chair === myChair : roleSlot(chair) in mine || !state.seats[chair];

  const write = (next: ResistanceState) => {
    setPeek(null);
    return updateData(item.id, { game: "resistance", state: clean(next) });
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
  // Dealing
  // ---------------------------------------------------------------------------

  const newGame = () =>
    run(async () => {
      if (!me) return;
      const fresh: ResistanceState = {
        ...clean(state),
        leader: firstLeader(chairs.length),
        mission: 0,
        results: [],
        rejections: 0,
        team: [],
        voteNo: 0,
        lastVote: null,
        lastFails: null,
        stage: "propose",
      };
      delete fresh.revealed;
      const setup = await pile("pile_setup", {
        p_item: item.id,
        p_piles: [{ slot: ROLES, cards: rolePool(chairs.length), shuffle: true }],
        p_public: { game: "resistance", state: fresh },
      });
      if (setup.error) return;
      const dealt = await pile("pile_deal", {
        p_item: item.id,
        p_from: ROLES,
        p_targets: chairs.map((chair) => ({
          slot: roleSlot(chair),
          owner: holders[chair] ?? me.userId,
          count: 1,
        })),
      });
      if (dealt.error) return;
      // The spies are told about each other. Nobody else is told anything.
      await pile("pile_team", { p_item: item.id, p_prefix: "role:", p_card: SPY, p_to_prefix: "team:" });
    });

  const resize = (by: number) => {
    const count = Math.max(MIN_SEATS, Math.min(MAX_SEATS, state.seatCount + by));
    if (count === state.seatCount) return;
    const keep = seatIds(count);
    void write({
      ...state,
      seatCount: count,
      stage: "lobby",
      team: [],
      seats: Object.fromEntries(keep.map((c) => [c, state.seats[c] ?? null])),
      holders: Object.fromEntries(keep.map((c) => [c, holders[c] ?? null])),
    });
  };

  // ---------------------------------------------------------------------------
  // Proposing, voting, going on the mission
  // ---------------------------------------------------------------------------

  const toggleOnTeam = (chair: string) => {
    const on = state.team.includes(chair);
    if (!on && state.team.length >= size) return;
    void write({ ...state, team: on ? state.team.filter((c) => c !== chair) : [...state.team, chair] });
  };

  const voteSlots = chairs.map((chair) => voteSlot(voteNo, chair));
  const playSlots = state.team.map((chair) => playSlot(state.mission, chair));

  const vote = (chair: string, approve: boolean) =>
    run(() =>
      pile("pile_put", {
        p_item: item.id,
        p_to: voteSlot(voteNo, chair),
        p_cards: [approve],
        p_to_owner: me?.userId,
        p_seal: voteSlots,
      }),
    );

  const play = (chair: string, succeed: boolean) =>
    run(() =>
      pile("pile_put", {
        p_item: item.id,
        p_to: playSlot(state.mission, chair),
        p_cards: [succeed ? "success" : "fail"],
        p_to_owner: me?.userId,
        p_seal: playSlots,
      }),
    );

  // When the last vote is in, one device turns them over and settles it: the
  // one holding the leader's vote. If that one has gone quiet, anyone can.
  const votesIn = state.stage === "vote" && allCommitted(piles, voteSlots);
  const playsIn = state.stage === "mission" && allCommitted(piles, playSlots);
  const settler = (slot: string) => slot in mine;

  const settleVote = () =>
    run(async () => {
      const turned = await pile("pile_reveal", { p_item: item.id, p_slots: voteSlots }, { quiet: true });
      if (turned.error) return;
      const votes = await waitForItem(item.id, (s) =>
        readVotes(s.revealed as Record<string, unknown[]> | undefined, voteNo, chairs),
      );
      if (!votes) return;
      const live = useRoomStore.getState().items[item.id]?.data as { state: ResistanceState } | undefined;
      const base = live?.state ?? state;
      if (voteCarries(votes, chairs)) {
        await write({ ...base, stage: "mission", rejections: 0, lastVote: votes, voteNo: voteNo + 1 });
        return;
      }
      const rejections = base.rejections + 1;
      const done = verdict(base.results, rejections);
      await write({
        ...base,
        team: [],
        rejections,
        lastVote: votes,
        voteNo: voteNo + 1,
        leader: (base.leader + 1) % chairs.length,
        stage: done ? "over" : "propose",
        wins: done === "spies" ? { ...base.wins, spies: base.wins.spies + 1 } : base.wins,
      });
    });

  const settleMission = () =>
    run(async () => {
      const turned = await pile(
        "pile_reveal",
        { p_item: item.id, p_slots: playSlots, p_pool: missionPool(state.mission) },
        { quiet: true },
      );
      if (turned.error) return;
      const fails = await waitForItem(item.id, (s) =>
        readFails(s.revealed as Record<string, unknown[]> | undefined, state.mission),
      );
      if (fails === null) return;
      const live = useRoomStore.getState().items[item.id]?.data as { state: ResistanceState } | undefined;
      const base = live?.state ?? state;
      const ok = missionSucceeded(base.seatCount, base.mission, fails);
      const results = [...base.results, ok];
      const done = verdict(results, 0);
      await write({
        ...base,
        team: [],
        results,
        lastFails: fails,
        mission: base.mission + 1,
        leader: (base.leader + 1) % chairs.length,
        stage: done ? "over" : "propose",
        wins: done
          ? done === "spies"
            ? { ...base.wins, spies: base.wins.spies + 1 }
            : { ...base.wins, resistance: base.wins.resistance + 1 }
          : base.wins,
      });
    });

  const autoKey = useRef("");
  useEffect(() => {
    const key = votesIn ? `v${voteNo}` : playsIn ? `m${state.mission}` : "";
    if (!key || autoKey.current === key) return;
    const mineToSettle = votesIn ? settler(voteSlot(voteNo, leader)) : settler(playSlots[0]);
    if (!mineToSettle) return;
    autoKey.current = key;
    // Out of the render's way: settling writes state of its own.
    const timer = window.setTimeout(() => void (votesIn ? settleVote() : settleMission()), 0);
    return () => window.clearTimeout(timer);
    // The functions close over the latest state; the key is what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [votesIn, playsIn, voteNo, state.mission]);

  // At the end, every device turns over the role cards it holds.
  const turning = useRef("");
  const toTurn =
    state.stage === "over"
      ? chairs.map(roleSlot).filter((slot) => slot in mine && !state.revealed?.[slot])
      : [];
  const turnKey = toTurn.join(",");
  useEffect(() => {
    if (!turnKey || turning.current === turnKey) return;
    turning.current = turnKey;
    void pile("pile_reveal", { p_item: item.id, p_slots: turnKey.split(","), p_keep: true });
  }, [turnKey, item.id, pile]);

  // ---------------------------------------------------------------------------

  const outcome = verdict(state.results, state.rejections);
  const unmasked = readSpies(state.revealed, chairs);
  const myRole = (chair: string) => (mine[roleSlot(chair)] as string[] | undefined)?.[0];
  const myTeam = (chair: string) => (mine[teamSlot(chair)] as string[] | undefined) ?? [];
  const waiting = (slots: string[]) => slots.filter((slot) => (piles?.[slot]?.size ?? 0) === 0).length;
  const dealt = Boolean(piles?.[roleSlot(chairs[0])]);

  return (
    <div className="surface grain relative flex size-full flex-col gap-2 overflow-hidden rounded-2xl p-2.5">
      {/* The table, and how the missions have gone */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-muted/70">
        <span className="flex items-center gap-0.5">
          <button type="button" disabled={!canEdit || state.seatCount <= MIN_SEATS} onClick={() => resize(-1)} aria-label={t("one chair fewer")} className="grid size-7 place-items-center rounded transition hover:bg-white/10 hover:text-chalk disabled:opacity-30">
            <Minus className="size-3" strokeWidth={2.6} />
          </button>
          <span className="tabular-nums text-chalk">{state.seatCount}</span>
          <span>{t("chairs · {seatCount} spies", { seatCount: spyCount(state.seatCount) })}</span>
          <button type="button" disabled={!canEdit || state.seatCount >= MAX_SEATS} onClick={() => resize(1)} aria-label={t("one chair more")} className="grid size-7 place-items-center rounded transition hover:bg-white/10 hover:text-chalk disabled:opacity-30">
            <Plus className="size-3" strokeWidth={2.6} />
          </button>
        </span>
        <button type="button" onClick={() => setRules(true)} className="flex items-center gap-1 rounded-lg px-1.5 py-1 hover:bg-white/8 hover:text-chalk">
          <BookOpen className="size-3" />{" "}{t("rules")}</button>

        <span className="ml-auto flex items-center gap-1">
          {Array.from({ length: MISSIONS }, (_, i) => {
            const done = state.results[i];
            return (
              <span
                key={i}
                title={
                  done === undefined
                    ? t(`mission ${i + 1}: ${teamSize(state.seatCount, i)} go${needsTwoFails(state.seatCount, i) ? ", two fails to sink it" : ""}`)
                    : done
                      ? t(`mission ${i + 1} came back clean`)
                      : t(`mission ${i + 1} was sabotaged`)
                }
                className={clsx(
                  "grid size-6 place-items-center rounded-full text-[9px] font-bold tabular-nums ring-1",
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
          const isMe = chair === myChair;
          const onTeam = state.team.includes(chair);
          const caught = state.stage === "over" && unmasked.spies.includes(chair);
          const picking = state.stage === "propose" && mineToPlay(leader) && canEdit;
          const voted = state.stage === "vote" && (piles?.[voteSlot(voteNo, chair)]?.size ?? 0) > 0;
          const lastVote = state.stage === "propose" || state.stage === "mission" ? state.lastVote?.[chair] : undefined;
          return (
            <button
              key={chair}
              type="button"
              disabled={!canEdit || !me}
              onClick={() =>
                picking
                  ? toggleOnTeam(chair)
                  : me && void write({ ...state, ...claimChair(state.seats, holders, chair, me) })
              }
              title={picking ? (onTeam ? t("take them off the team") : t("send them")) : who ? (isMe ? t("stand up") : who) : t("sit here")}
              className={clsx(
                "flex min-h-10 min-w-0 flex-1 basis-24 items-center gap-1.5 rounded-xl px-2 py-1.5 text-left transition disabled:opacity-50",
                caught ? "bg-[#e0655c]/20 ring-1 ring-[#e0655c]/50" : onTeam ? "bg-glow/18 ring-1 ring-glow/45" : "bg-white/5 hover:bg-white/9",
              )}
            >
              {chair === leader && dealt && <span title={t("proposes this mission")} className="size-2 shrink-0 rounded-full bg-glow" />}
              <span className="min-w-0 flex-1 truncate text-[11px]">
                {who ? <span className={isMe ? "text-chalk" : "text-muted"}>{who}</span> : <span className="text-muted/55">{t("seat {n}", { n: index + 1 })}</span>}
              </span>
              {voted && <span className="shrink-0 text-[9px] text-muted/60">{t("voted")}</span>}
              {lastVote !== undefined && (
                <span className={clsx("shrink-0 text-[9px]", lastVote ? "text-[#a6d189]" : "text-[#e0655c]")}>{lastVote ? t("yes") : t("no")}</span>
              )}
              {state.stage === "over" && !unmasked.waitingOn.includes(chair) && (
                <span className="shrink-0 text-[9px] text-muted/70">{unmasked.spies.includes(chair) ? t("spy") : t("rebel")}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Whatever the cell is waiting on */}
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto rounded-xl bg-ink-950/25 p-2 inset-ring inset-ring-white/6">
        {state.stage === "lobby" && (
          <p className="my-auto text-center text-[11px] text-muted/50">{t("everyone sits down, then deal to plant the spies")}</p>
        )}

        {state.stage === "over" && (
          <div className="my-auto text-center">
            <p className="text-sm font-semibold text-chalk">
              {outcome === "spies" ? t("the spies had it all along") : t("the resistance holds")}
            </p>
            <p className="mt-1 text-[11px] text-muted">
              {unmasked.waitingOn.length > 0
                ? t("turning the role cards over...")
                : t(`${unmasked.spies.map(label).join(", ")} ${unmasked.spies.length === 1 ? "was" : "were"} working for them`)}
            </p>
          </div>
        )}

        {(state.stage === "propose" || state.stage === "vote" || state.stage === "mission") && (
          <>
            {/* Whose side you are on. Shown only when asked for. */}
            <div className="flex flex-wrap items-center gap-1">
              {chairs
                .filter((chair) => roleSlot(chair) in mine && (!myChair || chair === myChair))
                .map((chair) => (
                  <button
                    key={chair}
                    type="button"
                    onClick={() => setPeek(peek === chair ? null : chair)}
                    className={clsx(
                      "flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] transition",
                      peek === chair ? "bg-glow/20 text-glow" : "bg-white/6 text-muted hover:bg-white/10 hover:text-chalk",
                    )}
                  >
                    <Eye className="size-3.5" strokeWidth={2.2} />
                    {myChair ? t("your card") : label(chair)}
                  </button>
                ))}
              {state.rejections > 0 && (
                <span className="ml-auto text-[10px] text-warm">
                  {t("{rejections} of {maxRejections} refused", { rejections: state.rejections, maxRejections: MAX_REJECTIONS })}</span>
              )}
            </div>

            {peek && (
              <div className="rounded-xl bg-ink-950/60 p-2.5 text-center inset-ring inset-ring-white/8">
                {myRole(peek) === SPY ? (
                  <>
                    <p className="text-[12px] font-semibold text-[#e0655c]">{t("you are a spy")}</p>
                    <p className="mt-0.5 text-[11px] text-muted">{t("with {nobody}", { nobody: myTeam(peek).filter((c) => c !== peek).map(label).join(", ") || t("nobody") })}
                    </p>
                  </>
                ) : myRole(peek) ? (
                  <p className="text-[12px] font-semibold text-[#a6d189]">{t("you are loyal, and on your own")}</p>
                ) : (
                  <p className="text-[11px] text-muted">...</p>
                )}
              </div>
            )}

            {state.lastFails !== null && state.lastFails !== undefined && state.stage === "propose" && state.results.length > 0 && (
              <p className="text-[10px] text-muted/70">{t("the last mission came back with {lastFails} {what}", { lastFails: state.lastFails, what: state.lastFails === 1 ? t("fail") : t("fails") })}
              </p>
            )}

            {state.stage === "propose" && (
              <>
                <p className="text-[12px] text-chalk">
                  {t("{leader} sends {size} on mission {mission}", { leader: label(leader), size, mission: state.mission + 1 })}
                  {needsTwoFails(state.seatCount, state.mission) && <span className="text-warm">{" "}{t("· this one takes two to sink")}</span>}
                </p>
                <p className="text-[10px] text-muted/60">
                  {state.team.length === 0 ? t("tap the chairs to pick a team") : `${state.team.map(label).join(", ")} (${state.team.length}/${size})`}
                </p>
                {canEdit && mineToPlay(leader) && state.team.length === size && (
                  <button type="button" onClick={() => void write({ ...state, stage: "vote" })} className="min-h-9 self-start rounded-lg bg-chalk px-3 py-1.5 text-[11px] font-semibold text-ink-950">{t("put it to the table")}</button>
                )}
              </>
            )}

            {state.stage === "vote" && (
              <>
                <p className="text-[12px] text-chalk">{t("send {team}?", { team: state.team.map(label).join(", ") })}</p>
                <p className="text-[10px] text-muted/60">{t("waiting on {voteSlots} · every vote stays sealed until they are all in", { voteSlots: waiting(voteSlots) })}</p>
                {canEdit &&
                  chairs
                    .filter((chair) => mineToPlay(chair) && (piles?.[voteSlot(voteNo, chair)]?.size ?? 0) === 0)
                    .map((chair) => (
                      <div key={chair} className="flex flex-wrap items-center gap-1">
                        <span className="text-[10px] text-muted/70">{label(chair)}:</span>
                        <button type="button" disabled={busy} onClick={() => void vote(chair, true)} className="flex min-h-9 items-center gap-1 rounded-lg bg-[#a6d189]/18 px-2.5 py-1.5 text-[11px] text-[#a6d189]">
                          <Check className="size-3.5" strokeWidth={2.4} />{" "}{t("send them")}</button>
                        <button type="button" disabled={busy} onClick={() => void vote(chair, false)} className="flex min-h-9 items-center gap-1 rounded-lg bg-[#e0655c]/18 px-2.5 py-1.5 text-[11px] text-[#e0655c]">
                          <X className="size-3.5" strokeWidth={2.4} />{" "}{t("not them")}</button>
                      </div>
                    ))}
                {votesIn && canEdit && (
                  <button type="button" onClick={() => void settleVote()} className="min-h-9 self-start rounded-lg bg-white/8 px-2.5 text-[11px] text-chalk">{t("turn the votes over")}</button>
                )}
              </>
            )}

            {state.stage === "mission" && (
              <>
                <p className="text-[12px] text-chalk">{t("{team} are out there", { team: state.team.map(label).join(", ") })}</p>
                <p className="text-[10px] text-muted/60">{t("waiting on {playSlots} · the cards come back shuffled, so only the count is known", { playSlots: waiting(playSlots) })}</p>
                {canEdit &&
                  state.team
                    .filter((chair) => mineToPlay(chair) && (piles?.[playSlot(state.mission, chair)]?.size ?? 0) === 0)
                    .map((chair) => (
                      <div key={chair} className="flex flex-wrap items-center gap-1">
                        <span className="text-[10px] text-muted/70">{label(chair)}:</span>
                        <button type="button" disabled={busy} onClick={() => void play(chair, true)} className="flex min-h-9 items-center gap-1 rounded-lg bg-[#a6d189]/18 px-2.5 py-1.5 text-[11px] text-[#a6d189]">
                          <Check className="size-3.5" strokeWidth={2.4} />{" "}{t("carry it out")}</button>
                        {/* Only a spy may sabotage. The button is hidden rather
                            than disabled -- a greyed-out button would tell the
                            room who is loyal. */}
                        {myRole(chair) === SPY && (
                          <button type="button" disabled={busy} onClick={() => void play(chair, false)} className="flex min-h-9 items-center gap-1 rounded-lg bg-[#e0655c]/18 px-2.5 py-1.5 text-[11px] text-[#e0655c]">
                            <ShieldAlert className="size-3.5" strokeWidth={2.4} />{" "}{t("sink it")}</button>
                        )}
                      </div>
                    ))}
                {playsIn && canEdit && (
                  <button type="button" onClick={() => void settleMission()} className="min-h-9 self-start rounded-lg bg-white/8 px-2.5 text-[11px] text-chalk">{t("read the mission cards")}</button>
                )}
              </>
            )}
          </>
        )}
      </div>

      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 truncate text-[10px] text-muted/60">{t("rebels {resistance} · spies {spies}", { resistance: state.wins.resistance, spies: state.wins.spies })}
        </p>
        <button type="button" disabled={!canEdit || busy} onClick={() => void newGame()} aria-label={t("deal a new game")} title={t("deal a new game")} className="grid size-9 shrink-0 place-items-center rounded-lg text-muted transition hover:bg-white/8 hover:text-chalk disabled:opacity-40 sm:size-8">
          <RotateCcw className="size-3.5" strokeWidth={2.2} />
        </button>
      </div>

      {rules && (
        <RulesSheet title={t("how the resistance goes")} onClose={() => setRules(false)}>
          <p>{t("A few of the table are")}{" "}<b>{t("spies")}</b>{t(", dealt in secret. The spies know each other; the rebels know nobody. There are five missions;")}{" "}<b>{t("three successes")}</b>{" "}{t("win it for the rebels,")}{" "}<b>{t("three failures")}</b>{" "}{t("for the spies.")}</p>
          <p>{t("Each round, the")}{" "}<b>{t("leader")}</b>{" "}{t("(the dot) picks a team of the size shown on the mission. Everyone votes on it -- votes stay sealed until all are in, then turn over together. A majority sends the team; otherwise leadership passes on.")}{" "}<b>{t("Five refusals in a row")}</b>{" "}{t("and the spies win.")}</p>
          <p>{t("On a mission, each member secretly plays a card. Rebels must carry it out; spies may")}{" "}
            <b>{t("sink it")}</b>. The cards are shuffled before they are read, so only the number of fails is ever
            known. One fail sinks a mission -- except the fourth mission at seven or more players, which takes
            two.
          </p>
        </RulesSheet>
      )}
    </div>
  );
}

/** The state without what the old, leaky version kept, or what the database owns. */
function clean(state: ResistanceState): ResistanceState {
  const out = { ...state } as ResistanceState & Record<string, unknown>;
  delete out.spies;
  delete out.votes;
  delete out.plays;
  delete out.piles;
  if (typeof out.revealed === "boolean") delete out.revealed;
  return out;
}
