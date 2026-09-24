"use client";

import { memo, useId } from "react";
import type { CardBack, CardFace, DeckDef, TarotSuit } from "@/lib/table";
import { t as tr } from "@/lib/i18n";

/**
 * Cards drawn the way a printer would lay them out, in SVG so they stay crisp
 * at any zoom: indices in two corners, pips in their proper places with the
 * lower half turned upside down, framed court cards, a patterned back. Suits
 * are drawn as shapes rather than typed as characters, because a phone that
 * decides a heart is an emoji ruins the whole deck.
 */

const INK = { red: "#b3261e", black: "#1b1a22" };

/** Suit shapes in a 0..20 box, centred on 10,10. */
const SUIT_PATH: Record<"S" | "H" | "D" | "C", string> = {
  H: "M10 17.6 C4.2 13.2 1.2 10.3 1.2 6.8 C1.2 4.2 3.2 2.3 5.7 2.3 C7.6 2.3 9.2 3.4 10 5 C10.8 3.4 12.4 2.3 14.3 2.3 C16.8 2.3 18.8 4.2 18.8 6.8 C18.8 10.3 15.8 13.2 10 17.6 Z",
  D: "M10 1.5 L16.8 10 L10 18.5 L3.2 10 Z",
  S: "M10 1.8 C14.8 6.2 18.6 8.8 18.6 12.1 C18.6 14.4 16.8 16 14.7 16 C13.2 16 12 15.3 11.2 14.2 C11.4 16.1 12.1 17.3 13.4 18.4 L6.6 18.4 C7.9 17.3 8.6 16.1 8.8 14.2 C8 15.3 6.8 16 5.3 16 C3.2 16 1.4 14.4 1.4 12.1 C1.4 8.8 5.2 6.2 10 1.8 Z",
  C: "M10 2.2 A3.7 3.7 0 1 1 9.99 2.2 Z M5.3 8.7 A3.7 3.7 0 1 1 5.29 8.7 Z M14.7 8.7 A3.7 3.7 0 1 1 14.69 8.7 Z M10 10.4 L11.3 14.4 C11.7 16.2 12.5 17.4 13.6 18.4 L6.4 18.4 C7.5 17.4 8.3 16.2 8.7 14.4 Z",
};

/** Pip centres for 2..10 in a 0..100 by 0..140 card, the standard layouts. */
const PIP_LAYOUT: Record<number, Array<[number, number]>> = {
  2: [[50, 30], [50, 110]],
  3: [[50, 30], [50, 70], [50, 110]],
  4: [[32, 30], [68, 30], [32, 110], [68, 110]],
  5: [[32, 30], [68, 30], [50, 70], [32, 110], [68, 110]],
  6: [[32, 30], [68, 30], [32, 70], [68, 70], [32, 110], [68, 110]],
  7: [[32, 30], [68, 30], [50, 50], [32, 70], [68, 70], [32, 110], [68, 110]],
  8: [[32, 30], [68, 30], [50, 50], [32, 70], [68, 70], [50, 90], [32, 110], [68, 110]],
  9: [[32, 30], [68, 30], [32, 56.7], [68, 56.7], [50, 70], [32, 83.3], [68, 83.3], [32, 110], [68, 110]],
  10: [[32, 30], [68, 30], [50, 43], [32, 56.7], [68, 56.7], [32, 83.3], [68, 83.3], [50, 97], [32, 110], [68, 110]],
};

function Suit({
  suit,
  x,
  y,
  size,
  flip,
  color,
}: {
  suit: "S" | "H" | "D" | "C";
  x: number;
  y: number;
  size: number;
  flip?: boolean;
  color: string;
}) {
  const s = size / 20;
  return (
    <path
      d={SUIT_PATH[suit]}
      fill={color}
      transform={`translate(${x} ${y}) ${flip ? "rotate(180)" : ""} scale(${s}) translate(-10 -10)`}
    />
  );
}

// ---------------------------------------------------------------------------
// Backs
// ---------------------------------------------------------------------------

function Back({ back, tall }: { back: CardBack; tall?: boolean }) {
  const id = useId().replace(/:/g, "");
  const h = tall ? 170 : 140;
  const light = "rgba(255,255,255,0.22)";

  return (
    <>
      <rect x="0.5" y="0.5" width="99" height={h - 1} rx="7" fill="#fbf8f1" />
      <rect x="5" y="5" width="90" height={h - 10} rx="4.5" fill={back.color} />
      {back.image ? (
        <>
          <clipPath id={`clip-${id}`}>
            <rect x="5" y="5" width="90" height={h - 10} rx="4.5" />
          </clipPath>
          <image
            href={back.image}
            x="5"
            y="5"
            width="90"
            height={h - 10}
            preserveAspectRatio="xMidYMid slice"
            clipPath={`url(#clip-${id})`}
          />
        </>
      ) : (
        <>
          <defs>
            <pattern id={`p-${id}`} width="8" height="8" patternUnits="userSpaceOnUse">
              {back.pattern === "lattice" && (
                <path d="M0 0 L8 8 M8 0 L0 8" stroke={light} strokeWidth="1" />
              )}
              {back.pattern === "stripes" && (
                <path d="M-2 2 L2 -2 M0 8 L8 0 M6 10 L10 6" stroke={light} strokeWidth="1.6" />
              )}
              {back.pattern === "dots" && <circle cx="4" cy="4" r="1.3" fill={light} />}
            </pattern>
          </defs>
          {back.pattern !== "plain" && (
            <rect x="5" y="5" width="90" height={h - 10} rx="4.5" fill={`url(#p-${id})`} />
          )}
          <rect
            x="10"
            y="10"
            width="80"
            height={h - 20}
            rx="3"
            fill="none"
            stroke="rgba(255,255,255,0.35)"
            strokeWidth="1"
          />
          <g transform={`translate(50 ${h / 2})`}>
            <circle r="13" fill={back.color} stroke="rgba(255,255,255,0.5)" strokeWidth="1.2" />
            <path d="M0 -8 L6 0 L0 8 L-6 0 Z" fill="rgba(255,255,255,0.55)" />
          </g>
        </>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Standard faces
// ---------------------------------------------------------------------------

function StandardFace({ rank, suit }: { rank: string; suit: "S" | "H" | "D" | "C" }) {
  const color = suit === "H" || suit === "D" ? INK.red : INK.black;
  const court = rank === "J" || rank === "Q" || rank === "K";
  const pips = PIP_LAYOUT[Number(rank)];

  return (
    <>
      <rect x="0.5" y="0.5" width="99" height="139" rx="7" fill="#fbf8f1" stroke="#d9d2c3" />
      {/* Indices, top left and (turned) bottom right */}
      {[false, true].map((flip) => (
        <g key={String(flip)} transform={flip ? "rotate(180 50 70)" : undefined}>
          <text
            x="10.5"
            y="19"
            textAnchor="middle"
            fontFamily="Georgia, 'Times New Roman', serif"
            fontWeight="700"
            fontSize={rank === "10" ? 13 : 15}
            fill={color}
            letterSpacing={rank === "10" ? -1 : 0}
          >
            {rank}
          </text>
          <Suit suit={suit} x={10.5} y={28} size={9} color={color} />
        </g>
      ))}

      {rank === "A" && <Suit suit={suit} x={50} y={70} size={suit === "S" ? 40 : 30} color={color} />}

      {pips?.map(([x, y], i) => (
        <Suit key={i} suit={suit} x={x} y={y} size={17} flip={y > 70} color={color} />
      ))}

      {court && (
        <g>
          <rect x="20" y="22" width="60" height="96" rx="3" fill="none" stroke={color} strokeWidth="1.2" />
          <rect x="23" y="25" width="54" height="90" rx="2" fill={suit === "H" || suit === "D" ? "#f3dcd6" : "#dfe0ea"} />
          {[false, true].map((flip) => (
            <g key={String(flip)} transform={flip ? "rotate(180 50 70)" : undefined}>
              <path
                d="M37 58 L37 38 L42 43 L50 31 L58 43 L63 38 L63 58 Z"
                fill={rank === "K" ? "#d8a93a" : rank === "Q" ? "#c98fb0" : "#7aa0c9"}
                stroke={color}
                strokeWidth="0.9"
              />
              <text
                x="50"
                y="55"
                textAnchor="middle"
                fontFamily="Georgia, serif"
                fontWeight="700"
                fontSize="13"
                fill={color}
              >
                {rank}
              </text>
            </g>
          ))}
          <path d="M26 70 L44 70 M56 70 L74 70" stroke={color} strokeWidth="0.8" opacity="0.6" />
          <Suit suit={suit} x={50} y={70} size={12} color={color} />
        </g>
      )}
    </>
  );
}

function JokerFace({ n }: { n: number }) {
  const color = n % 2 === 0 ? INK.black : INK.red;
  return (
    <>
      <rect x="0.5" y="0.5" width="99" height="139" rx="7" fill="#fbf8f1" stroke="#d9d2c3" />
      {"JOKER".split("").map((letter, i) => (
        <text
          key={i}
          x="10"
          y={20 + i * 11}
          textAnchor="middle"
          fontFamily="Georgia, serif"
          fontWeight="700"
          fontSize="10"
          fill={color}
        >
          {letter}
        </text>
      ))}
      <g transform="translate(55 72)">
        <path
          d="M0 -30 L7 -9 L29 -9 L11 4 L18 26 L0 12 L-18 26 L-11 4 L-29 -9 L-7 -9 Z"
          fill={color}
          opacity="0.9"
        />
        <circle r="6" fill="#fbf8f1" />
      </g>
    </>
  );
}

// ---------------------------------------------------------------------------
// Tarot
// ---------------------------------------------------------------------------

export type TarotTheme = "classic" | "night" | "rose";

const TAROT_THEME: Record<TarotTheme, { paper: string; frame: string; ink: string; glow: string }> = {
  classic: { paper: "#efe3c6", frame: "#9a7a2e", ink: "#3a2a14", glow: "#d9a642" },
  night: { paper: "#1e1a3a", frame: "#b9b3e6", ink: "#e9e6ff", glow: "#8f86e0" },
  rose: { paper: "#f7e1e4", frame: "#8e3450", ink: "#4b1627", glow: "#d86a8a" },
};

const ROMAN = [
  "0", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X",
  "XI", "XII", "XIII", "XIV", "XV", "XVI", "XVII", "XVIII", "XIX", "XX", "XXI",
];

/** A small mark for each of the major arcana, drawn round 0,0 in about 60 units. */
function Arcanum({ n, ink, glow }: { n: number; ink: string; glow: string }) {
  const stroke = { stroke: ink, strokeWidth: 2, fill: "none", strokeLinecap: "round" as const };
  switch (n) {
    case 0: // the fool: a sun over a cliff edge
      return (
        <g>
          <circle cx="-10" cy="-12" r="8" fill={glow} />
          <path d="M-26 20 L-4 20 L6 8 L26 8" {...stroke} />
        </g>
      );
    case 1: // the magician: infinity
      return <path d="M0 0 C-8 -12 -24 -12 -24 0 C-24 12 -8 12 0 0 C8 -12 24 -12 24 0 C24 12 8 12 0 0 Z" {...stroke} />;
    case 2: // the high priestess: two pillars and a moon
      return (
        <g>
          <path d="M-18 -24 L-18 24 M18 -24 L18 24" {...stroke} strokeWidth={4} />
          <path d="M-4 -10 A10 10 0 1 0 -4 10 A7 7 0 1 1 -4 -10 Z" fill={glow} />
        </g>
      );
    case 3: // the empress: venus
      return <path d="M0 -24 A10 10 0 1 1 -0.1 -24 M0 -4 L0 22 M-10 12 L10 12" {...stroke} />;
    case 4: // the emperor: a throne
      return <path d="M-18 24 L-18 -8 L-8 -8 L-8 -22 L8 -22 L8 -8 L18 -8 L18 24 Z" {...stroke} />;
    case 5: // the hierophant: a triple cross
      return <path d="M0 -26 L0 26 M-8 -16 L8 -16 M-12 -6 L12 -6 M-16 4 L16 4" {...stroke} />;
    case 6: // the lovers: two circles overlapping
      return (
        <g>
          <circle cx="-8" r="14" {...stroke} />
          <circle cx="8" r="14" {...stroke} />
        </g>
      );
    case 7: // the chariot
      return (
        <g>
          <rect x="-16" y="-18" width="32" height="24" rx="2" {...stroke} />
          <circle cx="-12" cy="16" r="7" {...stroke} />
          <circle cx="12" cy="16" r="7" {...stroke} />
        </g>
      );
    case 8: // strength: a mane round a face
      return (
        <g>
          {Array.from({ length: 12 }, (_, i) => {
            const a = (i / 12) * Math.PI * 2;
            return (
              <path
                key={i}
                d={`M${Math.cos(a) * 12} ${Math.sin(a) * 12} L${Math.cos(a) * 22} ${Math.sin(a) * 22}`}
                {...stroke}
              />
            );
          })}
          <circle r="10" fill={glow} />
        </g>
      );
    case 9: // the hermit: a lantern
      return (
        <g>
          <path d="M-10 -14 L10 -14 L14 12 L-14 12 Z" {...stroke} />
          <path d="M0 -26 L0 -14 M-6 18 L6 18" {...stroke} />
          <circle cy="-1" r="5" fill={glow} />
        </g>
      );
    case 10: // the wheel
      return (
        <g>
          <circle r="22" {...stroke} />
          <circle r="5" fill={glow} />
          {Array.from({ length: 8 }, (_, i) => {
            const a = (i / 8) * Math.PI * 2;
            return <path key={i} d={`M0 0 L${Math.cos(a) * 22} ${Math.sin(a) * 22}`} {...stroke} strokeWidth={1.4} />;
          })}
        </g>
      );
    case 11: // justice: scales
      return (
        <path
          d="M0 -24 L0 22 M-20 -12 L20 -12 M-20 -12 L-28 4 L-12 4 Z M20 -12 L12 4 L28 4 Z M-10 22 L10 22"
          {...stroke}
        />
      );
    case 12: // the hanged man
      return <path d="M-18 -22 L18 -22 M0 -22 L0 6 M-10 -6 L10 -6 M-10 18 L0 6 L10 18 Z" {...stroke} />;
    case 13: // death: a sun going down
      return (
        <g>
          <path d="M-16 8 A16 16 0 0 1 16 8 Z" fill={glow} />
          <path d="M-28 8 L28 8 M-20 16 L20 16 M-12 24 L12 24" {...stroke} />
        </g>
      );
    case 14: // temperance: pouring between two cups
      return (
        <path
          d="M-24 -18 L-12 -18 L-14 -2 L-22 -2 Z M12 6 L24 6 L22 22 L14 22 Z M-14 -8 C0 -8 4 0 16 8"
          {...stroke}
        />
      );
    case 15: // the devil: a star turned over
      return <path d="M0 24 L7 3 L29 3 L11 -10 L18 -32 L0 -18 L-18 -32 L-11 -10 L-29 3 L-7 3 Z" {...stroke} />;
    case 16: // the tower struck
      return (
        <g>
          <path d="M-12 26 L-12 -14 L12 -14 L12 26 M-14 -14 L-14 -22 L14 -22 L14 -14" {...stroke} />
          <path d="M22 -30 L8 -8 L16 -8 L2 12" stroke={glow} strokeWidth={2.4} fill="none" />
        </g>
      );
    case 17: // the star
      return (
        <path
          d="M0 -26 L5 -5 L26 0 L5 5 L0 26 L-5 5 L-26 0 L-5 -5 Z M-15 -15 L0 0 L15 15 M15 -15 L0 0 L-15 15"
          stroke={ink}
          strokeWidth={1.4}
          fill={glow}
        />
      );
    case 18: // the moon
      return (
        <g>
          <path d="M6 -22 A22 22 0 1 0 6 22 A16 16 0 1 1 6 -22 Z" fill={glow} />
          <path d="M-22 26 L-18 20 M22 26 L18 20" {...stroke} />
        </g>
      );
    case 19: // the sun
      return (
        <g>
          {Array.from({ length: 16 }, (_, i) => {
            const a = (i / 16) * Math.PI * 2;
            const r = i % 2 === 0 ? 28 : 22;
            return <path key={i} d={`M${Math.cos(a) * 15} ${Math.sin(a) * 15} L${Math.cos(a) * r} ${Math.sin(a) * r}`} {...stroke} />;
          })}
          <circle r="12" fill={glow} />
        </g>
      );
    case 20: // judgement: a horn and rays
      return (
        <g>
          <path d="M-24 10 L14 -6 L14 14 Z" {...stroke} />
          <path d="M18 -10 L28 -20 M20 4 L30 4 M18 18 L28 26" {...stroke} />
        </g>
      );
    default: // the world: a wreath
      return (
        <g>
          <ellipse rx="18" ry="26" {...stroke} strokeWidth={3} />
          <path d="M0 -8 L3 -2 L9 -1 L4 3 L6 9 L0 6 L-6 9 L-4 3 L-9 -1 L-3 -2 Z" fill={glow} />
        </g>
      );
  }
}

/** A suit emblem for the minor arcana, drawn round 0,0 in about 20 units. */
function TarotSuitMark({ suit, ink, glow }: { suit: TarotSuit; ink: string; glow: string }) {
  const stroke = { stroke: ink, strokeWidth: 1.6, fill: "none", strokeLinecap: "round" as const };
  switch (suit) {
    case "W":
      return <path d="M-7 9 L7 -9 M4 -9 L7 -9 L7 -6 M-4 3 L-1 6" {...stroke} strokeWidth={2.2} />;
    case "C":
      return (
        <g>
          <path d="M-7 -8 L7 -8 C7 0 4 3 0 3 C-4 3 -7 0 -7 -8 Z" fill={glow} stroke={ink} strokeWidth={1.2} />
          <path d="M0 3 L0 8 M-4 9 L4 9" {...stroke} />
        </g>
      );
    case "S":
      return <path d="M0 -10 L2 4 L-2 4 Z M-5 4 L5 4 M0 4 L0 10" stroke={ink} strokeWidth={1.4} fill={glow} />;
    default:
      return (
        <g>
          <circle r="8" fill={glow} stroke={ink} strokeWidth={1.2} />
          <path d="M0 -6 L1.8 -1.8 L6 -1.8 L2.6 1 L3.8 5.4 L0 2.8 L-3.8 5.4 L-2.6 1 L-6 -1.8 L-1.8 -1.8 Z" fill={ink} />
        </g>
      );
  }
}

function TarotFace({ face, theme }: { face: CardFace; theme: TarotTheme }) {
  const t = TAROT_THEME[theme];
  const major = face.kind === "major";
  const title = face.kind === "major" || face.kind === "minor" ? face.name : "";

  return (
    <>
      <rect x="0.5" y="0.5" width="99" height="169" rx="7" fill={t.paper} stroke={t.frame} />
      <rect x="5" y="5" width="90" height="160" rx="4" fill="none" stroke={t.frame} strokeWidth="1.4" />
      <rect x="8" y="8" width="84" height="154" rx="3" fill="none" stroke={t.frame} strokeWidth="0.6" />

      {major && face.kind === "major" && (
        <>
          <text x="50" y="24" textAnchor="middle" fontFamily="Georgia, serif" fontSize="12" fill={t.ink}>
            {ROMAN[face.n]}
          </text>
          <g transform="translate(50 82) scale(1.05)">
            <circle r="34" fill={t.glow} opacity="0.12" />
            <Arcanum n={face.n} ink={t.ink} glow={t.glow} />
          </g>
        </>
      )}

      {face.kind === "minor" && (
        <>
          <text x="50" y="24" textAnchor="middle" fontFamily="Georgia, serif" fontSize="11" fill={t.ink}>
            {face.n === 1 ? "ACE" : face.n <= 10 ? face.n : ["PAGE", "KNIGHT", "QUEEN", "KING"][face.n - 11]}
          </text>
          {face.n === 1 || face.n > 10 ? (
            <g transform="translate(50 82) scale(2.6)">
              <TarotSuitMark suit={face.suit} ink={t.ink} glow={t.glow} />
            </g>
          ) : (
            Array.from({ length: face.n }, (_, i) => {
              const cols = face.n > 6 ? 3 : 2;
              const rows = Math.ceil(face.n / cols);
              const col = i % cols;
              const row = Math.floor(i / cols);
              const x = 50 + (col - (cols - 1) / 2) * 24;
              const y = 82 + (row - (rows - 1) / 2) * 24;
              return (
                <g key={i} transform={`translate(${x} ${y})`}>
                  <TarotSuitMark suit={face.suit} ink={t.ink} glow={t.glow} />
                </g>
              );
            })
          )}
        </>
      )}

      <rect x="14" y="140" width="72" height="16" rx="2" fill={t.frame} opacity="0.18" />
      <text
        x="50"
        y="151.5"
        textAnchor="middle"
        fontFamily="Georgia, serif"
        fontSize={title.length > 18 ? 6 : title.length > 13 ? 7 : 8.5}
        fill={t.ink}
      >
        {tr(title).toUpperCase()}
      </text>
    </>
  );
}

// ---------------------------------------------------------------------------
// Custom
// ---------------------------------------------------------------------------

function CustomFace({ face }: { face: Extract<CardFace, { kind: "custom" }> }) {
  const id = useId().replace(/:/g, "");
  const { card } = face;
  return (
    <>
      <rect x="0.5" y="0.5" width="99" height="139" rx="7" fill="#fbf8f1" stroke="#d9d2c3" />
      <rect x="6" y="6" width="88" height="128" rx="4" fill={card.color} opacity="0.2" />
      {card.image ? (
        <>
          <clipPath id={`c-${id}`}>
            <rect x="10" y="26" width="80" height="62" rx="3" />
          </clipPath>
          <image
            href={card.image}
            x="10"
            y="26"
            width="80"
            height="62"
            preserveAspectRatio="xMidYMid slice"
            clipPath={`url(#c-${id})`}
          />
        </>
      ) : (
        <circle cx="50" cy="57" r="22" fill={card.color} opacity="0.85" />
      )}
      <rect x="6" y="6" width="88" height="16" rx="3" fill={card.color} />
      <text x="50" y="17.5" textAnchor="middle" fontFamily="Georgia, serif" fontWeight="700" fontSize="9" fill="#1b1a22">
        {card.title.slice(0, 18)}
      </text>
      {card.text && (
        <foreignObject x="9" y="92" width="82" height="40">
          <div
            style={{
              fontSize: 7.5,
              lineHeight: 1.2,
              color: "#1b1a22",
              textAlign: "center",
              overflow: "hidden",
              height: "100%",
              fontFamily: "Georgia, serif",
            }}
          >
            {card.text}
          </div>
        </foreignObject>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// The card
// ---------------------------------------------------------------------------

export function isTall(deck: DeckDef | null): boolean {
  return deck?.kind === "tarot";
}

/** Height for a given width, for this deck's proportions. */
export function cardHeight(width: number, deck: DeckDef | null): number {
  return Math.round(width * (isTall(deck) ? 1.7 : 1.4));
}

function PlayingCard({
  face,
  deck,
  down,
  width,
  turned,
  className,
}: {
  face: CardFace | null;
  deck: DeckDef | null;
  down?: boolean;
  width: number;
  turned?: boolean;
  className?: string;
}) {
  const tall = isTall(deck);
  const h = tall ? 170 : 140;
  const back = deck?.back ?? { color: "#7a2e3b", pattern: "lattice" as const };
  const theme: TarotTheme = deck?.theme ?? "classic";

  return (
    <svg
      viewBox={`0 0 100 ${h}`}
      width={width}
      height={cardHeight(width, deck)}
      className={className}
      style={{
        display: "block",
        transform: turned ? "rotate(180deg)" : undefined,
        filter: "drop-shadow(0 1px 0.5px rgba(0,0,0,0.35)) drop-shadow(0 3px 6px rgba(0,0,0,0.22))",
      }}
      role="img"
    >
      {down || !face ? (
        <Back back={back} tall={tall} />
      ) : face.kind === "standard" ? (
        <StandardFace rank={face.rank} suit={face.suit} />
      ) : face.kind === "joker" ? (
        <JokerFace n={face.n} />
      ) : face.kind === "major" || face.kind === "minor" ? (
        <TarotFace face={face} theme={theme} />
      ) : face.kind === "custom" ? (
        <CustomFace face={face} />
      ) : (
        <>
          <rect x="0.5" y="0.5" width="99" height={h - 1} rx="7" fill="#fbf8f1" stroke="#d9d2c3" />
          <text x="50" y={h / 2} textAnchor="middle" fontSize="12" fill="#1b1a22">
            ?
          </text>
        </>
      )}
    </svg>
  );
}

export default memo(PlayingCard);
