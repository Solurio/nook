"use client";

// Everything that talks to pdf.js. The library is big, so it is only fetched
// the first time a PDF is actually on the table; documents, rendered pages and
// page text are all kept for a while, since a book gets turned back and forth
// and every screen in the room is showing the same few pages.

import type { PDFDocumentProxy } from "pdfjs-dist";
import { safeLink } from "@/lib/pdf";

type PdfJs = typeof import("pdfjs-dist");

let library: Promise<PdfJs> | null = null;

function pdfjs(): Promise<PdfJs> {
  library ??= import("pdfjs-dist").then((lib) => {
    lib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
    return lib;
  });
  return library;
}

const documents = new Map<string, Promise<PDFDocumentProxy>>();

/** Opens a document once, however many screens and items ask for it. */
export function openPdf(url: string): Promise<PDFDocumentProxy> {
  let doc = documents.get(url);
  if (!doc) {
    doc = pdfjs().then(
      (lib) =>
        lib.getDocument({
          url,
          // Only the pages being looked at are fetched, in ranges, so a
          // three hundred page scan opens as fast as a leaflet.
          disableAutoFetch: true,
        }).promise,
    );
    doc.catch(() => documents.delete(url));
    documents.set(url, doc);
  }
  return doc;
}

// ---------------------------------------------------------------------------
// Pages as pictures
// ---------------------------------------------------------------------------

const MAX_KEPT = 14;
const pictures = new Map<string, Promise<HTMLCanvasElement>>();

/** Rendered widths come in steps, so a small resize does not render again. */
const bucket = (px: number) => Math.min(2048, Math.max(256, Math.ceil(px / 128) * 128));

/** The shape of a page, height over width. */
export async function aspectOf(doc: PDFDocumentProxy, n: number): Promise<number> {
  const page = await doc.getPage(n);
  const view = page.getViewport({ scale: 1 });
  return view.height / view.width;
}

/**
 * A page drawn at about this many device pixels wide. Kept, so turning back
 * to it is instant, and so the leaf of a turning page costs nothing.
 */
export function pagePicture(url: string, doc: PDFDocumentProxy, n: number, pixelWidth: number): Promise<HTMLCanvasElement> {
  const width = bucket(pixelWidth);
  const key = `${url}#${n}@${width}`;
  const kept = pictures.get(key);
  if (kept) {
    // Most recently used goes to the back of the queue.
    pictures.delete(key);
    pictures.set(key, kept);
    return kept;
  }
  const made = (async () => {
    const page = await doc.getPage(n);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: width / base.width });
    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("no canvas");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvas, canvasContext: context, viewport }).promise;
    return canvas;
  })();
  made.catch(() => pictures.delete(key));
  pictures.set(key, made);
  while (pictures.size > MAX_KEPT) {
    const oldest = pictures.keys().next().value as string;
    pictures.delete(oldest);
  }
  return made;
}

// ---------------------------------------------------------------------------
// Words, for searching
// ---------------------------------------------------------------------------

export interface PageWords {
  text: string;
  /** Each run of text and where it sits, 0 to 1 across and down the page. */
  runs: Array<{ str: string; x: number; y: number; w: number; h: number }>;
}

const words = new Map<string, Promise<PageWords>>();

export function pageWords(url: string, doc: PDFDocumentProxy, n: number): Promise<PageWords> {
  const key = `${url}#${n}`;
  let found = words.get(key);
  if (!found) {
    found = (async () => {
      const page = await doc.getPage(n);
      const view = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      const runs: PageWords["runs"] = [];
      for (const piece of content.items) {
        if (!("str" in piece) || !piece.str.trim()) continue;
        const [, , , d, e, f] = piece.transform as number[];
        const height = Math.abs(d) || piece.height || 10;
        const [x1, y1, x2, y2] = view.convertToViewportRectangle([e, f, e + piece.width, f + height]);
        runs.push({
          str: piece.str,
          x: Math.min(x1, x2) / view.width,
          y: Math.min(y1, y2) / view.height,
          w: Math.abs(x2 - x1) / view.width,
          h: Math.abs(y2 - y1) / view.height,
        });
      }
      return { text: runs.map((r) => r.str).join(" "), runs };
    })();
    found.catch(() => words.delete(key));
    words.set(key, found);
  }
  return found;
}

// ---------------------------------------------------------------------------
// Links, and the table of contents
// ---------------------------------------------------------------------------

export interface PageLink {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Somewhere else on the web. */
  url?: string;
  /** Somewhere else in the document. */
  page?: number;
}

type Destination = string | unknown[] | null;

async function pageOf(doc: PDFDocumentProxy, dest: Destination): Promise<number | undefined> {
  try {
    const explicit = typeof dest === "string" ? await doc.getDestination(dest) : dest;
    if (!Array.isArray(explicit) || explicit.length === 0) return undefined;
    const ref = explicit[0];
    if (typeof ref === "number") return ref + 1;
    return (await doc.getPageIndex(ref as Parameters<PDFDocumentProxy["getPageIndex"]>[0])) + 1;
  } catch {
    return undefined;
  }
}

const links = new Map<string, Promise<PageLink[]>>();

export function pageLinks(url: string, doc: PDFDocumentProxy, n: number): Promise<PageLink[]> {
  const key = `${url}#${n}`;
  let found = links.get(key);
  if (!found) {
    found = (async () => {
      const page = await doc.getPage(n);
      const view = page.getViewport({ scale: 1 });
      const annotations = (await page.getAnnotations({ intent: "display" })) as Array<{
        subtype?: string;
        rect?: number[];
        url?: string;
        unsafeUrl?: string;
        dest?: Destination;
      }>;
      const out: PageLink[] = [];
      for (const note of annotations) {
        if (note.subtype !== "Link" || !note.rect) continue;
        const [x1, y1, x2, y2] = view.convertToViewportRectangle(note.rect);
        const box = {
          x: Math.min(x1, x2) / view.width,
          y: Math.min(y1, y2) / view.height,
          w: Math.abs(x2 - x1) / view.width,
          h: Math.abs(y2 - y1) / view.height,
        };
        const outside = note.url ? safeLink(note.url) : null;
        if (outside) out.push({ ...box, url: outside });
        else if (note.dest) {
          const target = await pageOf(doc, note.dest);
          if (target) out.push({ ...box, page: target });
        }
      }
      return out;
    })();
    found.catch(() => links.delete(key));
    links.set(key, found);
  }
  return found;
}

export interface OutlineEntry {
  title: string;
  page?: number;
  url?: string;
  children: OutlineEntry[];
}

/** The document's own table of contents, if it has one, with page numbers worked out. */
export async function outlineOf(doc: PDFDocumentProxy): Promise<OutlineEntry[]> {
  const raw = (await doc.getOutline()) as Array<{ title: string; dest: Destination; url: string | null; items: unknown[] }> | null;
  if (!raw) return [];
  const walk = async (entries: typeof raw, depth: number): Promise<OutlineEntry[]> =>
    Promise.all(
      entries.slice(0, 300).map(async (entry) => ({
        title: entry.title,
        page: entry.dest ? await pageOf(doc, entry.dest) : undefined,
        url: entry.url ? (safeLink(entry.url) ?? undefined) : undefined,
        children: depth < 3 ? await walk(entry.items as typeof raw, depth + 1) : [],
      })),
    );
  return walk(raw, 0);
}
