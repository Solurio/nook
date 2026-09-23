"use client";

import { useRef, useState } from "react";
import clsx from "clsx";
import { Download, Film, FolderOpen, ImagePlus, Layers, Loader2, Save, Trash2 } from "lucide-react";
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
          <Loader2 className="size-3.5 animate-spin" /> {busy}
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
            aria-label="see-through"
            title="see-through"
            className={clsx("checker size-6 rounded ring-1 ring-white/20 disabled:opacity-40", paper === null && "ring-2 ring-chalk")}
          />
          <label className="relative size-6 cursor-pointer overflow-hidden rounded ring-1 ring-white/20" title={t("any colour")} style={{ background: paper ?? "transparent" }}>
            <input type="color" disabled={!canEdit} value={paper ?? "#ffffff"} onChange={(event) => onPaper(event.target.value)} className="absolute inset-0 cursor-pointer opacity-0" />
          </label>
        </div>
      </Section>

      <Section title={t(`canvas: ${doc.w} x ${doc.h}`)}>
        {empty ? (
          <div className="grid grid-cols-2 gap-1">
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
        ) : (
          <p className="text-[10px] text-muted">{t("the size is set once something is drawn.")}</p>
        )}
      </Section>

      <Section title={t("history")}>
        <p className="mb-1 text-[10px] text-muted">
          {opCount} {opCount === 1 ? t("thing") : t("things")}{" "}{t("done")}{mode === "item" ? t(" (kept in the board itself: run 0009 for more room)") : ""}.
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-2.5">
      <p className="mb-1 text-[9px] tracking-wide text-muted/60 uppercase">{title}</p>
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
