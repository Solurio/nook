/**
 * Glyphs for the floating reactions. These are user-facing content rather
 * than decoration, which is why literal characters live here instead of an
 * icon set. Keeping them in one list makes the palette easy to swap.
 */
export const REACTIONS = ["<3", "!", "?", "ha", "wow", "yes"] as const;

export const REACTION_GLYPHS: Record<(typeof REACTIONS)[number], string> = {
  "<3": "❤️",
  "!": "❗",
  "?": "❓",
  ha: "😂",
  wow: "✨",
  yes: "👍",
};
