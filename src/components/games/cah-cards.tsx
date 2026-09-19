"use client";

import clsx from "clsx";
import { fill, pickOf } from "@/lib/cah";

export function BlackCard({ prompt, answers, small }: { prompt: string; answers?: string[]; small?: boolean }) {
  return (
    <div
      className={clsx(
        "flex flex-col justify-between rounded-xl bg-[#121014] font-semibold text-[#f4efe6] shadow-[0_6px_18px_rgba(0,0,0,0.45)] ring-1 ring-white/10",
        small ? "min-h-20 p-2.5 text-[12px]" : "min-h-28 p-3.5 text-[14px] leading-snug",
      )}
    >
      <p>
        {fill(prompt, answers ?? []).map((part, i) =>
          part.answer ? (
            <span key={i} className="text-warm underline decoration-warm/40 underline-offset-2">
              {part.text}
            </span>
          ) : (
            <span key={i}>{part.text}</span>
          ),
        )}
      </p>
      {pickOf(prompt) > 1 && <p className="mt-2 self-end text-[10px] font-bold tracking-wide text-muted">PICK {pickOf(prompt)}</p>}
    </div>
  );
}

export function WhiteCard({
  text,
  order,
  chosen,
  dim,
  onClick,
  className,
}: {
  text: string;
  order?: number;
  chosen?: boolean;
  dim?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  const look = clsx(
    "relative flex min-h-16 flex-col rounded-lg bg-[#f4efe6] p-1.5 text-left text-[10.5px] leading-tight font-semibold text-[#141117] shadow-[0_3px_8px_rgba(0,0,0,0.35)] transition",
    onClick && "hover:-translate-y-0.5",
    chosen && "-translate-y-1 ring-3 ring-warm",
    dim && "opacity-50",
    className,
  );
  const badge = order !== undefined && (
    <span className="absolute -top-1.5 -right-1.5 grid size-5 place-items-center rounded-full bg-warm text-[10px] font-bold text-ink-950">{order}</span>
  );
  // Only a card you can play is a button; one sitting inside an answer the czar taps is not.
  if (!onClick) {
    return (
      <div className={look}>
        {text}
        {badge}
      </div>
    );
  }
  return (
    <button type="button" onClick={onClick} className={look}>
      {text}
      {badge}
    </button>
  );
}
