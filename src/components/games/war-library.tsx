"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { tidyRules, tidyWorld, type WarRules, type WarWorld } from "@/lib/war-world";

/** A saved map, without the map itself: enough for a list. */
export interface SavedMap {
  id: string;
  owner_id: string;
  author: string;
  name: string;
  territory_count: number;
  updated_at: string;
}

export type LibraryStatus = "loading" | "ready" | "missing" | "error";

const META = "id, owner_id, author, name, territory_count, updated_at";

/** Turns what the database said into something a person can act on. */
export function explainMapError(message: string | undefined | null): string {
  const text = message ?? "";
  if (/war_maps/.test(text) && /not|exist|find|cache/i.test(text)) {
    return "Saved maps need the newest database update. Run supabase/migrations/0008_war_maps.sql in the Supabase SQL editor.";
  }
  if (/relation .* does not exist|PGRST205/i.test(text)) {
    return "Saved maps need the newest database update. Run supabase/migrations/0008_war_maps.sql in the Supabase SQL editor.";
  }
  if (/row-level security|violates|permission/i.test(text)) return "Only whoever made a map can change it. Save a copy instead.";
  if (/check constraint/i.test(text)) return "That map is too big to save.";
  return text || "The map could not be saved.";
}

/** Every saved map, newest first. Read when the list opens and after a save. */
export function useSavedMaps() {
  const [maps, setMaps] = useState<SavedMap[]>([]);
  const [status, setStatus] = useState<LibraryStatus>("loading");
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let cancelled = false;
    void supabaseBrowser()
      .from("war_maps")
      .select(META)
      .order("updated_at", { ascending: false })
      .limit(300)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          setStatus(/Run supabase/.test(explainMapError(error.message)) ? "missing" : "error");
          return;
        }
        setMaps((data ?? []) as SavedMap[]);
        setStatus("ready");
      });
    return () => {
      cancelled = true;
    };
  }, [tick]);
  return { maps, status, reload: () => setTick((t) => t + 1) };
}

export async function loadSavedMap(id: string): Promise<{ world: WarWorld; rules?: WarRules } | { problem: string }> {
  const { data, error } = await supabaseBrowser().from("war_maps").select("world, rules").eq("id", id).maybeSingle();
  if (error) return { problem: explainMapError(error.message) };
  const world = tidyWorld((data as { world?: unknown } | null)?.world);
  if (!world) return { problem: "That map is gone, or broken." };
  const rules = (data as { rules?: Partial<WarRules> | null }).rules;
  return { world, ...(rules ? { rules: tidyRules(rules) } : {}) };
}

/** Saves a map: over your own copy when there is one, as a new one otherwise. Returns its id. */
export async function saveMapTo(
  world: WarWorld,
  rules: WarRules,
  author: string,
  existing: string | null,
): Promise<{ id: string } | { problem: string }> {
  const row = { author: author.slice(0, 40), name: (world.name || "a map").slice(0, 60), world, rules };
  const db = supabaseBrowser().from("war_maps");
  const { data, error } = existing
    ? await db.update(row).eq("id", existing).select("id").maybeSingle()
    : await db.insert(row).select("id").maybeSingle();
  if (error || !data) return { problem: explainMapError(error?.message ?? "Only whoever made a map can change it. Save a copy instead.") };
  return { id: (data as { id: string }).id };
}

export async function deleteSavedMap(id: string): Promise<string | null> {
  const { error } = await supabaseBrowser().from("war_maps").delete().eq("id", id);
  return error ? explainMapError(error.message) : null;
}
