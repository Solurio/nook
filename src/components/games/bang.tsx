"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { BookOpen, Eye, EyeOff, Minus, Plus, Skull, Star } from "lucide-react";
import { useRoom } from "@/realtime/room-provider";
import { usePiles } from "@/realtime/use-piles";
import { useHandOver, useScrub } from "@/realtime/use-hand-over";
import { useRoomStore } from "@/state/room-store";
import { chairOf, claimChair } from "@/lib/seats";
import { randomBelow } from "@/lib/dice";
import {
  ARROWS,
  CHARACTERS,
  FACE_NAME,
  FACE_TEXT,
  FACES,
  MAX_SEATS,
  MIN_SEATS,
  ROLES_PILE,
  ROLE_GOAL,
  ROLE_NAME,
  SEALED_PILE,
  THREE_TARGET,
  alive,
  canReroll,
  count,
  emptyBang,
  gatlingNeeds,
  maxRolls,
  resolve,
  roll,
  roleSlot,
  sealedSlot,
  sidGives,
  startGame,
  stopRolling,
  targetsFor,
  unchosen,
  unmasked,
  winnerText,
  type BangState,
  type Plan,
  type Role,
} from "@/lib/bang";
import type { Item } from "@/lib/types";
import BangDie from "./bang-die";
import RulesSheet from "./rules-sheet";
import { t as tx } from "@/lib/i18n";

/** A bullet for every life, the spent ones hollow. */
function Bullets({ life, max }: { life: number; max: number }) {
  return (
    <span className="flex flex-wrap gap-px" aria-label={tx(`${life} of ${max} lives`)}>
      {Array.from({ length: max }, (_, i) => (
        <svg key={i} viewBox="0 0 6 14" className="h-3 w-[5px]" aria-hidden>
          <path
            d="M3 0.5 C5 2 5.5 4 5.5 5 V13 H0.5 V5 C0.5 4 1 2 3 0.5Z"
            fill={i < life ? "#d6a85a" : "none"}
            stroke={i < life ? "#8c5f22" : "rgba(255,255,255,0.2)"}
            strokeWidth="0.8"
          />
        </svg>
      ))}
    </span>
  );
}

/** Arrows held, as little arrows. */
function Quiver({ n }: { n: number }) {
  if (n <= 0) return null;
  return (
    <span className="flex items-center gap-px text-[#e0655c]" aria-label={tx(`${n} arrows`)}>
      {Array.from({ length: Math.min(n, 9) }, (_, i) => (
        <svg key={i} viewBox="0 0 8 16" className="h-3 w-[5px]" aria-hidden>
          <path d="M4 1 V15 M4 1 L1.5 4 M4 1 L6.5 4 M4 15 L2 12.5 M4 15 L6 12.5" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round" />
        </svg>
      ))}
    </span>
  );
}

/**
 * BANG! The Dice Game. Five dice go round the table; everybody watches them
 * land. What is kept from you is who everyone really is -- only the Sheriff's
 * star is out in the open, and every other role turns over when its player
 * falls.
 */
export default function Bang({ item, state: raw }: { item: Item<"game">; state: unknown }) {
  const { updateData, pile, canEdit } = useRoom();
  const me = useRoomStore((s) => s.me);
  const legacy = (raw as { version?: number } | null)?.version !== 2;
  const state = useMemo<BangState>(
    () =>
      legacy
        ? emptyBang((raw as { seatCount?: number } | null)?.seatCount ?? 5)
        : ({ ...emptyBang(), ...(raw as Partial<BangState>) } as BangState),
    [raw, legacy],
  );
  // The card game that used to live here kept its state in another shape.
  useScrub(legacy, () => void updateData(item.id, { game: "bang", state: clean(state) } as never));

  const [busy, setBusy] = useState(false);
  const [manual, setManual] = useState(false);
  const [throwing, setThrowing] = useState<number[]>([]);
  const [plan, setPlan] = useState<Plan & { turnKey: string }>({ shots: {}, beers: {}, slab: null, kit: [], turnKey: "" });
  const [aiming, setAiming] = useState<number | null>(null);
  const [looking, setLooking] = useState<string | null>(null);

  const chairs = useMemo(
    () => Array.from({ length: Math.max(MIN_SEATS, Math.min(MAX_SEATS, state.seatCount)) }, (_, i) => `s${i}`),
    [state.seatCount],
  );
  const holders = useMemo(() => state.holders ?? {}, [state.holders]);
  const myChair = chairOf(state.seats, holders, me);
  const piles = state.piles;
  const mine = usePiles(item.id, piles);
  useHandOver(item.id, piles, holders);

  const label = (chair: string) => state.seats[chair] ?? `seat ${chairs.indexOf(chair) + 1}`;
  /** This device plays for its own chair, and for any chair nobody is sitting in. */
  const plays = (chair: string) => canEdit && (holders[chair] ? holders[chair] === me?.userId : true);
  const playing = state.phase === "play";
  const myTurn = playing && plays(state.turn) && !state.waiting && state.unmask.length === 0;

  const write = (next: BangState) => updateData(item.id, { game: "bang", state: clean(next) } as never);
  const latest = (): BangState => {
    const data = useRoomStore.getState().items[item.id]?.data as { state?: BangState } | undefined;
    return { ...emptyBang(), ...(data?.state ?? state) };
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

  // Choices for this turn's dice, forgotten when the turn or the roll changes.
  const turnKey = `${state.round}:${state.turn}:${state.roll?.n ?? 0}`;
  const current: Plan = plan.turnKey === turnKey ? plan : { shots: {}, beers: {}, slab: null, kit: [] };
  const choose = (patch: Partial<Plan>) => setPlan({ ...current, ...patch, turnKey });
  const picked = throwing.filter((i) => canReroll(state, i));

  // ---------------------------------------------------------------------------
  // Dealing
  // ---------------------------------------------------------------------------

  const deal = () =>
    run(async () => {
      if (!me) return;
      const game = startGame(clean(state), chairs, randomBelow, label);
      if (!game.sheriff) {
        // Three players: every role face up, nothing secret to deal.
        await pile("pile_setup", { p_item: item.id, p_piles: [], p_public: { game: "bang", state: clean(game.state) } });
        return;
      }
      const set = await pile("pile_setup", {
        p_item: item.id,
        p_piles: [{ slot: ROLES_PILE, cards: game.hidden, shuffle: true, copies: [{ slot: SEALED_PILE }] }],
        p_public: { game: "bang", state: clean(game.state) },
      });
      if (set.error) return;
      const others = chairs.filter((c) => c !== game.sheriff);
      // The same order into both: each player's role, and its sealed copy.
      await pile("pile_deal", {
        p_item: item.id,
        p_from: ROLES_PILE,
        p_targets: others.map((c) => ({ slot: roleSlot(c), owner: holders[c] ?? me.userId, count: 1 })),
      });
      await pile("pile_deal", {
        p_item: item.id,
        p_from: SEALED_PILE,
        p_targets: others.map((c) => ({ slot: sealedSlot(c), count: 1 })),
      });
    });

  // ---------------------------------------------------------------------------
  // The dead are unmasked by whoever is playing -- or by anyone, a moment later
  // ---------------------------------------------------------------------------

  const unmaskKey = playing && state.unmask.length ? state.unmask.join(",") : "";
  const unmasking = useRef("");
  const firstHand = plays(state.turn);
  useEffect(() => {
    if (!unmaskKey || unmasking.current === unmaskKey) return;
    const t = window.setTimeout(
      async () => {
        const now = latest();
        if (!now.unmask.length || now.unmask.join(",") !== unmaskKey) return;
        unmasking.current = unmaskKey;
        const hidden = now.unmask.filter((c) => !now.revealed?.[sealedSlot(c)]);
        if (hidden.length) await pile("pile_reveal", { p_item: item.id, p_slots: hidden.map(sealedSlot), p_keep: true }, { quiet: true });
        for (let i = 0; i < 25; i += 1) {
          const live = latest();
          if (!live.unmask.length) return;
          const roles: Record<string, Role> = {};
          for (const c of live.unmask) {
            const role = (live.revealed?.[sealedSlot(c)] as Role[] | undefined)?.[0];
            if (role) roles[c] = role;
          }
          if (Object.keys(roles).length === live.unmask.length) {
            await write(unmasked(live, roles, label));
            return;
          }
          await new Promise((r) => window.setTimeout(r, 200));
        }
        unmasking.current = "";
      },
      firstHand ? 0 : 3000,
    );
    return () => window.clearTimeout(t);
    // Keyed on who is waiting to be unmasked; the rest is read fresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unmaskKey, firstHand]);

  // At the end, every role comes out.
  const endKey =
    state.phase === "over" ? state.order.filter((c) => !state.players[c]?.role && !state.revealed?.[sealedSlot(c)]).join(",") : "";
  const ended = useRef("");
  useEffect(() => {
    if (!endKey || ended.current === endKey || !canEdit) return;
    ended.current = endKey;
    void pile("pile_reveal", { p_item: item.id, p_slots: endKey.split(",").map(sealedSlot), p_keep: true }, { quiet: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endKey]);

  // ---------------------------------------------------------------------------
  // Moves
  // ---------------------------------------------------------------------------

  const throwDice = () =>
    run(async () => {
      const now = latest();
      const next = roll(now, now.rolls === 0 ? [] : picked, randomBelow, label);
      if (next === now) return;
      setThrowing([]);
      await write(next);
    });

  const keep = () => run(() => write(stopRolling(latest())));
  const settleDice = () =>
    run(async () => {
      await write(resolve(latest(), current, label));
      setAiming(null);
    });
  const sid = (to: string) => run(() => write(sidGives(latest(), to, label)));

  const aimable = (chair: string): boolean => {
    if (!myTurn || state.step !== "resolve" || aiming === null) return false;
    const face = state.dice[aiming];
    if (face === "beer") return !state.players[chair]?.dead;
    if (face === "one" || face === "two") return targetsFor(state, state.turn, face).includes(chair);
    return false;
  };

  // Tapping a player while a die is being aimed.
  const aimAt = (chair: string) => {
    if (aiming === null || !aimable(chair)) return;
    const face = state.dice[aiming];
    if (face === "beer") choose({ beers: { ...current.beers, [aiming]: chair } });
    else choose({ shots: { ...current.shots, [aiming]: chair } });
    setAiming(null);
  };

  // ---------------------------------------------------------------------------
  // What this screen shows
  // ---------------------------------------------------------------------------

  const roleOf = (chair: string): Role | undefined =>
    state.players[chair]?.role ?? (state.revealed?.[sealedSlot(chair)] as Role[] | undefined)?.[0];
  const secretRole = (chair: string): Role | undefined => (mine[roleSlot(chair)] as Role[] | undefined)?.[0];
  const ownedRoles = state.order.filter((c) => secretRole(c));
  const shownRoleChair = myChair && secretRole(myChair) ? myChair : ownedRoles.length === 1 ? ownedRoles[0] : null;

  // Only dice thrown while this screen was open tumble in.
  const [arrivedAt] = useState(() => state.roll?.n ?? 0);
  const fresh = (i: number) => Boolean(state.roll && state.roll.n > arrivedAt && state.roll.thrown.includes(i));

  const myThree = state.three && myChair ? state.players[myChair]?.role : undefined;
  const stillToChoose = playing && state.step === "resolve" ? unchosen(state, current) : [];
  const rollsLeft = maxRolls(state) - state.rolls;
  const turnPlayer = state.players[state.turn];
  const gatlings = count(state.dice, "gatling");

  return (
    <div className="surface grain relative flex size-full flex-col gap-2 overflow-hidden rounded-2xl p-2.5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-muted/70">
        <span className="flex items-center gap-0.5">
          <button
            type="button"
            disabled={!canEdit || playing || state.seatCount <= MIN_SEATS}
            onClick={() => void write({ ...state, seatCount: state.seatCount - 1 })}
            aria-label={tx("one chair fewer")}
            className="grid size-7 place-items-center rounded hover:bg-white/10 disabled:opacity-30"
          >
            <Minus className="size-3" strokeWidth={2.6} />
          </button>
          <span className="tabular-nums text-chalk">{state.seatCount}</span>{" "}{tx("chairs")}<button
            type="button"
            disabled={!canEdit || playing || state.seatCount >= MAX_SEATS}
            onClick={() => void write({ ...state, seatCount: state.seatCount + 1 })}
            aria-label={tx("one chair more")}
            className="grid size-7 place-items-center rounded hover:bg-white/10 disabled:opacity-30"
          >
            <Plus className="size-3" strokeWidth={2.6} />
          </button>
        </span>
        {playing && (
          <span className="flex items-center gap-1" title={tx("arrows left in the middle")}>
            <Quiver n={state.arrows} />
            <span className="tabular-nums text-chalk">{state.arrows}</span>/{ARROWS}{" "}{tx("arrows")}</span>
        )}
        <button type="button" onClick={() => setManual(true)} className="ml-auto flex min-h-8 items-center gap-1 rounded-lg px-1.5 hover:bg-white/8 hover:text-chalk">
          <BookOpen className="size-3" />{" "}{tx("rules")}</button>
      </div>

      {/* Round the table */}
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
        {chairs.map((chair, index) => {
          const p = state.players[chair];
          const role = roleOf(chair);
          const isTurn = playing && state.turn === chair;
          const target = aimable(chair);
          const sidTarget = myTurn && state.step === "sid" && p && !p.dead;
          return (
            <div
              key={chair}
              onClick={target ? () => aimAt(chair) : sidTarget ? () => void sid(chair) : undefined}
              className={clsx(
                "flex min-w-0 flex-col gap-1 rounded-xl p-1.5 transition",
                p?.dead ? "bg-white/3 opacity-45" : isTurn ? "bg-white/10 ring-1 ring-warm/60" : "bg-white/5",
                (target || sidTarget) && "cursor-pointer ring-2 ring-[#e0655c] hover:bg-[#e0655c]/15",
              )}
            >
              <button
                type="button"
                disabled={!canEdit || !me || playing}
                onClick={(event) => {
                  event.stopPropagation();
                  if (me) void write({ ...state, ...claimChair(state.seats, holders, chair, me) });
                }}
                className="flex min-h-6 items-center gap-1 text-left text-[11px] disabled:cursor-default"
              >
                {role === "sheriff" && <Star className="size-3 shrink-0 fill-warm text-warm" />}
                {p?.dead && <Skull className="size-3 shrink-0" />}
                <span className={clsx("min-w-0 flex-1 truncate", chair === myChair ? "text-chalk" : "text-muted")}>
                  {state.seats[chair] ?? <span className="text-muted/50">{tx("seat")}{" "}{index + 1}</span>}
                </span>
                {(state.wins[chair] ?? 0) > 0 && <span className="text-warm">{state.wins[chair]}</span>}
              </button>
              {p && (
                <>
                  <p className="truncate text-[10px] text-glow/85" title={CHARACTERS[p.character].text}>
                    {CHARACTERS[p.character].name}
                    {role && role !== "sheriff" && <span className="text-muted"> · {ROLE_NAME[role]}</span>}
                  </p>
                  <div className="flex min-h-3 items-center gap-1.5">
                    <Bullets life={p.life} max={p.max} />
                    <span className="ml-auto">
                      <Quiver n={p.arrows} />
                    </span>
                  </div>
                  {p.character === "bart" && plays(chair) && !p.dead && (
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        void write({ ...state, players: { ...state.players, [chair]: { ...p, bartArrows: !p.bartArrows } } });
                      }}
                      className={clsx("self-start rounded px-1 text-[9px]", p.bartArrows ? "bg-glow/20 text-glow" : "text-muted/60")}
                    >{tx("arrows for wounds:")}{" "}{p.bartArrows ? tx("yes") : tx("no")}
                    </button>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>

      {/* The felt */}
      <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center gap-2 overflow-y-auto rounded-xl bg-[radial-gradient(ellipse_at_center,#4a3322_0%,#2a1c14_70%,#1a120d_100%)] p-2 inset-ring inset-ring-white/8">
        {!playing ? (
          <div className="flex flex-col items-center gap-2 text-center">
            {state.winner && <p className="text-sm font-semibold text-warm">{winnerText(state, label)}</p>}
            <p className="max-w-72 text-[11px] text-muted/75">{tx("three to eight chairs. Empty chairs play from whoever deals; sit down to hold your own role.")}</p>
            <button type="button" disabled={!canEdit || busy} onClick={() => void deal()} className="min-h-10 rounded-xl bg-chalk px-4 text-[12px] font-semibold text-ink-950 disabled:opacity-40">
              {state.winner ? tx("deal again") : tx("deal")}
            </button>
          </div>
        ) : (
          <>
            <p className="text-center text-[11px] text-chalk">
              {state.unmask.length
                ? tx("turning over the dead...")
                : state.step === "sid"
                  ? tx(`${label(state.turn)} gives someone a life`)
                  : `${label(state.turn)} -- ${CHARACTERS[turnPlayer?.character ?? "paul"].name}${state.rolls ? ` · roll ${state.rolls} of ${maxRolls(state)}` : ""}`}
              {state.exploded && <b className="ml-1 text-[#f2a4b8]">BOOM</b>}
            </p>

            <div className="flex flex-wrap items-end justify-center gap-2">
              {state.dice.length === 0
                ? Array.from({ length: 5 }, (_, i) => <BangDie key={i} face={null} />)
                : state.dice.map((face, i) => {
                    const rerollable = myTurn && state.step === "roll" && canReroll(state, i);
                    const aimableDie = myTurn && state.step === "resolve" && (face === "one" || face === "two" || face === "beer");
                    const target = face === "beer" ? current.beers[i] : current.shots[i];
                    const slab = current.slab;
                    return (
                      <BangDie
                        key={`${state.roll?.n ?? 0}:${i}`}
                        face={face}
                        tumble={fresh(i)}
                        delay={i * 70}
                        locked={face === "dynamite" && state.step === "roll" && !canReroll(state, i)}
                        picked={rerollable ? throwing.includes(i) : aiming === i}
                        marked={
                          slab && slab.beer === i
                            ? "doubling"
                            : target
                              ? `${face === "beer" ? "for" : "at"} ${label(target)}${slab && slab.shot === i ? " x2" : ""}`
                              : undefined
                        }
                        title={`${FACE_NAME[face]}: ${FACE_TEXT[face]}`}
                        onClick={
                          rerollable
                            ? () => setThrowing((t) => (t.includes(i) ? t.filter((x) => x !== i) : [...t, i]))
                            : aimableDie
                              ? () => setAiming(aiming === i ? null : i)
                              : undefined
                        }
                      />
                    );
                  })}
            </div>

            {/* The roller's buttons */}
            {myTurn && state.step === "roll" && (
              <div className="flex flex-wrap items-center justify-center gap-1.5">
                {state.rolls === 0 ? (
                  <button type="button" disabled={busy} onClick={() => void throwDice()} className="min-h-10 rounded-xl bg-chalk px-5 text-[12px] font-semibold text-ink-950 active:scale-95">{tx("roll the dice")}</button>
                ) : (
                  <>
                    <button
                      type="button"
                      disabled={busy || picked.length === 0}
                      onClick={() => void throwDice()}
                      className="min-h-10 rounded-xl bg-chalk px-4 text-[12px] font-semibold text-ink-950 active:scale-95 disabled:opacity-40"
                    >{tx("roll")}{" "}{picked.length || ""}{" "}{tx("again (")}{rollsLeft}{" "}{tx("left)")}</button>
                    <button type="button" disabled={busy} onClick={() => void keep()} className="min-h-10 rounded-xl bg-white/10 px-4 text-[12px] text-chalk">{tx("keep these")}</button>
                  </>
                )}
              </div>
            )}
            {myTurn && state.step === "roll" && state.rolls > 0 && <p className="text-[10px] text-muted/60">{tx("tap the dice you want to throw again")}</p>}

            {myTurn && state.step === "resolve" && (
              <div className="flex flex-col items-center gap-1.5">
                <p className="text-center text-[10px] text-muted/70">
                  {aiming !== null
                    ? state.dice[aiming] === "beer"
                      ? tx("now tap who drinks")
                      : tx("now tap who you shoot")
                    : stillToChoose.length
                      ? tx("tap a 1, a 2 or a beer, then a player")
                      : tx("ready")}
                  {gatlings >= gatlingNeeds(state) && tx(" · the Gatling fires")}
                </p>
                <div className="flex flex-wrap justify-center gap-1.5">
                  {turnPlayer?.character === "slab" &&
                    (() => {
                      const beer = state.dice.findIndex((f, i) => f === "beer" && !current.beers[i]);
                      const shot = state.dice.findIndex((f) => f === "one" || f === "two");
                      if (beer < 0 || shot < 0) return null;
                      const on = Boolean(current.slab);
                      return (
                        <button
                          type="button"
                          onClick={() => choose({ slab: on ? null : { beer, shot } })}
                          className={clsx("min-h-9 rounded-lg px-2.5 text-[11px]", on ? "bg-[#e0655c]/25 text-[#f2a4b8]" : "bg-white/8 text-chalk")}
                        >
                          {on ? tx("doubled") : tx("spend a beer to double a shot")}
                        </button>
                      );
                    })()}
                  {turnPlayer?.character === "kit" && gatlings > 0 && (
                    <span className="flex flex-wrap items-center gap-1 text-[10px] text-muted">{tx("take arrows off:")}{alive(state)
                        .filter((c) => state.players[c].arrows > 0)
                        .map((c) => {
                          const taken = (current.kit ?? []).filter((x) => x === c).length;
                          return (
                            <button
                              key={c}
                              type="button"
                              onClick={() => {
                                const kit = current.kit ?? [];
                                choose({ kit: kit.length < gatlings && taken < state.players[c].arrows ? [...kit, c] : kit.filter((x) => x !== c) });
                              }}
                              className={clsx("min-h-8 rounded-md px-2", taken ? "bg-glow/20 text-glow" : "bg-white/8 text-chalk")}
                            >
                              {label(c)}
                              {taken ? ` ${taken}` : ""}
                            </button>
                          );
                        })}
                    </span>
                  )}
                  <button
                    type="button"
                    disabled={busy || stillToChoose.length > 0}
                    onClick={() => void settleDice()}
                    className="min-h-10 rounded-xl bg-chalk px-5 text-[12px] font-semibold text-ink-950 active:scale-95 disabled:opacity-40"
                  >{tx("let them fly")}</button>
                </div>
              </div>
            )}

            {myTurn && state.step === "sid" && <p className="text-[11px] text-warm">{tx("tap anyone -- yourself too -- to give them a life")}</p>}
            {!myTurn && !state.unmask.length && <p className="text-center text-[10px] text-muted/60">{state.log.at(-1)}</p>}
          </>
        )}
      </div>

      {/* Your role: yours alone */}
      {playing && (myThree || shownRoleChair || ownedRoles.length > 1) && (
        <div className="flex items-center gap-2 rounded-xl bg-white/4 px-2 py-1.5 text-[11px]">
          {myThree ? (
            <span className="text-muted">{tx("you are the")}{" "}<b className="text-chalk">{ROLE_NAME[myThree]}</b>{" "}{tx("-- take out the")}{" "}{ROLE_NAME[THREE_TARGET[myThree] as Role]}
              {state.freeForAll ? tx(", or just be the last one standing") : tx(" yourself")}
            </span>
          ) : shownRoleChair ? (
            <span className="text-muted">
              {shownRoleChair === myChair ? tx("you are") : tx(`${label(shownRoleChair)} is`)}{" "}{tx("the")}{" "}
              <b className="text-chalk">{ROLE_NAME[secretRole(shownRoleChair) as Role]}</b>: {ROLE_GOAL[secretRole(shownRoleChair) as Role]}
            </span>
          ) : (
            <span className="flex flex-wrap items-center gap-1 text-muted">{tx("pass the phone, then look:")}{ownedRoles.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setLooking(looking === c ? null : c)}
                  className="flex min-h-8 items-center gap-1 rounded-lg bg-white/8 px-2 text-chalk"
                >
                  {looking === c ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
                  {label(c)}
                  {looking === c && <b className="ml-1">{ROLE_NAME[secretRole(c) as Role]}</b>}
                </button>
              ))}
            </span>
          )}
        </div>
      )}

      {manual && (
        <RulesSheet title={tx("BANG! The Dice Game")} onClose={() => setManual(false)}>
          <p>{tx("Everyone has a secret role. The")}{" "}<b>{tx("Sheriff")}</b>{" "}{tx("shows his, has two more bullets, and goes first.")}{" "}<b>{tx("Deputies")}</b>{" "}{tx("protect him,")}{" "}<b>{tx("Outlaws")}</b>{" "}{tx("want him dead, and the")}{" "}<b>{tx("Renegade")}</b>{" "}{tx("wants to be the last one standing.")}</p>
          <p>{tx("On your turn roll all five dice, then throw any of them again -- twice more at most. Dynamite stays where it falls. Arrows are taken the moment they land; whoever takes the last arrow in the middle brings the Indians down on everyone: a life for every arrow held, then all the arrows go back.")}</p>
          <p>{tx("Three dynamite and your rolling is over, with a life lost -- but the other dice still count.")}</p>
          <div className="space-y-1 border-t border-white/8 pt-2">
            <h4>{tx("the dice, in the order they are settled")}</h4>
            {FACES.map((f) => (
              <div key={f} className="flex items-center gap-2">
                <BangDie face={f} size={22} />
                <span>
                  <b>{FACE_NAME[f]}</b> -- {FACE_TEXT[f]}
                </span>
              </div>
            ))}
          </div>
          <p className="border-t border-white/8 pt-2">{tx("When the Sheriff falls, the Outlaws win -- unless a Renegade is the only one left. When every Outlaw and Renegade is gone, the law wins. With three at the table every role is face up: the Deputy hunts the Renegade, the Renegade the Outlaw, the Outlaw the Deputy -- and you only win by taking your own target out yourself.")}</p>
          <div className="space-y-1 border-t border-white/8 pt-2">
            <h4>{tx("the characters")}</h4>
            {Object.values(CHARACTERS).map((c) => (
              <p key={c.name}>
                <b>{c.name}</b> ({c.life}) -- {tx(c.text)}
              </p>
            ))}
          </div>
        </RulesSheet>
      )}
    </div>
  );
}

/** The state without what only the database writes. */
function clean(state: BangState): BangState {
  const out = { ...state } as BangState & Record<string, unknown>;
  delete out.piles;
  delete out.revealed;
  return out;
}
