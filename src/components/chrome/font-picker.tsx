"use client";

import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import clsx from "clsx";
import { Type, X } from "lucide-react";
import { BUNDLED_FONTS, INSTALLED_FONTS, fontStack } from "@/lib/fonts";
import { t } from "@/lib/i18n";

/**
 * A button that opens the list of fonts, each written in itself. The first
 * few are for everyone; the rest show where they are installed.
 *
 * The list is a portal on document.body, not a child of the button. An
 * absolutely positioned panel is still clipped by any ancestor that scrolls,
 * and the toolbar scrolls sideways, which is what folded the whole list into
 * the bar. `fixed` would not help either: the bar's backdrop-blur makes it a
 * containing block. Anchored by viewport coordinates instead, the panel has
 * nothing left to be trapped by.
 */

const PANEL_W = 256; // the old w-64, now that Tailwind cannot size a portal for us
const PANEL_MAX_H = 320; // the old max-h-80
const PANEL_MIN_H = 180;
const GAP = 8;

type Group = "own" | "bundled" | "installed";
type Row = { family: string | undefined; label: string; group: Group };

const GROUP_HEADING: Record<Group, string | null> = {
  own: null,
  bundled: "for everyone",
  installed: "where installed",
};

/** useLayoutEffect warns during the static prerender, where there is no layout. */
const useAnchorEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export default function FontPicker({
  value,
  onPick,
}: {
  value: string | undefined;
  onPick: (family: string | undefined) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [anchor, setAnchor] = useState<{ top: number; left: number; height: number } | null>(null);

  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const activeRow = useRef<HTMLButtonElement | null>(null);
  const wasOpen = useRef(false);

  const total = BUNDLED_FONTS.length + INSTALLED_FONTS.length;

  const rows = useMemo<Row[]>(() => {
    const q = query.trim().toLowerCase();
    const match = (f: string) => !q || f.toLowerCase().includes(q);
    const out: Row[] = [];
    if (!q) out.push({ family: undefined, label: t("the room's own"), group: "own" });
    for (const f of BUNDLED_FONTS) {
      if (match(f.family)) out.push({ family: f.family, label: f.family, group: "bundled" });
    }
    for (const f of INSTALLED_FONTS) {
      if (match(f)) out.push({ family: f, label: f, group: "installed" });
    }
    return out;
  }, [query]);

  /** Measures the button and decides whether the panel drops or rises. */
  const place = useCallback(() => {
    const button = trigger.current;
    if (!button) return;
    const rect = button.getBoundingClientRect();
    const below = window.innerHeight - rect.bottom - GAP * 2;
    const above = rect.top - GAP * 2;
    const rise = below < PANEL_MIN_H && above > below;
    const height = Math.max(PANEL_MIN_H, Math.min(PANEL_MAX_H, rise ? above : below));
    const left = Math.min(
      Math.max(GAP, rect.left + rect.width / 2 - PANEL_W / 2),
      window.innerWidth - PANEL_W - GAP,
    );
    setAnchor({ top: rise ? rect.top - GAP - height : rect.bottom + GAP, left, height });
  }, []);

  useAnchorEffect(() => {
    if (!open) return;
    place();
    const follow = () => place();
    window.addEventListener("resize", follow);
    // Capture, so the bar scrolling sideways moves the panel with it.
    window.addEventListener("scroll", follow, true);
    return () => {
      window.removeEventListener("resize", follow);
      window.removeEventListener("scroll", follow, true);
    };
  }, [open, place]);

  /** A click anywhere else closes it, and still reaches whatever it hit. */
  useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (panel.current?.contains(target)) return;
      if (trigger.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [open]);

  /**
   * Returns focus to the trigger whenever the panel closes. This lives here,
   * keyed on `open`, instead of inside `choose`/`onKeyDown`: those run from a
   * closure built while rendering the list, and a ref may only be read in an
   * effect or a genuine event callback — never in a closure created during
   * render, which is what a per-row handler built inside `.map()` counts as.
   */
  useEffect(() => {
    if (open) {
      wasOpen.current = true;
      return;
    }
    if (wasOpen.current) {
      wasOpen.current = false;
      trigger.current?.focus();
    }
  }, [open]);

  useEffect(() => {
    if (open) field.current?.focus();
  }, [open]);

  useEffect(() => {
    if (open) activeRow.current?.scrollIntoView({ block: "nearest" });
  }, [open, active, query]);

  function show() {
    setQuery("");
    setActive(Math.max(0, rows.findIndex((row) => row.family === value)));
    setOpen(true);
  }

  function choose(family: string | undefined) {
    onPick(family);
    setOpen(false);
  }

  /** The room listens for single keys, so nothing typed in here may escape. */
  function onKeyDown(event: React.KeyboardEvent) {
    event.stopPropagation();

    switch (event.key) {
      case "Escape":
        event.preventDefault();
        setOpen(false);
        break;
      case "ArrowDown":
        event.preventDefault();
        setActive((i) => Math.min(rows.length - 1, i + 1));
        break;
      case "ArrowUp":
        event.preventDefault();
        setActive((i) => Math.max(0, i - 1));
        break;
      case "Home":
        event.preventDefault();
        setActive(0);
        break;
      case "End":
        event.preventDefault();
        setActive(Math.max(0, rows.length - 1));
        break;
      case "Enter": {
        event.preventDefault();
        const row = rows[active];
        if (row) choose(row.family);
        break;
      }
    }
  }

  const list =
    open && anchor
      ? createPortal(
          <div
            ref={panel}
            role="dialog"
            aria-label={t("font")}
            style={{
              position: "fixed",
              top: anchor.top,
              left: anchor.left,
              width: PANEL_W,
              height: anchor.height,
            }}
            className="z-[90] flex flex-col gap-1 rounded-2xl bg-ink-900/97 p-2 shadow-2xl ring-1 ring-white/10 backdrop-blur-md"
            // A portal still bubbles through the React tree, so the room would
            // otherwise see every click in here as a click on the board.
            onPointerDown={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
            onDoubleClick={(event) => event.stopPropagation()}
            onWheel={(event) => event.stopPropagation()}
            onKeyDown={onKeyDown}
          >
            <div className="flex items-center gap-1">
              <input
                ref={field}
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setActive(0);
                }}
                spellCheck={false}
                autoComplete="off"
                placeholder={t(`find one of ${total}`)}
                className="h-8 min-w-0 flex-1 rounded-lg bg-white/7 px-2 text-[12px] text-chalk outline-none ring-1 ring-white/10 focus:ring-glow/45"
              />
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={t("close")}
                className="grid size-8 shrink-0 place-items-center rounded-lg text-muted hover:text-chalk"
              >
                <X className="size-3.5" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
              {rows.length === 0 ? (
                <p className="px-2 py-6 text-center text-[12px] text-muted">nothing by that name</p>
              ) : (
                rows.map((row, index) => (
                  <Fragment key={`${row.group}:${row.label}`}>
                    {GROUP_HEADING[row.group] && rows[index - 1]?.group !== row.group && (
                      <p
                        className={clsx(
                          "px-2 text-[9px] font-semibold tracking-wide text-muted/60 uppercase",
                          index === 0 ? "pt-1" : "pt-2",
                        )}
                      >
                        {t(GROUP_HEADING[row.group] ?? "")}
                      </p>
                    )}
                    <button
                      ref={index === active ? activeRow : undefined}
                      type="button"
                      onPointerEnter={() => setActive(index)}
                      onClick={() => choose(row.family)}
                      title={row.label}
                      style={{ fontFamily: fontStack(row.family) }}
                      className={clsx(
                        "w-full truncate rounded-lg px-2 py-1.5 text-left text-[15px] text-chalk",
                        index === active && "bg-white/8",
                        value === row.family && "bg-glow/15 ring-1 ring-glow/40",
                      )}
                    >
                      {row.label}
                    </button>
                  </Fragment>
                ))
              )}
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <span className="shrink-0">
      <button
        ref={trigger}
        type="button"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={() => (open ? setOpen(false) : show())}
        aria-label={t("font")}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={t("font")}
        className={clsx(
          "flex h-8 max-w-28 items-center gap-1 rounded-xl px-2 text-[11px] ring-1 ring-white/10",
          open ? "bg-glow/20 text-chalk" : "bg-white/7 text-muted hover:text-chalk",
        )}
      >
        <Type className="size-3.5 shrink-0" strokeWidth={2.2} />
        <span className="truncate" style={{ fontFamily: fontStack(value) }}>
          {value ?? t("font")}
        </span>
      </button>
      {list}
    </span>
  );
}