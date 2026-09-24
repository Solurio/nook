"use client";

import { X } from "lucide-react";
import { t } from "@/lib/i18n";

/**
 * The rules, on the table itself. Opens over the game rather than taking you
 * somewhere else, so checking what a card does never costs you your seat.
 */
export default function RulesSheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="absolute inset-0 z-30 flex flex-col rounded-2xl bg-ink-950/95 p-3 backdrop-blur-sm">
      <div className="mb-2 flex shrink-0 items-center justify-between">
        <h3 className="text-[12px] font-semibold text-chalk">{t(title)}</h3>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("close")}
          className="grid size-9 place-items-center rounded-lg text-muted transition hover:bg-white/8 hover:text-chalk"
        >
          <X className="size-4" strokeWidth={2.4} />
        </button>
      </div>
      <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto text-[11px] leading-relaxed text-muted [&_b]:font-semibold [&_b]:text-chalk [&_h4]:mt-1 [&_h4]:text-[11px] [&_h4]:font-semibold [&_h4]:text-chalk">
        {children}
      </div>
    </div>
  );
}
