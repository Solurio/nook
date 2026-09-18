"use client";

import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { useRoomStore } from "@/state/room-store";
import { fold, type PdfMark } from "@/lib/pdf";
import { pageLinks, pagePicture, pageWords, type PageLink, type PageWords } from "./engine";
import InkLayer, { type InkTool } from "./ink-layer";

/**
 * One page of the document, drawn to fit its box: the picture, anything the
 * room has drawn on it, the links it carries, and where a search landed.
 */
export default function PageView({
  url,
  doc,
  n,
  marks,
  tool,
  color,
  query,
  onMark,
  onErase,
  onNote,
  onGo,
  className,
}: {
  url: string;
  doc: PDFDocumentProxy;
  n: number;
  marks?: PdfMark[];
  /** Set when annotating: pointers draw rather than follow links. */
  tool?: InkTool | null;
  color?: string;
  query?: string;
  onMark?: (mark: PdfMark) => void;
  onErase?: (id: string) => void;
  onNote?: (id: string) => void;
  onGo?: (page: number) => void;
  className?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(0);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [links, setLinks] = useState<PageLink[]>([]);
  const [words, setWords] = useState<PageWords | null>(null);
  const zoom = useRoomStore((s) => s.viewport.scale);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Draw the page, at the resolution the screen is actually showing it.
  useEffect(() => {
    if (width <= 0) return;
    let live = true;
    const density = Math.min(2, typeof window === "undefined" ? 1 : window.devicePixelRatio || 1);
    const pixels = width * density * Math.min(2, Math.max(0.5, zoom));
    pagePicture(url, doc, n, pixels)
      .then((picture) => {
        const target = canvas.current;
        if (!live || !target) return;
        target.width = picture.width;
        target.height = picture.height;
        target.getContext("2d")?.drawImage(picture, 0, 0);
        setReady(true);
        setFailed(false);
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [url, doc, n, width, zoom]);

  useEffect(() => {
    let live = true;
    pageLinks(url, doc, n)
      .then((found) => live && setLinks(found))
      .catch(() => live && setLinks([]));
    return () => {
      live = false;
    };
  }, [url, doc, n]);

  const searching = Boolean(query && query.trim().length >= 2);
  useEffect(() => {
    if (!searching) return;
    let live = true;
    pageWords(url, doc, n)
      .then((found) => live && setWords(found))
      .catch(() => live && setWords(null));
    return () => {
      live = false;
    };
  }, [url, doc, n, searching]);

  const q = searching ? fold(query as string) : "";
  const hits = q && words ? words.runs.filter((run) => fold(run.str).includes(q)) : [];

  return (
    <div ref={box} className={clsx("relative size-full overflow-hidden bg-white", className)}>
      <canvas ref={canvas} className={clsx("block size-full transition-opacity duration-200", ready ? "opacity-100" : "opacity-0")} />
      {!ready && !failed && <div className="absolute inset-0 animate-pulse bg-[#f1ece2]" />}
      {failed && <div className="absolute inset-0 grid place-items-center text-[11px] text-ink-700">this page would not draw</div>}

      {hits.map((hit, i) => (
        <span
          key={i}
          className="pointer-events-none absolute rounded-[2px] bg-[#ffd43b]/45 mix-blend-multiply"
          style={{ left: `${hit.x * 100}%`, top: `${hit.y * 100}%`, width: `${hit.w * 100}%`, height: `${hit.h * 100}%` }}
        />
      ))}

      {!tool &&
        links.map((link, i) =>
          link.url ? (
            <a
              key={i}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer nofollow"
              title={link.url}
              onPointerDown={(event) => event.stopPropagation()}
              className="absolute rounded-sm hover:bg-[#2e6fd1]/15"
              style={{ left: `${link.x * 100}%`, top: `${link.y * 100}%`, width: `${link.w * 100}%`, height: `${link.h * 100}%` }}
            />
          ) : (
            <button
              key={i}
              type="button"
              title={`page ${link.page}`}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                if (link.page) onGo?.(link.page);
              }}
              className="absolute rounded-sm hover:bg-[#2e6fd1]/15"
              style={{ left: `${link.x * 100}%`, top: `${link.y * 100}%`, width: `${link.w * 100}%`, height: `${link.h * 100}%` }}
            />
          ),
        )}

      <InkLayer marks={marks ?? []} tool={tool ?? null} color={color ?? "#1a1420"} onMark={onMark} onErase={onErase} onNote={onNote} />
    </div>
  );
}
