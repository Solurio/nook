/**
 * Glyphs for the floating reactions. These are user-facing content rather than
 * decoration, which is why literal characters live here instead of an icon set.
 */
export const REACTIONS = [
  "heart",
  "fire",
  "sparkle",
  "laugh",
  "cry",
  "shock",
  "yes",
  "no",
  "clap",
  "star",
  "sob",
  "cool",
  "party",
  "skull",
  "eyes",
  "pray",
] as const;

export const REACTION_GLYPHS: Record<(typeof REACTIONS)[number], string> = {
  heart: "❤️",
  fire: "🔥",
  sparkle: "✨",
  laugh: "😂",
  cry: "🥹",
  shock: "😮",
  yes: "👍",
  no: "👎",
  clap: "👏",
  star: "🌟",
  sob: "😭",
  cool: "😎",
  party: "🎉",
  skull: "💀",
  eyes: "👀",
  pray: "🙏",
};
