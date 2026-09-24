"use client";

import clsx from "clsx";
import type { Sides } from "@/lib/dice";
import { t } from "@/lib/i18n";

/** Where the pips go on a d6, on a 3x3 grid. */
const PIPS: Record<number, Array<[number, number]>> = {
  1: [[1, 1]],
  2: [[0, 0], [2, 2]],
  3: [[0, 0], [1, 1], [2, 2]],
  4: [[0, 0], [2, 0], [0, 2], [2, 2]],
  5: [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]],
  6: [[0, 0], [2, 0], [0, 1], [2, 1], [0, 2], [2, 2]],
};

/** The outline of each kind of die, seen from above, in a 44 unit box. */
function outline(sides: Sides): { shape: React.ReactNode; textY: number } {
  const style = { fill: "var(--die)", stroke: "var(--die-edge)", strokeWidth: 1.6, strokeLinejoin: "round" as const };
  const facet = { stroke: "var(--die-edge)", strokeWidth: 0.8, opacity: 0.55, fill: "none" };
  switch (sides) {
    case 4:
      return { shape: <polygon points="22,3 41,38 3,38" {...style} />, textY: 31 };
    case 6:
    case "F":
      return { shape: <rect x="4" y="4" width="36" height="36" rx="8" {...style} />, textY: 27 };
    case 8:
      return {
        shape: (
          <>
            <polygon points="22,2 42,22 22,42 2,22" {...style} />
            <path d="M2 22 L42 22" {...facet} />
          </>
        ),
        textY: 19,
      };
    case 10:
    case 100:
      return {
        shape: (
          <>
            <polygon points="22,2 41,17 22,42 3,17" {...style} />
            <path d="M3 17 L22 26 L41 17 M22 26 L22 42" {...facet} />
          </>
        ),
        textY: 21,
      };
    case 12:
      return {
        shape: (
          <>
            <polygon points="22,2 42,16.5 34.5,40 9.5,40 2,16.5" {...style} />
            <polygon points="22,10 32,18 28.5,31 15.5,31 12,18" {...facet} />
          </>
        ),
        textY: 25,
      };
    case 20:
      return {
        shape: (
          <>
            <polygon points="22,2 40,12 40,32 22,42 4,32 4,12" {...style} />
            <polygon points="22,9 35,31 9,31" {...facet} />
          </>
        ),
        textY: 26,
      };
    default:
      return { shape: <circle cx="22" cy="22" r="19" {...style} />, textY: 27 };
  }
}

/**
 * One die as it lies in the tray: its real shape, the face it landed on, and a
 * little ceremony for the best and the worst faces it has.
 */
export default function DieFace({
  sides,
  value,
  kept = true,
  best,
  worst,
  exploded,
  tint = "#f4efe6",
  size = 44,
  tumble,
  delay = 0,
}: {
  sides: Sides;
  value: number;
  kept?: boolean;
  best?: boolean;
  worst?: boolean;
  exploded?: boolean;
  tint?: string;
  size?: number;
  tumble?: boolean;
  delay?: number;
}) {
  const { shape, textY } = outline(sides);
  const pips = sides === 6 && value >= 1 && value <= 6;
  const label = sides === "F" ? (value > 0 ? "+" : value < 0 ? "-" : "") : String(value);
  const long = label.length >= 3;

  return (
    <span
      className={clsx("relative inline-block shrink-0", tumble && "animate-die-tumble", !kept && "opacity-35")}
      style={
        {
          width: size,
          height: size,
          animationDelay: `${delay}ms`,
          "--die": tint,
          "--die-edge": "color-mix(in oklab, var(--die) 55%, #100d16)",
        } as React.CSSProperties
      }
      title={`d${sides === "F" ? "F" : sides}: ${label || t("blank")}${kept ? "" : ` (${t("dropped")})`}`}
    >
      <svg viewBox="0 0 44 44" className="size-full drop-shadow-[0_2px_2px_rgba(0,0,0,0.45)]" aria-hidden>
        {shape}
        {pips ? (
          PIPS[value].map(([col, row], i) => (
            <circle key={i} cx={12 + col * 10} cy={12 + row * 10} r={3.2} fill="#100d16" opacity={0.85} />
          ))
        ) : (
          <text
            x="22"
            y={textY}
            textAnchor="middle"
            className={clsx("animate-die-land font-sans font-bold", tumble || "[animation:none]")}
            style={{ animationDelay: `${delay}ms` }}
            fontSize={long ? 10 : sides === 4 ? 12 : 14}
            fill="#100d16"
          >
            {label}
          </text>
        )}
        {!kept && <path d="M8 36 L36 8" stroke="#100d16" strokeWidth={2.4} strokeLinecap="round" opacity={0.7} />}
      </svg>
      {(best || worst) && kept && (
        <span
          className={clsx(
            "pointer-events-none absolute inset-0 rounded-full",
            best ? "shadow-[0_0_14px_2px_rgba(246,193,119,0.55)]" : "shadow-[0_0_12px_1px_rgba(224,101,92,0.45)]",
          )}
        />
      )}
      {exploded && (
        <span className="absolute -top-1 -right-1 grid size-4 place-items-center rounded-full bg-warm text-[9px] font-bold text-ink-950">
          !
        </span>
      )}
    </span>
  );
}
