// Slugs double as the access capability for a room, so they need enough
// entropy to be unguessable while still being readable over voice chat.

const WORDS = [
  "moss", "lamp", "tide", "plum", "dusk", "fern", "cove", "kite",
  "ember", "vinyl", "harbor", "linen", "opal", "willow", "cocoa", "quilt",
  "marble", "sable", "juniper", "clover", "cedar", "pearl", "amber", "birch",
];

const ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";

function randomInts(count: number): Uint32Array {
  const out = new Uint32Array(count);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(out);
    return out;
  }
  for (let i = 0; i < count; i += 1) out[i] = Math.floor(Math.random() * 2 ** 32);
  return out;
}

/** Something like "cocoa-willow-7fk2" — two words plus four random chars. */
export function generateSlug(): string {
  const r = randomInts(6);
  const a = WORDS[r[0] % WORDS.length];
  let b = WORDS[r[1] % WORDS.length];
  if (b === a) b = WORDS[(r[1] + 1) % WORDS.length];

  let tail = "";
  for (let i = 0; i < 4; i += 1) tail += ALPHABET[r[2 + i] % ALPHABET.length];

  return `${a}-${b}-${tail}`;
}

/**
 * Turns whatever someone typed as a room name into a slug for the link, so the
 * address reads like the room instead of like a serial number. Returns null
 * when nothing usable survives (emoji-only names, punctuation, two letters),
 * and the caller falls back to a generated slug.
 */
export function slugifyName(name: string): string | null {
  const slug = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // drop accents, keep the letter
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");

  return /^[a-z0-9-]{3,40}$/.test(slug) ? slug : null;
}

/** A short random tail, for when the slug someone wanted is already taken. */
export function withSuffix(slug: string, length = 3): string {
  const r = randomInts(length);
  let tail = "";
  for (let i = 0; i < length; i += 1) tail += ALPHABET[r[i] % ALPHABET.length];
  return `${slug.slice(0, 40 - length - 1)}-${tail}`;
}

/** Accepts a bare slug or a full room URL and returns just the slug. */
export function normalizeSlugInput(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Rooms are addressed as /r/?r=slug, so an "r" query parameter wins when a
  // whole URL is pasted in.
  const query = trimmed.includes("?") ? trimmed.slice(trimmed.indexOf("?") + 1) : "";
  if (query) {
    const fromQuery = new URLSearchParams(query.split("#")[0]).get("r");
    if (fromQuery) {
      const clean = fromQuery.trim().toLowerCase();
      return /^[a-z0-9-]{3,64}$/.test(clean) ? clean : null;
    }
  }

  // Otherwise fall back to the last path segment (bare slug or an /r/slug link).
  let candidate = trimmed;
  if (trimmed.includes("/")) {
    const parts = trimmed.replace(/\/+$/, "").split("/");
    candidate = parts[parts.length - 1] ?? "";
  }

  candidate = candidate.split("?")[0].split("#")[0].toLowerCase();
  return /^[a-z0-9-]{3,64}$/.test(candidate) ? candidate : null;
}

export function newId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  const r = randomInts(4);
  return Array.from(r, (n) => n.toString(16).padStart(8, "0")).join("-");
}
