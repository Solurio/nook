"use client";

import { useRef, useState } from "react";
import clsx from "clsx";
import { Crop, Download, Film, FolderOpen, ImagePlus, Layers, LayoutGrid, Loader2, Save, Scissors, Trash2 } from "lucide-react";
import { Panel } from "./widgets";
import { t } from "@/lib/i18n";

export const CANVAS_SIZES: Array<{ name: string; w: number; h: number }> = [
  { name: "landscape", w: 1600, h: 1200 },
  { name: "square", w: 1600, h: 1600 },
  { name: "portrait", w: 1200, h: 1600 },
  { name: "wide", w: 1920, h: 1080 },
  { name: "tall phone", w: 1080, h: 1920 },
  { name: "big", w: 2048, h: 2048 },
  { name: "small", w: 800, h: 600 },
];

const PAPERS = ["#faf7f0", "#ffffff", "#f4ecd8", "#1a1420", "#000000", "#dbe9f4"];

export type ExportKind = "png" | "jpeg" | "transparent" | "png2x";

/**
 * Everything about the picture as a file: saving it out as an image or as a
 * project that opens again with its layers, bringing a picture in, the paper
 * it is drawn on, the canvas size, and folding a long history into pictures.
 */
export default function FilePanel({
  doc,
  paper,
  empty,
  opCount,
  mode,
  busy,
  canEdit,
  onExport,
  onGif,
  onSaveProject,
  onOpenProject,
  onImportImage,
  onPaper,
  onSize,
  onCanvas,
  onTrim,
  onCropToSelection,
  onResetLayout,
  selected,
  layerCount,
  onBake,
  onClearAll,
  onClose,
}: {
  doc: { w: number; h: number };
  paper: string | null;
  empty: boolean;
  opCount: number;
  mode: "loading" | "table" | "item";
  busy: string | null;
  canEdit: boolean;
  onExport: (kind: ExportKind) => void;
  onGif: () => void;
  onSaveProject: () => void;
  onOpenProject: (file: File) => void;
  onImportImage: (file: File) => void;
  onPaper: (color: string | null) => void;
  onSize: (w: number, h: number) => void;
  onCanvas: (change: CanvasChange) => void;
  onTrim: () => void;
  onCropToSelection: () => void;
  onResetLayout: () => void;
  selected: boolean;
  layerCount: number;
  onBake: () => void;
  onClearAll: () => void;
  onClose: () => void;
}) {
  const projectInput = useRef<HTMLInputElement>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const [sure, setSure] = useState(false);

  return (
    <Panel title={t("file")} onClose={onClose} className="top-2 left-12 w-72">
      {busy && (
        <p className="mb-2 flex items-center gap-1.5 rounded-lg bg-white/6 px-2 py-1.5 text-[11px] text-chalk">
          <Loader2 className="size-3.5 animate-spin" /> {t(busy)}
        </p>
      )}

      <Section title={t("save as a picture")}>
        <div className="grid grid-cols-2 gap-1">
          <Action onClick={() => onExport("png")} icon={<Download />}>
            PNG
          </Action>
          <Action onClick={() => onExport("jpeg")} icon={<Download />}>
            JPG
          </Action>
          <Action onClick={() => onExport("transparent")} icon={<Download />}>{t("PNG, no paper")}</Action>
          <Action onClick={() => onExport("png2x")} icon={<Download />}>{t("PNG, twice the size")}</Action>
          <Action onClick={onGif} icon={<Film />} disabled={Boolean(busy)}>{t("timelapse GIF")}</Action>
        </div>
      </Section>

      <Section title={t("project")}>
        <div className="grid grid-cols-2 gap-1">
          <Action onClick={onSaveProject} icon={<Save />}>{t("save project")}</Action>
          <Action onClick={() => projectInput.current?.click()} icon={<FolderOpen />} disabled={!canEdit || Boolean(busy)}>{t("open project")}</Action>
          <Action onClick={() => imageInput.current?.click()} icon={<ImagePlus />} disabled={!canEdit || Boolean(busy)}>{t("picture as a layer")}</Action>
        </div>
        <p className="mt-1 text-[9px] text-muted/70">{t("a project keeps the layers, the brushes and everything done, and opens again here.")}</p>
        <input
          ref={projectInput}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) onOpenProject(file);
          }}
        />
        <input
          ref={imageInput}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) onImportImage(file);
          }}
        />
      </Section>

      <Section title={t("paper")}>
        <div className="flex flex-wrap items-center gap-1">
          {PAPERS.map((c) => (
            <button
              key={c}
              type="button"
              disabled={!canEdit}
              onClick={() => onPaper(c)}
              aria-label={c}
              className={clsx("size-6 rounded ring-1 ring-white/20 disabled:opacity-40", paper === c && "ring-2 ring-chalk")}
              style={{ background: c }}
            />
          ))}
          <button
            type="button"
            disabled={!canEdit}
            onClick={() => onPaper(null)}
            aria-label={t("see-through")}
            title={t("see-through")}
            className={clsx("checker size-6 rounded ring-1 ring-white/20 disabled:opacity-40", paper === null && "ring-2 ring-chalk")}
          />
          <label className="relative size-6 cursor-pointer overflow-hidden rounded ring-1 ring-white/20" title={t("any colour")} style={{ background: paper ?? "transparent" }}>
            <input type="color" disabled={!canEdit} value={paper ?? "#ffffff"} onChange={(event) => onPaper(event.target.value)} className="absolute inset-0 cursor-pointer opacity-0" />
          </label>
        </div>
      </Section>

      <CanvasSection doc={doc} empty={empty} canEdit={canEdit && !busy} selected={selected} layerCount={layerCount} onSize={onSize} onCanvas={onCanvas} onTrim={onTrim} onCropToSelection={onCropToSelection} />

      <Section title={t("panels")}>
        <Action onClick={onResetLayout} icon={<LayoutGrid />}>{t("put the panels back where they started")}</Action>
      </Section>

      <Section title={t("history")}>
        <p className="mb-1 text-[10px] text-muted">
          {t("{opCount} {what} done{what2}.", { opCount, what: opCount === 1 ? t("thing") : t("things"), what2: mode === "item" ? t(" (kept in the board itself: run 0009 for more room)") : "" })}
        </p>
        <div className="grid grid-cols-1 gap-1">
          <Action onClick={onBake} icon={<Layers />} disabled={!canEdit || Boolean(busy) || opCount === 0}>{t("fold the history into pictures")}</Action>
          <button
            type="button"
            disabled={!canEdit || empty}
            onClick={() => {
              if (!sure) {
                setSure(true);
                return;
              }
              setSure(false);
              onClearAll();
            }}
            className={clsx(
              "flex min-h-8 items-center gap-1.5 rounded-lg px-2 text-[11px] disabled:opacity-30 [&_svg]:size-3.5",
              sure ? "bg-red-500/25 text-red-200" : "bg-white/5 text-muted hover:bg-red-500/15 hover:text-red-300",
            )}
          >
            <Trash2 /> {sure ? t("tap again: it all goes, for everyone") : t("start over")}
          </button>
        </div>
      </Section>
    </Panel>
  );
}

/** The biggest a side of the picture can be. */
export const MAX_SIDE = 10000;

/** Moving the picture to a new canvas: each layer scaled by sx, sy, then moved by x, y. */
export interface CanvasChange {
  w: number;
  h: number;
  x: number;
  y: number;
  sx: number;
  sy: number;
}

/**
 * How big a picture this browser can hold, found by trying: phones stop far
 * short of what a computer manages, and a canvas that is too big simply
 * comes out blank rather than saying so.
 */
let probed: number | null = null;
export function largestSide(): number {
  if (probed !== null) return probed;
  // Smallest first, stopping at the first that fails -- and not even trying
  // the biggest on a device with little memory, where trying could itself hurt.
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
  const sides = [2048, 4096, 6144, 8192, MAX_SIDE].filter((s) => memory > 4 || s <= 6144);
  let best = 1024;
  for (const side of sides) {
    let ok = false;
    try {
      const c = document.createElement("canvas");
      c.width = side;
      c.height = side;
      const ctx = c.getContext("2d");
      if (ctx) {
        ctx.fillStyle = "#fff";
        ctx.fillRect(side - 1, side - 1, 1, 1);
        ok = ctx.getImageData(side - 1, side - 1, 1, 1).data[3] === 255;
      }
      c.width = 1;
      c.height = 1;
    } catch {
      ok = false;
    }
    if (!ok) break;
    best = side;
  }
  probed = best;
  return best;
}

const ANCHORS: Array<[number, number]> = [
  [0, 0],
  [0.5, 0],
  [1, 0],
  [0, 0.5],
  [0.5, 0.5],
  [1, 0.5],
  [0, 1],
  [0.5, 1],
  [1, 1],
];

function CanvasSection({
  doc,
  empty,
  canEdit,
  selected,
  layerCount,
  onSize,
  onCanvas,
  onTrim,
  onCropToSelection,
}: {
  doc: { w: number; h: number };
  empty: boolean;
  canEdit: boolean;
  selected: boolean;
  layerCount: number;
  onSize: (w: number, h: number) => void;
  onCanvas: (change: CanvasChange) => void;
  onTrim: () => void;
  onCropToSelection: () => void;
}) {
  const [how, setHow] = useState<"canvas" | "scale">("canvas");
  const [w, setW] = useState(doc.w);
  const [h, setH] = useState(doc.h);
  const [anchor, setAnchor] = useState<[number, number]>([0.5, 0.5]);
  const [keep, setKeep] = useState(true);
  const [limit] = useState(largestSide);
  const clamp = (v: number) => Math.max(16, Math.min(limit, Math.round(v) || 16));
  // Every layer is a picture this size in memory, and there are a few more besides.
  const megabytes = Math.round((w * h * 4 * (layerCount + 4)) / 1_000_000);

  const setWidth = (v: number) => {
    setW(v);
    if (how === "scale" && keep) setH(Math.round((v * doc.h) / doc.w));
  };
  const setHeight = (v: number) => {
    setH(v);
    if (how === "scale" && keep) setW(Math.round((v * doc.w) / doc.h));
  };

  const apply = () => {
    const nw = clamp(w);
    const nh = clamp(h);
    if (empty) return onSize(nw, nh);
    if (how === "scale") onCanvas({ w: nw, h: nh, x: 0, y: 0, sx: nw / doc.w, sy: nh / doc.h });
    else onCanvas({ w: nw, h: nh, x: Math.round((nw - doc.w) * anchor[0]), y: Math.round((nh - doc.h) * anchor[1]), sx: 1, sy: 1 });
  };

  return (
    <Section title={t(`canvas: ${doc.w} x ${doc.h}`)}>
      {empty && (
        <div className="mb-1.5 grid grid-cols-2 gap-1">
          {CANVAS_SIZES.map((s) => (
            <button
              key={s.name}
              type="button"
              disabled={!canEdit}
              onClick={() => onSize(s.w, s.h)}
              className={clsx("min-h-7 rounded-md px-2 text-left text-[10px] disabled:opacity-40", s.w === doc.w && s.h === doc.h ? "bg-glow/25 text-glow" : "bg-white/5 text-muted hover:text-chalk")}
            >
              {t(s.name)} <span className="text-muted/60">{s.w}x{s.h}</span>
            </button>
          ))}
        </div>
      )}
      {!empty && (
        <div className="mb-1.5 flex flex-wrap gap-1">
          <Action onClick={onTrim} icon={<Crop />} disabled={!canEdit}>{t("trim to what is drawn")}</Action>
          <Action onClick={onCropToSelection} icon={<Scissors />} disabled={!canEdit || !selected}>{t("crop to the selection")}</Action>
        </div>
      )}
      {!empty && (
        <div className="mb-1.5 flex rounded-lg bg-white/6 p-0.5">
          {(
            [
              ["canvas", t("canvas size")],
              ["scale", t("resize the picture")],
            ] as const
          ).map(([id, label]) => (
            <button key={id} type="button" onClick={() => setHow(id)} className={clsx("min-h-7 flex-1 rounded-md text-[10px]", how === id ? "bg-chalk text-ink-950" : "text-muted hover:text-chalk")}>
              {t(label)}
            </button>
          ))}
        </div>
      )}
      <div className="flex items-center gap-1.5">
        <label className="flex items-center gap-1 text-[10px] text-muted">
          W
          <input type="number" min={16} max={limit} value={w} onChange={(event) => setWidth(Number(event.target.value))} className="h-7 w-16 rounded-md bg-white/7 px-1.5 text-[11px] text-chalk tabular-nums outline-none" />
        </label>
        <label className="flex items-center gap-1 text-[10px] text-muted">
          H
          <input type="number" min={16} max={limit} value={h} onChange={(event) => setHeight(Number(event.target.value))} className="h-7 w-16 rounded-md bg-white/7 px-1.5 text-[11px] text-chalk tabular-nums outline-none" />
        </label>
        {how === "scale" && !empty && (
          <button type="button" onClick={() => setKeep((v) => !v)} className={clsx("min-h-7 rounded-md px-1.5 text-[10px]", keep ? "bg-glow/25 text-glow" : "bg-white/6 text-muted")}>
            {t("keep the shape")}
          </button>
        )}
      </div>
      {how === "canvas" && !empty && (
        <div className="mt-1.5 flex items-center gap-2">
          <div className="grid grid-cols-3 gap-0.5" role="group" aria-label={t("where the picture sits")}>
            {ANCHORS.map(([ax, ay]) => (
              <button
                key={`${ax}${ay}`}
                type="button"
                onClick={() => setAnchor([ax, ay])}
                aria-label={t("anchor here")}
                className={clsx("size-5 rounded-sm", anchor[0] === ax && anchor[1] === ay ? "bg-glow" : "bg-white/10 hover:bg-white/20")}
              />
            ))}
          </div>
          <p className="text-[9px] leading-snug text-muted/70">{t("where the picture sits on the new canvas; smaller than it is cuts it.")}</p>
        </div>
      )}
      <div className="mt-1.5 flex items-center gap-1.5">
        <button type="button" disabled={!canEdit || (w === doc.w && h === doc.h)} onClick={apply} className="min-h-8 rounded-lg bg-glow/30 px-3 text-[11px] font-semibold text-glow hover:bg-glow/40 disabled:opacity-30">
          {t("apply")}
        </button>
        <p className="text-[9px] leading-snug text-muted/70">
          {t(`up to ${limit} x ${limit} on this device.`)}
          {megabytes > 900 ? ` ${t(`about ${megabytes} MB of memory: it may be slow.`)}` : ""}
        </p>
      </div>
      {!empty && <p className="mt-1 text-[9px] text-muted/60">{t("changing the canvas folds each layer's history into a picture.")}</p>}
    </Section>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-2.5">
      <p className="mb-1 text-[9px] tracking-wide text-muted/60 uppercase">{t(title)}</p>
      {children}
    </div>
  );
}

function Action({ onClick, icon, children, disabled }: { onClick: () => void; icon: React.ReactNode; children: React.ReactNode; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex min-h-8 items-center gap-1.5 rounded-lg bg-white/6 px-2 text-left text-[11px] text-chalk hover:bg-white/10 disabled:opacity-30 [&_svg]:size-3.5 [&_svg]:shrink-0"
    >
      {icon}
      <span className="min-w-0 truncate">{children}</span>
    </button>
  );
}
