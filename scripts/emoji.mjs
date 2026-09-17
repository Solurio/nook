// Rebuilds src/lib/emoji-data.ts from the Unicode emoji list.
//
//   node scripts/emoji.mjs
//
// Worth rerunning when a new Unicode release lands, and otherwise never. The
// generated file is committed so a build never has to reach the network.

import { writeFileSync } from "node:fs";

const SOURCE = "https://unicode.org/Public/emoji/latest/emoji-test.txt";
const OUT = new URL("../src/lib/emoji-data.ts", import.meta.url);

/** Unicode's group names, and what this app calls them. */
const GROUPS = new Map([
  ["Smileys & Emotion", "smileys"],
  ["People & Body", "people"],
  ["Animals & Nature", "nature"],
  ["Food & Drink", "food"],
  ["Travel & Places", "travel"],
  ["Activities", "activities"],
  ["Objects", "objects"],
  ["Symbols", "symbols"],
  ["Flags", "flags"],
]);

const response = await fetch(SOURCE);
if (!response.ok) throw new Error(`${SOURCE} answered ${response.status}`);
const text = await response.text();

const byGroup = new Map([...GROUPS.values()].map((slug) => [slug, []]));
const seen = new Set();
let group = null;

for (const line of text.split("\n")) {
  if (line.startsWith("# group:")) {
    group = line.slice("# group:".length).trim();
    continue;
  }
  if (line.startsWith("#") || !line.includes("; fully-qualified")) continue;
  if (!GROUPS.has(group)) continue;

  // The comment carries what we actually want: "😀 E1.0 grinning face".
  const comment = line.slice(line.indexOf("#") + 1).trim();
  const match = /^(\S+)\s+E[\d.]+\s+(.*)$/.exec(comment);
  if (!match) continue;

  const [, char, name] = match;
  // Five copies of every hand would treble the list without adding anything
  // anyone is going to search for.
  if (name.includes("skin tone")) continue;
  if (seen.has(char)) continue;
  seen.add(char);

  byGroup.get(GROUPS.get(group)).push(`${char} ${name}`);
}

const total = [...byGroup.values()].reduce((sum, rows) => sum + rows.length, 0);
if (total < 1500) throw new Error(`only parsed ${total} emoji; the format has moved`);

const out = `// Generated from the Unicode emoji list. Do not hand edit -- run
// \`node scripts/emoji.mjs\` to rebuild it against a newer Unicode release.
//
// Skin tone variants are left out on purpose: five copies of every hand would
// treble the list without adding anything anyone is going to search for.

export const EMOJI_GROUPS = [
${[...GROUPS.values()].map((slug) => `  "${slug}",`).join("\n")}
] as const;

export type EmojiGroup = (typeof EMOJI_GROUPS)[number];

/**
 * One emoji per line, the character then its name. Packed as text rather than
 * an array of objects because it is a fraction of the bytes, and the split
 * happens once, the first time the picker opens.
 */
export const PACKED: Record<EmojiGroup, string> = {
${[...byGroup]
  .map(([slug, rows]) => `  ${slug}: "${rows.join("\\n")}",`)
  .join("\n")}
};
`;

writeFileSync(OUT, out, "utf8");
console.log(`${total} emoji across ${GROUPS.size} groups -> src/lib/emoji-data.ts`);
