// What a piece carries: a short list of things, each with how many. Kept on
// the piece itself, so it moves with it and everyone sees the same bag.
// Two of the same name are one line with a bigger number.

export interface Carried {
  id: string;
  name: string;
  count: number;
}

export const MAX_LINES = 60;
export const MAX_NAME = 40;
export const MAX_COUNT = 9999;

const clampCount = (n: number) => Math.max(0, Math.min(MAX_COUNT, Math.round(Number.isFinite(n) ? n : 0)));
const same = (a: string, b: string) => a.trim().toLocaleLowerCase() === b.trim().toLocaleLowerCase();

/** A bag read from whatever was saved: anything malformed is left out. */
export function readBag(raw: unknown): Carried[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((c): c is Carried => typeof c === "object" && c !== null && typeof (c as Carried).id === "string" && typeof (c as Carried).name === "string")
    .map((c) => ({ id: c.id, name: c.name.slice(0, MAX_NAME), count: clampCount(c.count) }))
    .filter((c) => c.name.trim() && c.count > 0)
    .slice(0, MAX_LINES);
}

/** Puts something in: onto the line of the same name if there is one. */
export function put(bag: Carried[], name: string, count = 1, id: string = Math.random().toString(36).slice(2, 10)): Carried[] {
  const clean = name.trim().slice(0, MAX_NAME);
  const n = clampCount(count);
  if (!clean || n <= 0) return bag;
  const at = bag.findIndex((c) => same(c.name, clean));
  if (at >= 0) return bag.map((c, i) => (i === at ? { ...c, count: clampCount(c.count + n) } : c));
  if (bag.length >= MAX_LINES) return bag;
  return [...bag, { id, name: clean, count: n }];
}

/** Sets how many; none left takes the line away. */
export function setCount(bag: Carried[], id: string, count: number): Carried[] {
  const n = clampCount(count);
  return n <= 0 ? bag.filter((c) => c.id !== id) : bag.map((c) => (c.id === id ? { ...c, count: n } : c));
}

export function rename(bag: Carried[], id: string, name: string): Carried[] {
  const clean = name.trim().slice(0, MAX_NAME);
  if (!clean) return bag;
  const line = bag.find((c) => c.id === id);
  if (!line) return bag;
  // Renamed into something already carried: the two become one line.
  const twin = bag.find((c) => c.id !== id && same(c.name, clean));
  if (twin) return bag.filter((c) => c.id !== id).map((c) => (c.id === twin.id ? { ...c, count: clampCount(c.count + line.count) } : c));
  return bag.map((c) => (c.id === id ? { ...c, name: clean } : c));
}

export function drop(bag: Carried[], id: string): Carried[] {
  return bag.filter((c) => c.id !== id);
}

/** Hands some of a line to another bag; both come back changed. */
export function give(from: Carried[], to: Carried[], id: string, count = 1): { from: Carried[]; to: Carried[] } {
  const line = from.find((c) => c.id === id);
  if (!line) return { from, to };
  const n = Math.min(clampCount(count), line.count);
  if (n <= 0) return { from, to };
  return { from: setCount(from, id, line.count - n), to: put(to, line.name, n) };
}

/** How many things in all, for the badge on the piece. */
export function total(bag: Carried[]): number {
  return bag.reduce((sum, c) => sum + c.count, 0);
}
