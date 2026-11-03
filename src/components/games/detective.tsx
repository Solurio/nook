"use client";

import { useMemo, useState } from "react";
import clsx from "clsx";
import { BookOpen, DoorOpen, Eye, Footprints, Gavel, Mail, Minus, NotebookPen, Plus, Sword, UserRound } from "lucide-react";
import { useRoom } from "@/realtime/room-provider";
import { usePiles } from "@/realtime/use-piles";
import { useHandOver } from "@/realtime/use-hand-over";
import { useRoomStore } from "@/state/room-store";
import { chairOf, claimChair } from "@/lib/seats";
import {
  DECK,
  MAX_SEATS,
  MIN_SEATS,
  ROOMS,
  SUSPECTS,
  WEAPONS,
  adjacent,
  canShow,
  cardKind,
  cardName,
  chairsFor,
  emptyDetective,
  handSlot,
  known,
  passageFrom,
  readHand,
  readSeen,
  seenSlot,
  tintOf,
  type Case,
  type DetectiveState,
  type Shown,
  type Suggestion,
} from "@/lib/detective";
import type { Item } from "@/lib/types";
import RulesSheet from "./rules-sheet";
import { t } from "@/lib/i18n";

const upgrade = (raw: unknown): DetectiveState => ({ ...emptyDetective(), ...((raw ?? {}) as Partial<DetectiveState>) });

/** One colour per chair, for the pieces on the plan of the house. */
const CHAIR_TINT = ["#e8a33d", "#5aa9e6", "#e05d8a", "#6cc28a", "#a98be8", "#e07a4f"];

type Mark = "no" | "maybe";

/** The notebook's own marks, kept on this phone, per game and per chair. */
function useMarks(key: string) {
  const [marks, setMarks] = useState<Record<string, Mark>>(() => {
    try {
      return JSON.parse(window.localStorage.getItem(key) ?? "{}") as Record<string, Mark>;
    } catch {
      return {};
    }
  });
  const cycle = (card: string) => {
    const next = { ...marks };
    if (!next[card]) next[card] = "no";
    else if (next[card] === "no") next[card] = "maybe";
    else delete next[card];
    setMarks(next);
    try {
      window.localStorage.setItem(key, JSON.stringify(next));
    } catch {
      // Remembered for this visit only.
    }
  };
  return [marks, cycle] as const;
}

function KindIcon({ card, className }: { card: string; className?: string }) {
  const kind = cardKind(card);
  if (kind === "s") return <UserRound className={className} style={{ color: tintOf(card) ?? undefined }} />;
  if (kind === "w") return <Sword className={className} />;
  return <DoorOpen className={className} />;
}

function CardChip({ card, onClick, disabled, active, small }: { card: string; onClick?: () => void; disabled?: boolean; active?: boolean; small?: boolean }) {
  const body = (
    <>
      <KindIcon card={card} className={clsx("shrink-0", small ? "size-3" : "size-3.5")} />
      <span className="truncate">{t(cardName(card))}</span>
    </>
  );
  const look = clsx(
    "flex min-w-0 items-center gap-1 rounded-lg transition",
    small ? "min-h-7 px-1.5 text-[10px]" : "min-h-9 px-2 text-[11px]",
    active ? "bg-chalk font-semibold text-[#1b1a22]" : "bg-white/8 text-chalk",
  );
  return onClick ? (
    <button type="button" onClick={onClick} disabled={disabled} className={clsx(look, "hover:bg-white/14 disabled:opacity-35", active && "hover:bg-chalk")}>
      {body}
    </button>
  ) : (
    <span className={look}>{body}</span>
  );
}

/**
 * Detective. The envelope is a pile nobody can read; every hand is a secret
 * pile; and when you suggest, the database goes round the table and answers
 * for everyone, so nobody can pretend not to hold a card. With nobody
 * sitting, one phone goes round: each player looks only when it is theirs.
 */
export default function Detective({ item, state: raw }: { item: Item<"game">; state: unknown }) {
  const { updateData, pile, canEdit } = useRoom();
  const me = useRoomStore((s) => s.me);
  const state = useMemo(() => upgrade(raw), [raw]);
  const [busy, setBusy] = useState(false);
  const [rules, setRules] = useState(false);
  const [notebook, setNotebook] = useState(false);
  const [looking, setLooking] = useState<string | null>(null);
  const [accusing, setAccusing] = useState(false);
  const [pickS, setPickS] = useState<string | null>(null);
  const [pickW, setPickW] = useState<string | null>(null);
  const [pickR, setPickR] = useState<string | null>(null);
  const [verdict, setVerdict] = useState<{ chair: string; answer: string[] } | null>(null);

  const allChairs = chairsFor(state.seatCount);
  const holders = useMemo(() => state.holders ?? {}, [state.holders]);
  const myChair = chairOf(state.seats, holders, me);
  const mine = usePiles(item.id, state.piles);
  useHandOver(item.id, state.piles, holders);
  const cs = state.cs;
  const playing = cs?.phase === "play";

  const table = cs ? cs.chairs : allChairs;
  const label = (chair: string) => state.seats[chair] ?? t("seat {n}", { n: allChairs.indexOf(chair) + 1 });
  const tint = (chair: string) => CHAIR_TINT[allChairs.indexOf(chair) % CHAIR_TINT.length];
  const handOf = (chair: string) => readHand(mine[handSlot(chair)] as unknown[] | undefined);
  const seenOf = (chair: string) => readSeen(mine[seenSlot(chair)] as unknown[] | undefined);
  /** The chairs this phone plays for: your own, and any empty chair whose hand it was dealt. */
  const ownChairs = table.filter((c) => Boolean(mine[handSlot(c)]) && (c === myChair || !holders[c]));
  const sharing = ownChairs.length > 1;

  // Who this phone has to hand things to right now: the one answering a suggestion, or whoever's turn it is.
  const actor = !cs || !playing ? null : cs.pending && ownChairs.includes(cs.pending.by!) ? cs.pending.by : cs.pending ? null : ownChairs.includes(cs.turn) ? cs.turn : null;
  const viewer = actor && (!sharing || looking === actor) ? actor : !sharing && myChair && ownChairs.includes(myChair) ? myChair : null;

  const write = (next: DetectiveState) => {
    const copy = { ...next } as DetectiveState & Record<string, unknown>;
    delete copy.cs;
    delete copy.piles;
    delete copy.revealed;
    return updateData(item.id, { game: "detective", state: copy } as never);
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

  const clearPicks = () => {
    setPickS(null);
    setPickW(null);
    setPickR(null);
    setAccusing(false);
  };

  // ---------------------------------------------------------------------------

  const resize = (by: number) => {
    const count = Math.max(MIN_SEATS, Math.min(MAX_SEATS, state.seatCount + by));
    const keep = chairsFor(count);
    void write({
      ...state,
      seatCount: count,
      seats: Object.fromEntries(keep.map((c) => [c, state.seats[c] ?? null])),
      holders: Object.fromEntries(keep.map((c) => [c, holders[c] ?? null])),
    });
  };

  const seated = allChairs.filter((c) => holders[c]);
  const dealing = seated.length >= MIN_SEATS ? seated : allChairs;

  const deal = () =>
    run(async () => {
      if (!me) return;
      setLooking(null);
      setVerdict(null);
      clearPicks();
      await pile("detective_deal", { p_item: item.id, p_chairs: dealing, p_owners: dealing.map((c) => holders[c] ?? me.userId), p_deck: DECK });
    });

  const move = (room: number) => actor && run(() => pile("detective_move", { p_item: item.id, p_chair: actor, p_room: room }));
  const suggest = () =>
    actor &&
    pickS &&
    pickW &&
    run(async () => {
      const res = await pile("detective_suggest", { p_item: item.id, p_chair: actor, p_suspect: pickS, p_weapon: pickW });
      if (!res.error) clearPicks();
    });
  const show = (card: string) => actor && run(() => pile("detective_show", { p_item: item.id, p_chair: actor, p_card: card }));
  const end = () =>
    actor &&
    run(async () => {
      const res = await pile("detective_end", { p_item: item.id, p_chair: actor });
      if (!res.error) {
        clearPicks();
        setLooking(null);
      }
    });
  const accuse = () =>
    actor &&
    pickS &&
    pickW &&
    pickR &&
    run(async () => {
      const chair = actor;
      const res = await pile<{ right: boolean; answer: string[] }>("detective_accuse", { p_item: item.id, p_chair: chair, p_suspect: pickS, p_weapon: pickW, p_room: pickR });
      if (res.error || !res.data) return;
      clearPicks();
      // Wrong: you alone see what was in the envelope, until you put the phone down.
      if (!res.data.right) setVerdict({ chair, answer: res.data.answer });
    });

  // ---------------------------------------------------------------------------

  const here = cs && viewer ? cs.at[viewer] : null;
  const myTurn = Boolean(cs && playing && viewer && viewer === cs.turn && !cs.pending);
  const canMove = myTurn && cs && !cs.moved && !cs.suggested;
  const lastMine = cs && viewer ? [...cs.history].reverse().find((h) => h.from === viewer && h.turn === cs.turns) : undefined;
  const seenNow = viewer && lastMine?.by ? seenOf(viewer).find((s) => s.turn === lastMine.turn && s.by === lastMine.by) : undefined;

  const headline = !cs
    ? t("sit down and deal: the answer goes into the envelope")
    : cs.phase === "over"
      ? cs.winner
        ? t("{who} solved it", { who: label(cs.winner) })
        : t("nobody solved it")
      : cs.pending
        ? t("{who} is choosing a card to show {to}", { who: label(cs.pending.by!), to: label(cs.pending.from) })
        : t("{who}'s turn", { who: label(cs.turn) });

  const describe = (h: Suggestion) => {
    const [s, w, r] = h.cards;
    const asked = t("{who} suggested {suspect}, with the {weapon}, in the {room}", { who: label(h.from), suspect: t(cardName(s)), weapon: t(cardName(w)), room: t(cardName(r)) });
    const passed = h.passed.length ? t("{who} could not answer", { who: h.passed.map(label).join(", ") }) : "";
    const answered = h.by ? t("{who} showed a card", { who: label(h.by) }) : t("nobody could answer");
    return [asked, passed, answered].filter(Boolean).join(" · ");
  };

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
        <span className="min-w-0 truncate text-[11px] font-semibold text-chalk">{headline}</span>
        <span className="ml-auto flex items-center gap-1">
          {viewer && (
            <button type="button" onClick={() => setNotebook(true)} className="flex min-h-7 items-center gap-1 rounded-lg px-1.5 hover:bg-white/8 hover:text-chalk">
              <NotebookPen className="size-3" />
              {t("notebook")}
            </button>
          )}
          <button type="button" onClick={() => setRules(true)} className="flex min-h-7 items-center gap-1 rounded-lg px-1.5 hover:bg-white/8 hover:text-chalk">
            <BookOpen className="size-3" />
            {t("rules")}
          </button>
        </span>
      </div>

      {/* Who is at the table */}
      <div className="flex flex-wrap gap-1">
        {(playing ? table : allChairs).map((chair) => {
          const out = cs?.out.includes(chair);
          const size = state.piles?.[handSlot(chair)]?.size;
          return (
            <button
              key={chair}
              type="button"
              disabled={!canEdit || !me || playing}
              onClick={() => me && void write({ ...state, ...claimChair(state.seats, holders, chair, me) })}
              className={clsx(
                "flex min-h-9 min-w-0 max-w-[48%] items-center gap-1.5 rounded-xl px-2 text-[11px] transition disabled:cursor-default @md:max-w-[32%]",
                cs?.turn === chair && playing ? "bg-white/14 ring-1 ring-chalk/50" : chair === myChair ? "bg-white/10" : "bg-white/5",
                out && "opacity-50",
              )}
            >
              <span className="size-2.5 shrink-0 rounded-full" style={{ background: tint(chair) }} />
              <span className={clsx("min-w-0 truncate", state.seats[chair] ? "text-chalk" : "text-muted/60", out && "line-through")}>{label(chair)}</span>
              {playing && size !== undefined && <span className="shrink-0 text-[9px] text-muted tabular-nums">{t("{n} cards", { n: size })}</span>}
            </button>
          );
        })}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2 @xl:flex-row">
        {/* The house */}
        <div className="grid aspect-square w-full max-w-[22rem] shrink-0 grid-cols-3 gap-1 self-center rounded-xl bg-[#2a2220] p-1 inset-ring inset-ring-black/30 @xl:max-w-[50%] @xl:self-start">
          {ROOMS.map((room, i) => {
            const people = cs ? table.filter((c) => cs.at[c] === i) : [];
            const lit = Boolean(canMove && here !== null && adjacent(here, i));
            const passage = passageFrom(i);
            const solved = cs?.phase === "over" && cs.answer?.includes(`r:${room.id}`);
            return (
              <button
                key={room.id}
                type="button"
                disabled={!lit || busy}
                onClick={() => void move(i)}
                className={clsx(
                  "relative flex min-w-0 flex-col items-center justify-between overflow-hidden rounded-lg p-1 text-center transition disabled:cursor-default",
                  lit ? "bg-[#5b4a36] ring-2 ring-[#f2c879]/70 hover:bg-[#6b573f]" : "bg-[#3b302b]",
                  here === i && "inset-ring-2 inset-ring-chalk/40",
                  solved && "ring-2 ring-[#f26b6b]",
                )}
              >
                <span className="w-full truncate text-[9px] leading-tight text-[#e8dccb] @md:text-[10px]">{t(room.name)}</span>
                <span className="flex flex-wrap justify-center gap-0.5">
                  {people.map((c) => (
                    <span key={c} title={label(c)} className="grid size-4 place-items-center rounded-full text-[8px] font-bold text-[#1b1a22] ring-1 ring-black/30" style={{ background: tint(c) }}>
                      {label(c).slice(0, 1).toUpperCase()}
                    </span>
                  ))}
                </span>
                {passage !== null && (
                  <span
                    className={clsx("absolute size-2 rotate-45 bg-[#e8dccb]/35", i === 0 && "right-0.5 bottom-0.5", i === 2 && "bottom-0.5 left-0.5", i === 6 && "top-0.5 right-0.5", i === 8 && "top-0.5 left-0.5")}
                    title={t("secret passage to the {room}", { room: t(ROOMS[passage].name) })}
                  />
                )}
              </button>
            );
          })}
        </div>

        {/* The table's side of it */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 overflow-y-auto rounded-xl bg-black/15 p-2">
          {!playing && (
            <div className="space-y-2 py-1 text-center">
              {cs?.phase === "over" && cs.answer && (
                <div className="space-y-1">
                  <p className="text-[11px] text-chalk/80">{t("it was")}</p>
                  <div className="flex flex-wrap justify-center gap-1">
                    {cs.answer.map((c) => (
                      <CardChip key={c} card={c} />
                    ))}
                  </div>
                </div>
              )}
              <p className="text-[10px] text-chalk/55">{t("{n} players will be dealt in", { n: dealing.length })}</p>
              <button
                type="button"
                disabled={!canEdit || busy || dealing.length < MIN_SEATS}
                onClick={() => void deal()}
                className="mx-auto flex min-h-11 items-center gap-2 rounded-xl bg-[#f7f4ee] px-5 text-[13px] font-semibold text-[#1b1a22] shadow-lg active:scale-95 disabled:opacity-50"
              >
                <Mail className="size-4" />
                {cs ? t("a new case") : t("seal the envelope and deal")}
              </button>
            </div>
          )}

          {/* Handing the phone round */}
          {playing && sharing && actor && looking !== actor && !verdict && (
            <button type="button" onClick={() => setLooking(actor)} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-white/10 px-3 text-[12px] text-chalk">
              <Eye className="size-4 shrink-0" />
              {t("pass the phone to {turn}, then tap to look", { turn: label(actor) })}
            </button>
          )}

          {verdict && (sharing || viewer === verdict.chair) && (
            <div className="space-y-1 rounded-lg bg-[#5a2a2a]/50 p-2 text-center">
              <p className="text-[11px] text-chalk">{t("wrong. you are out, but you still answer. it was:")}</p>
              <div className="flex flex-wrap justify-center gap-1">
                {verdict.answer.map((c) => (
                  <CardChip key={c} card={c} small />
                ))}
              </div>
              <button type="button" onClick={() => setVerdict(null)} className="min-h-8 text-[11px] text-muted hover:text-chalk">
                {t("done -- hide it")}
              </button>
            </div>
          )}

          {/* Your hand */}
          {playing && viewer && (
            <div className="space-y-1">
              <p className="text-[10px] text-muted">{sharing ? t("{who}'s cards", { who: label(viewer) }) : t("your cards")}</p>
              <div className="flex flex-wrap gap-1">
                {handOf(viewer).map((c) => (
                  <CardChip key={c} card={c} small />
                ))}
              </div>
            </div>
          )}

          {/* Answering a suggestion */}
          {playing && cs?.pending && viewer && viewer === cs.pending.by && (
            <div className="space-y-1.5 rounded-lg bg-white/6 p-2">
              <p className="text-[11px] text-chalk">{t("{who} asked about these. Show them one:", { who: label(cs.pending.from) })}</p>
              <div className="flex flex-wrap gap-1">
                {canShow(handOf(viewer), cs.pending.cards).map((c) => (
                  <CardChip key={c} card={c} disabled={busy} onClick={() => void show(c)} />
                ))}
              </div>
            </div>
          )}

          {/* Your turn */}
          {myTurn && cs && viewer && (
            <div className="space-y-1.5 rounded-lg bg-white/6 p-2">
              {!cs.moved && !accusing && (
                <p className="flex items-center gap-1.5 text-[11px] text-chalk">
                  <Footprints className="size-3.5 shrink-0" />
                  {t("move to a room next door: the lit ones")}
                </p>
              )}

              {cs.moved && !cs.suggested && !accusing && (
                <>
                  <p className="text-[11px] text-chalk">{t("in the {room}. Who did it, and with what?", { room: t(ROOMS[cs.at[viewer]].name) })}</p>
                  <Picker cards={cs.suspects.map((s) => `s:${s}`)} picked={pickS} onPick={setPickS} />
                  <Picker cards={cs.weapons.map((w) => `w:${w}`)} picked={pickW} onPick={setPickW} />
                  <button type="button" disabled={busy || !pickS || !pickW} onClick={() => void suggest()} className="min-h-9 w-full rounded-lg bg-chalk text-[12px] font-semibold text-[#1b1a22] disabled:opacity-40">
                    {t("suggest it")}
                  </button>
                </>
              )}

              {cs.suggested && lastMine && !accusing && (
                <p className="text-[11px] text-chalk">
                  {!lastMine.by ? t("nobody could answer.") : seenNow ? t("{who} showed you:", { who: label(lastMine.by) }) : t("{who} answered", { who: label(lastMine.by) })}
                  {seenNow && (
                    <span className="mt-1 flex">
                      <CardChip card={seenNow.card} />
                    </span>
                  )}
                </p>
              )}

              {accusing ? (
                <>
                  <p className="text-[11px] text-[#f2a4a4]">{t("an accusation is checked against the envelope. Wrong, and you are out.")}</p>
                  <Picker cards={cs.suspects.map((s) => `s:${s}`)} picked={pickS} onPick={setPickS} />
                  <Picker cards={cs.weapons.map((w) => `w:${w}`)} picked={pickW} onPick={setPickW} />
                  <Picker cards={cs.rooms.map((r) => `r:${r}`)} picked={pickR} onPick={setPickR} />
                  <div className="flex gap-1">
                    <button type="button" onClick={clearPicks} className="min-h-9 flex-1 rounded-lg bg-white/8 text-[12px] text-chalk">
                      {t("cancel")}
                    </button>
                    <button type="button" disabled={busy || !pickS || !pickW || !pickR} onClick={() => void accuse()} className="min-h-9 flex-1 rounded-lg bg-[#c84b4b] text-[12px] font-semibold text-white disabled:opacity-40">
                      {t("accuse")}
                    </button>
                  </div>
                </>
              ) : (
                <div className="flex gap-1">
                  <button type="button" disabled={busy} onClick={() => setAccusing(true)} className="flex min-h-9 flex-1 items-center justify-center gap-1 rounded-lg bg-[#c84b4b]/25 text-[11px] text-[#f2a4a4]">
                    <Gavel className="size-3.5" />
                    {t("accuse")}
                  </button>
                  <button type="button" disabled={busy} onClick={() => void end()} className="min-h-9 flex-1 rounded-lg bg-white/10 text-[11px] text-chalk">
                    {t("end your turn")}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* What the table has heard */}
          {cs && (cs.history.length > 0 || cs.accused.length > 0) && (
            <div className="space-y-1 border-t border-white/8 pt-1.5">
              {cs.accused.map((a, i) => (
                <p key={`a${i}`} className={clsx("text-[10px] leading-snug", a.right ? "text-[#9ee0bd]" : "text-[#f2a4a4]")}>
                  {a.right ? t("{who} accused, and was right", { who: label(a.chair) }) : t("{who} accused wrongly and is out", { who: label(a.chair) })}
                </p>
              ))}
              {[...cs.history].reverse().map((h, i) => (
                <p key={i} className="text-[10px] leading-snug text-chalk/60">
                  {describe(h)}
                </p>
              ))}
            </div>
          )}
        </div>
      </div>

      {notebook && viewer && cs && <Notebook itemId={item.id} cs={cs} chair={viewer} hand={handOf(viewer)} seen={seenOf(viewer)} label={label} onClose={() => setNotebook(false)} />}

      {rules && (
        <RulesSheet title={t("how detective goes")} onClose={() => setRules(false)}>
          <p>{t("Somebody in the house did it. One suspect, one weapon and one room are sealed in an envelope, and the rest of the cards are dealt out. Be the first to say what is in the envelope.")}</p>
          <p>{t("On your turn, move one room -- up, down, left or right, or through a secret passage between opposite corners. Then you may suggest who did it and with what, in the room you are standing in.")}</p>
          <p>{t("Going round the table from you, the first player holding any of the three cards shows you one, and only you. If they hold more than one, they choose. Everyone sees who could not answer and who did, never the card.")}</p>
          <p>{t("Whenever it is your turn, you can accuse: name a suspect, a weapon and a room. Right, and you have solved it. Wrong, and you are out: you see the answer, keep your cards, and go on answering. If everyone else is out, the last one in wins.")}</p>
          <p>{t("Nobody answers for themselves. The database looks at the hands, so nobody can claim not to hold a card they do.")}</p>
          <p className="text-muted/60">{t("The notebook keeps track for you: your cards and the ones you have been shown are filled in, and you can cross off or circle the rest.")}</p>
        </RulesSheet>
      )}
    </div>
  );
}

function Picker({ cards, picked, onPick }: { cards: string[]; picked: string | null; onPick: (id: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1">
      {cards.map((c) => (
        <CardChip key={c} card={c} small active={picked === c.slice(2)} onClick={() => onPick(c.slice(2))} />
      ))}
    </div>
  );
}

function Notebook({
  itemId,
  cs,
  chair,
  hand,
  seen,
  label,
  onClose,
}: {
  itemId: string;
  cs: Case;
  chair: string;
  hand: string[];
  seen: Shown[];
  label: (c: string) => string;
  onClose: () => void;
}) {
  const [marks, cycle] = useMarks(`nook.dt.${itemId}.${cs.game}.${chair}`);
  const sure = known(hand, seen);
  const groups: Array<[string, string[]]> = [
    ["suspects", cs.suspects.map((s) => `s:${s}`)],
    ["weapons", cs.weapons.map((w) => `w:${w}`)],
    ["rooms", cs.rooms.map((r) => `r:${r}`)],
  ];
  return (
    <RulesSheet title={t("{who}'s notebook", { who: label(chair) })} onClose={onClose}>
      <p className="text-muted/70">{t("Tap a card to cross it off, again to circle it, again to clear it.")}</p>
      {groups.map(([title, cards]) => (
        <div key={title}>
          <h4>{t(title)}</h4>
          <div className="mt-1 grid grid-cols-1 gap-0.5 @sm:grid-cols-2">
            {cards.map((card) => {
              const fact = sure[card];
              const mark = marks[card];
              return (
                <button
                  key={card}
                  type="button"
                  disabled={Boolean(fact)}
                  onClick={() => cycle(card)}
                  className={clsx("flex min-h-8 items-center gap-1.5 rounded-md px-1.5 text-left text-[11px] transition hover:bg-white/6 disabled:cursor-default", (fact || mark === "no") && "text-muted/50 line-through")}
                >
                  <KindIcon card={card} className="size-3.5 shrink-0" />
                  <span className={clsx("min-w-0 flex-1 truncate", mark === "maybe" && "rounded-full px-1 ring-1 ring-[#f2c879]/70")}>{t(cardName(card))}</span>
                  {fact && <span className="shrink-0 text-[9px] text-muted no-underline">{fact.by ? t("shown by {who}", { who: label(fact.by) }) : t("yours")}</span>}
                </button>
              );
            })}
          </div>
        </div>
      ))}
      <p className="text-muted/60">{t("Suspects: {list}", { list: SUSPECTS.map((s) => `${t(s.name)} (${t(s.about)})`).join("; ") })}</p>
      <p className="text-muted/60">{t("Weapons: {list}", { list: WEAPONS.map((w) => t(w.name)).join(", ") })}</p>
    </RulesSheet>
  );
}
