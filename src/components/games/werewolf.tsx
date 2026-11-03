"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { BookOpen, Crosshair, Eye, EyeOff, Minus, Moon, Plus, Skull, Sun, Vote } from "lucide-react";
import { useRoom } from "@/realtime/room-provider";
import { usePiles } from "@/realtime/use-piles";
import { useHandOver } from "@/realtime/use-hand-over";
import { useRoomStore } from "@/state/room-store";
import { chairOf, claimChair } from "@/lib/seats";
import {
  MAX_SEATS,
  MIN_SEATS,
  ROLE_DOES,
  ROLE_NAME,
  ROLE_TINT,
  chairsFor,
  defaultWolves,
  emptyWerewolf,
  fits,
  howTheyDied,
  readCard,
  roleSlot,
  tally,
  type Narration,
  type Role,
  type WerewolfSetup,
  type WerewolfState,
} from "@/lib/werewolf";
import type { Item } from "@/lib/types";
import RulesSheet from "./rules-sheet";
import { t } from "@/lib/i18n";

const upgrade = (raw: unknown): WerewolfState => {
  const base = emptyWerewolf();
  const got = (raw ?? {}) as Partial<WerewolfState>;
  return { ...base, ...got, setup: { ...base.setup, ...(got.setup ?? {}) } };
};

type Card = { role: Role; wolves: string[] };
type Answer = { role?: Role; victim?: string | null; waiting?: boolean; heal?: boolean; poison?: boolean };
type Reply = { data: Answer | null; error: string | null };
type Notes = { seen: Array<{ night: number; target: string; role: Role }>; saved?: { night: number; target: string } };

/** A number from a string, the same on every phone. */
function spread(text: string): number {
  let h = 7;
  for (let i = 0; i < text.length; i += 1) h = (h * 31 + text.charCodeAt(i)) >>> 0;
  return h;
}

/** What a phone has learned at night -- the seer's looks, the doctor's last patient -- kept on that phone, per game. */
function useNotes(key: string) {
  const [notes, setNotes] = useState<Notes>(() => {
    try {
      const got = JSON.parse(window.localStorage.getItem(key) ?? "") as Notes;
      return Array.isArray(got.seen) ? got : { seen: [] };
    } catch {
      return { seen: [] };
    }
  });
  const save = (next: Notes) => {
    setNotes(next);
    try {
      window.localStorage.setItem(key, JSON.stringify(next));
    } catch {
      // Remembered for this visit only.
    }
  };
  return [notes, save] as const;
}

/**
 * Werewolf, narrated by the database. Every player's card is a secret pile;
 * the night is acted out through functions that check you hold the card you
 * act for, and the table only ever learns what a narrator would say out loud.
 * With nobody sitting, one phone goes round the table: each player is shown
 * their card and their night in turn.
 */
export default function Werewolf({ item, state: raw }: { item: Item<"game">; state: unknown }) {
  const { updateData, pile, canEdit } = useRoom();
  const me = useRoomStore((s) => s.me);
  const state = useMemo(() => upgrade(raw), [raw]);
  const [busy, setBusy] = useState(false);
  const [rules, setRules] = useState(false);
  // The chair whose night is open on this phone, and which night that was.
  const [looking, setLooking] = useState<{ chair: string; night: number } | null>(null);
  const [showCard, setShowCard] = useState(false);

  const allChairs = chairsFor(state.seatCount);
  const holders = useMemo(() => state.holders ?? {}, [state.holders]);
  const myChair = chairOf(state.seats, holders, me);
  const mine = usePiles(item.id, state.piles);
  useHandOver(item.id, state.piles, holders);
  const ww = state.ww;
  const playing = Boolean(ww) && ww?.phase !== "over";
  const notesKey = (chair: string) => `nook.ww.${item.id}.${ww?.game ?? "-"}.${chair}`;

  // Once dealt, the village is whoever was dealt in.
  const village = ww ? allChairs.filter((c) => ww.alive.includes(c) || ww.dead.some((d) => d.chair === c)) : allChairs;
  const label = (chair: string) => state.seats[chair] ?? t("seat {n}", { n: allChairs.indexOf(chair) + 1 });
  const cardOf = (chair: string): Card | null => readCard(mine[roleSlot(chair)] as unknown[] | undefined);
  /** The chairs this phone plays for: your own, and any empty chair whose card it was dealt. */
  const ownChairs = village.filter((c) => Boolean(mine[roleSlot(c)]) && (c === myChair || !holders[c]));
  const sharing = ownChairs.length > 1;

  const write = (next: WerewolfState) => {
    const copy = { ...next } as WerewolfState & Record<string, unknown>;
    delete copy.ww;
    delete copy.piles;
    delete copy.revealed;
    return updateData(item.id, { game: "werewolf", state: copy } as never);
  };

  const run = async <T,>(work: () => Promise<T>): Promise<T | undefined> => {
    if (busy || !canEdit) return undefined;
    setBusy(true);
    try {
      return await work();
    } finally {
      setBusy(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Setting up
  // ---------------------------------------------------------------------------

  const setSetup = (patch: Partial<WerewolfSetup>) => void write({ ...state, setup: { ...state.setup, ...patch } });
  const resize = (by: number) => {
    const count = Math.max(MIN_SEATS, Math.min(MAX_SEATS, state.seatCount + by));
    const keep = chairsFor(count);
    void write({
      ...state,
      seatCount: count,
      setup: { ...state.setup, wolves: Math.min(state.setup.wolves, Math.floor((count - 1) / 2)) || defaultWolves(count) },
      seats: Object.fromEntries(keep.map((c) => [c, state.seats[c] ?? null])),
      holders: Object.fromEntries(keep.map((c) => [c, holders[c] ?? null])),
    });
  };

  // Enough people sitting: deal to them. Otherwise every chair is dealt, and
  // the empty ones are played on the dealer's phone.
  const seated = allChairs.filter((c) => holders[c]);
  const dealing = seated.length >= MIN_SEATS ? seated : allChairs;

  const deal = () =>
    run(async () => {
      if (!me) return;
      setLooking(null);
      setShowCard(false);
      await pile("werewolf_deal", {
        p_item: item.id,
        p_chairs: dealing,
        p_owners: dealing.map((c) => holders[c] ?? me.userId),
        p_setup: state.setup,
      });
    });

  // ---------------------------------------------------------------------------
  // Acting
  // ---------------------------------------------------------------------------

  const act = (chair: string, kind: string, target: string | null = null) =>
    run(() => pile<Answer>("werewolf_night", { p_item: item.id, p_chair: chair, p_kind: kind, p_target: target }));
  // The witch asking after the wolves runs beside everything else, and a refusal is not worth a toast.
  const ask = (chair: string) => pile<Answer>("werewolf_night", { p_item: item.id, p_chair: chair, p_kind: "victim" }, { quiet: true });
  const vote = (chair: string, target: string) => run(() => pile("werewolf_vote", { p_item: item.id, p_chair: chair, p_target: target }));
  const shoot = (chair: string, target: string) => run(() => pile("werewolf_shoot", { p_item: item.id, p_chair: chair, p_target: target }));

  // ---------------------------------------------------------------------------
  // Whose turn on this phone
  // ---------------------------------------------------------------------------

  const night = ww?.phase === "night" ? ww : null;
  /**
   * The order the phone goes round in at night. It starts somewhere different
   * each night; with a witch on this phone, somewhere that puts every wolf
   * before her, since she is told whom they chose.
   */
  const order = (() => {
    if (!night) return [];
    const ring = ownChairs.filter((c) => night.alive.includes(c));
    if (ring.length === 0) return [];
    let starts = ring.map((_, i) => i);
    const witch = ring.findIndex((c) => cardOf(c)?.role === "witch");
    if (witch >= 0 && ring.some((c) => cardOf(c)?.role === "wolf")) {
      starts = [];
      for (let k = 1; k <= ring.length; k += 1) {
        const i = (witch + k) % ring.length;
        starts.push(i);
        if (cardOf(ring[i])?.role === "wolf") break;
      }
    }
    const start = starts[spread(`${night.game ?? ""}:${night.night}`) % starts.length];
    return [...ring.slice(start), ...ring.slice(0, start)].filter((c) => !night.done.includes(c));
  })();

  const turnChair = order[0] ?? null;
  const held = looking && ww && looking.night === ww.night && ownChairs.includes(looking.chair) ? looking.chair : null;
  const open = held ?? (!sharing ? turnChair : null);
  const pendingVote = ww?.phase === "day" ? ownChairs.filter((c) => ww.alive.includes(c) && !(c in ww.votes)) : [];
  const huntsman = ww?.phase === "hunter" && ww.hunter && ownChairs.includes(ww.hunter) ? ww.hunter : null;

  const headline = !ww
    ? t("sit down, choose the roles, then deal")
    : ww.phase === "over"
      ? ww.winner === "wolves"
        ? t("the wolves have taken the village")
        : t("the village is safe: every wolf is dead")
      : ww.phase === "night"
        ? t("night {n}: the village sleeps", { n: ww.night })
        : ww.phase === "day"
          ? t("day {n}: who is a wolf?", { n: ww.night })
          : t("the hunter is taking aim");

  return (
    <div className="surface grain @container relative flex size-full flex-col gap-2 overflow-hidden rounded-2xl p-2.5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-muted/70">
        {!playing && (
          <span className="flex items-center gap-0.5">
            <button type="button" disabled={!canEdit || state.seatCount <= MIN_SEATS} onClick={() => resize(-1)} aria-label={t("one chair fewer")} className="grid size-7 place-items-center rounded disabled:opacity-30">
              <Minus className="size-3" />
            </button>
            <span>{t("{n} chairs", { n: state.seatCount })}</span>
            <button type="button" disabled={!canEdit || state.seatCount >= MAX_SEATS} onClick={() => resize(1)} aria-label={t("one chair more")} className="grid size-7 place-items-center rounded disabled:opacity-30">
              <Plus className="size-3" />
            </button>
          </span>
        )}
        {playing && ww && (
          <span className="flex items-center gap-1 text-chalk/80">
            {ww.phase === "night" ? <Moon className="size-3.5" /> : <Sun className="size-3.5 text-warm" />}
            {ww.phase === "night" ? t("{done} of {alive} done with the night", { done: ww.done.length, alive: ww.alive.length }) : t("{n} alive", { n: ww.alive.length })}
          </span>
        )}
        <button type="button" onClick={() => setRules(true)} className="ml-auto flex min-h-7 items-center gap-1 rounded-lg px-1.5 hover:bg-white/8 hover:text-chalk">
          <BookOpen className="size-3" />
          {t("rules")}
        </button>
      </div>

      {/* The village */}
      <div className="grid grid-cols-2 gap-1.5 @sm:grid-cols-3 @2xl:grid-cols-4">
        {(playing ? village : allChairs).map((chair) => {
          const who = state.seats[chair];
          const dead = ww?.dead.find((d) => d.chair === chair);
          const shown = ww?.roles?.[chair] ?? dead?.role;
          const votes = ww?.phase === "day" ? (tally(ww.votes, ww.alive).against[chair] ?? 0) : 0;
          return (
            <button
              key={chair}
              type="button"
              disabled={!canEdit || !me || playing}
              title={dead ? t(howTheyDied(dead.how)) : undefined}
              onClick={() => me && void write({ ...state, ...claimChair(state.seats, holders, chair, me) })}
              className={clsx(
                "flex min-h-11 min-w-0 items-center gap-1.5 rounded-xl px-2 text-left transition disabled:cursor-default",
                dead ? "bg-white/3 opacity-60" : chair === myChair ? "bg-white/12 ring-1 ring-glow/45" : "bg-white/5",
              )}
            >
              {dead && <Skull className="size-3.5 shrink-0 text-muted" />}
              <span className={clsx("min-w-0 flex-1 truncate text-[11px]", who ? "text-chalk" : "text-muted/60", dead && "line-through")}>{label(chair)}</span>
              {shown && (
                <span className="shrink-0 rounded px-1 text-[9px] font-semibold text-[#1b1a22]" style={{ background: ROLE_TINT[shown] }}>
                  {t(ROLE_NAME[shown])}
                </span>
              )}
              {night && !dead && night.done.includes(chair) && <span className="size-1.5 shrink-0 rounded-full bg-glow/80" title={t("done with the night")} />}
              {votes > 0 && <span className="shrink-0 rounded-full bg-[#d65a5a] px-1.5 text-[10px] font-bold text-white tabular-nums">{votes}</span>}
            </button>
          );
        })}
      </div>

      {/* The narrator */}
      <div
        className={clsx(
          "relative flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto rounded-xl p-3 inset-ring inset-ring-black/30",
          night ? "bg-[radial-gradient(ellipse_at_top,#26294a_0%,#121427_75%)]" : "bg-[radial-gradient(ellipse_at_top,#4a3a2a_0%,#1f1914_75%)]",
        )}
      >
        <p className="text-center text-[13px] font-semibold text-chalk">{headline}</p>

        {ww?.phase === "day" && (
          <p className="text-center text-[11px] text-chalk/80">
            {ww.morning.length === 0
              ? t("nobody died in the night")
              : ww.morning
                  .map((c) => t("{who} was found dead -- a {role}", { who: label(c), role: t(ROLE_NAME[ww.dead.find((d) => d.chair === c)?.role ?? "villager"]) }))
                  .join(" · ")}
          </p>
        )}

        {/* Setting up, and starting again */}
        {!playing && (
          <Setup setup={state.setup} players={dealing.length} canEdit={canEdit} busy={busy} again={Boolean(ww)} onChange={setSetup} onDeal={() => void deal()} />
        )}

        {/* Your own card, whenever you want a look */}
        {playing && myChair && !sharing && cardOf(myChair) && (
          <div className="mx-auto w-full max-w-sm">
            <button type="button" onClick={() => setShowCard((v) => !v)} className="flex min-h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-white/8 text-[11px] text-chalk">
              {showCard ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
              {showCard ? t("hide your card") : t("look at your card")}
            </button>
            {showCard && <RoleCard notesKey={notesKey(myChair)} chair={myChair} card={cardOf(myChair)!} label={label} />}
          </div>
        )}

        {/* The night, for whoever holds the phone */}
        {ww && open && cardOf(open) ? (
          <NightTurn
            key={`${ww.game}:${ww.night}:${open}`}
            notesKey={notesKey(open)}
            chair={open}
            card={cardOf(open)!}
            ww={ww}
            label={label}
            busy={busy}
            showCardToo={sharing}
            act={act}
            ask={ask}
            onHold={() => setLooking({ chair: open, night: ww.night })}
            onDone={() => setLooking(null)}
          />
        ) : (
          night &&
          turnChair &&
          sharing && (
            <button
              type="button"
              onClick={() => setLooking({ chair: turnChair, night: night.night })}
              className="mx-auto flex min-h-12 w-full max-w-sm items-center justify-center gap-2 rounded-xl bg-white/10 px-3 text-[12px] text-chalk"
            >
              <Eye className="size-4 shrink-0" />
              {t("pass the phone to {turn}, then tap to look", { turn: label(turnChair) })}
            </button>
          )
        )}
        {night && !turnChair && ownChairs.some((c) => night.alive.includes(c)) && (
          <p className="text-center text-[11px] text-chalk/60">{sharing ? t("everyone on this phone is done. waiting for the others...") : t("your night is done. waiting for the others...")}</p>
        )}

        {/* The day's vote */}
        {ww?.phase === "day" && <DayVote ww={ww} voters={pendingVote} sharing={sharing} label={label} busy={busy} onVote={(c, target) => void vote(c, target)} />}

        {/* The hunter's last shot */}
        {huntsman && ww && (
          <div className="mx-auto w-full max-w-sm space-y-1.5">
            <p className="flex items-center justify-center gap-1.5 text-[12px] text-warm">
              <Crosshair className="size-4 shrink-0" />
              {t("{who}, the hunter, takes someone with them:", { who: label(huntsman) })}
            </p>
            <div className="grid grid-cols-2 gap-1">
              {ww.alive.map((c) => (
                <button key={c} type="button" disabled={busy} onClick={() => void shoot(huntsman, c)} className="min-h-10 truncate rounded-lg bg-white/8 px-2 text-[12px] text-chalk hover:bg-white/14">
                  {label(c)}
                </button>
              ))}
            </div>
          </div>
        )}
        {ww?.phase === "hunter" && !huntsman && ww.hunter && <p className="text-center text-[11px] text-chalk/60">{t("waiting for {who} to shoot...", { who: label(ww.hunter) })}</p>}

        {ww && ww.log.length > 0 && <p className="mt-auto pt-1 text-center text-[10px] text-chalk/45">{t(ww.log.at(-1)!)}</p>}
      </div>

      {rules && (
        <RulesSheet title={t("how werewolf goes")} onClose={() => setRules(false)}>
          <p>{t("Somewhere in the village are werewolves. Each night they kill; each day the village argues, votes, and puts someone to death. The village wins when the last wolf is dead; the wolves win when there are as many of them as everyone else.")}</p>
          <p>{t("Nobody has to sit out as narrator: the table runs itself. The cards are dealt and kept by the server, so not even whoever dealt can see them. At night everybody does something, even the villagers (they sleep), so nobody can tell who has a power by who is still busy.")}</p>
          <h4>{t("the roles")}</h4>
          {(Object.keys(ROLE_NAME) as Role[]).map((role) => (
            <p key={role}>
              <b style={{ color: ROLE_TINT[role] }}>{t(ROLE_NAME[role])}</b> -- {t(ROLE_DOES[role])}
            </p>
          ))}
          <p>{t("A day's vote kills whoever has the most votes, as long as they have more than the runner-up and more than the people sparing everyone. Otherwise nobody dies that day.")}</p>
          <p className="text-muted/60">{t("With four or more sitting down, only they are dealt in. With fewer, every chair is, and one phone goes round for the empty ones: each player looks at their own card, plays their night, and passes it on.")}</p>
        </RulesSheet>
      )}
    </div>
  );
}

function Toggle({ on, onClick, label, disabled }: { on: boolean; onClick: () => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-pressed={on}
      className={clsx("min-h-9 rounded-lg px-3 text-[11px] transition disabled:opacity-40", on ? "bg-chalk font-semibold text-[#1b1a22]" : "bg-white/7 text-muted hover:text-chalk")}
    >
      {t(label)}
    </button>
  );
}

function Setup({
  setup,
  players,
  canEdit,
  busy,
  again,
  onChange,
  onDeal,
}: {
  setup: WerewolfSetup;
  players: number;
  canEdit: boolean;
  busy: boolean;
  again: boolean;
  onChange: (patch: Partial<WerewolfSetup>) => void;
  onDeal: () => void;
}) {
  const most = Math.max(1, Math.floor((players - 1) / 2));
  const ok = fits(setup, players);
  return (
    <div className="mx-auto w-full max-w-md space-y-2.5 py-1">
      <p className="text-center text-[10px] text-chalk/55">{t("{n} players will be dealt in", { n: players })}</p>
      <div className="flex items-center justify-center gap-2">
        <span className="text-[11px] text-chalk/80">{t("wolves")}</span>
        <button type="button" disabled={!canEdit || setup.wolves <= 1} onClick={() => onChange({ wolves: setup.wolves - 1 })} aria-label={t("one wolf fewer")} className="grid size-8 place-items-center rounded-lg bg-white/7 disabled:opacity-30">
          <Minus className="size-3.5" />
        </button>
        <span className="w-5 text-center text-[15px] font-bold text-[#e07a7a] tabular-nums">{setup.wolves}</span>
        <button type="button" disabled={!canEdit || setup.wolves >= most} onClick={() => onChange({ wolves: setup.wolves + 1 })} aria-label={t("one wolf more")} className="grid size-8 place-items-center rounded-lg bg-white/7 disabled:opacity-30">
          <Plus className="size-3.5" />
        </button>
      </div>
      <div className="flex flex-wrap justify-center gap-1">
        <Toggle on={setup.seer} label="seer" disabled={!canEdit} onClick={() => onChange({ seer: !setup.seer })} />
        <Toggle on={setup.doctor} label="doctor" disabled={!canEdit} onClick={() => onChange({ doctor: !setup.doctor })} />
        <Toggle on={setup.hunter} label="hunter" disabled={!canEdit} onClick={() => onChange({ hunter: !setup.hunter })} />
        <Toggle on={setup.witch} label="witch" disabled={!canEdit} onClick={() => onChange({ witch: !setup.witch })} />
      </div>
      {!ok && <p className="text-center text-[10px] text-[#f2a4b8]">{setup.wolves > most ? t("too many wolves for this many players") : t("too many roles for this many players")}</p>}
      <button
        type="button"
        disabled={!canEdit || busy || !ok}
        onClick={onDeal}
        className="mx-auto flex min-h-11 items-center gap-2 rounded-xl bg-[#f7f4ee] px-5 text-[13px] font-semibold text-[#1b1a22] shadow-lg active:scale-95 disabled:opacity-50"
      >
        <Moon className="size-4" />
        {again ? t("a new game") : t("deal the cards")}
      </button>
    </div>
  );
}

/** A role card, and what this phone has learned with it. */
function RoleCard({ notesKey, chair, card, label }: { notesKey: string; chair: string; card: Card; label: (c: string) => string }) {
  const [notes] = useNotes(notesKey);
  const tint = ROLE_TINT[card.role];
  return (
    <div className="mt-2 rounded-xl p-3 text-center" style={{ background: `${tint}22`, boxShadow: `inset 0 0 0 2px ${tint}88` }}>
      <p className="text-[18px] font-bold" style={{ color: tint }}>
        {t(ROLE_NAME[card.role])}
      </p>
      <p className="mt-1 text-[11px] leading-snug text-chalk/80">{t(ROLE_DOES[card.role])}</p>
      {card.role === "wolf" && card.wolves.length > 1 && (
        <p className="mt-1.5 text-[11px] text-[#e07a7a]">
          {t("your pack: {wolves}", {
            wolves: card.wolves
              .filter((w) => w !== chair)
              .map(label)
              .join(", "),
          })}
        </p>
      )}
      {notes.seen.length > 0 && (
        <p className="mt-1.5 text-[10px] text-chalk/70">
          {notes.seen.map((s) => t("night {n}: {who} is a {role}", { n: s.night, who: label(s.target), role: t(ROLE_NAME[s.role]) })).join(" · ")}
        </p>
      )}
    </div>
  );
}

/** One player's night: their card, and the one thing they get to do. */
function NightTurn({
  notesKey,
  chair,
  card,
  ww,
  label,
  busy,
  showCardToo,
  act,
  ask,
  onHold,
  onDone,
}: {
  notesKey: string;
  chair: string;
  card: Card;
  ww: Narration;
  label: (c: string) => string;
  busy: boolean;
  showCardToo: boolean;
  act: (chair: string, kind: string, target?: string | null) => Promise<Reply | undefined>;
  ask: (chair: string) => Promise<Reply>;
  onHold: () => void;
  onDone: () => void;
}) {
  const [notes, saveNotes] = useNotes(notesKey);
  const [seen, setSeen] = useState<{ target: string; role: Role } | null>(null);
  const [told, setTold] = useState<Answer | null>(null);
  const [poisoning, setPoisoning] = useState(false);
  const [alsoHeal, setAlsoHeal] = useState(false);
  const asked = useRef(-1);
  const others = ww.alive.filter((c) => c !== chair);
  const isNight = ww.phase === "night";

  // The witch is told whom the wolves chose, once they all have. Ask again whenever someone finishes.
  const doneCount = ww.done.length;
  const waiting = card.role === "witch" && isNight && (!told || Boolean(told.waiting));
  useEffect(() => {
    if (!waiting || asked.current === doneCount) return;
    asked.current = doneCount;
    void ask(chair).then((reply) => {
      if (reply.data) setTold(reply.data);
    });
  }, [waiting, doneCount, chair, ask]);

  // The night ended while the seer was still reading their answer: keep showing only that.
  if (!isNight && !seen) return null;

  const finish = async (kind: string, target: string | null = null) => {
    if (kind === "see") onHold();
    const reply = await act(chair, kind, target);
    if (!reply || reply.error) return;
    if (kind === "see" && reply.data?.role && target) {
      setSeen({ target, role: reply.data.role });
      saveNotes({ ...notes, seen: [...notes.seen, { night: ww.night, target, role: reply.data.role }] });
      return;
    }
    if (kind === "save" && target) saveNotes({ ...notes, saved: { night: ww.night, target } });
    onDone();
  };

  const pick = (choices: string[], kind: string, off?: (c: string) => boolean) => (
    <div className="grid grid-cols-2 gap-1">
      {choices.map((c) => (
        <button
          key={c}
          type="button"
          disabled={busy || off?.(c)}
          onClick={() => void finish(kind, c)}
          className="min-h-10 truncate rounded-lg bg-white/8 px-2 text-[12px] text-chalk hover:bg-white/14 disabled:opacity-35"
        >
          {label(c)}
        </button>
      ))}
    </div>
  );

  const victim = told && !told.waiting ? (told.victim ?? null) : undefined;

  return (
    <div className="mx-auto w-full max-w-sm space-y-2">
      {showCardToo && <RoleCard notesKey={notesKey} chair={chair} card={card} label={label} />}

      {card.role === "wolf" && (
        <>
          <p className="text-center text-[12px] text-[#e07a7a]">{t("who do the wolves kill tonight?")}</p>
          {pick(
            others.filter((c) => !card.wolves.includes(c)),
            "kill",
          )}
        </>
      )}

      {card.role === "seer" &&
        (seen ? (
          <>
            <p className="text-center text-[13px] text-chalk">{t("{who} is a {role}", { who: label(seen.target), role: t(ROLE_NAME[seen.role]) })}</p>
            <button type="button" onClick={onDone} className="mx-auto flex min-h-9 items-center rounded-lg bg-white/10 px-4 text-[12px] text-chalk">
              {t("done -- hide it")}
            </button>
          </>
        ) : (
          <>
            <p className="text-center text-[12px] text-[#a99af0]">{t("whose card do you look at?")}</p>
            {pick(others, "see")}
          </>
        ))}

      {card.role === "doctor" && (
        <>
          <p className="text-center text-[12px] text-[#7fd4a8]">{t("who do you sit up with tonight?")}</p>
          {pick(ww.alive, "save", (c) => notes.saved?.night === ww.night - 1 && notes.saved.target === c)}
        </>
      )}

      {card.role === "witch" && (
        <>
          <p className="text-center text-[12px] text-[#c98be0]">
            {victim === undefined ? t("the wolves are still choosing...") : victim ? t("the wolves went for {who}", { who: label(victim) }) : t("the wolves chose nobody")}
          </p>
          {poisoning ? (
            <>
              <p className="text-center text-[11px] text-chalk/70">{t("poison whom?")}</p>
              {pick(others, alsoHeal ? "both" : "poison")}
              {victim && told?.heal && (
                <label className="flex min-h-8 items-center justify-center gap-1.5 text-[11px] text-chalk/80">
                  <input type="checkbox" checked={alsoHeal} onChange={(e) => setAlsoHeal(e.target.checked)} />
                  {t("and save {who} too", { who: label(victim) })}
                </label>
              )}
              <button type="button" onClick={() => setPoisoning(false)} className="mx-auto block min-h-8 text-[11px] text-muted">
                {t("cancel")}
              </button>
            </>
          ) : (
            <div className="flex flex-wrap justify-center gap-1">
              <button type="button" disabled={busy || !victim || !told?.heal} onClick={() => void finish("heal")} className="min-h-10 rounded-lg bg-[#5bc08f]/25 px-3 text-[12px] text-[#9ee0bd] disabled:opacity-35">
                {told && !told.heal ? t("no healing left") : t("save them")}
              </button>
              <button type="button" disabled={busy || victim === undefined || !told?.poison} onClick={() => setPoisoning(true)} className="min-h-10 rounded-lg bg-[#b067c9]/25 px-3 text-[12px] text-[#d9a6ec] disabled:opacity-35">
                {told && !told.poison ? t("no poison left") : t("poison someone")}
              </button>
              <button type="button" disabled={busy || victim === undefined} onClick={() => void finish("pass")} className="min-h-10 rounded-lg bg-white/8 px-3 text-[12px] text-chalk disabled:opacity-35">
                {t("do nothing")}
              </button>
            </div>
          )}
        </>
      )}

      {(card.role === "villager" || card.role === "hunter") && (
        <button type="button" disabled={busy} onClick={() => void finish("sleep")} className="mx-auto flex min-h-11 items-center gap-2 rounded-xl bg-white/10 px-5 text-[12px] text-chalk">
          <Moon className="size-4" />
          {t("close your eyes")}
        </button>
      )}
    </div>
  );
}

function DayVote({
  ww,
  voters,
  sharing,
  label,
  busy,
  onVote,
}: {
  ww: Narration;
  voters: string[];
  sharing: boolean;
  label: (c: string) => string;
  busy: boolean;
  onVote: (chair: string, target: string) => void;
}) {
  const voter = voters[0];
  const { cast } = tally(ww.votes, ww.alive);
  return (
    <div className="mx-auto w-full max-w-sm space-y-1.5">
      <p className="text-center text-[11px] text-chalk/70">{t("{cast} of {alive} have voted", { cast, alive: ww.alive.length })}</p>
      {voter ? (
        <>
          <p className="flex items-center justify-center gap-1.5 text-[12px] text-chalk">
            <Vote className="size-4 shrink-0" />
            {sharing ? t("{who} votes to put to death:", { who: label(voter) }) : t("you vote to put to death:")}
          </p>
          <div className="grid grid-cols-2 gap-1">
            {ww.alive
              .filter((c) => c !== voter)
              .map((c) => (
                <button key={c} type="button" disabled={busy} onClick={() => onVote(voter, c)} className="min-h-10 truncate rounded-lg bg-white/8 px-2 text-[12px] text-chalk hover:bg-[#d65a5a]/30">
                  {label(c)}
                </button>
              ))}
          </div>
          <button type="button" disabled={busy} onClick={() => onVote(voter, "skip")} className="mx-auto flex min-h-9 items-center rounded-lg bg-white/6 px-4 text-[11px] text-muted hover:text-chalk">
            {t("spare everyone today")}
          </button>
        </>
      ) : (
        <p className="text-center text-[11px] text-chalk/60">{t("waiting for the rest of the village to vote...")}</p>
      )}
      <div className="flex flex-wrap justify-center gap-x-2 gap-y-0.5 text-[10px] text-chalk/50">
        {Object.entries(ww.votes)
          .filter(([v]) => ww.alive.includes(v))
          .map(([v, target]) => (
            <span key={v}>{target === "skip" ? t("{who} spares everyone", { who: label(v) }) : t("{who} -> {target}", { who: label(v), target: label(target) })}</span>
          ))}
      </div>
    </div>
  );
}
