"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { PaintOp } from "@/lib/studio/ops";

export type OpsMode = "loading" | "table" | "item";

interface Row {
  id: string;
  seq: number;
  op: PaintOp;
}

/** Baked pictures come first; everything else in the order it was done. */
const ordered = (rows: Row[]) =>
  [...rows].sort((a, b) => {
    const ba = (a.op as { baked?: boolean }).baked ? 0 : 1;
    const bb = (b.op as { baked?: boolean }).baked ? 0 : 1;
    return ba - bb || a.seq - b.seq;
  });

/**
 * The ops of one picture. With the paint_ops table (0009) each op is a row:
 * adding one is one insert, and everyone else gets that row and nothing more.
 * Without it the ops live in the item, the way boards always kept them, so the
 * studio still works -- it only sends more with every stroke.
 *
 * Ops kept in the item before the table existed stay where they are and come
 * first.
 */
export function usePaintOps({
  itemId,
  roomId,
  itemOps,
  editItemOps,
}: {
  itemId: string;
  roomId: string;
  /** The ops kept in the item itself. */
  itemOps: PaintOp[];
  /** Changes the item's own ops, starting from the newest copy of them. */
  editItemOps: (change: (ops: PaintOp[]) => PaintOp[]) => void;
}) {
  const [mode, setMode] = useState<OpsMode>("loading");
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    let cancelled = false;
    const db = supabaseBrowser();
    void db
      .from("paint_ops")
      .select("id, seq, op")
      .eq("item_id", itemId)
      .order("seq", { ascending: true })
      .limit(5000)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          setMode("item");
          return;
        }
        setRows((data ?? []) as Row[]);
        setMode("table");
      });
    // A name of its own for each mount: the same board shown twice at once (the
    // room and full screen) would otherwise be handed one channel, already
    // subscribed, and adding to it then throws.
    const channel = db
      .channel(`paint:${itemId}:${Math.random().toString(36).slice(2, 10)}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "paint_ops", filter: `item_id=eq.${itemId}` }, (payload) => {
        const row = payload.new as Row;
        setRows((current) => (current.some((r) => r.id === row.id) ? current.map((r) => (r.id === row.id ? row : r)) : [...current, row]));
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "paint_ops", filter: `item_id=eq.${itemId}` }, (payload) => {
        const gone = (payload.old as { id?: string }).id;
        if (gone) setRows((current) => current.filter((r) => r.id !== gone));
      })
      .subscribe();
    return () => {
      cancelled = true;
      void db.removeChannel(channel);
    };
  }, [itemId]);

  const ops = useMemo(() => [...itemOps, ...ordered(rows).map((r) => r.op)], [itemOps, rows]);

  const add = useCallback(
    async (next: PaintOp | PaintOp[]): Promise<string | null> => {
      const list = Array.isArray(next) ? next : [next];
      if (!list.length) return null;
      if (mode !== "table") {
        editItemOps((current) => [...current, ...list]);
        return null;
      }
      // Shown straight away, placed after everything known until the real row comes back.
      setRows((current) => {
        const top = current.reduce((m, r) => Math.max(m, r.seq), 0);
        return [...current, ...list.map((op, i) => ({ id: op.id, seq: top + 1e9 + i, op }))];
      });
      for (let i = 0; i < list.length; i += 100) {
        const chunk = list.slice(i, i + 100);
        const { error } = await supabaseBrowser()
          .from("paint_ops")
          .insert(chunk.map((op) => ({ id: op.id, item_id: itemId, room_id: roomId, op })));
        if (error) {
          const ids = new Set(list.slice(i).map((op) => op.id));
          setRows((current) => current.filter((r) => !ids.has(r.id)));
          return error.message;
        }
      }
      return null;
    },
    [editItemOps, itemId, mode, roomId],
  );

  const remove = useCallback(
    async (ids: string[]): Promise<string | null> => {
      if (!ids.length) return null;
      const gone = new Set(ids);
      // Some may be the item's own, from before the table.
      if (mode !== "table" || itemOps.some((op) => gone.has(op.id))) editItemOps((current) => current.filter((op) => !gone.has(op.id)));
      if (mode !== "table") return null;
      setRows((current) => current.filter((r) => !gone.has(r.id)));
      const inTable = ids.filter((id) => !itemOps.some((op) => op.id === id));
      for (let i = 0; i < inTable.length; i += 200) {
        const { error } = await supabaseBrowser().from("paint_ops").delete().in("id", inTable.slice(i, i + 200));
        if (error) return error.message;
      }
      return null;
    },
    [editItemOps, itemOps, mode],
  );

  /** Some ops out and others in, as one change: a layer's history folded into a picture. */
  const replace = useCallback(
    async (ids: string[], next: PaintOp[]): Promise<string | null> => {
      if (mode !== "table") {
        const gone = new Set(ids);
        editItemOps((current) => [...current.filter((op) => !gone.has(op.id)), ...next]);
        return null;
      }
      // The new ones go in first, so a failure leaves the old ones standing.
      const failed = await add(next);
      if (failed) return failed;
      return remove(ids);
    },
    [add, editItemOps, mode, remove],
  );

  return { ops, mode, add, remove, replace };
}
