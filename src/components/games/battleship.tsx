"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import clsx from "clsx";
import { Anchor, Check, RotateCcw, RotateCw, Shuffle, Trash2 } from "lucide-react";
import { useRoom } from "@/realtime/room-provider";
import { usePiles } from "@/realtime/use-piles";
import { useHandOver } from "@/realtime/use-hand-over";
import { useRoomStore } from "@/state/room-store";
import { chairOf, claimChair } from "@/lib/seats";
import {
  CHAIRS,
  COLS,
  FLEET,
  FLEET_SQUARES,
  SIZE,
  afterShot,
  cellName,
  cellsOf,
  emptyBattleship,
  fitsWith,
  fleetCards,
  fleetProblem,
  fleetSlot,
  hitsBy,
  newlySunk,
  other,
  randomFleet,
  ready,
  shipName,
  shipsIn,
  upgradeBattleship,
  type BattleshipState,
  type Chair,
  type Placement,
  type Ship,
} from "@/lib/battleship";
import type { Item } from "@/lib/types";
import { t } from "@/lib/i18n";

const TINT: Record<Chair, string> = { a: "#6aa9e0", b: "#e0655c" };
const SIDE_NAME: Record<Chair, string> = { a: "blue fleet", b: "red fleet" };

type Mark = "ship" | "hit" | "miss" | "sunk" | "wreck";

interface Hull {
  ship: string;
  /** Where in the ship this square is, and which way the ship lies. */
  at: number;
  size: number;
  across: boolean;
}

/** Which ship each square belongs to, for drawing hulls with rounded ends. */
function hulls(ships: Ship[]): Map<string, Hull> {
  const out = new Map<string, Hull>();
  for (const ship of ships) {
    const across = ship.cells.length < 2 || ship.cells[0].slice(1) === ship.cells[1].slice(1);
    ship.cells.forEach((cell, at) => out.set(cell, { ship: ship.ship, at, size: ship.cells.length, across }));
  }
  return out;
}

function Waters({
  title,
  tint,
  marks,
  ships,
  preview,
  onCell,
  onHover,
  cell,
  dim,
}: {
  title: string;
  tint: string;
  marks: Map<string, Mark>;
  ships: Map<string, Hull>;
  preview?: { cells: string[]; ok: boolean } | null;
  onCell?: (name: string) => void;
  onHover?: (name: string | null) => void;
  cell: number;
  dim?: boolean;
}) {
  const label = Math.max(9, Math.round(cell * 0.42));
  return (
    <div className={clsx("flex flex-col items-center", dim && "opacity-80")}>
      <p className="mb-1 flex items-center gap-1.5 text-[11px] text-muted">
        <span className="size-2 rounded-full" style={{ background: tint }} />
        {title}
      </p>
      <div
        className="grid select-none"
        style={{ gridTemplateColumns: `${cell * 0.7}px repeat(${SIZE}, ${cell}px)`, gridAutoRows: `${cell}px` }}
        onPointerLeave={() => onHover?.(null)}
      >
        <span />
        {Array.from(COLS).map((c) => (
          <span key={c} className="grid place-items-center text-muted/60" style={{ fontSize: label }}>
            {c}
          </span>
        ))}
        {Array.from({ length: SIZE }, (_, row) => (
          <Row
            key={row}
            row={row}
            label={label}
            marks={marks}
            ships={ships}
            preview={preview}
            onCell={onCell}
            onHover={onHover}
          />
        ))}
      </div>
    </div>
  );
}

function Row({
  row,
  label,
  marks,
  ships,
  preview,
  onCell,
  onHover,
}: {
  row: number;
  label: number;
  marks: Map<string, Mark>;
  ships: Map<string, Hull>;
  preview?: { cells: string[]; ok: boolean } | null;
  onCell?: (name: string) => void;
  onHover?: (name: string | null) => void;
}) {
  return (
    <>
      <span className="grid place-items-center text-muted/60" style={{ fontSize: label }}>
        {row + 1}
      </span>
      {Array.from({ length: SIZE }, (_, col) => {
        const name = cellName(row, col);
        const mark = marks.get(name);
        const hull = ships.get(name);
        const previewed = preview?.cells.includes(name);
        const first = hull && hull.at === 0;
        const last = hull && hull.at === hull.size - 1;
        return (
          <button
            key={name}
            type="button"
            aria-label={name}
            disabled={!onCell}
            onClick={() => onCell?.(name)}
            onPointerEnter={() => onHover?.(name)}
            className={clsx(
              "relative grid place-items-center border-[0.5px] border-sky-200/10 bg-[#123a55] transition-colors enabled:hover:bg-[#1a4c6e] disabled:cursor-default",
              previewed && (preview?.ok ? "bg-emerald-500/35" : "bg-red-500/35"),
            )}
          >
            {hull && (
              <span
                className={clsx(
                  "absolute inset-[3px]",
                  mark === "sunk" || mark === "wreck" ? "bg-[#5a2a2a]" : "bg-[#9aa7b4]",
                  hull.across ? clsx(first && "rounded-l-full", last && "rounded-r-full") : clsx(first && "rounded-t-full", last && "rounded-b-full"),
                )}
              />
            )}
            {(mark === "hit" || mark === "sunk" || mark === "wreck") && (
              <span className="relative size-[55%] rounded-full bg-[radial-gradient(circle,#ffd07a_0%,#e0452c_55%,rgba(224,69,44,0)_72%)]" />
            )}
            {mark === "miss" && <span className="relative size-[28%] rounded-full bg-white/75" />}
          </button>
        );
      })}
    </>
  );
}

/**
 * Battleship for two. Each side sets its fleet out in secret; after that the
 * guns take turns, and the database answers every shot without ever showing
 * anyone the other side's waters.
 */
export default function Battleship({ item, state: raw }: { item: Item<"game">; state: unknown }) {
  const { pile, canEdit, updateDataIf, setNotice } = useRoom();
  const me = useRoomStore((s) => s.me);
  const state = upgradeBattleship(raw);
  const piles = state.piles;
  const mine = usePiles(item.id, piles);
  const holders = state.holders ?? { a: null, b: null };
  useHandOver(item.id, piles, holders);

  const myChair = chairOf(state.seats, holders, me);
  const open = !state.seats.a && !state.seats.b;
  const aReady = ready(piles, "a");
  const bReady = ready(piles, "b");
  const phase = state.winner ? "over" : aReady && bReady ? "firing" : "placing";

  // On a table nobody has sat at, this device plays both sides in turn.
  const placingFor: Chair | null = myChair ?? (open ? (aReady ? "b" : "a") : null);
  const firingFor: Chair | null = myChair ?? (open ? state.turn : null);

  const [placements, setPlacements] = useState<Placement[]>([]);
  const [chosen, setChosen] = useState<string>(FLEET[0].id);
  const [across, setAcross] = useState(true);
  const [hover, setHover] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // One device passed between two people: the screen is covered until the
  // next person says they are holding it.
  const [shownFor, setShownFor] = useState<string>(`${phase}:${phase === "firing" ? firingFor : placingFor}`);
  const showing = `${phase}:${phase === "firing" ? firingFor : placingFor}`;
  const covered = open && phase !== "over" && shownFor !== showing && (phase === "firing" || aReady);

  const boxRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(520);
  useLayoutEffect(() => {
    const node = boxRef.current;
    if (!node) return;
    const observe = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observe.observe(node);
    return () => observe.disconnect();
  }, []);
  const sideBySide = width >= 560;
  const cell = Math.max(18, Math.min(34, Math.floor((sideBySide ? width / 2 - 24 : width - 16) / 10.7)));
  const small = Math.max(14, Math.min(26, Math.floor(cell * (sideBySide ? 1 : 0.72))));

  // ---------------------------------------------------------------------------
  // Saving
  // ---------------------------------------------------------------------------

  const strip = (next: BattleshipState): BattleshipState => {
    const out = { ...next } as BattleshipState & Record<string, unknown>;
    delete out.piles;
    delete out.tested;
    return out;
  };

  const save = async (make: (fresh: BattleshipState) => BattleshipState | null) => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const row = useRoomStore.getState().items[item.id];
      if (!row) return;
      const fresh = upgradeBattleship((row.data as { state?: unknown }).state);
      const next = make(fresh);
      if (!next) return;
      if (await updateDataIf(item.id, { game: "battleship", state: strip(next) } as never, row.updated_at)) return;
      await new Promise((resolve) => window.setTimeout(resolve, 60 + attempt * 80));
    }
    setNotice("the other side moved first. try that again.");
  };

  const sit = (chair: Chair) => {
    if (!me) return;
    void save((fresh) => ({ ...fresh, ...claimChair(fresh.seats, fresh.holders ?? { a: null, b: null }, chair, me) }));
  };

  // ---------------------------------------------------------------------------
  // Ships that went down: only their owner knows, so their screen says so.
  // ---------------------------------------------------------------------------

  const shotsSig = `${state.shots.a.length}:${state.shots.b.length}:${state.sunk.a.length}:${state.sunk.b.length}`;
  const ownFleets = CHAIRS.filter((c) => Array.isArray(mine[fleetSlot(c)]));
  const ownSig = ownFleets.join(",");
  useEffect(() => {
    for (const c of ownFleets) {
      const ships = shipsIn(mine[fleetSlot(c)] ?? []);
      if (newlySunk(ships, state.shots[other(c)], state.sunk[c]).length === 0) continue;
      void save((fresh) => {
        const down = newlySunk(ships, fresh.shots[other(c)], fresh.sunk[c]);
        return down.length ? { ...fresh, sunk: { ...fresh.sunk, [c]: [...fresh.sunk[c], ...down] } } : null;
      });
    }
    // Checked whenever a shot lands or a fleet is read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shotsSig, ownSig]);

  // ---------------------------------------------------------------------------
  // Setting out a fleet
  // ---------------------------------------------------------------------------

  const place = (name: string) => {
    const [col, row] = [COLS.indexOf(name[0]), Number(name.slice(1)) - 1];
    const holding = placements.find((p) => (cellsOf(p) ?? []).includes(name));
    if (holding && holding.ship !== chosen) {
      // Tapping a ship already out picks it up again.
      setPlacements(placements.filter((p) => p.ship !== holding.ship));
      setChosen(holding.ship);
      setAcross(holding.across);
      return;
    }
    const next: Placement = { ship: chosen, row, col, across };
    if (!fitsWith(placements, next)) {
      setNotice(`the ${shipName(chosen)} does not fit there.`);
      return;
    }
    const all = [...placements.filter((p) => p.ship !== chosen), next];
    setPlacements(all);
    const unplaced = FLEET.find((kind) => !all.some((p) => p.ship === kind.id));
    if (unplaced) setChosen(unplaced.id);
  };

  const sendFleet = async () => {
    if (!placingFor || busy) return;
    const problem = fleetProblem(placements);
    if (problem) {
      setNotice(problem);
      return;
    }
    setBusy(true);
    try {
      const owner = holders[placingFor] ?? me?.userId ?? null;
      const done = await pile("pile_put", {
        p_item: item.id,
        p_to: fleetSlot(placingFor),
        p_cards: fleetCards(placements),
        p_to_owner: owner,
      });
      if (!done.error) {
        setPlacements([]);
        setChosen(FLEET[0].id);
      }
    } finally {
      setBusy(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Firing
  // ---------------------------------------------------------------------------

  const fire = async (name: string) => {
    if (!firingFor || busy || state.turn !== firingFor || state.winner) return;
    if (state.shots[firingFor].some((s) => s.cell === name)) return;
    setBusy(true);
    try {
      const answer = await pile<boolean>("pile_test", { p_item: item.id, p_slot: fleetSlot(other(firingFor)), p_card: name });
      if (answer.error) return;
      const shooter = firingFor;
      await save((fresh) => (fresh.turn !== shooter ? null : afterShot(fresh, shooter, name, Boolean(answer.data))));
    } finally {
      setBusy(false);
    }
  };

  const newGame = async () => {
    if (!canEdit || busy) return;
    setBusy(true);
    try {
      const live = upgradeBattleship((useRoomStore.getState().items[item.id]?.data as { state?: unknown } | undefined)?.state);
      const fresh = { ...emptyBattleship(), seats: live.seats, holders: live.holders, again: live.again };
      await pile("pile_setup", { p_item: item.id, p_piles: [], p_public: { game: "battleship", state: strip(fresh) } });
      setPlacements([]);
    } finally {
      setBusy(false);
    }
  };

  // ---------------------------------------------------------------------------
  // What each set of waters shows
  // ---------------------------------------------------------------------------

  /** A side's own waters: its ships, and where the other side has fired. */
  const ownWaters = (c: Chair): { marks: Map<string, Mark>; ships: Map<string, Hull> } => {
    const ships = shipsIn(mine[fleetSlot(c)] ?? []);
    const marks = new Map<string, Mark>();
    for (const cellName of ships.flatMap((s) => s.cells)) marks.set(cellName, "ship");
    const sunkCells = new Set(state.sunk[c].flatMap((s) => s.cells));
    for (const shot of state.shots[other(c)]) marks.set(shot.cell, shot.hit ? (sunkCells.has(shot.cell) ? "wreck" : "hit") : "miss");
    return { marks, ships: hulls(ships) };
  };

  /** The other side's waters, as far as this side has found them out. */
  const theirWaters = (c: Chair): { marks: Map<string, Mark>; ships: Map<string, Hull> } => {
    const marks = new Map<string, Mark>();
    const sunk = state.sunk[other(c)];
    const sunkCells = new Set(sunk.flatMap((s) => s.cells));
    for (const shot of state.shots[c]) marks.set(shot.cell, shot.hit ? (sunkCells.has(shot.cell) ? "sunk" : "hit") : "miss");
    return { marks, ships: hulls(sunk) };
  };

  const label = (c: Chair) => state.seats[c] ?? SIDE_NAME[c];

  const status = (() => {
    if (state.winner) return `${label(state.winner)} sank the whole fleet`;
    if (phase === "placing") {
      if (placingFor && !ready(piles, placingFor)) return open ? `${label(placingFor)}: set your fleet out` : "set your fleet out";
      return `waiting for ${label(aReady ? "b" : "a")} to set out a fleet`;
    }
    const last = [...state.shots.a.map((s) => ({ ...s, by: "a" as Chair })), ...state.shots.b.map((s) => ({ ...s, by: "b" as Chair }))].at(-1);
    const turn = state.turn === firingFor ? "your shot" : `${label(state.turn)} is aiming`;
    return last ? `${last.cell}: ${t(last.hit ? "hit" : "miss")} · ${t(turn)}` : turn;
  })();

  // The preview of the ship in hand, under the pointer.
  const preview = (() => {
    if (!hover || phase !== "placing") return null;
    const [col, row] = [COLS.indexOf(hover[0]), Number(hover.slice(1)) - 1];
    const next: Placement = { ship: chosen, row, col, across };
    const cells = cellsOf(next);
    if (!cells) return { cells: [hover], ok: false };
    return { cells, ok: fitsWith(placements, next) };
  })();

  const placingMarks = new Map<string, Mark>();
  const placingShips = hulls(placements.map((p) => ({ ship: p.ship, cells: cellsOf(p) ?? [] })));
  for (const name of placingShips.keys()) placingMarks.set(name, "ship");

  return (
    <div ref={boxRef} className="surface grain relative flex size-full flex-col gap-2 overflow-hidden rounded-2xl p-2.5">
      {/* The two sides */}
      <div className="flex items-center gap-1.5">
        {CHAIRS.map((c) => (
          <button
            key={c}
            type="button"
            disabled={!canEdit || !me}
            onClick={() => sit(c)}
            className={clsx(
              "flex min-h-9 min-w-0 flex-1 items-center gap-1.5 rounded-xl px-2 text-[11px] transition disabled:opacity-60",
              state.turn === c && phase === "firing" ? "bg-glow/18 ring-1 ring-glow/45" : "bg-white/5 hover:bg-white/9",
            )}
          >
            <span className="size-2.5 shrink-0 rounded-full" style={{ background: TINT[c] }} />
            <span className={clsx("truncate", state.seats[c] ? "text-chalk" : "text-muted/60")}>{state.seats[c] ?? t(`${SIDE_NAME[c]} · sit here`)}</span>
            <span className="ml-auto shrink-0 text-[10px] text-muted tabular-nums">
              {ready(piles, c) ? `${hitsBy(state, c)}/${FLEET_SQUARES}` : t("in port")}
            </span>
          </button>
        ))}
      </div>

      <p className={clsx("text-center text-[12px]", state.winner ? "text-glow" : "text-chalk")}>{t(status)}</p>

      <div className="relative min-h-0 flex-1 overflow-y-auto">
        {covered ? (
          <div className="grid h-full place-items-center">
            <button
              type="button"
              onClick={() => setShownFor(showing)}
              className="flex min-h-12 flex-col items-center justify-center gap-1 rounded-2xl bg-white/8 px-5 py-3 text-[12px] text-chalk ring-1 ring-white/12"
            >
              <Anchor className="size-5 text-glow" />{t("pass it to")}{" "}{label((phase === "firing" ? firingFor : placingFor) ?? "a")}
              <span className="text-[10px] text-muted">{t("tap when it is in their hands")}</span>
            </button>
          </div>
        ) : phase === "placing" && placingFor && !ready(piles, placingFor) ? (
          <div className={clsx("flex gap-3", sideBySide ? "flex-row items-start justify-center" : "flex-col items-center")}>
            <Waters
              title={t(`${label(placingFor)}: your waters`)}
              tint={TINT[placingFor]}
              marks={placingMarks}
              ships={placingShips}
              preview={preview}
              onCell={canEdit ? place : undefined}
              onHover={setHover}
              cell={cell}
            />
            <div className="flex w-full max-w-60 flex-col gap-1.5">
              {FLEET.map((kind) => {
                const placed = placements.some((p) => p.ship === kind.id);
                return (
                  <button
                    key={kind.id}
                    type="button"
                    onClick={() => setChosen(kind.id)}
                    className={clsx(
                      "flex min-h-9 items-center gap-2 rounded-lg px-2 text-[11px]",
                      chosen === kind.id ? "bg-glow/22 text-glow ring-1 ring-glow/40" : "bg-white/5 text-muted hover:text-chalk",
                    )}
                  >
                    <span className="flex gap-0.5">
                      {Array.from({ length: kind.size }, (_, i) => (
                        <span key={i} className="h-2.5 w-3 rounded-[2px] bg-[#9aa7b4]" />
                      ))}
                    </span>
                    {t(kind.name)}
                    {placed && <Check className="ml-auto size-3.5 text-emerald-300" />}
                  </button>
                );
              })}
              <div className="flex flex-wrap gap-1">
                <button type="button" onClick={() => setAcross((v) => !v)} className="flex min-h-9 flex-1 items-center justify-center gap-1 rounded-lg bg-white/7 text-[11px] text-chalk">
                  <RotateCw className="size-3.5" /> {across ? t("across") : t("down")}
                </button>
                <button type="button" onClick={() => setPlacements(randomFleet())} className="flex min-h-9 flex-1 items-center justify-center gap-1 rounded-lg bg-white/7 text-[11px] text-chalk">
                  <Shuffle className="size-3.5" />{" "}{t("at random")}</button>
                <button type="button" onClick={() => setPlacements([])} aria-label={t("clear the board")} className="grid min-h-9 w-9 place-items-center rounded-lg bg-white/7 text-muted hover:text-red-300">
                  <Trash2 className="size-3.5" />
                </button>
              </div>
              <button
                type="button"
                disabled={!canEdit || busy || placements.length < FLEET.length}
                onClick={() => void sendFleet()}
                className="flex min-h-10 items-center justify-center gap-1.5 rounded-xl bg-glow/30 text-[12px] font-semibold text-glow disabled:opacity-40"
              >
                <Anchor className="size-4" />{" "}{t("put to sea")}</button>
              <p className="text-[10px] text-muted/70">{t("tap a square to put the ship there; tap one already out to pick it up again.")}</p>
            </div>
          </div>
        ) : phase === "placing" ? (
          <div className="grid h-full place-items-center text-center text-[12px] text-muted">
            {placingFor ? t("your fleet is out. waiting for the other side.") : t("sit on a side to play.")}
          </div>
        ) : (
          (() => {
            const side = firingFor ?? "a";
            const theirs = theirWaters(side);
            const ours = ownWaters(side);
            const canFire = Boolean(firingFor) && state.turn === firingFor && !state.winner && canEdit && !busy;
            return (
              <div className={clsx("flex gap-3", sideBySide ? "flex-row items-start justify-center" : "flex-col items-center")}>
                <Waters
                  title={t(`${label(other(side))}'s waters`)}
                  tint={TINT[other(side)]}
                  marks={theirs.marks}
                  ships={theirs.ships}
                  onCell={canFire ? (name) => void fire(name) : undefined}
                  cell={cell}
                />
                {firingFor && (
                  <Waters title={t("your waters")} tint={TINT[side]} marks={ours.marks} ships={ours.ships} cell={small} dim />
                )}
              </div>
            );
          })()
        )}
      </div>

      {/* What has gone down, and the table's rules */}
      <div className="flex flex-wrap items-center gap-1.5">
        {CHAIRS.map((c) =>
          state.sunk[c].length > 0 ? (
            <span key={c} className="rounded-md bg-white/5 px-1.5 py-0.5 text-[10px] text-muted">
              <span style={{ color: TINT[c] }}>{label(c)}</span>{" "}{t("lost:")}{" "}{state.sunk[c].map((s) => shipName(s.ship)).join(", ")}
            </span>
          ) : null,
        )}
        {canEdit && (
          <>
            <button
              type="button"
              onClick={() => void save((fresh) => ({ ...fresh, again: !fresh.again }))}
              className={clsx("ml-auto min-h-8 rounded-lg px-2 text-[10px]", state.again ? "bg-glow/22 text-glow" : "bg-white/6 text-muted hover:text-chalk")}
              title={t("whether a hit earns another shot")}
            >
              {state.again ? t("a hit shoots again") : t("shots take turns")}
            </button>
            <button type="button" onClick={() => void newGame()} className="flex min-h-8 items-center gap-1 rounded-lg bg-white/6 px-2 text-[10px] text-muted hover:text-chalk">
              <RotateCcw className="size-3" />{" "}{t("new game")}</button>
          </>
        )}
      </div>
    </div>
  );
}
