"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { ArrowRightLeft, Minus, Plus, X } from "lucide-react";
import { useRoom } from "@/realtime/room-provider";
import { useRoomStore } from "@/state/room-store";
import { MAX_COUNT, MAX_NAME, drop, give, put, readBag, rename, setCount, type Carried } from "@/lib/inventory";
import type { TokenData } from "@/lib/grid";
import type { Item } from "@/lib/types";
import { t } from "@/lib/i18n";

/**
 * What a piece carries, opened from the piece's own bar. Everything here is a
 * save of the piece, so the whole table sees the same bag, and undo takes
 * back a change like any other.
 */
export default function InventorySheet({ id, onClose }: { id: string; onClose: () => void }) {
  const { updateData, canEdit } = useRoom();
  const piece = useRoomStore((s) => s.items[id]) as Item<"token"> | undefined;
  const items = useRoomStore((s) => s.items);
  const [name, setName] = useState("");
  const [count, setCountDraft] = useState(1);
  const [giving, setGiving] = useState<string | null>(null);

  if (!piece || typeof document === "undefined") return null;
  const data = piece.data as TokenData;
  const bag = readBag(data.bag);
  const others = Object.values(items).filter((i): i is Item<"token"> => i.kind === "token" && i.id !== id);
  const nameOf = (token: Item<"token">) => (token.data as TokenData).label.trim() || t("a piece with no name");

  const save = (next: Carried[]) => void updateData(id, { ...data, bag: next });
  const add = () => {
    if (!name.trim()) return;
    save(put(bag, name, count));
    setName("");
    setCountDraft(1);
  };
  const hand = (line: Carried, to: Item<"token">) => {
    const theirs = to.data as TokenData;
    const moved = give(bag, readBag(theirs.bag), line.id, 1);
    void updateData(id, { ...data, bag: moved.from });
    void updateData(to.id, { ...theirs, bag: moved.to });
    if (!moved.from.some((c) => c.id === line.id)) setGiving(null);
  };

  return createPortal(
    <div
      role="dialog"
      aria-label={t("what it carries")}
      className="surface animate-drift-in fixed top-1/2 left-1/2 z-[70] flex max-h-[70dvh] w-[min(22rem,calc(100vw-1.5rem))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-3xl"
      onPointerDown={(event) => event.stopPropagation()}
    >
      <header className="flex items-center gap-2 border-b border-white/8 px-4 py-3">
        <span className="size-3 shrink-0 rounded-full" style={{ background: data.color }} />
        <h2 className="min-w-0 flex-1 truncate text-sm font-semibold">
          {data.label.trim() ? t("what {name} carries", { name: data.label.trim() }) : t("what it carries")}
        </h2>
        <button type="button" onClick={onClose} aria-label={t("close")} className="grid size-7 place-items-center rounded-lg text-muted hover:bg-white/8 hover:text-chalk">
          <X className="size-3.5" strokeWidth={2.4} />
        </button>
      </header>

      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 py-2.5">
        {bag.length === 0 && <p className="py-4 text-center text-xs text-muted/60">{t("nothing yet. add the first thing below.")}</p>}
        {bag.map((line) => (
          <div key={line.id} className="rounded-xl bg-white/4 p-1">
            <div className="flex items-center gap-1">
              <input
                key={line.name}
                defaultValue={line.name}
                maxLength={MAX_NAME}
                disabled={!canEdit}
                aria-label={t("name")}
                onBlur={(event) => event.target.value.trim() !== line.name && save(rename(bag, line.id, event.target.value))}
                onKeyDown={(event) => event.key === "Enter" && (event.target as HTMLInputElement).blur()}
                className="h-8 min-w-0 flex-1 rounded-lg bg-transparent px-2 text-[13px] text-chalk outline-none focus:bg-white/6"
              />
              <button type="button" disabled={!canEdit} onClick={() => save(setCount(bag, line.id, line.count - 1))} aria-label={t("one fewer")} className="grid size-8 place-items-center rounded-lg text-muted hover:bg-white/8 hover:text-chalk disabled:opacity-35">
                <Minus className="size-3.5" />
              </button>
              <span className="w-8 text-center text-[13px] font-semibold text-chalk tabular-nums">{line.count}</span>
              <button type="button" disabled={!canEdit} onClick={() => save(setCount(bag, line.id, line.count + 1))} aria-label={t("one more")} className="grid size-8 place-items-center rounded-lg text-muted hover:bg-white/8 hover:text-chalk disabled:opacity-35">
                <Plus className="size-3.5" />
              </button>
              {others.length > 0 && (
                <button
                  type="button"
                  disabled={!canEdit}
                  onClick={() => setGiving(giving === line.id ? null : line.id)}
                  aria-label={t("give one to another piece")}
                  title={t("give one to another piece")}
                  className={`grid size-8 place-items-center rounded-lg hover:bg-white/8 disabled:opacity-35 ${giving === line.id ? "bg-glow/22 text-glow" : "text-muted hover:text-chalk"}`}
                >
                  <ArrowRightLeft className="size-3.5" />
                </button>
              )}
              <button type="button" disabled={!canEdit} onClick={() => save(drop(bag, line.id))} aria-label={t("take it out")} className="grid size-8 place-items-center rounded-lg text-muted hover:bg-red-500/15 hover:text-red-300 disabled:opacity-35">
                <X className="size-3.5" />
              </button>
            </div>
            {giving === line.id && (
              <div className="flex flex-wrap gap-1 px-1 pt-1 pb-0.5">
                <span className="w-full text-[10px] text-muted">{t("give one to:")}</span>
                {others.map((other) => (
                  <button key={other.id} type="button" onClick={() => hand(line, other)} className="flex min-h-8 items-center gap-1.5 rounded-lg bg-white/7 px-2 text-[11px] text-chalk hover:bg-white/12">
                    <span className="size-2.5 rounded-full" style={{ background: (other.data as TokenData).color }} />
                    {nameOf(other)}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          add();
        }}
        className="flex items-center gap-1.5 border-t border-white/8 p-2.5"
      >
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          disabled={!canEdit}
          maxLength={MAX_NAME}
          placeholder={t("a sword, 30 gold, a key...")}
          className="min-w-0 flex-1 rounded-xl bg-white/7 px-3 py-2 text-sm ring-1 ring-white/10 outline-none placeholder:text-muted/55 focus:ring-glow/45"
        />
        <input
          type="number"
          min={1}
          max={MAX_COUNT}
          value={count}
          disabled={!canEdit}
          aria-label={t("how many")}
          onChange={(event) => setCountDraft(Math.max(1, Math.min(MAX_COUNT, Number(event.target.value) || 1)))}
          className="w-14 rounded-xl bg-white/7 px-2 py-2 text-center text-sm tabular-nums ring-1 ring-white/10 outline-none focus:ring-glow/45"
        />
        <button type="submit" disabled={!canEdit || !name.trim()} aria-label={t("put it in")} className="grid size-9 shrink-0 place-items-center rounded-xl bg-chalk text-ink-950 transition hover:bg-white disabled:opacity-35">
          <Plus className="size-4" strokeWidth={2.4} />
        </button>
      </form>
    </div>,
    document.body,
  );
}
