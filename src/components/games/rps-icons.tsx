/**
 * A rock, a sheet of paper and a pair of scissors, drawn rather than stood in
 * for by a circle, a square and a triangle. Shared by intransitive, where they
 * are the pieces, and rock paper scissors, where they are the whole game.
 */

export type Hand = "R" | "P" | "S";

export function RpsIcon({
  shape,
  className,
  ink = "#1a1420",
}: {
  shape: Hand;
  className?: string;
  ink?: string;
}) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden fill="none" strokeLinecap="round" strokeLinejoin="round">
      {shape === "R" && (
        <g stroke={ink} strokeWidth="1.5">
          {/* A lumpy stone, lit from the top left, with a crack or two. */}
          <path
            d="M5.2 15.8 L3.8 11.9 L6.1 7.6 L10.4 5.4 L15.2 6.1 L19.1 8.9 L20.4 13.2 L18.7 17.4 L14.3 19.1 L8.9 18.8 Z"
            fill="#b9b3a6"
          />
          <path d="M7 9 L10.4 7.1 L14.6 7.6" stroke="#e8e3d8" strokeWidth="1.2" />
          <path d="M11.5 12.2 L13.6 14.1 L13 16.3" strokeWidth="1.1" />
          <path d="M8.1 13.6 L9.4 12.7" strokeWidth="1.1" />
        </g>
      )}
      {shape === "P" && (
        <g stroke={ink} strokeWidth="1.4">
          {/* A sheet with its corner folded down and a few lines written on it. */}
          <path d="M6 3.5 L14.8 3.5 L19 7.7 L19 20.5 L6 20.5 Z" fill="#f6f2e8" />
          <path d="M14.8 3.5 L14.8 7.7 L19 7.7" fill="#dcd5c4" />
          <path d="M8.6 10.6 L16.4 10.6 M8.6 13.4 L16.4 13.4 M8.6 16.2 L13.6 16.2" strokeWidth="1.1" />
        </g>
      )}
      {shape === "S" && (
        <g stroke={ink} strokeWidth="1.4">
          {/* Two blades crossing at the pivot, over two finger loops. */}
          <path d="M11.1 12.4 L19.6 3.6 L20.2 4.9 L13 13.2 Z" fill="#dfe3ea" />
          <path d="M12.9 12.4 L4.4 3.6 L3.8 4.9 L11 13.2 Z" fill="#c7ccd6" />
          <circle cx="7.3" cy="17.6" r="3.1" fill="#e0655c" />
          <circle cx="16.7" cy="17.6" r="3.1" fill="#e0655c" />
          <circle cx="7.3" cy="17.6" r="1.3" fill="#f6f2e8" />
          <circle cx="16.7" cy="17.6" r="1.3" fill="#f6f2e8" />
          <path d="M9.4 15.5 L11 13.2 M14.6 15.5 L13 13.2" />
          <circle cx="12" cy="12.6" r="0.9" fill={ink} stroke="none" />
        </g>
      )}
    </svg>
  );
}

export const HAND_NAME: Record<Hand, string> = { R: "rock", P: "paper", S: "scissors" };
