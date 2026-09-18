// A PDF laid on the table: as a book, opened to a spread with the cover on its
// own, or on a clipboard, one sheet at a time. The file itself is never
// changed. Whatever people draw or pin on it lives here, in the room, as a
// layer over the page -- normalised to the page so it lines up at any size.

export type PdfMode = "book" | "clipboard";

export interface InkMark {
  id: string;
  kind: "pen" | "highlight";
  color: string;
  /** In page units: a thousandth of the page's width. */
  width: number;
  /** x0, y0, x1, y1, ... each 0 to 1 across and down the page. */
  points: number[];
  by?: string;
}

export interface NoteMark {
  id: string;
  kind: "note";
  x: number;
  y: number;
  text: string;
  color: string;
  by?: string;
}

export type PdfMark = InkMark | NoteMark;

export interface PdfData {
  src: string;
  name: string;
  /** Known once the file has been opened; 0 until then. */
  pages: number;
  mode: PdfMode;
  /** The page everyone is on, from 1. In a book, either page of the spread. */
  page: number;
  /** Marks by page number. */
  marks: Record<string, PdfMark[]>;
  bookmarks: number[];
}

export const MAX_MARKS_PER_PAGE = 120;
export const MAX_POINTS = 240;
export const NOTE_MAX = 280;
export const MAX_BOOKMARKS = 40;

export const PEN_COLORS = ["#1a1420", "#c0392b", "#2e6fd1", "#2f8f4e"];
export const HIGHLIGHT_COLORS = ["#ffe066", "#8ce99a", "#74c0fc", "#f783ac"];

export function emptyPdf(): PdfData {
  return { src: "", name: "", pages: 0, mode: "book", page: 1, marks: {}, bookmarks: [] };
}

export function clampPage(page: number, pages: number): number {
  if (!Number.isFinite(page)) return 1;
  return Math.max(1, Math.min(Math.max(1, pages), Math.round(page)));
}

// ---------------------------------------------------------------------------
// The book
// ---------------------------------------------------------------------------

/**
 * The two pages showing when a book is open at `page`. The cover sits alone
 * on the right, as a real book opens; after that the even pages are on the
 * left. The last page may be alone on the left.
 */
export function spreadOf(page: number, pages: number): [number | null, number | null] {
  const at = clampPage(page, pages);
  if (at <= 1) return [null, 1];
  const left = at % 2 === 0 ? at : at - 1;
  return [left, left + 1 <= pages ? left + 1 : null];
}

/** The page a turn lands on: the next spread, or the next sheet on a clipboard. */
export function turn(page: number, pages: number, mode: PdfMode, by: 1 | -1): number {
  if (mode === "clipboard") return clampPage(page + by, pages);
  const [left, right] = spreadOf(page, pages);
  if (by > 0) {
    const last = right ?? left ?? 1;
    return last >= pages ? clampPage(page, pages) : last + 1;
  }
  const first = left ?? right ?? 1;
  if (first <= 1) return 1;
  const [before, cover] = spreadOf(first - 1, pages);
  return before ?? cover ?? 1;
}

/** Whether turning that way would go anywhere. */
export function canTurn(page: number, pages: number, mode: PdfMode, by: 1 | -1): boolean {
  if (pages <= 0) return false;
  if (mode === "clipboard") return by > 0 ? page < pages : page > 1;
  const [left, right] = spreadOf(page, pages);
  return by > 0 ? (right ?? left ?? 1) < pages : (left ?? right ?? 1) > 1;
}

/** Where the reader is, from 0 to 1. */
export function progress(page: number, pages: number): number {
  if (pages <= 1) return pages === 1 ? 1 : 0;
  return (clampPage(page, pages) - 1) / (pages - 1);
}

// ---------------------------------------------------------------------------
// Marks
// ---------------------------------------------------------------------------

const round3 = (n: number) => Math.round(Math.min(1, Math.max(0, n)) * 1000) / 1000;

/**
 * Thins a stroke to the points that matter (Ramer-Douglas-Peucker), rounded
 * to a thousandth of the page, so a scribble does not take a page of JSON.
 */
export function simplify(points: number[], tolerance = 0.002): number[] {
  const pts: Array<[number, number]> = [];
  for (let i = 0; i + 1 < points.length; i += 2) pts.push([round3(points[i]), round3(points[i + 1])]);
  if (pts.length <= 2) return pts.flat();

  const keep = new Array<boolean>(pts.length).fill(false);
  keep[0] = keep[pts.length - 1] = true;
  const stack: Array<[number, number]> = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop() as [number, number];
    const [ax, ay] = pts[a];
    const [bx, by] = pts[b];
    const dx = bx - ax;
    const dy = by - ay;
    const length = Math.hypot(dx, dy) || 1e-9;
    let far = -1;
    let at = -1;
    for (let i = a + 1; i < b; i += 1) {
      const d = Math.abs(dy * pts[i][0] - dx * pts[i][1] + bx * ay - by * ax) / length;
      if (d > far) {
        far = d;
        at = i;
      }
    }
    if (far > tolerance && at > 0) {
      keep[at] = true;
      stack.push([a, at], [at, b]);
    }
  }
  let out = pts.filter((_, i) => keep[i]);
  // Still too long: keep every nth, and always the last.
  if (out.length > MAX_POINTS / 2) {
    const step = Math.ceil(out.length / (MAX_POINTS / 2));
    out = out.filter((_, i) => i % step === 0 || i === out.length - 1);
  }
  return out.flat();
}

export function addMark(data: PdfData, page: number, mark: PdfMark): PdfData {
  const key = String(page);
  const clean: PdfMark =
    mark.kind === "note"
      ? { ...mark, x: round3(mark.x), y: round3(mark.y), text: mark.text.slice(0, NOTE_MAX) }
      : { ...mark, points: simplify(mark.points) };
  if (clean.kind !== "note" && clean.points.length < 4) return data;
  const list = [...(data.marks[key] ?? []), clean].slice(-MAX_MARKS_PER_PAGE);
  return { ...data, marks: { ...data.marks, [key]: list } };
}

export function editNote(data: PdfData, page: number, id: string, text: string): PdfData {
  const key = String(page);
  return {
    ...data,
    marks: {
      ...data.marks,
      [key]: (data.marks[key] ?? []).map((m) => (m.id === id && m.kind === "note" ? { ...m, text: text.slice(0, NOTE_MAX) } : m)),
    },
  };
}

export function removeMark(data: PdfData, page: number, id: string): PdfData {
  const key = String(page);
  const list = (data.marks[key] ?? []).filter((m) => m.id !== id);
  const marks = { ...data.marks };
  if (list.length) marks[key] = list;
  else delete marks[key];
  return { ...data, marks };
}

export function clearPage(data: PdfData, page: number): PdfData {
  const marks = { ...data.marks };
  delete marks[String(page)];
  return { ...data, marks };
}

/** The ink mark nearest a point, if one passes within reach -- what an eraser touches. */
export function markAt(marks: PdfMark[], x: number, y: number, reach = 0.02): PdfMark | null {
  let best: PdfMark | null = null;
  let bestD = reach;
  for (const mark of marks) {
    if (mark.kind === "note") {
      const d = Math.hypot(mark.x - x, mark.y - y);
      if (d < bestD) {
        best = mark;
        bestD = d;
      }
      continue;
    }
    for (let i = 0; i + 1 < mark.points.length; i += 2) {
      const d = Math.hypot(mark.points[i] - x, mark.points[i + 1] - y);
      if (d < bestD) {
        best = mark;
        bestD = d;
      }
    }
  }
  return best;
}

export function toggleBookmark(data: PdfData, page: number): PdfData {
  const has = data.bookmarks.includes(page);
  const bookmarks = has ? data.bookmarks.filter((p) => p !== page) : [...data.bookmarks, page].sort((a, b) => a - b);
  return { ...data, bookmarks: bookmarks.slice(0, MAX_BOOKMARKS) };
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

/** Lower case with the accents off, so "cafe" finds "Café". */
export function fold(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export function countMatches(text: string, query: string): number {
  const q = fold(query.trim());
  if (!q) return 0;
  const hay = fold(text);
  let count = 0;
  let at = hay.indexOf(q);
  while (at >= 0) {
    count += 1;
    at = hay.indexOf(q, at + q.length);
  }
  return count;
}

/** A line of context around the first match. */
export function snippet(text: string, query: string, radius = 38): string {
  const q = fold(query.trim());
  const flat = text.replace(/\s+/g, " ");
  const at = fold(flat).indexOf(q);
  if (!q || at < 0) return "";
  const start = Math.max(0, at - radius);
  const end = Math.min(flat.length, at + q.length + radius);
  return `${start > 0 ? "..." : ""}${flat.slice(start, end).trim()}${end < flat.length ? "..." : ""}`;
}

/** A link is only ever opened if it goes somewhere a browser should go. */
export function safeLink(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:" || parsed.protocol === "mailto:" ? parsed.href : null;
  } catch {
    return null;
  }
}
