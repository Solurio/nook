"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import {
  BookOpen,
  Bookmark,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Eraser,
  FileUp,
  Highlighter,
  ListTree,
  PenLine,
  Search,
  StickyNote,
  Trash2,
  User,
  Users,
  X,
} from "lucide-react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { useRoom } from "@/realtime/room-provider";
import {
  HIGHLIGHT_COLORS,
  PEN_COLORS,
  addMark,
  canTurn,
  clampPage,
  clearPage,
  countMatches,
  editNote,
  emptyPdf,
  progress,
  removeMark,
  snippet,
  spreadOf,
  toggleBookmark,
  turn,
  type PdfData,
  type PdfMark,
  type PdfMode,
} from "@/lib/pdf";
import type { Item } from "@/lib/types";
import { aspectOf, openPdf, outlineOf, pageWords, type OutlineEntry } from "@/components/pdf/engine";
import PageView from "@/components/pdf/page-view";
import { PDF_MAX_MB, uploadPdf } from "@/components/pdf/upload";
import type { InkTool } from "@/components/pdf/ink-layer";
import { t } from "@/lib/i18n";

/**
 * A PDF on the table. Open as a book -- the cover alone, then spreads, the
 * pages turning over -- or clipped to a board a sheet at a time. Everyone
 * reads the same page unless they choose to read on their own, and anything
 * drawn or pinned on it is the room's, over the file rather than in it.
 */
export default function PdfItem({ item }: { item: Item<"pdf"> }) {
  const data = useMemo(() => ({ ...emptyPdf(), ...item.data }) as PdfData, [item.data]);
  if (!data.src) return <PdfSlot item={item} />;
  return <Reader item={item} data={data} />;
}

function PdfSlot({ item }: { item: Item<"pdf"> }) {
  const { canEdit, uploadFile, updateData, setNotice } = useRoom();
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const busy = progress !== null;

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setProgress({ done: 0, total: 1 });
    const up = await uploadPdf(file, uploadFile, (done, total) => setProgress({ done, total }));
    setProgress(null);
    if ("error" in up) {
      setNotice(up.error);
      return;
    }
    await updateData(item.id, { ...emptyPdf(), ...item.data, ...up, name: file.name.replace(/\.pdf$/i, "") });
  };

  return (
    <div className="surface grain grid size-full place-items-center rounded-2xl p-4 text-center">
      <div className="flex flex-col items-center gap-2">
        <BookOpen className="size-8 text-glow/70" strokeWidth={1.6} />
        <p className="text-[12px] text-muted">{t("a book, a menu, the rules, a character sheet -- up to")}{" "}{PDF_MAX_MB}MB</p>
        <button
          type="button"
          disabled={!canEdit || busy}
          onClick={() => input.current?.click()}
          className="flex min-h-10 items-center gap-2 rounded-xl bg-chalk px-4 text-[12px] font-semibold text-ink-950 disabled:opacity-40"
        >
          <FileUp className="size-4" />{" "}
          {progress ? (progress.total > 1 ? t(`putting it on the table... ${progress.done} of ${progress.total}`) : t("putting it on the table...")) : t("choose a PDF")}
        </button>
        <input ref={input} type="file" accept="application/pdf,.pdf" hidden onChange={(event) => void pick(event.target.files?.[0])} />
      </div>
    </div>
  );
}

type Flip = { from: number; to: number; dir: 1 | -1; n: number };
type Panel = "search" | "contents" | null;

function Reader({ item, data }: { item: Item<"pdf">; data: PdfData }) {
  const { canEdit, updateData } = useRoom();
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [failed, setFailed] = useState(false);
  const [aspect, setAspect] = useState(1.414);
  const [alone, setAlone] = useState(!canEdit);
  const [ownPage, setOwnPage] = useState(data.page);
  const [panel, setPanel] = useState<Panel>(null);
  const [query, setQuery] = useState("");
  const [tool, setTool] = useState<InkTool | null>(null);
  const [color, setColor] = useState(PEN_COLORS[0]);
  const [note, setNote] = useState<{ page: number; id: string } | null>(null);
  const stage = useRef<HTMLDivElement>(null);
  const [room, setRoom] = useState({ w: 0, h: 0 });

  const pages = doc?.numPages ?? data.pages;
  const mode: PdfMode = data.mode;
  const target = clampPage(alone ? ownPage : data.page, pages || 1);

  useEffect(() => {
    let live = true;
    openPdf(data.src, data.parts)
      .then(async (opened) => {
        const shape = await aspectOf(opened, 1);
        if (!live) return;
        setAspect(Math.min(2.2, Math.max(0.4, shape)));
        setDoc(opened);
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
    // The parts only change along with the file itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.src]);

  // The page count is written down once the file has been read, so the room
  // knows how long the book is before anyone has opened it.
  useEffect(() => {
    if (doc && canEdit && data.pages !== doc.numPages) void updateData(item.id, { ...data, pages: doc.numPages });
    // Only when the document or its count changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, data.pages]);

  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setRoom({ w: entry.contentRect.width, h: entry.contentRect.height }));
    observer.observe(el);
    return () => observer.disconnect();
  }, [doc]);

  // A page turn, whoever turned it, is animated from where this screen was.
  const [seen, setSeen] = useState(target);
  const [flip, setFlip] = useState<Flip | null>(null);
  if (seen !== target) {
    setSeen(target);
    const sameSpread = mode === "book" && spreadOf(seen, pages).join() === spreadOf(target, pages).join();
    if (!sameSpread && doc) setFlip({ from: seen, to: target, dir: target > seen ? 1 : -1, n: (flip?.n ?? 0) + 1 });
  }

  const save = (next: PdfData) => updateData(item.id, next);
  const go = (page: number) => {
    const to = clampPage(page, pages);
    if (alone) setOwnPage(to);
    else if (canEdit) void save({ ...data, page: to });
  };
  const step = (by: 1 | -1) => {
    if (canTurn(target, pages, mode, by)) go(turn(target, pages, mode, by));
  };

  const mark = (page: number, value: PdfMark) => void save(addMark(data, page, value));
  const erase = (page: number, id: string) => void save(removeMark(data, page, id));
  const marksOf = (page: number | null) => (page ? data.marks[String(page)] : undefined);

  // Swipes turn the page when nothing is being drawn.
  const swipe = useRef<{ x: number; y: number } | null>(null);

  if (failed) {
    return (
      <div className="surface grid size-full place-items-center rounded-2xl p-4 text-center text-[12px] text-muted">{t("this PDF would not open")}</div>
    );
  }

  const page = (n: number | null, extra?: string) =>
    n && doc ? (
      <PageView
        url={data.src}
        doc={doc}
        n={n}
        marks={marksOf(n)}
        tool={tool}
        color={color}
        query={panel === "search" || query ? query : ""}
        onMark={(m) => mark(n, m)}
        onErase={(id) => erase(n, id)}
        onNote={(id) => setNote({ page: n, id })}
        onGo={go}
        className={extra}
      />
    ) : (
      <div className={clsx("size-full", extra)} style={{ background: "linear-gradient(135deg,#3a2a3f,#2a1f30)" }} />
    );

  // How big a page can be in the space there is.
  const bookW = Math.max(0, Math.min(room.w / 2, (room.h - 8) / aspect));
  const clipW = Math.max(0, Math.min(room.w * 0.9, (room.h - 34) / aspect));
  const [left, right] = spreadOf(target, pages);
  const turning = flip && doc ? flip : null;
  const bookmarked = data.bookmarks.includes(left ?? right ?? target) || (right !== null && data.bookmarks.includes(right));
  const label =
    mode === "book" ? (left && right ? `${left}-${right}` : `${left ?? right}`) : `${target}`;

  const editingNote = note ? (data.marks[String(note.page)] ?? []).find((m) => m.id === note.id && m.kind === "note") : null;

  return (
    <div
      className="surface relative flex size-full flex-col overflow-hidden rounded-2xl"
      tabIndex={0}
      onKeyDown={(event) => {
        if ((event.target as HTMLElement).tagName === "INPUT" || (event.target as HTMLElement).tagName === "TEXTAREA") return;
        if (event.key === "ArrowRight") step(1);
        if (event.key === "ArrowLeft") step(-1);
      }}
    >
      {/* Along the top: what it is, and what to do with it */}
      <div className="flex min-h-10 shrink-0 items-center gap-0.5 border-b border-white/6 px-1.5">
        <p className="min-w-0 flex-1 truncate px-1 text-[11px] font-medium text-chalk" title={data.name}>
          {data.name || t("untitled")}
        </p>
        <Tool label={mode === "book" ? t("put it on a clipboard") : t("open it as a book")} disabled={!canEdit} onClick={() => void save({ ...data, mode: mode === "book" ? "clipboard" : "book" })}>
          {mode === "book" ? <ClipboardList /> : <BookOpen />}
        </Tool>
        <Tool label={t("search")} active={panel === "search"} onClick={() => setPanel(panel === "search" ? null : "search")}>
          <Search />
        </Tool>
        <Tool label={t("contents and bookmarks")} active={panel === "contents"} onClick={() => setPanel(panel === "contents" ? null : "contents")}>
          <ListTree />
        </Tool>
        <Tool label={bookmarked ? t("take the bookmark out") : t("bookmark this page")} active={bookmarked} disabled={!canEdit} onClick={() => void save(toggleBookmark(data, left ?? right ?? target))}>
          <Bookmark className={bookmarked ? "fill-current" : ""} />
        </Tool>
        <Tool label={tool ? t("stop drawing") : t("draw on it")} active={Boolean(tool)} disabled={!canEdit} onClick={() => setTool(tool ? null : "pen")}>
          <PenLine />
        </Tool>
        <Tool
          label={alone ? t("read along with everyone") : t("read on my own")}
          active={alone}
          disabled={!canEdit}
          onClick={() => {
            setOwnPage(data.page);
            setAlone(!alone);
          }}
        >
          {alone ? <User /> : <Users />}
        </Tool>
      </div>

      {tool && (
        <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-white/6 px-2 py-1">
          {(
            [
              ["pen", <PenLine key="p" />, "pen"],
              ["highlight", <Highlighter key="h" />, "highlighter"],
              ["note", <StickyNote key="n" />, "pin a note"],
              ["eraser", <Eraser key="e" />, "rub out"],
            ] as const
          ).map(([kind, icon, name]) => (
            <Tool
              key={kind}
              label={name}
              active={tool === kind}
              onClick={() => {
                setTool(kind);
                if (kind === "highlight" && !HIGHLIGHT_COLORS.includes(color)) setColor(HIGHLIGHT_COLORS[0]);
                if (kind === "pen" && !PEN_COLORS.includes(color)) setColor(PEN_COLORS[0]);
              }}
            >
              {icon}
            </Tool>
          ))}
          <span className="mx-1 h-5 w-px bg-white/10" />
          {(tool === "highlight" ? HIGHLIGHT_COLORS : PEN_COLORS).map((c) => (
            <button
              key={c}
              type="button"
              aria-label={t(`colour ${c}`)}
              onClick={() => setColor(c)}
              className={clsx("size-6 rounded-full ring-1 ring-white/25", color === c && "ring-2 ring-chalk")}
              style={{ background: c }}
            />
          ))}
          <button
            type="button"
            onClick={() => {
              let next = data;
              for (const p of mode === "book" ? [left, right] : [target]) if (p) next = clearPage(next, p);
              void save(next);
            }}
            className="ml-auto flex min-h-8 items-center gap-1 rounded-lg px-2 text-[10px] text-muted hover:bg-white/8 hover:text-chalk"
          >
            <Trash2 className="size-3" />{" "}{t("clear")}{" "}{mode === "book" ? t("these pages") : t("this page")}
          </button>
        </div>
      )}

      {/* The pages */}
      <div
        ref={stage}
        className="relative min-h-0 flex-1 overflow-hidden bg-[radial-gradient(ellipse_at_center,#2c2433_0%,#17121d_85%)] p-2"
        onPointerDown={(event) => {
          if (tool) return;
          swipe.current = { x: event.clientX, y: event.clientY };
        }}
        onPointerUp={(event) => {
          const from = swipe.current;
          swipe.current = null;
          if (!from || tool) return;
          const dx = event.clientX - from.x;
          const dy = event.clientY - from.y;
          if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.4) step(dx < 0 ? 1 : -1);
        }}
      >
        {!doc ? (
          <div className="grid size-full place-items-center text-[11px] text-muted/70">{t("opening it...")}</div>
        ) : mode === "book" ? (
          <div className="absolute inset-0 grid place-items-center [perspective:1800px]">
            <div className="relative flex" style={{ width: bookW * 2, height: bookW * aspect }}>
              {/* The spread underneath: what will be showing once the leaf lands */}
              <div className="relative h-full w-1/2 shadow-[-6px_8px_18px_rgba(0,0,0,0.45)]">
                {page(turning ? (turning.dir > 0 ? spreadOf(turning.from, pages)[0] : spreadOf(turning.to, pages)[0]) : left)}
                <span className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-black/25 to-transparent" />
              </div>
              <div className="relative h-full w-1/2 shadow-[6px_8px_18px_rgba(0,0,0,0.45)]">
                {page(turning ? (turning.dir > 0 ? spreadOf(turning.to, pages)[1] : spreadOf(turning.from, pages)[1]) : right)}
                <span className="pointer-events-none absolute inset-y-0 left-0 w-6 bg-gradient-to-r from-black/20 to-transparent" />
              </div>

              {/* The leaf in the air */}
              {turning && (
                <div
                  key={turning.n}
                  className={clsx(
                    "absolute top-0 h-full w-1/2 [transform-style:preserve-3d]",
                    turning.dir > 0 ? "left-1/2 origin-left animate-leaf-forward" : "left-0 origin-right animate-leaf-back",
                  )}
                  onAnimationEnd={() => setFlip(null)}
                >
                  <div className="absolute inset-0 [backface-visibility:hidden]">
                    {page(turning.dir > 0 ? spreadOf(turning.from, pages)[1] : spreadOf(turning.from, pages)[0])}
                  </div>
                  <div className="absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)]">
                    {page(turning.dir > 0 ? spreadOf(turning.to, pages)[0] : spreadOf(turning.to, pages)[1])}
                  </div>
                </div>
              )}

              {/* Ribbons for the bookmarks on this spread */}
              {[left, right].map((p, i) =>
                p && data.bookmarks.includes(p) && !turning ? (
                  <span key={i} className="pointer-events-none absolute -top-1 h-8 w-3 bg-[#e0655c] [clip-path:polygon(0_0,100%_0,100%_100%,50%_78%,0_100%)]" style={{ left: i === 0 ? "12%" : "82%" }} />
                ) : null,
              )}
            </div>
          </div>
        ) : (
          <div className="absolute inset-0 grid place-items-center [perspective:1400px]">
            {/* The board, and the clip holding the sheets */}
            <div className="relative rounded-xl bg-[#8a6a45] p-[4%] pt-7 shadow-[0_14px_30px_rgba(0,0,0,0.5)]" style={{ width: clipW * 1.08 }}>
              <svg viewBox="0 0 120 40" className="absolute -top-3 left-1/2 z-20 w-[34%] -translate-x-1/2 drop-shadow-[0_2px_2px_rgba(0,0,0,0.5)]" aria-hidden>
                <rect x="6" y="12" width="108" height="24" rx="6" fill="#c9ccd3" stroke="#6b7384" strokeWidth="2" />
                <rect x="36" y="2" width="48" height="16" rx="8" fill="none" stroke="#9aa3b2" strokeWidth="5" />
                <rect x="14" y="20" width="92" height="6" rx="3" fill="#aeb4bf" />
              </svg>
              <div className="relative" style={{ height: clipW * aspect }}>
                {page(turning ? (turning.dir > 0 ? turning.to : turning.from) : target, "shadow-[0_2px_6px_rgba(0,0,0,0.3)]")}
                {turning && (
                  <div
                    key={turning.n}
                    className={clsx("absolute inset-0 origin-top", turning.dir > 0 ? "animate-sheet-up" : "animate-sheet-down")}
                    onAnimationEnd={() => setFlip(null)}
                  >
                    {page(turning.dir > 0 ? turning.from : turning.to, "shadow-[0_6px_16px_rgba(0,0,0,0.35)]")}
                  </div>
                )}
                {data.bookmarks.includes(target) && !turning && (
                  <span className="pointer-events-none absolute -top-1 right-[8%] h-8 w-3 bg-[#e0655c] [clip-path:polygon(0_0,100%_0,100%_100%,50%_78%,0_100%)]" />
                )}
              </div>
            </div>
          </div>
        )}

        {/* Edges to tap, for turning without swiping */}
        {doc && !tool && (
          <>
            <button type="button" aria-label={t("previous page")} disabled={!canTurn(target, pages, mode, -1)} onClick={() => step(-1)} className="absolute inset-y-0 left-0 z-10 w-[9%] min-w-8 opacity-0 transition hover:bg-gradient-to-r hover:from-white/6 hover:to-transparent hover:opacity-100 disabled:hidden">
              <ChevronLeft className="mx-auto size-5 text-chalk/70" />
            </button>
            <button type="button" aria-label={t("next page")} disabled={!canTurn(target, pages, mode, 1)} onClick={() => step(1)} className="absolute inset-y-0 right-0 z-10 w-[9%] min-w-8 opacity-0 transition hover:bg-gradient-to-l hover:from-white/6 hover:to-transparent hover:opacity-100 disabled:hidden">
              <ChevronRight className="mx-auto size-5 text-chalk/70" />
            </button>
          </>
        )}

        {panel === "search" && doc && <SearchPanel url={data.src} doc={doc} query={query} setQuery={setQuery} onGo={go} onClose={() => setPanel(null)} />}
        {panel === "contents" && doc && (
          <ContentsPanel
            doc={doc}
            bookmarks={data.bookmarks}
            canEdit={canEdit}
            onGo={(p) => {
              go(p);
              setPanel(null);
            }}
            onUnmark={(p) => void save(toggleBookmark(data, p))}
            onClose={() => setPanel(null)}
          />
        )}

        {note && editingNote && editingNote.kind === "note" && (
          <NoteEditor
            key={note.id}
            text={editingNote.text}
            by={editingNote.by}
            canEdit={canEdit}
            onSave={(text) => {
              void save(text.trim() ? editNote(data, note.page, note.id, text) : removeMark(data, note.page, note.id));
              setNote(null);
            }}
            onDelete={() => {
              void save(removeMark(data, note.page, note.id));
              setNote(null);
            }}
            onClose={() => setNote(null)}
          />
        )}
      </div>

      {/* Along the bottom: where you are */}
      <div className="flex min-h-11 shrink-0 items-center gap-1.5 border-t border-white/6 px-1.5">
        <Tool label={t("previous")} disabled={!canTurn(target, pages, mode, -1)} onClick={() => step(-1)}>
          <ChevronLeft />
        </Tool>
        <PageInput key={`${label}:${pages}`} label={label} pages={pages} onGo={go} />
        <Scrubber key={target} value={target} pages={pages} onGo={go} />
        <Tool label={t("next")} disabled={!canTurn(target, pages, mode, 1)} onClick={() => step(1)}>
          <ChevronRight />
        </Tool>
      </div>
    </div>
  );
}

function Tool({
  label,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={clsx(
        "grid size-9 shrink-0 place-items-center rounded-lg transition disabled:opacity-30 sm:size-8 [&_svg]:size-4",
        active ? "bg-glow/20 text-glow" : "text-muted hover:bg-white/8 hover:text-chalk",
      )}
    >
      {children}
    </button>
  );
}

function PageInput({ label, pages, onGo }: { label: string; pages: number; onGo: (page: number) => void }) {
  const [text, setText] = useState(label);
  return (
    <form
      className="flex shrink-0 items-center gap-1 text-[11px] text-muted"
      onSubmit={(event) => {
        event.preventDefault();
        const n = Number.parseInt(text, 10);
        if (Number.isFinite(n)) onGo(n);
        (document.activeElement as HTMLElement | null)?.blur();
      }}
    >
      <input
        value={text}
        onChange={(event) => setText(event.target.value)}
        onFocus={(event) => {
          setText(label.split("-")[0]);
          event.target.select();
        }}
        onBlur={() => setText(label)}
        inputMode="numeric"
        aria-label={t("page")}
        className="h-8 w-14 rounded-md bg-white/6 text-center text-[12px] text-chalk tabular-nums outline-none focus:bg-white/10"
      />
      <span className="tabular-nums">{t("of")}{" "}{pages || "?"}</span>
    </form>
  );
}

/** A progress bar you can drag to get somewhere fast. Only lands when let go. */
function Scrubber({ value, pages, onGo }: { value: number; pages: number; onGo: (page: number) => void }) {
  const [at, setAt] = useState(value);
  const commit = () => at !== value && onGo(at);
  return (
    <div className="relative min-w-0 flex-1">
      <div className="pointer-events-none absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-white/10">
        <div className="h-full rounded-full bg-glow/60" style={{ width: `${progress(at, pages) * 100}%` }} />
      </div>
      <input
        type="range"
        min={1}
        max={Math.max(1, pages)}
        value={at}
        onChange={(event) => setAt(Number(event.target.value))}
        onPointerUp={commit}
        onKeyUp={commit}
        onPointerDown={(event) => event.stopPropagation()}
        aria-label={t("scroll through the pages")}
        className="relative h-8 w-full cursor-pointer opacity-0"
      />
    </div>
  );
}

function SearchPanel({
  url,
  doc,
  query,
  setQuery,
  onGo,
  onClose,
}: {
  url: string;
  doc: PDFDocumentProxy;
  query: string;
  setQuery: (q: string) => void;
  onGo: (page: number) => void;
  onClose: () => void;
}) {
  const [results, setResults] = useState<Array<{ page: number; count: number; line: string }>>([]);
  const [looked, setLooked] = useState(0);
  const [asked, setAsked] = useState(query);

  useEffect(() => {
    const q = asked.trim();
    if (q.length < 2) return;
    let live = true;
    (async () => {
      const found: Array<{ page: number; count: number; line: string }> = [];
      for (let n = 1; n <= doc.numPages && live; n += 1) {
        try {
          const words = await pageWords(url, doc, n);
          const count = countMatches(words.text, q);
          if (count) found.push({ page: n, count, line: snippet(words.text, q) });
        } catch {
          // A page without text -- a scan -- has nothing to find.
        }
        if (!live) return;
        if (n % 8 === 0 || n === doc.numPages) {
          setLooked(n);
          setResults([...found].slice(0, 200));
        }
      }
    })();
    return () => {
      live = false;
    };
  }, [asked, url, doc]);

  const total = results.reduce((sum, r) => sum + r.count, 0);

  return (
    <div className="absolute inset-x-2 top-2 z-30 flex max-h-[85%] flex-col rounded-xl bg-ink-950/95 p-2 shadow-2xl backdrop-blur-sm" onPointerDown={(event) => event.stopPropagation()}>
      <form
        className="flex items-center gap-1.5"
        onSubmit={(event) => {
          event.preventDefault();
          setResults([]);
          setLooked(0);
          setAsked(query);
        }}
      >
        <input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("find in the document...")}
          className="h-9 min-w-0 flex-1 rounded-lg bg-white/8 px-2 text-[12px] text-chalk outline-none placeholder:text-muted/50"
        />
        <button type="submit" className="h-9 rounded-lg bg-chalk px-3 text-[11px] font-semibold text-ink-950">{t("find")}</button>
        <button
          type="button"
          aria-label={t("close")}
          onClick={() => {
            setQuery("");
            onClose();
          }}
          className="grid size-9 place-items-center rounded-lg text-muted hover:text-chalk"
        >
          <X className="size-4" />
        </button>
      </form>
      {asked.trim().length >= 2 && (
        <p className="px-1 pt-1.5 text-[10px] text-muted/70">
          {looked < doc.numPages ? t(`looking... page ${looked} of ${doc.numPages}`) : t(`${total} found on ${results.length} pages`)}
        </p>
      )}
      <ol className="mt-1 min-h-0 flex-1 space-y-0.5 overflow-y-auto">
        {results.map((r) => (
          <li key={r.page}>
            <button type="button" onClick={() => onGo(r.page)} className="flex w-full items-baseline gap-2 rounded-lg px-1.5 py-1 text-left hover:bg-white/8">
              <span className="w-9 shrink-0 text-right text-[11px] font-semibold tabular-nums text-glow">{r.page}</span>
              <span className="min-w-0 flex-1 truncate text-[11px] text-muted">{r.line}</span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}

function ContentsPanel({
  doc,
  bookmarks,
  canEdit,
  onGo,
  onUnmark,
  onClose,
}: {
  doc: PDFDocumentProxy;
  bookmarks: number[];
  canEdit: boolean;
  onGo: (page: number) => void;
  onUnmark: (page: number) => void;
  onClose: () => void;
}) {
  const [outline, setOutline] = useState<OutlineEntry[] | null>(null);
  useEffect(() => {
    let live = true;
    outlineOf(doc)
      .then((found) => live && setOutline(found))
      .catch(() => live && setOutline([]));
    return () => {
      live = false;
    };
  }, [doc]);

  const entry = (e: OutlineEntry, depth: number, key: string): React.ReactNode => (
    <li key={key}>
      {e.url ? (
        <a href={e.url} target="_blank" rel="noopener noreferrer nofollow" className="block truncate rounded-md px-1.5 py-1 text-[11px] text-muted hover:bg-white/8 hover:text-chalk" style={{ paddingLeft: 6 + depth * 12 }}>
          {e.title}
        </a>
      ) : (
        <button
          type="button"
          disabled={!e.page}
          onClick={() => e.page && onGo(e.page)}
          className="flex w-full items-baseline gap-2 rounded-md px-1.5 py-1 text-left hover:bg-white/8 disabled:opacity-50"
          style={{ paddingLeft: 6 + depth * 12 }}
        >
          <span className="min-w-0 flex-1 truncate text-[11px] text-chalk/90">{e.title}</span>
          {e.page && <span className="shrink-0 text-[10px] tabular-nums text-muted">{e.page}</span>}
        </button>
      )}
      {e.children.length > 0 && <ul>{e.children.map((c, i) => entry(c, depth + 1, `${key}.${i}`))}</ul>}
    </li>
  );

  return (
    <div className="absolute inset-2 z-30 flex flex-col rounded-xl bg-ink-950/95 p-2 shadow-2xl backdrop-blur-sm" onPointerDown={(event) => event.stopPropagation()}>
      <div className="flex items-center justify-between">
        <h3 className="px-1 text-[12px] font-semibold text-chalk">{t("contents")}</h3>
        <button type="button" aria-label={t("close")} onClick={onClose} className="grid size-9 place-items-center rounded-lg text-muted hover:text-chalk">
          <X className="size-4" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {bookmarks.length > 0 && (
          <>
            <p className="px-1.5 pt-1 text-[10px] tracking-wide text-muted/60 uppercase">{t("bookmarks")}</p>
            <ul className="mb-2">
              {bookmarks.map((p) => (
                <li key={p} className="flex items-center">
                  <button type="button" onClick={() => onGo(p)} className="flex min-h-8 flex-1 items-center gap-2 rounded-md px-1.5 text-left text-[11px] text-chalk hover:bg-white/8">
                    <Bookmark className="size-3 fill-[#e0655c] text-[#e0655c]" />{" "}{t("page")}{" "}{p}
                  </button>
                  {canEdit && (
                    <button type="button" aria-label={`remove the bookmark on page ${p}`} onClick={() => onUnmark(p)} className="grid size-8 place-items-center text-muted/60 hover:text-chalk">
                      <X className="size-3" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
        <p className="px-1.5 pt-1 text-[10px] tracking-wide text-muted/60 uppercase">{t("in the document")}</p>
        {outline === null ? (
          <p className="px-1.5 py-2 text-[11px] text-muted/60">{t("reading...")}</p>
        ) : outline.length === 0 ? (
          <p className="px-1.5 py-2 text-[11px] text-muted/60">{t("this one has no table of contents of its own")}</p>
        ) : (
          <ul>{outline.map((e, i) => entry(e, 0, String(i)))}</ul>
        )}
      </div>
    </div>
  );
}

function NoteEditor({
  text,
  by,
  canEdit,
  onSave,
  onDelete,
  onClose,
}: {
  text: string;
  by?: string;
  canEdit: boolean;
  onSave: (text: string) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(text);
  return (
    <div className="absolute inset-x-3 bottom-3 z-30 rounded-xl bg-[#fff3b0] p-2 text-ink-950 shadow-2xl" onPointerDown={(event) => event.stopPropagation()}>
      <textarea
        autoFocus={canEdit}
        readOnly={!canEdit}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        maxLength={280}
        rows={3}
        placeholder={t("write something on it...")}
        className="w-full resize-none bg-transparent text-[12px] leading-snug outline-none placeholder:text-ink-950/40"
      />
      <div className="flex items-center gap-1">
        {by && <span className="min-w-0 flex-1 truncate text-[10px] text-ink-950/60">{by}</span>}
        {!by && <span className="flex-1" />}
        {canEdit && (
          <button type="button" onClick={onDelete} className="min-h-8 rounded-md px-2 text-[11px] text-ink-950/70 hover:bg-black/5">{t("take it off")}</button>
        )}
        <button type="button" onClick={() => (canEdit ? onSave(draft) : onClose())} className="min-h-8 rounded-md bg-ink-950 px-3 text-[11px] font-semibold text-[#fff3b0]">
          {canEdit ? t("done") : t("close")}
        </button>
      </div>
    </div>
  );
}
