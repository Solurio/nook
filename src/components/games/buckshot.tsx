"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import {
  ArrowUpDown,
  Beer,
  BookOpen,
  Cigarette,
  Link2,
  Minus,
  Pill,
  Plus,
  Search,
  Slice,
  Smartphone,
  Syringe,
  Zap,
} from "lucide-react";
import { useRoom } from "@/realtime/room-provider";
import { useRoomStore } from "@/state/room-store";
import { claimChair, chairOf } from "@/lib/seats";
import {
  CHAMBER,
  GEAR_DOES,
  GEAR_NAME,
  MAX_SEATS,
  MIN_SEATS,
  aim,
  applyGear,
  chairsFor,
  emptyBuckshot,
  flip,
  landed,
  left,
  needsLoad,
  newLoad,
  oddsLive,
  remaining,
  shellKey,
  startRound,
  steal,
  type BuckshotState,
  type Gear,
  type Shell,
} from "@/lib/buckshot";
import type { Item } from "@/lib/types";
import RulesSheet from "./rules-sheet";
import { t as tx } from "@/lib/i18n";

const GEAR_ICON: Record<Gear, React.ReactNode> = {
  glass: <Search />,
  beer: <Beer />,
  cigarettes: <Cigarette />,
  saw: <Slice />,
  cuffs: <Link2 />,
  phone: <Smartphone />,
  inverter: <ArrowUpDown />,
  medicine: <Pill />,
  adrenaline: <Syringe />,
};

const SHELL_TINT: Record<Shell, string> = { live: "#e0655c", blank: "#8b93a3" };

/** A shell, side on: coloured hull, brass head. */
function ShellIcon({ shell, size = 22, faded }: { shell: Shell | null; size?: number; faded?: boolean }) {
  return (
    <svg viewBox="0 0 12 26" width={size * 0.46} height={size} className={clsx("shrink-0", faded && "opacity-35")} aria-hidden>
      <rect x="1" y="1" width="10" height="18" rx="2.5" fill={shell ? SHELL_TINT[shell] : "#3b3357"} stroke="#100d16" strokeWidth="1" />
      <rect x="0.5" y="18" width="11" height="7" rx="1" fill="#d6a85a" stroke="#100d16" strokeWidth="1" />
      {!shell && (
        <text x="6" y="13" textAnchor="middle" fontSize="8" fontWeight="700" fill="#a598bb">
          ?
        </text>
      )}
    </svg>
  );
}

/**
 * Buckshot Roulette at the table. The shells are a secret pile nobody can
 * read; the gun fires them in an order nobody has seen. Items, charges and
 * whose turn it is are out in the open, the way they are in the game.
 */
export default function Buckshot({ item, state: raw }: { item: Item<"game">; state: unknown }) {
  const { updateData, pile, canEdit } = useRoom();
  const me = useRoomStore((s) => s.me);
  const state = useMemo(() => ({ ...emptyBuckshot(), ...(raw as Partial<BuckshotState>) }) as BuckshotState, [raw]);
  const [manual, setManual] = useState(false);
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState<{ gear: Gear; from?: string } | null>(null);
  // What this device has learnt by peeking: `${load}:${position}` -> the shell.
  const [known, setKnown] = useState<Record<string, Shell>>({});

  const chairs = chairsFor(state.seatCount);
  const holders = useMemo(() => state.holders ?? {}, [state.holders]);
  const myChair = chairOf(state.seats, holders, me);
  const label = (chair: string) => state.seats[chair] ?? tx(`seat ${chairs.indexOf(chair) + 1}`);
  /** Whether this device plays for a chair: its own, or one nobody is sitting in. */
  const mine = (chair: string) => canEdit && (holders[chair] ? holders[chair] === me?.userId : true);

  const playing = state.phase === "play";
  const myTurn = playing && !state.firing && mine(state.turn) && left(state) > 0;
  const next = state.spent.length;
  const { live, blank } = remaining(state);
  const knownNow = known[`${state.load}:${next}`];
  const lastShot = state.spent.at(-1);

  const clean = (s: BuckshotState): BuckshotState => {
    const out = { ...s } as BuckshotState & Record<string, unknown>;
    delete out.piles;
    delete out.revealed;
    delete out.peeked;
    return out;
  };
  const write = (s: BuckshotState) => updateData(item.id, { game: "buckshot", state: clean(s) } as never);
  const latest = (): BuckshotState => {
    const data = useRoomStore.getState().items[item.id]?.data as { state?: BuckshotState } | undefined;
    return { ...emptyBuckshot(), ...(data?.state ?? state) };
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
  // Loading the gun
  // ---------------------------------------------------------------------------

  const load = async (fresh: { state: BuckshotState; shells: Shell[] }) => {
    await pile("pile_setup", {
      p_item: item.id,
      p_piles: [{ slot: CHAMBER, cards: fresh.shells, shuffle: true }],
      p_public: { game: "buckshot", state: clean(fresh.state) },
    });
  };

  const begin = () => run(() => load(startRound(clean(state), chairs)));

  // An empty gun is loaded by whoever's turn it is, as soon as it runs dry.
  const loading = useRef("");
  const dry = needsLoad(state) && mine(state.turn) ? `${state.round}:${state.load}` : "";
  useEffect(() => {
    if (!dry || loading.current === dry) return;
    loading.current = dry;
    const t = window.setTimeout(() => void load(newLoad(latest())), 1400);
    return () => window.clearTimeout(t);
    // Keyed on the load; the rest is read fresh when it fires.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dry]);

  // ---------------------------------------------------------------------------
  // Firing
  // ---------------------------------------------------------------------------

  const pull = async (firing: BuckshotState) => {
    const f = firing.firing;
    if (!f) return;
    await write(firing);
    const out = await pile("pile_reveal", {
      p_item: item.id,
      p_slots: [CHAMBER],
      p_count: 1,
      p_as: shellKey(firing.load, f.n),
    });
    // If the database would not fire it, nothing happened: put the gun down.
    if (out.error) await write({ ...latest(), firing: null });
  };

  const shoot = (target: string) => run(() => pull(aim(state, state.turn, target)));

  // Once the shell is out, the device that fired works out what it did. If
  // that device has gone quiet, anyone at the table can, a moment later.
  const shell = state.firing ? (state.revealed?.[shellKey(state.load, state.firing.n)]?.[0] as Shell | undefined) : undefined;
  const settleKey = state.firing && shell ? `${state.load}:${state.firing.n}` : "";
  const firedHere = state.firing ? mine(state.firing.by) : false;
  useEffect(() => {
    if (!settleKey) return;
    const t = window.setTimeout(
      () => {
        const now = latest();
        const f = now.firing;
        const raw = f ? (now.revealed?.[shellKey(now.load, f.n)]?.[0] as Shell | undefined) : undefined;
        if (!f || `${now.load}:${f.n}` !== settleKey || !raw) return;
        void write(landed(now, raw, label));
      },
      firedHere ? 250 : 3500,
    );
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settleKey, firedHere]);

  // ---------------------------------------------------------------------------
  // Items
  // ---------------------------------------------------------------------------

  const spend = (gear: Gear, options: { target?: string; from?: string } = {}) =>
    run(async () => {
      const by = state.turn;
      const done = options.from
        ? steal(state, by, options.from, gear, label, { target: options.target })
        : applyGear(state, by, gear, label, { target: options.target });
      setPicking(null);
      if (!done) return;
      if (done.rack) {
        await pull(done.state);
        return;
      }
      await write(done.state);
      if (done.peek !== undefined) {
        const at = done.peek;
        const seen = await pile<Shell>("pile_peek", { p_item: item.id, p_slot: CHAMBER, p_index: at });
        if (seen.data) setKnown((k) => ({ ...k, [`${state.load}:${next + at}`]: seen.data as Shell }));
      }
    });

  const tapGear = (owner: string, gear: Gear) => {
    if (!myTurn || busy) return;
    if (owner !== state.turn) {
      // Somebody else's: only with adrenaline in hand.
      if (picking?.gear === "adrenaline") {
        if (gear === "adrenaline") return;
        if (gear === "cuffs") setPicking({ gear, from: owner });
        else void spend(gear, { from: owner });
      }
      return;
    }
    if (gear === "adrenaline") setPicking(picking?.gear === "adrenaline" ? null : { gear });
    else if (gear === "cuffs") setPicking(picking?.gear === "cuffs" ? null : { gear });
    else void spend(gear);
  };

  // ---------------------------------------------------------------------------
  // What this device knows
  // ---------------------------------------------------------------------------

  const futures = Object.entries(known)
    .map(([key, value]) => ({ at: Number(key.split(":")[1]), load: Number(key.split(":")[0]), value }))
    .filter((k) => k.load === state.load && k.at > next)
    .sort((a, b) => a.at - b.at);

  const resize = (by: number) => {
    const count = Math.max(MIN_SEATS, Math.min(MAX_SEATS, state.seatCount + by));
    void write({ ...state, seatCount: count });
  };

  const settled = state.phase !== "play";
  const odds = Math.round(oddsLive(state) * 100);

  return (
    <div className="surface grain relative flex size-full flex-col gap-2 overflow-hidden rounded-2xl p-2.5">
      {/* The table's settings */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-muted/70">
        <Stepper label={tx("chairs")} value={state.seatCount} disabled={!canEdit || !settled} onChange={resize} min={MIN_SEATS} max={MAX_SEATS} />
        <Stepper
          label={tx("charges")}
          value={state.charges}
          disabled={!canEdit || !settled}
          onChange={(by) => void write({ ...state, charges: Math.max(2, Math.min(6, state.charges + by)) })}
          min={2}
          max={6}
        />
        <Stepper
          label={tx("items")}
          value={state.gearPerLoad}
          disabled={!canEdit || !settled}
          onChange={(by) => void write({ ...state, gearPerLoad: Math.max(0, Math.min(4, state.gearPerLoad + by)) })}
          min={0}
          max={4}
        />
        <button type="button" onClick={() => setManual(true)} className="ml-auto flex min-h-8 items-center gap-1 rounded-lg px-1.5 hover:bg-white/8 hover:text-chalk">
          <BookOpen className="size-3" />{" "}{tx("rules")}</button>
      </div>

      {/* Everyone at the table */}
      <div className="grid grid-cols-2 gap-1.5">
        {chairs.map((chair, index) => {
          const player = state.players[chair];
          const out = playing && player && player.charges <= 0;
          const target = myTurn && !out && player && !picking;
          const cuffTarget = picking?.gear === "cuffs" && chair !== state.turn && !out && player;
          return (
            <div
              key={chair}
              className={clsx(
                "flex min-w-0 flex-col gap-1 rounded-xl p-1.5 transition",
                out ? "bg-white/3 opacity-45" : state.turn === chair && playing ? "bg-white/10 ring-1 ring-[#e0655c]/50" : "bg-white/5",
              )}
            >
              <button
                type="button"
                disabled={!canEdit || !me || playing}
                onClick={() => me && void write({ ...state, ...claimChair(state.seats, holders, chair, me) })}
                className="flex min-h-7 items-center gap-1 text-left text-[11px] disabled:cursor-default"
                title={playing ? undefined : state.seats[chair] ? tx("stand up") : tx("sit here")}
              >
                <span className={clsx("min-w-0 flex-1 truncate", chair === myChair ? "text-chalk" : "text-muted")}>
                  {state.seats[chair] ?? <span className="text-muted/50">{tx("seat {n}", { n: index + 1 })}</span>}
                  {(state.wins[chair] ?? 0) > 0 && <span className="ml-1 text-warm">{state.wins[chair]}</span>}
                </span>
                {state.cuffed.includes(chair) && <Link2 className="size-3 shrink-0 text-warm" aria-label={tx("in cuffs")} />}
                {player && (
                  <span className="flex shrink-0" aria-label={tx(`${player.charges} charges`)}>
                    {Array.from({ length: state.charges }, (_, i) => (
                      <Zap key={i} className={clsx("size-3", i < player.charges ? "fill-warm text-warm" : "text-white/15")} strokeWidth={2} />
                    ))}
                  </span>
                )}
              </button>
              {player && (
                <div className="flex min-h-7 flex-wrap gap-0.5">
                  {player.gear.map((gear, i) => {
                    const usable =
                      myTurn &&
                      (chair === state.turn || (picking?.gear === "adrenaline" && gear !== "adrenaline"));
                    return (
                      <button
                        key={`${gear}${i}`}
                        type="button"
                        disabled={!usable || busy}
                        onClick={() => tapGear(chair, gear)}
                        title={`${tx(GEAR_NAME[gear])}: ${tx(GEAR_DOES[gear])}`}
                        aria-label={tx(GEAR_NAME[gear])}
                        className={clsx(
                          "grid size-7 place-items-center rounded-md transition [&_svg]:size-3.5",
                          picking?.gear === gear && chair === state.turn ? "bg-warm text-ink-950" : "bg-white/8 text-chalk",
                          usable ? "hover:bg-white/16" : "cursor-default opacity-70",
                        )}
                      >
                        {GEAR_ICON[gear]}
                      </button>
                    );
                  })}
                </div>
              )}
              {(target || cuffTarget) && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => (cuffTarget ? void spend("cuffs", { target: chair, from: picking?.from }) : void shoot(chair))}
                  className={clsx(
                    "min-h-8 rounded-lg text-[11px] font-semibold transition active:scale-95",
                    cuffTarget ? "bg-warm/20 text-warm" : "bg-[#e0655c]/20 text-[#f2a4b8] hover:bg-[#e0655c]/30",
                  )}
                >
                  {cuffTarget ? tx("cuff them") : chair === state.turn ? tx("shoot yourself") : tx("shoot them")}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* The gun, and what went into it */}
      <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center gap-1.5 overflow-hidden rounded-xl bg-[radial-gradient(ellipse_at_center,#2a2030_0%,#15111c_80%)] p-2 inset-ring inset-ring-white/8">
        {playing && state.loaded ? (
          <>
            <Shotgun sawn={state.saw} firing={Boolean(state.firing)} />
            <div className="flex items-center gap-2 text-[11px]">
              <span className="flex items-center gap-0.5">
                {Array.from({ length: live }, (_, i) => (
                  <ShellIcon key={`l${i}`} shell="live" size={18} />
                ))}
                {Array.from({ length: blank }, (_, i) => (
                  <ShellIcon key={`b${i}`} shell="blank" size={18} />
                ))}
              </span>
              <span className="text-muted">
                <b className="text-[#f2a4b8]">{live}</b>{" "}{tx("live ·")}{" "}<b className="text-chalk">{blank}</b>{" "}{tx("blank")}</span>
            </div>
            <p className="text-[10px] text-muted/70">{tx("the next one is live {odds}% of the time{what}{what2}", { odds, what: state.inverted ? tx(" (inverted)") : "", what2: state.saw ? tx(" · sawn off") : "" })}
            </p>
            {knownNow && (
              <p className="rounded-md bg-glow/15 px-2 py-0.5 text-[11px] text-glow">{tx("you saw it: {what}", { what: state.inverted ? tx(`${knownNow}, now ${flip(knownNow)}`) : tx(knownNow) })}
              </p>
            )}
            {futures.length > 0 && (
              <p className="text-[10px] text-glow/80">
                {futures.map((f) => tx(`shell ${f.at - next + 1} is ${f.value}`)).join(" · ")}
              </p>
            )}
          </>
        ) : state.phase === "over" && state.winner ? (
          <p className="text-center text-sm font-semibold text-chalk">{tx("{winner} walks away", { winner: label(state.winner) })}</p>
        ) : (
          <p className="text-center text-[11px] text-muted/60">{tx("sit down, then load the gun -- empty chairs play from whoever loads")}</p>
        )}

        {lastShot && playing && (
          <div key={`${state.load}:${state.spent.length}`} className={clsx("absolute top-2 right-2 flex items-center gap-1 animate-drift-in", lastShot.shell === "live" && lastShot.how === "shot" && "animate-bang")}>
            <ShellIcon shell={lastShot.shell} size={18} />
            <span className={clsx("text-[11px] font-bold", lastShot.shell === "live" ? "text-[#f2a4b8]" : "text-muted")}>
              {lastShot.how === "beer" ? tx("racked") : lastShot.shell === "live" ? "BANG" : tx("click")}
            </span>
          </div>
        )}

        {state.spent.length > 0 && playing && (
          <div className="absolute bottom-1.5 left-2 flex gap-0.5" aria-label={tx("spent shells")}>
            {state.spent.map((s, i) => (
              <ShellIcon key={i} shell={s.shell} size={14} faded />
            ))}
          </div>
        )}
      </div>

      <div className="flex min-h-10 items-center gap-2">
        {picking && (
          <p className="min-w-0 flex-1 text-[11px] text-warm">
            {picking.gear === "adrenaline" ? tx("take one of their items") : tx("cuff whom?")}
            <button type="button" onClick={() => setPicking(null)} className="ml-2 text-muted underline">{tx("never mind")}</button>
          </p>
        )}
        {!picking && (
          <p className="min-w-0 flex-1 truncate text-[10px] text-muted/70">
            {playing
              ? state.firing
                ? "..."
                : needsLoad(state)
                  ? tx("empty. loading again...")
                  : tx(`${label(state.turn)}'s turn${myTurn ? " -- point it at someone" : ""}`)
              : tx(state.log.at(-1) ?? "")}
          </p>
        )}
        {needsLoad(state) && !mine(state.turn) && canEdit && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void run(() => load(newLoad(latest())))}
            className="min-h-9 shrink-0 rounded-lg bg-white/8 px-3 text-[11px] text-chalk"
            title={tx("if whoever's turn it is has gone quiet")}
          >{tx("load it")}</button>
        )}
        {!playing && (
          <button
            type="button"
            disabled={!canEdit || busy}
            onClick={() => void begin()}
            className="min-h-10 shrink-0 rounded-xl bg-chalk px-4 text-[12px] font-semibold text-ink-950 transition active:scale-95 disabled:opacity-40"
          >
            {state.phase === "over" ? tx("again") : tx("load the gun")}
          </button>
        )}
      </div>

      {manual && (
        <RulesSheet title={tx("buckshot roulette")} onClose={() => setManual(false)}>
          <p>{tx("The gun is loaded with")}{" "}<b>{tx("live")}</b>{" "}{tx("shells and")}{" "}<b>{tx("blanks")}</b>. Everyone is told how many of each, and nobody is told
            the order. On your turn, point it at anyone -- yourself included.
          </p>
          <p>{tx("A live shell costs whoever it hits a charge. A blank at your own head")}{" "}<b>{tx("keeps your turn")}</b>{tx("; anything else passes it on. Run out of charges and you are out; the last one standing wins the round.")}</p>
          <p>{tx("When the gun is empty it is loaded again, and everyone still in gets more items. Use any number on your turn, before you shoot.")}</p>
          <div className="space-y-1 border-t border-white/8 pt-2">
            {(Object.keys(GEAR_NAME) as Gear[]).map((gear) => (
              <p key={gear} className="flex items-start gap-2">
                <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded bg-white/8 text-chalk [&_svg]:size-3">{GEAR_ICON[gear]}</span>
                <span>
                  <b>{tx(GEAR_NAME[gear])}</b> -- {tx(GEAR_DOES[gear])}
                </span>
              </p>
            ))}
          </div>
          <p className="border-t border-white/8 pt-2">{tx("The shells are kept where no browser can read them. A magnifying glass or a phone shows you one, and only you; the table is told you looked.")}</p>
        </RulesSheet>
      )}
    </div>
  );
}

function Stepper({
  label,
  value,
  onChange,
  disabled,
  min,
  max,
}: {
  label: string;
  value: number;
  onChange: (by: number) => void;
  disabled: boolean;
  min: number;
  max: number;
}) {
  return (
    <span className="flex items-center gap-0.5">
      <button type="button" disabled={disabled || value <= min} onClick={() => onChange(-1)} aria-label={tx(`fewer ${label}`)} className="grid size-7 place-items-center rounded transition hover:bg-white/10 hover:text-chalk disabled:opacity-30">
        <Minus className="size-3" strokeWidth={2.6} />
      </button>
      <span className="tabular-nums text-chalk">{value}</span> {tx(label)}
      <button type="button" disabled={disabled || value >= max} onClick={() => onChange(1)} aria-label={tx(`more ${label}`)} className="grid size-7 place-items-center rounded transition hover:bg-white/10 hover:text-chalk disabled:opacity-30">
        <Plus className="size-3" strokeWidth={2.6} />
      </button>
    </span>
  );
}

/** The shotgun, side on. Sawn off, the barrel is shorter; firing, it kicks. */
function Shotgun({ sawn, firing }: { sawn: boolean; firing: boolean }) {
  const barrel = sawn ? 58 : 96;
  return (
    <svg viewBox="0 0 200 44" className={clsx("w-[min(15rem,80%)]", firing && "animate-kick")} aria-hidden>
      <path d="M4 26 L38 18 L52 18 L52 32 L40 32 L14 40 Q4 42 4 34 Z" fill="#6b4a2e" stroke="#100d16" strokeWidth="1.5" />
      <rect x="50" y="16" width="44" height="14" rx="2" fill="#3a3149" stroke="#100d16" strokeWidth="1.5" />
      <path d="M60 30 L66 38 L72 38 L70 30 Z" fill="#3a3149" stroke="#100d16" strokeWidth="1.2" />
      <rect x="92" y="17" width={barrel} height="6" rx="1" fill="#514667" stroke="#100d16" strokeWidth="1.2" />
      <rect x="92" y="23" width={barrel - 6} height="5" rx="1" fill="#6b5f80" stroke="#100d16" strokeWidth="1.2" />
      <rect x="96" y="28" width="38" height="5" rx="2" fill="#6b4a2e" stroke="#100d16" strokeWidth="1.2" />
    </svg>
  );
}
