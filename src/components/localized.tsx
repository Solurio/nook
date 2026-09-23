"use client";

import { Fragment, useEffect } from "react";
import clsx from "clsx";
import { Languages } from "lucide-react";
import { LANGUAGES, drawIn, setLanguage, t, useLanguage } from "@/lib/i18n";

/**
 * Draws everything under it in the language the visitor picked, and draws it
 * all again when they pick another. Only the interface is redrawn: whatever
 * sits above this -- the room's connection, what is on the table -- carries on.
 */
export function Localized({ children }: { children: React.ReactNode }) {
  const lang = useLanguage();
  drawIn(lang);
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  return <Fragment key={lang}>{children}</Fragment>;
}

/** English, Português, Español: the three buttons that change it. */
export function LanguagePicker({ className, compact }: { className?: string; compact?: boolean }) {
  const lang = useLanguage();
  return (
    <div className={clsx("flex items-center gap-0.5 rounded-xl bg-white/6 p-0.5", className)} role="group" aria-label={t("language")}>
      {!compact && <Languages className="mx-1 size-3.5 text-muted" aria-hidden />}
      {LANGUAGES.map((l) => (
        <button
          key={l.id}
          type="button"
          onClick={() => void setLanguage(l.id)}
          title={l.name}
          aria-pressed={lang === l.id}
          className={clsx(
            "min-h-7 rounded-lg px-2 text-[11px] font-semibold transition",
            lang === l.id ? "bg-chalk text-ink-950" : "text-muted hover:text-chalk",
          )}
        >
          {compact ? l.short : l.name}
        </button>
      ))}
    </div>
  );
}
