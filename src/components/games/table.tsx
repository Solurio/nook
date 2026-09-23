"use client";

import clsx from "clsx";
import { RotateCcw, Users } from "lucide-react";
import { isOpenTable, type Seats } from "@/lib/seats";
import { t } from "@/lib/i18n";

/**
 * The shell every board game sits in: chairs along the top, the board in the
 * middle, where things stand along the bottom. Keeping it in one place means a
 * game only has to bring its board, and all of them behave the same way.
 */
export default function GameTable<K extends string>({
  seats,
  turn,
  me,
  order,
  label,
  tint,
  onSit,
  status,
  score,
  onRestart,
  canEdit,
  over,
  children,
}: {
  seats: Seats<K>;
  turn: K;
  me: string;
  /** Chairs in the order they should be shown. */
  order: readonly K[];
  label: (seat: K) => string;
  tint: (seat: K) => string;
  onSit: (seat: K) => void;
  status: string;
  score?: string;
  onRestart?: () => void;
  canEdit: boolean;
  over?: boolean;
  children: React.ReactNode;
}) {
  const open = isOpenTable(seats);

  return (
    <div className="surface grain flex size-full flex-col overflow-hidden rounded-2xl p-2.5">
      <div className="mb-2 flex items-center gap-1.5">
        {order.map((seat) => (
          <Chair
            key={seat}
            label={label(seat)}
            tint={tint(seat)}
            who={seats[seat]}
            mine={seats[seat] === me}
            active={turn === seat && !over}
            disabled={!canEdit}
            onClick={() => onSit(seat)}
          />
        ))}
      </div>

      <div className="grid min-h-0 flex-1 place-items-center overflow-hidden [container-type:size]">{children}</div>

      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="flex min-w-0 items-center gap-1.5 truncate text-xs font-medium text-muted">
          {open && !over && (
            <Users className="size-3.5 shrink-0 text-muted/60" strokeWidth={2.2} />
          )}
          <span className="truncate">{t(status)}</span>
        </p>

        <div className="flex shrink-0 items-center gap-2">
          {score && <span className="text-[10px] tabular-nums text-muted/70">{score}</span>}
          {onRestart && (
            <button
              type="button"
              disabled={!canEdit}
              onClick={onRestart}
              aria-label={t("new game")}
              title={t("new game")}
              className="grid size-8 place-items-center rounded-lg text-muted transition hover:bg-white/8 hover:text-chalk disabled:opacity-40 sm:size-7"
            >
              <RotateCcw className="size-3.5" strokeWidth={2.2} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** One chair. Tap an empty one to sit, tap your own to stand back up. */
function Chair({
  label,
  tint,
  who,
  mine,
  active,
  disabled,
  onClick,
}: {
  label: string;
  tint: string;
  who: string | null;
  mine: boolean;
  active: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={who ? (mine ? t("stand up") : who) : t(`sit as ${label}`)}
      className={clsx(
        "flex min-h-9 min-w-0 flex-1 items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-left transition disabled:opacity-50",
        active ? "bg-white/12 ring-1 ring-glow/45" : "bg-white/5 hover:bg-white/9",
      )}
    >
      <span
        className={clsx(
          "size-3 shrink-0 rounded-full ring-1 ring-white/25",
          active && "ring-2 ring-glow/70",
        )}
        style={{ background: tint }}
      />
      <span className="min-w-0 flex-1 truncate text-[11px]">
        {who ? (
          <span className={mine ? "text-chalk" : "text-muted"}>{who}</span>
        ) : (
          <span className="text-muted/60">{t(label)}{" "}{t("· open")}</span>
        )}
      </span>
      {mine && <span className="shrink-0 text-[10px] font-medium text-glow">{t("you")}</span>}
    </button>
  );
}
