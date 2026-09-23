"use client";

import { useLayoutEffect, useRef, useState } from "react";
import clsx from "clsx";
import {
  ArrowLeft,
  Car,
  Dice5,
  Droplets,
  Gavel,
  Handshake,
  Lock,
  Package,
  Receipt,
  Siren,
  TrainFront,
  X,
  Zap,
} from "lucide-react";
import { useRoom } from "@/realtime/room-provider";
import { useRoomStore } from "@/state/room-store";
import { chairOf, claimChair } from "@/lib/seats";
import {
  BOARD,
  CHANCE,
  CHEST,
  GROUP_COLOR,
  TOKENS,
  answerTrade,
  bid,
  build,
  buildProblem,
  buy,
  chairsFor,
  closeAuction,
  decline,
  deedOf,
  endTurn,
  goBroke,
  housesLeft,
  isOwnable,
  leaveAuction,
  mortgage,
  ownedBy,
  payOut,
  propose,
  rentFor,
  roll,
  sellHouse,
  startGame,
  tradeProblem,
  unmortgage,
  upgradeMonopoly,
  useFreeCard as freeCard,
  worth,
  type Chair,
  type MonopolyState,
  type Space,
  type Trade,
} from "@/lib/monopoly";
import type { Item } from "@/lib/types";
import { t as tx } from "@/lib/i18n";

/** Where each of the forty squares sits on an eleven by eleven board: GO in the bottom right. */
function spot(at: number): { row: number; col: number } {
  if (at <= 10) return { row: 10, col: 10 - at };
  if (at <= 20) return { row: 10 - (at - 10), col: 0 };
  if (at <= 30) return { row: 0, col: at - 20 };
  return { row: at - 30, col: 10 };
}

/** Which way a square faces the middle, for its colour band. */
function side(at: number): "bottom" | "left" | "top" | "right" | "corner" {
  if (at % 10 === 0) return "corner";
  if (at < 10) return "bottom";
  if (at < 20) return "left";
  if (at < 30) return "top";
  return "right";
}

/** A square's name, cut to fit -- or, in another language, its translation. */
function short(name: string) {
  const local = tx(name);
  if (local !== name) return local;
  return name
    .replace(" Avenue", "")
    .replace(" Railroad", " RR")
    .replace("Community Chest", "Chest")
    .replace("Electric Company", "Electric")
    .replace("North Carolina", "N. Carolina")
    .replace("Pennsylvania", "Penn.")
    .replace(" Place", "")
    .replace("Mediterranean", "Mediterr.");
}

function SpaceIcon({ s, className }: { s: Space; className?: string }) {
  const cls = clsx("shrink-0", className);
  switch (s.kind) {
    case "rail":
      return <TrainFront className={cls} />;
    case "utility":
      return s.name.startsWith("Water") ? <Droplets className={cls} /> : <Zap className={cls} />;
    case "tax":
      return <Receipt className={cls} />;
    case "chest":
      return <Package className={cls} />;
    case "chance":
      return <span className={clsx(cls, "font-bold")}>?</span>;
    case "jail":
      return <Lock className={cls} />;
    case "parking":
      return <Car className={cls} />;
    case "gotojail":
      return <Siren className={cls} />;
    case "go":
      return <ArrowLeft className={cls} />;
    default:
      return null;
  }
}

/**
 * Monopoly for two to eight: buy the streets, collect the sets, build, and
 * bleed everyone else dry. The rules are all in lib/monopoly.ts; this is the
 * board, the deeds, and the buttons.
 */
export default function Monopoly({ item, state: raw }: { item: Item<"game">; state: unknown }) {
  const { canEdit, updateDataIf, setNotice } = useRoom();
  const me = useRoomStore((s) => s.me);
  const state = upgradeMonopoly(raw);
  const chairs = chairsFor(state.seatCount);
  const holders = state.holders ?? {};
  const myChair = chairOf(state.seats, holders, me) as Chair | null;
  const open = chairs.every((c) => !state.seats[c]);
  const inGame = state.order;
  const names = (c: Chair) => state.seats[c] ?? tx(`player ${Number(c.slice(1)) + 1}`);

  /** Who this device is playing for right now: its own chair, or on an open table whoever is up. */
  const actor: Chair | null = myChair && inGame.includes(myChair) ? myChair : open ? state.turn : null;
  const myTurn = actor !== null && actor === state.turn && state.phase !== "over";

  const [looking, setLooking] = useState<number | null>(null);
  const [trading, setTrading] = useState(false);
  const [bidAs, setBidAs] = useState<Chair | null>(null);
  const [busy, setBusy] = useState(false);

  const boxRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  useLayoutEffect(() => {
    const node = boxRef.current;
    if (!node) return;
    const observe = new ResizeObserver(([entry]) => setWidth(Math.min(entry.contentRect.width, entry.contentRect.height || entry.contentRect.width)));
    observe.observe(node);
    return () => observe.disconnect();
  }, []);
  const cell = width / 11;
  const roomy = cell >= 46;

  const save = async (make: (fresh: MonopolyState) => MonopolyState | null) => {
    if (!canEdit || busy) return;
    setBusy(true);
    try {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const row = useRoomStore.getState().items[item.id];
        if (!row) return;
        const fresh = upgradeMonopoly((row.data as { state?: unknown }).state);
        const next = make(fresh);
        if (!next || next === fresh) return;
        if (await updateDataIf(item.id, { game: "monopoly", state: next } as never, row.updated_at)) return;
        await new Promise((resolve) => window.setTimeout(resolve, 60 + attempt * 80));
      }
      setNotice("somebody else moved first. try that again.");
    } finally {
      setBusy(false);
    }
  };

  const sit = (c: Chair) => {
    if (!me) return;
    void save((fresh) => ({ ...fresh, ...claimChair(fresh.seats, fresh.holders ?? {}, c, me) }));
  };

  const start = () =>
    void save((fresh) => {
      const seated = chairsFor(fresh.seatCount).filter((c) => fresh.seats[c]);
      const playing = seated.length >= 2 ? seated : chairsFor(fresh.seatCount);
      return startGame(fresh, playing, (c) => fresh.seats[c] ?? `player ${Number(c.slice(1)) + 1}`);
    });

  const pending = state.pending;
  const auction = pending?.kind === "auction" ? pending : null;
  const debt = pending?.kind === "debt" ? pending : null;
  const bidder: Chair | null = myChair && inGame.includes(myChair) ? myChair : open ? (bidAs ?? state.turn) : null;
  const drawnCard = state.drawn ? (state.drawn.deck === "chance" ? CHANCE : CHEST)[state.drawn.card] : null;

  // ---------------------------------------------------------------------------
  // The middle of the board: dice, what just happened, and what to do now
  // ---------------------------------------------------------------------------

  const middle = (() => {
    if (state.phase === "setup") {
      const seated = chairs.filter((c) => state.seats[c]).length;
      return (
        <div className="flex flex-col items-center gap-2 text-center">
          <p className="text-[13px] font-semibold text-chalk">{tx("Monopoly")}</p>
          <p className="max-w-56 text-[11px] text-muted">
            {seated >= 2 ? tx(`${seated} players sitting down.`) : tx("sit down to play, or leave every chair empty and pass one device round.")}
          </p>
          <div className="flex items-center gap-1">
            {[2, 3, 4, 5, 6, 8].map((n) => (
              <button
                key={n}
                type="button"
                disabled={!canEdit}
                onClick={() => void save((fresh) => ({ ...fresh, seatCount: n }))}
                className={clsx("size-7 rounded-md text-[11px]", state.seatCount === n ? "bg-chalk text-ink-950" : "bg-white/7 text-muted")}
              >
                {n}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => void save((fresh) => ({ ...fresh, jackpot: !fresh.jackpot }))}
            className={clsx("rounded-lg px-2 py-1 text-[10px]", state.jackpot ? "bg-glow/25 text-glow" : "bg-white/6 text-muted")}
          >
            {state.jackpot ? tx("Free Parking collects the fines") : tx("Free Parking is just parking")}
          </button>
          <button
            type="button"
            disabled={!canEdit || busy}
            onClick={start}
            className="min-h-10 rounded-xl bg-[#f3ead7] px-4 text-[12px] font-semibold text-[#2a2118] shadow disabled:opacity-40"
          >{tx("start the game")}</button>
        </div>
      );
    }

    const who = names(state.turn);
    const p = state.players[state.turn];
    return (
      <div className="flex w-full flex-col items-center gap-1.5 text-center">
        <p className="text-[12px] text-chalk">
          <span className="mr-1 inline-block size-2.5 rounded-full align-middle" style={{ background: p?.color }} />
          {state.phase === "over" ? tx(`${names(state.winner as Chair)} owns the town`) : myTurn ? tx("your turn") : tx(`${who}'s turn`)}
        </p>
        {state.dice && (
          <div className="flex gap-1.5">
            {state.dice.map((d, i) => (
              <span key={i} className="grid size-8 place-items-center rounded-lg bg-[#f7f5ef] text-[15px] font-bold text-[#1b1a22] shadow">
                {d}
              </span>
            ))}
          </div>
        )}
        {drawnCard && (
          <p className="max-w-60 rounded-lg bg-[#f6e7c1] px-2 py-1 text-[10px] text-[#3a2a12] shadow">
            <span className="font-semibold">{state.drawn?.deck === "chance" ? tx("Chance") : tx("Community Chest")}: </span>
            {tx(drawnCard.text)}
          </p>
        )}

        {/* What there is to do */}
        <div className="flex flex-wrap justify-center gap-1">
          {debt && (actor === debt.who || open) && (
            <>
              <p className="w-full text-[10px] text-amber-200">
                {names(debt.who)}{" "}{tx("owes $")}{-state.players[debt.who].cash}. sell houses or mortgage to raise it.
              </p>
              <Act onClick={() => void save((fresh) => goBroke(fresh, debt.who, names))} danger>{tx("give up")}</Act>
            </>
          )}
          {auction && (
            <div className="flex w-full flex-col items-center gap-1 rounded-xl bg-white/6 p-1.5">
              <p className="text-[11px] text-chalk">
                <Gavel className="mr-1 inline size-3.5" />
                {BOARD[auction.at].name}: {auction.by ? tx(`$${auction.bid} from ${names(auction.by)}`) : tx("no bids yet")}
              </p>
              {open && (
                <select
                  value={bidder ?? ""}
                  onChange={(event) => setBidAs(event.target.value as Chair)}
                  className="h-7 rounded-md bg-white/8 px-1 text-[10px] text-chalk"
                >
                  {inGame
                    .filter((c) => !state.players[c].bankrupt)
                    .map((c) => (
                      <option key={c} value={c}>{tx("bidding as")}{" "}{names(c)}
                      </option>
                    ))}
                </select>
              )}
              {bidder && !auction.out.includes(bidder) && (
                <div className="flex flex-wrap justify-center gap-1">
                  {[10, 50, 100].map((step) => (
                    <Act key={step} onClick={() => void save((fresh) => bid(fresh, bidder, (fresh.pending?.kind === "auction" ? fresh.pending.bid : 0) + step))}>
                      +${step}
                    </Act>
                  ))}
                  <Act onClick={() => void save((fresh) => leaveAuction(fresh, bidder, names))}>{tx("drop out")}</Act>
                </div>
              )}
              {myTurn && (
                <Act onClick={() => void save((fresh) => closeAuction(fresh, names))}>{tx("close the auction")}</Act>
              )}
            </div>
          )}
          {myTurn && pending?.kind === "buy" && (
            <>
              <Act onClick={() => void save((fresh) => buy(fresh, names))} primary disabled={(state.players[state.turn]?.cash ?? 0) < (BOARD[pending.at] as { price: number }).price}>{tx("buy")}{" "}{short(BOARD[pending.at].name)}{" "}{tx("for $")}{(BOARD[pending.at] as { price: number }).price}
              </Act>
              <Act onClick={() => void save((fresh) => decline(fresh, names))}>{tx("auction it")}</Act>
            </>
          )}
          {myTurn && state.phase === "roll" && !pending && (
            <>
              <Act onClick={() => void save((fresh) => roll(fresh, names))} primary>
                <Dice5 className="size-4" /> {state.doubles > 0 ? tx("roll again") : tx("roll")}
              </Act>
              {p?.jailed && (
                <>
                  <Act onClick={() => void save((fresh) => payOut(fresh, names))} disabled={(p?.cash ?? 0) < 50}>{tx("pay $50")}</Act>
                  {p.free.length > 0 && <Act onClick={() => void save((fresh) => freeCard(fresh, names))}>{tx("use the card")}</Act>}
                </>
              )}
            </>
          )}
          {myTurn && state.phase === "moved" && !pending && <Act onClick={() => void save((fresh) => endTurn(fresh))}>{tx("end turn")}</Act>}
          {state.phase !== "over" && actor && inGame.length > 1 && (
            <Act onClick={() => setTrading(true)}>
              <Handshake className="size-3.5" />{" "}{tx("trade")}</Act>
          )}
        </div>

        {/* A trade waiting for an answer */}
        {state.trade && (
          <TradeView
            trade={state.trade}
            names={names}
            canAnswer={actor === state.trade.to || open}
            onAnswer={(yes) => void save((fresh) => answerTrade(fresh, yes, names))}
          />
        )}

        <div className="max-h-16 w-full max-w-64 overflow-y-auto text-[9px] leading-snug text-muted/80 no-scrollbar">
          {state.log.slice(0, 6).map((line, i) => (
            <p key={i} className={i === 0 ? "text-muted" : undefined}>
              {tx(line)}
            </p>
          ))}
        </div>
      </div>
    );
  })();

  return (
    <div className="surface grain flex size-full flex-col gap-1.5 overflow-hidden rounded-2xl p-2">
      {/* The players */}
      <div className="no-scrollbar flex items-center gap-1 overflow-x-auto pb-0.5">
        {(state.phase === "setup" ? chairs : inGame).map((c, i) => {
          const p = state.players[c];
          return (
            <button
              key={c}
              type="button"
              disabled={!canEdit || !me || state.phase !== "setup"}
              onClick={() => sit(c)}
              className={clsx(
                "flex min-h-8 shrink-0 items-center gap-1.5 rounded-xl px-2 text-[11px] transition disabled:cursor-default",
                c === state.turn && state.phase !== "setup" ? "bg-glow/18 ring-1 ring-glow/45" : "bg-white/5",
                p?.bankrupt && "opacity-40 line-through",
              )}
              title={p ? tx(`worth $${worth(state, c)}`) : undefined}
            >
              <span className="size-2.5 rounded-full" style={{ background: p?.color ?? TOKENS[i % TOKENS.length] }} />
              <span className={clsx("max-w-20 truncate", state.seats[c] ? "text-chalk" : "text-muted/60")}>{names(c)}</span>
              {p && <span className="text-[10px] text-emerald-200 tabular-nums">${p.cash}</span>}
              {p?.jailed && <Lock className="size-3 text-muted" />}
            </button>
          );
        })}
      </div>

      {/* The board */}
      <div ref={boxRef} className="relative grid min-h-0 flex-1 place-items-center">
        <div
          className="relative grid rounded-lg bg-[#cfe4d2] p-0.5 shadow-inner"
          style={{ width, height: width, gridTemplateColumns: "repeat(11, 1fr)", gridTemplateRows: "repeat(11, 1fr)" }}
        >
          {BOARD.map((s, at) => {
            const { row, col } = spot(at);
            const d = deedOf(state, at);
            const owner = d ? state.players[d.by] : null;
            const band = s.kind === "street" ? GROUP_COLOR[s.group] : null;
            const facing = side(at);
            const here = inGame.filter((c) => state.players[c] && !state.players[c].bankrupt && state.players[c].at === at);
            return (
              <button
                key={at}
                type="button"
                onClick={() => setLooking(at)}
                className={clsx(
                  "relative flex overflow-hidden border-[0.5px] border-[#6b8f73]/60 bg-[#e7f1e3] text-[#1f2a22] transition hover:brightness-95",
                  facing === "corner" ? "items-center justify-center" : "flex-col items-center justify-start",
                  d?.mortgaged && "opacity-55",
                )}
                style={{ gridRow: row + 1, gridColumn: col + 1 }}
                title={s.name}
              >
                {band && (
                  <span
                    className="absolute"
                    style={{
                      background: band,
                      ...(facing === "bottom"
                        ? { top: 0, left: 0, right: 0, height: "24%" }
                        : facing === "top"
                          ? { bottom: 0, left: 0, right: 0, height: "24%" }
                          : facing === "left"
                            ? { top: 0, bottom: 0, right: 0, width: "24%" }
                            : { top: 0, bottom: 0, left: 0, width: "24%" }),
                    }}
                  />
                )}
                <span
                  className={clsx(
                    "relative flex flex-col items-center justify-center gap-px text-center leading-none",
                    facing === "bottom" && "mt-[26%]",
                    facing === "top" && "mb-[26%]",
                    facing === "left" && "mr-[26%] h-full",
                    facing === "right" && "ml-[26%] h-full",
                  )}
                  style={{ fontSize: Math.max(6, Math.min(10, cell / 6.2)) }}
                >
                  {s.kind !== "street" && <SpaceIcon s={s} className="size-[1.6em]" />}
                  {(roomy || facing === "corner") && <span className="line-clamp-2 px-px">{short(s.name)}</span>}
                  {isOwnable(s) && !d && roomy && <span className="text-[#4a5a4d]">${s.price}</span>}
                </span>
                {/* Who owns it, and what is built on it */}
                {owner && <span className="absolute right-0.5 bottom-0.5 size-1.5 rounded-full ring-1 ring-black/30" style={{ background: owner.color }} />}
                {d && d.houses > 0 && (
                  <span className="absolute top-0.5 left-0.5 flex gap-px">
                    {d.houses === 5 ? (
                      <span className="h-1.5 w-3 rounded-[1px] bg-red-600 ring-1 ring-black/30" />
                    ) : (
                      Array.from({ length: d.houses }, (_, i) => <span key={i} className="size-1.5 rounded-[1px] bg-green-600 ring-1 ring-black/30" />)
                    )}
                  </span>
                )}
                {/* The pieces standing here */}
                {here.length > 0 && (
                  <span className="absolute inset-x-0 bottom-0.5 flex flex-wrap justify-center gap-px">
                    {here.map((c) => (
                      <span
                        key={c}
                        className={clsx("rounded-full ring-1 ring-black/50 shadow", c === state.turn && "ring-2 ring-white")}
                        style={{ background: state.players[c].color, width: Math.max(7, cell / 4.5), height: Math.max(7, cell / 4.5) }}
                      />
                    ))}
                  </span>
                )}
              </button>
            );
          })}

          {/* The middle of the board */}
          <div className="relative flex items-center justify-center overflow-y-auto p-1 no-scrollbar" style={{ gridRow: "2 / 11", gridColumn: "2 / 11" }}>
            {middle}
          </div>
        </div>

        {looking !== null && (
          <Deed
            at={looking}
            state={state}
            actor={actor}
            names={names}
            onClose={() => setLooking(null)}
            onBuild={() => actor && void save((fresh) => build(fresh, actor, looking, names))}
            onSell={() => actor && void save((fresh) => sellHouse(fresh, actor, looking, names))}
            onMortgage={() => actor && void save((fresh) => mortgage(fresh, actor, looking, names))}
            onUnmortgage={() => actor && void save((fresh) => unmortgage(fresh, actor, looking, names))}
          />
        )}

        {trading && actor && (
          <TradeBuilder
            state={state}
            from={actor}
            names={names}
            onClose={() => setTrading(false)}
            onSend={(t) => {
              const problem = tradeProblem(state, t);
              if (problem) {
                setNotice(problem);
                return;
              }
              void save((fresh) => propose(fresh, t));
              setTrading(false);
            }}
          />
        )}
      </div>

      {state.phase !== "setup" && (
        <div className="flex items-center justify-between text-[9px] text-muted/70">
          <span>{tx("houses left")}{" "}{housesLeft(state).houses}{" "}{tx("· hotels")}{" "}{housesLeft(state).hotels}
            {state.jackpot ? tx(` · on Free Parking $${state.pot}`) : ""}
          </span>
          {canEdit && (
            <button type="button" onClick={() => void save((fresh) => ({ ...upgradeMonopoly({ version: 1 }), seats: fresh.seats, holders: fresh.holders, seatCount: fresh.seatCount, jackpot: fresh.jackpot }))} className="rounded px-1.5 hover:text-chalk">{tx("new game")}</button>
          )}
        </div>
      )}
    </div>
  );
}

function Act({
  children,
  onClick,
  primary,
  danger,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  primary?: boolean;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        "flex min-h-8 items-center gap-1 rounded-lg px-2.5 text-[11px] font-medium shadow-sm transition active:scale-95 disabled:opacity-40",
        primary ? "bg-[#f3ead7] text-[#2a2118]" : danger ? "bg-red-500/20 text-red-200" : "bg-white/10 text-chalk hover:bg-white/15",
      )}
    >
      {children}
    </button>
  );
}

/** A title deed: the rents, the building costs, and what its owner can do with it. */
function Deed({
  at,
  state,
  actor,
  names,
  onClose,
  onBuild,
  onSell,
  onMortgage,
  onUnmortgage,
}: {
  at: number;
  state: MonopolyState;
  actor: Chair | null;
  names: (c: Chair) => string;
  onClose: () => void;
  onBuild: () => void;
  onSell: () => void;
  onMortgage: () => void;
  onUnmortgage: () => void;
}) {
  const s = BOARD[at];
  const d = deedOf(state, at);
  const mine = Boolean(actor && d?.by === actor);
  const problem = actor ? buildProblem(state, actor, at) : null;

  return (
    <div className="absolute inset-0 z-20 grid place-items-center bg-black/30 p-3" onClick={onClose}>
      <div className="w-full max-w-64 overflow-hidden rounded-xl bg-[#fbf8ef] text-[#1f1a14] shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="relative px-3 py-2 text-center" style={{ background: s.kind === "street" ? GROUP_COLOR[s.group] : "#e6e0cf" }}>
          <p className="text-[9px] tracking-widest uppercase opacity-70">{s.kind === "street" ? tx("title deed") : s.kind === "rail" ? tx("railroad") : s.kind === "utility" ? tx("utility") : ""}</p>
          <p className="text-[14px] font-bold">{s.name}</p>
          <button type="button" onClick={onClose} aria-label={tx("close")} className="absolute top-1.5 right-1.5 grid size-6 place-items-center rounded-full bg-black/10">
            <X className="size-3.5" />
          </button>
        </div>
        <div className="space-y-0.5 px-3 py-2 text-[11px]">
          {s.kind === "street" && (
            <>
              <Line label={tx("rent")} value={s.rents[0]} />
              <Line label={tx("with the whole set")} value={s.rents[0] * 2} />
              {[1, 2, 3, 4].map((n) => (
                <Line key={n} label={tx(`with ${n} house${n > 1 ? "s" : ""}`)} value={s.rents[n]} />
              ))}
              <Line label={tx("with a hotel")} value={s.rents[5]} />
              <Line label={tx("each house costs")} value={s.house} />
            </>
          )}
          {s.kind === "rail" && [1, 2, 3, 4].map((n) => <Line key={n} label={tx(`${n} railroad${n > 1 ? "s" : ""} owned`)} value={[25, 50, 100, 200][n - 1]} />)}
          {s.kind === "utility" && <p className="text-[10px]">{tx("Four times the dice with one utility; ten times with both.")}</p>}
          {s.kind === "tax" && <p>{tx("Pay $")}{s.amount}.</p>}
          {!isOwnable(s) && s.kind !== "tax" && <p className="text-[10px] text-[#5a4f3f]">{describe(s)}</p>}
          {isOwnable(s) && (
            <>
              <Line label={tx("price")} value={s.price} />
              <Line label={tx("mortgage value")} value={Math.floor(s.price / 2)} />
              <p className="pt-1 text-[10px] text-[#5a4f3f]">
                {d ? tx(`${names(d.by)}'s${d.mortgaged ? ", mortgaged" : ""}${d.houses === 5 ? ", with a hotel" : d.houses ? `, ${d.houses} house${d.houses > 1 ? "s" : ""}` : ""} · rent now $${rentFor(state, at, 7)}`) : tx("for sale")}
              </p>
            </>
          )}
        </div>
        {mine && d && (
          <div className="flex flex-wrap gap-1 border-t border-black/10 p-2">
            {s.kind === "street" && (
              <>
                <DeedButton onClick={onBuild} disabled={Boolean(problem)} title={problem ?? ""}>
                  {d.houses === 4 ? tx("build a hotel") : tx("build a house")}
                </DeedButton>
                <DeedButton onClick={onSell} disabled={d.houses === 0}>{tx("sell a house")}</DeedButton>
              </>
            )}
            {d.mortgaged ? <DeedButton onClick={onUnmortgage}>{tx("lift the mortgage")}</DeedButton> : <DeedButton onClick={onMortgage}>{tx("mortgage")}</DeedButton>}
            {problem && s.kind === "street" && <p className="w-full text-[9px] text-[#7a6a52]">{problem}</p>}
          </div>
        )}
      </div>
    </div>
  );
}

function describe(s: Space): string {
  switch (s.kind) {
    case "go":
      return "Collect $200 every time you pass.";
    case "jail":
      return "Just visiting, unless you were sent here.";
    case "parking":
      return "Somewhere to stop for a turn.";
    case "gotojail":
      return "Straight to jail. Do not pass GO.";
    case "chance":
    case "chest":
      return "Take a card.";
    default:
      return "";
  }
}

function Line({ label, value }: { label: string; value: number }) {
  return (
    <p className="flex justify-between gap-2">
      <span>{label}</span>
      <span className="font-semibold tabular-nums">${value}</span>
    </p>
  );
}

function DeedButton({ children, onClick, disabled, title }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; title?: string }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} title={title} className="min-h-8 flex-1 rounded-lg bg-[#2a2118] px-2 text-[10px] font-medium text-[#f3ead7] disabled:opacity-30">
      {children}
    </button>
  );
}

function TradeView({ trade, names, canAnswer, onAnswer }: { trade: Trade; names: (c: Chair) => string; canAnswer: boolean; onAnswer: (yes: boolean) => void }) {
  const list = (side: Trade["give"]) =>
    [side.cash ? `$${side.cash}` : "", ...side.squares.map((at) => short(BOARD[at].name)), side.free ? `${side.free} jail card${side.free > 1 ? "s" : ""}` : ""].filter(Boolean).join(", ") || "nothing";
  return (
    <div className="w-full max-w-64 rounded-xl bg-white/8 p-1.5 text-[10px] text-chalk">
      <p>
        {names(trade.from)}{" "}{tx("offers")}{" "}{names(trade.to)} <b>{list(trade.give)}</b>{" "}{tx("for")}{" "}<b>{list(trade.get)}</b>
      </p>
      {canAnswer && (
        <div className="mt-1 flex justify-center gap-1">
          <Act onClick={() => onAnswer(true)} primary>{tx("deal")}</Act>
          <Act onClick={() => onAnswer(false)}>{tx("no deal")}</Act>
        </div>
      )}
    </div>
  );
}

/** Putting a trade together: pick who with, then what goes each way. */
function TradeBuilder({
  state,
  from,
  names,
  onClose,
  onSend,
}: {
  state: MonopolyState;
  from: Chair;
  names: (c: Chair) => string;
  onClose: () => void;
  onSend: (t: Trade) => void;
}) {
  const others = state.order.filter((c) => c !== from && !state.players[c].bankrupt);
  const [to, setTo] = useState<Chair | null>(others[0] ?? null);
  const [give, setGive] = useState<Trade["give"]>({ cash: 0, squares: [], free: 0 });
  const [get, setGet] = useState<Trade["get"]>({ cash: 0, squares: [], free: 0 });

  return (
    <div className="absolute inset-0 z-20 grid place-items-center bg-black/35 p-2" onClick={onClose}>
      <div className="surface-raised w-full max-w-80 rounded-xl p-2 shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="mb-2 flex items-center gap-1">
          <Handshake className="size-4 text-glow" />
          <span className="text-[12px] text-chalk">{tx("a trade with")}</span>
          <select value={to ?? ""} onChange={(event) => setTo(event.target.value as Chair)} className="h-7 rounded-md bg-white/8 px-1 text-[11px] text-chalk">
            {others.map((c) => (
              <option key={c} value={c}>
                {names(c)}
              </option>
            ))}
          </select>
          <button type="button" onClick={onClose} aria-label={tx("close")} className="ml-auto grid size-7 place-items-center rounded-md text-muted hover:text-chalk">
            <X className="size-4" />
          </button>
        </div>
        {to && (
          <div className="flex gap-2">
            <TradeColumn state={state} who={from} side={give} set={setGive} names={names} />
            <TradeColumn state={state} who={to} side={get} set={setGet} names={names} />
          </div>
        )}
        <button
          type="button"
          disabled={!to}
          onClick={() => to && onSend({ from, to, give, get })}
          className="mt-2 min-h-9 w-full rounded-lg bg-[#f3ead7] text-[12px] font-semibold text-[#2a2118] disabled:opacity-40"
        >{tx("offer it")}</button>
      </div>
    </div>
  );
}

/** One side of a trade: some cash, some streets, maybe a jail card. */
function TradeColumn({
  state,
  who,
  side,
  set,
  names,
}: {
  state: MonopolyState;
  who: Chair;
  side: Trade["give"];
  set: (next: Trade["give"]) => void;
  names: (c: Chair) => string;
}) {
  const cash = state.players[who]?.cash ?? 0;
  const toggle = (at: number) => set({ ...side, squares: side.squares.includes(at) ? side.squares.filter((x) => x !== at) : [...side.squares, at] });
  return (
    <div className="min-w-0 flex-1">
      <p className="mb-1 truncate text-[10px] text-muted">{names(who)}{" "}{tx("gives")}</p>
      <label className="mb-1 flex items-center gap-1 text-[10px] text-muted">
        $
        <input
          type="number"
          min={0}
          max={cash}
          value={side.cash}
          onChange={(event) => set({ ...side, cash: Math.max(0, Math.min(cash, Number(event.target.value) || 0)) })}
          className="h-7 w-full min-w-0 rounded-md bg-white/8 px-1.5 text-[11px] text-chalk outline-none"
        />
      </label>
      <div className="no-scrollbar max-h-36 space-y-0.5 overflow-y-auto">
        {ownedBy(state, who).map((at) => {
          const s = BOARD[at];
          return (
            <button
              key={at}
              type="button"
              onClick={() => toggle(at)}
              className={clsx("flex w-full items-center gap-1 rounded-md px-1 py-0.5 text-left text-[10px]", side.squares.includes(at) ? "bg-glow/25 text-glow" : "bg-white/5 text-muted")}
            >
              {s.kind === "street" && <span className="h-2.5 w-1 rounded-sm" style={{ background: GROUP_COLOR[s.group] }} />}
              <span className="truncate">{short(s.name)}</span>
            </button>
          );
        })}
        {(state.players[who]?.free.length ?? 0) > 0 && (
          <button
            type="button"
            onClick={() => set({ ...side, free: side.free ? 0 : 1 })}
            className={clsx("w-full rounded-md px-1 py-0.5 text-left text-[10px]", side.free ? "bg-glow/25 text-glow" : "bg-white/5 text-muted")}
          >{tx("a jail card")}</button>
        )}
      </div>
    </div>
  );
}
