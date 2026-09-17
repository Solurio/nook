// Searching the emoji list. The list itself is generated into emoji-data.ts;
// this is the part worth reading.

import { EMOJI_GROUPS, PACKED, type EmojiGroup } from "./emoji-data";

export { EMOJI_GROUPS, type EmojiGroup };

export interface Emoji {
  /** The character itself. */
  char: string;
  /** Unicode's name, which is also what searching matches against. */
  name: string;
  group: EmojiGroup;
}

/**
 * Extra words to find things by. Unicode names are literal and English -- "红
 * heart" is "red heart", nothing else -- so a search for "love", or for
 * anything at all in Portuguese, comes back empty without these.
 *
 * Only the handful people actually reach for. The long tail is fine on its
 * proper name.
 */
const ALIASES: Record<string, string> = {
  "❤️": "love amor coracao heart",
  "🧡": "amor coracao laranja",
  "💛": "amor coracao amarelo",
  "💚": "amor coracao verde",
  "💙": "amor coracao azul",
  "💜": "amor coracao roxo",
  "🖤": "amor coracao preto",
  "💔": "heartbreak partido triste",
  "😂": "lol rindo risada rir kkk haha funny",
  "🤣": "lol rindo risada rir kkk haha funny",
  "😅": "risada nervoso aliviado",
  "😊": "feliz happy sorriso contente",
  "😀": "feliz happy sorriso",
  "😁": "feliz happy sorriso",
  "🙂": "feliz sorriso ok",
  "😍": "amor love apaixonado lindo",
  "🥰": "amor love apaixonado carinho",
  "😘": "beijo kiss amor",
  "😭": "chorando choro triste sad crying",
  "😢": "chorando choro triste sad",
  "😔": "triste sad chateado",
  "😡": "raiva bravo angry irritado",
  "🤬": "raiva bravo xingando palavrao angry",
  "😱": "susto medo choque scared shock",
  "😮": "surpresa uau wow surpreso",
  "🤔": "pensando duvida hmm thinking",
  "😴": "sono dormindo cansado sleep",
  "🥱": "bocejo sono cansado tired",
  "🤢": "nojo enjoo eca gross",
  "😎": "estiloso maneiro legal cool oculos",
  "🥳": "festa comemorar party aniversario",
  "🤯": "explodindo mente chocado mindblown",
  "😳": "vergonha constrangido embaracado",
  "🙃": "ironia sarcasmo",
  "💀": "morto morri caveira dead morrendo",
  "👻": "fantasma assombrado boo",
  "🔥": "fogo foda incrivel lit fire top",
  "✨": "brilho magia estrelas sparkle",
  "⭐": "estrela favorito star",
  "🌟": "estrela brilho star",
  "💯": "cem perfeito nota dez hundred",
  "👍": "joinha positivo curti like ok yes sim",
  "👎": "negativo nao descurti dislike no",
  "👏": "palmas aplausos parabens clap",
  "🙏": "obrigado por favor reza please thanks",
  "🤝": "acordo aperto de mao combinado deal",
  "✌️": "paz victoria",
  "🤙": "suave beleza",
  "👀": "olhando olhos vendo eyes fofoca",
  "🧠": "cerebro ideia pensar brain",
  "💪": "forca musculo forte strong",
  "🎉": "festa parabens comemorar party",
  "🎂": "bolo aniversario birthday",
  "🍕": "pizza comida food",
  "🍔": "hamburguer lanche comida food",
  "☕": "cafe coffee",
  "🍺": "cerveja beer bebida",
  "🍻": "brinde cerveja saude cheers",
  "🎮": "jogo videogame gaming",
  "🎵": "musica som music",
  "🎶": "musica som music",
  "📷": "foto camera picture",
  "💤": "sono dormindo zzz",
  "🚀": "foguete lancamento rapido rocket bora",
  "🐛": "bug inseto erro",
  "🤖": "robo bot ia ai",
  "💸": "dinheiro grana money caro",
  "⚠️": "aviso cuidado atencao warning",
  "✅": "certo feito pronto check ok done",
  "❌": "errado nao cancelado wrong",
  "❓": "pergunta duvida question",
  "❗": "atencao importante exclamacao",
  "🇧🇷": "brasil brazil bandeira",
};

/** Lowercased and stripped of accents, so "coração" and "coracao" both land. */
export function fold(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

let cache: Emoji[] | null = null;

/** The whole list, parsed once. */
export function allEmoji(): Emoji[] {
  if (cache) return cache;
  cache = EMOJI_GROUPS.flatMap((group) =>
    PACKED[group]
      .split("\n")
      .filter(Boolean)
      .map((row) => {
        const at = row.indexOf(" ");
        return { char: row.slice(0, at), name: row.slice(at + 1), group };
      }),
  );
  return cache;
}

export function emojiIn(group: EmojiGroup): Emoji[] {
  return allEmoji().filter((emoji) => emoji.group === group);
}

/**
 * How well one emoji answers a search. Higher is better, zero means no. The
 * ranking is what stops "fire" burying 🔥 under "firecracker" and "fire
 * engine": a whole word beats the start of a longer one, which beats a match
 * buried in the middle.
 */
function score(emoji: Emoji, term: string): number {
  const name = fold(emoji.name);
  if (name === term) return 100;

  const words = name.split(/[\s:,-]+/);
  if (words.includes(term)) return 80;
  if (words.some((word) => word.startsWith(term))) return 60;

  const alias = ALIASES[emoji.char];
  if (alias) {
    const parts = fold(alias).split(" ");
    if (parts.includes(term)) return 70;
    if (parts.some((part) => part.startsWith(term))) return 50;
  }

  return name.includes(term) ? 20 : 0;
}

/** Everything matching, best first. An empty search matches nothing. */
export function searchEmoji(term: string, limit = 120): Emoji[] {
  const needle = fold(term);
  if (!needle) return [];

  const hits: Array<{ emoji: Emoji; score: number }> = [];
  for (const emoji of allEmoji()) {
    const value = score(emoji, needle);
    if (value > 0) hits.push({ emoji, score: value });
  }

  // Ties keep Unicode's order, which groups related things together.
  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, limit).map((hit) => hit.emoji);
}
