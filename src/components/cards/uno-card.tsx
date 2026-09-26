"use client";

import { memo } from "react";
import { COLORS, COLOR_HEX, parse, type Color } from "@/lib/uno";

/**
 * An uno card, drawn: the colour edge to edge inside a white border, a tilted
 * white oval in the middle carrying the number or the symbol, small marks in
 * two corners. Wilds are black with the four colours quartered in the oval.
 * The back is our own -- a dark card with a red oval and a star -- rather than
 * anyone's logo.
 */

const DRAW_LABEL: Record<string, string> = { "+": "+2", "+4": "+4", W4: "+4", W6: "+6", W10: "+10", WR: "+4" };

function Symbol({ value, color, size }: { value: string; color: string; size: "big" | "small" }) {
  const big = size === "big";
  const stroke = big ? 7 : 4.5;
  switch (value) {
    case "S":
      return (
        <g>
          <circle r={big ? 20 : 11} fill="none" stroke={color} strokeWidth={stroke} />
          <path d={big ? "M-13 13 L13 -13" : "M-7 7 L7 -7"} stroke={color} strokeWidth={stroke} strokeLinecap="round" />
        </g>
      );
    case "R": {
      const s = big ? 1 : 0.55;
      return (
        <g transform={`scale(${s})`} fill={color}>
          <path d="M-18 4 L-18 -8 C-18 -16 -12 -20 -4 -20 L6 -20 L6 -28 L20 -14 L6 0 L6 -8 L-4 -8 C-6 -8 -6 -7 -6 -6 L-6 4 Z" />
          <path d="M18 -4 L18 8 C18 16 12 20 4 20 L-6 20 L-6 28 L-20 14 L-6 0 L-6 8 L4 8 C6 8 6 7 6 6 L6 -4 Z" />
        </g>
      );
    }
    case "+":
    case "+4":
    case "W4":
    case "W6":
    case "W10":
    case "WR": {
      const label = DRAW_LABEL[value];
      const wild = value.startsWith("W");
      const long = label.length > 2;
      return (
        <g>
          <text
            y={big ? (value === "WR" ? 4 : 13) : 7}
            textAnchor="middle"
            fontFamily="'Arial Black', Arial, sans-serif"
            fontWeight="900"
            fontStyle="italic"
            fontSize={big ? (long ? 30 : 36) : long ? 15 : 20}
            fill={color}
            stroke={wild ? "#1b1a22" : "none"}
            strokeWidth={wild ? 1.5 : 0}
            paintOrder="stroke"
          >
            {label}
          </text>
          {value === "WR" && big && (
            <g transform="translate(0 26) scale(0.42)" fill={color} stroke="#1b1a22" strokeWidth={3} paintOrder="stroke">
              <path d="M-18 4 L-18 -8 C-18 -16 -12 -20 -4 -20 L6 -20 L6 -28 L20 -14 L6 0 L6 -8 L-4 -8 C-6 -8 -6 -7 -6 -6 L-6 4 Z" />
              <path d="M18 -4 L18 8 C18 16 12 20 4 20 L-6 20 L-6 28 L-20 14 L-6 0 L-6 8 L4 8 C6 8 6 7 6 6 L6 -4 Z" />
            </g>
          )}
        </g>
      );
    }
    case "SA": {
      // Two skips overlapping: everybody misses a go.
      const r = big ? 15 : 8;
      const off = big ? 8 : 4.5;
      return (
        <g fill="none" stroke={color} strokeWidth={big ? 5 : 3} strokeLinecap="round">
          {[-off, off].map((dx) => (
            <g key={dx} transform={`translate(${dx} ${dx * 0.6})`}>
              <circle r={r} />
              <path d={`M${-r * 0.65} ${r * 0.65} L${r * 0.65} ${-r * 0.65}`} />
            </g>
          ))}
        </g>
      );
    }
    case "DA": {
      // A fan of cards all going at once.
      const w = big ? 16 : 9;
      const h = big ? 24 : 13;
      return (
        <g fill={color} stroke="#f7f4ee" strokeWidth={big ? 1.6 : 1}>
          {[-24, 0, 24].map((a) => (
            <rect key={a} x={-w / 2} y={-h / 2} width={w} height={h} rx={2} transform={`rotate(${a}) translate(0 ${big ? -4 : -2})`} />
          ))}
        </g>
      );
    }
    case "WC":
      return (
        <text y={big ? 14 : 7} textAnchor="middle" fontFamily="'Arial Black', Arial, sans-serif" fontWeight="900" fontSize={big ? 40 : 20} fill={color} stroke="#1b1a22" strokeWidth={1.5} paintOrder="stroke">
          ?
        </text>
      );
    case "WS": {
      const s = big ? 1 : 0.5;
      return (
        <g transform={`scale(${s})`} fill={color} stroke="#1b1a22" strokeWidth={2} paintOrder="stroke">
          <path d="M-20 -8 L10 -8 L10 -16 L24 -4 L10 8 L10 0 L-20 0 Z" />
          <path d="M20 8 L-10 8 L-10 0 L-24 12 L-10 24 L-10 16 L20 16 Z" transform="translate(0 -4)" />
        </g>
      );
    }
    case "W":
      return null;
    default:
      return (
        <text
          y={big ? 17 : 8}
          textAnchor="middle"
          fontFamily="'Arial Black', Arial, sans-serif"
          fontWeight="900"
          fontStyle="italic"
          fontSize={big ? 50 : 22}
          fill={color}
          stroke="#1b1a22"
          strokeWidth={big ? 2 : 1}
          paintOrder="stroke"
        >
          {value}
        </text>
      );
  }
}

/** The four colours, quartered in an oval: the face of every wild. */
function Quarters({ rx, ry }: { rx: number; ry: number }) {
  return (
    <g>
      {COLORS.map((c: Color, i) => {
        const start = (i * Math.PI) / 2;
        const end = start + Math.PI / 2;
        const x1 = Math.cos(start) * rx;
        const y1 = Math.sin(start) * ry;
        const x2 = Math.cos(end) * rx;
        const y2 = Math.sin(end) * ry;
        return <path key={c} d={`M0 0 L${x1} ${y1} A${rx} ${ry} 0 0 1 ${x2} ${y2} Z`} fill={COLOR_HEX[c]} />;
      })}
    </g>
  );
}

function UnoCard({
  card,
  down,
  width,
  called,
  className,
}: {
  card: string | null;
  down?: boolean;
  width: number;
  /** For a wild on the discard pile: the colour it was called as, shown round it. */
  called?: Color | null;
  className?: string;
}) {
  const height = Math.round(width * 1.5);
  const shadow = "drop-shadow(0 1px 0.5px rgba(0,0,0,0.4)) drop-shadow(0 4px 8px rgba(0,0,0,0.25))";

  if (down || !card) {
    return (
      <svg viewBox="0 0 100 150" width={width} height={height} className={className} style={{ display: "block", filter: shadow }}>
        <rect x="0.5" y="0.5" width="99" height="149" rx="9" fill="#f7f4ee" />
        <rect x="6" y="6" width="88" height="138" rx="6" fill="#1b1a22" />
        <g transform="translate(50 75) rotate(-28)">
          <ellipse rx="34" ry="52" fill="#d63a3a" />
          <path d="M0 -20 L5 -5 L20 0 L5 5 L0 20 L-5 5 L-20 0 L-5 -5 Z" fill="#f7f4ee" />
        </g>
      </svg>
    );
  }

  const { color, value } = parse(card);
  const fill = color ? COLOR_HEX[color] : "#1b1a22";
  const wild = !color;
  const ink = color ? COLOR_HEX[color] : "#f7f4ee";

  return (
    <svg viewBox="0 0 100 150" width={width} height={height} className={className} style={{ display: "block", filter: shadow }}>
      <rect x="0.5" y="0.5" width="99" height="149" rx="9" fill="#f7f4ee" />
      <rect x="6" y="6" width="88" height="138" rx="6" fill={fill} />
      {called && wild && (
        <rect x="6" y="6" width="88" height="138" rx="6" fill="none" stroke={COLOR_HEX[called]} strokeWidth="6" />
      )}

      <g transform="translate(50 75) rotate(-28)">
        {wild ? <Quarters rx={32} ry={50} /> : <ellipse rx="32" ry="50" fill="#f7f4ee" />}
      </g>
      <g transform="translate(50 75)">
        <Symbol value={value} color={wild ? "#f7f4ee" : ink} size="big" />
      </g>

      {[false, true].map((flip) => (
        <g key={String(flip)} transform={flip ? "rotate(180 50 75)" : undefined}>
          <g transform="translate(19 22)">
            {wild ? (
              value !== "W" ? (
                <Symbol value={value} color="#f7f4ee" size="small" />
              ) : (
                <g transform="rotate(-28)">
                  <Quarters rx={7} ry={10} />
                </g>
              )
            ) : (
              <Symbol value={value} color="#f7f4ee" size="small" />
            )}
          </g>
        </g>
      ))}
    </svg>
  );
}

export default memo(UnoCard);
