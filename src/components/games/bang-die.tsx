"use client";

import clsx from "clsx";
import type { Face } from "@/lib/bang";
import { t } from "@/lib/i18n";

const INK = "#1a1420";
const RED = "#b3261e";

/** The six symbols, drawn on a 40 unit face. */
function Symbol({ face }: { face: Face }) {
  switch (face) {
    case "arrow":
      return (
        <g stroke={RED} strokeWidth={2.6} strokeLinecap="round" fill="none">
          <path d="M11 29 L28 12" />
          <path d="M28 12 L21.5 13 M28 12 L27 18.5" />
          <path d="M11 29 L9 24 M11 29 L16 31 M14 26 L12 21 M14 26 L19 28" strokeWidth={2} />
        </g>
      );
    case "dynamite":
      return (
        <g>
          <rect x="11" y="15" width="18" height="10" rx="2" fill={RED} transform="rotate(-25 20 20)" />
          <path d="M27 13 q 3 -4 6 -3" stroke={INK} strokeWidth={1.6} fill="none" />
          <path d="M33 7 l1.2 2.6 2.8 .4 -2 2 .5 2.8 -2.5 -1.3 -2.5 1.3 .5 -2.8 -2 -2 2.8 -.4z" fill="#f6c177" />
        </g>
      );
    case "one":
    case "two":
      return (
        <g>
          <circle cx="20" cy="20" r="12" fill="none" stroke={INK} strokeWidth={2} />
          <circle cx="20" cy="20" r="7.5" fill="none" stroke={RED} strokeWidth={2} />
          <text x="20" y="24.5" textAnchor="middle" fontSize="12" fontWeight="800" fill={INK}>
            {face === "one" ? "1" : "2"}
          </text>
        </g>
      );
    case "beer":
      return (
        <g>
          <rect x="12" y="14" width="13" height="16" rx="2" fill="#e0a64a" stroke={INK} strokeWidth={1.6} />
          <path d="M25 17 h3 a3 3 0 0 1 0 8 h-3" fill="none" stroke={INK} strokeWidth={1.6} />
          <path d="M11 14 q2 -4 5 -2 q2 -3 5 -1 q3 -2 5 2 z" fill="#fbf4e4" stroke={INK} strokeWidth={1.2} />
        </g>
      );
    case "gatling":
      return (
        <g fill={INK}>
          <rect x="9" y="15" width="22" height="2.6" rx="1.3" />
          <rect x="9" y="19" width="22" height="2.6" rx="1.3" />
          <rect x="9" y="23" width="22" height="2.6" rx="1.3" />
          <rect x="24" y="13" width="7" height="15" rx="2" />
          <circle cx="16" cy="31" r="3" fill="none" stroke={INK} strokeWidth={1.6} />
        </g>
      );
  }
}

/**
 * One of BANG!'s dice, lying on the table. Thrown dice tumble in and only
 * show their face once they have stopped; dynamite is locked where it fell.
 */
export default function BangDie({
  face,
  size = 52,
  tumble,
  delay = 0,
  picked,
  locked,
  marked,
  onClick,
  title,
}: {
  face: Face | null;
  size?: number;
  tumble?: boolean;
  delay?: number;
  /** Chosen to be thrown again, or chosen to be aimed. */
  picked?: boolean;
  locked?: boolean;
  /** A small note under the die: who it is for. */
  marked?: string;
  onClick?: () => void;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      title={title && t(title)}
      className={clsx("relative flex shrink-0 flex-col items-center gap-0.5 disabled:cursor-default", onClick && "active:scale-95")}
    >
      <span
        className={clsx(
          "relative block rounded-[22%] transition-transform",
          tumble && "animate-die-tumble",
          picked && "-translate-y-2",
        )}
        style={{ width: size, height: size, animationDelay: `${delay}ms` }}
      >
        <svg viewBox="0 0 40 40" className="size-full drop-shadow-[0_3px_3px_rgba(0,0,0,0.5)]" aria-hidden>
          <rect x="1" y="1" width="38" height="38" rx="8" fill="#f3ead6" stroke={picked ? "#f6c177" : "#8a6a45"} strokeWidth={picked ? 2.4 : 1.4} />
          {face && (
            <g className={clsx(tumble && "animate-die-land")} style={{ animationDelay: `${delay}ms` }}>
              <Symbol face={face} />
            </g>
          )}
        </svg>
        {locked && (
          <span className="absolute -top-1 -right-1 grid size-4 place-items-center rounded-full bg-[#b3261e] text-[8px] font-bold text-white" aria-label={t("locked")}>
            !
          </span>
        )}
      </span>
      {marked && <span className="max-w-16 truncate text-[9px] leading-none text-warm">{t(marked)}</span>}
    </button>
  );
}
