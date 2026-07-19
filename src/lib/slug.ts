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

/** Accepts a bare slug or a full room URL and returns just the slug. */
export function normalizeSlugInput(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

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
