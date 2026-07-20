"use client";

import { useState } from "react";
import clsx from "clsx";
import { ExternalLink, Loader2, Monitor, Repeat, X } from "lucide-react";
import { useRoom } from "@/realtime/room-provider";
import { useRoomStore } from "@/state/room-store";
import type { Item } from "@/lib/types";

/**
 * A live shared browser. Everyone in the room loads the same Hyperbeam embed and
 * controls the same machine at once -- real co-browsing over the internet. The
 * session (and its cost) only exists while it is live; closing it ends the VM.
 */
export default function CobrowseItem({
  item,
  selected,
}: {
  item: Item<"cobrowse">;
  selected: boolean;
}) {
  const { canEdit, updateData, startCobrowse, stopCobrowse } = useRoom();
  const me = useRoomStore((s) => s.me);
  const data = item.data;

  const [draft, setDraft] = useState(data.url ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [changing, setChanging] = useState(false);

  const start = async (url: string) => {
    const trimmed = url.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setError(null);

    // Drop any previous session before opening a new one, so we never leave a
    // paid machine running in the background.
    if (data.sessionId) void stopCobrowse(data.sessionId);

    const result = await startCobrowse(trimmed);
    setBusy(false);
    setChanging(false);

    if (result.ok) {
      await updateData<"cobrowse">(item.id, {
        url: trimmed,
        embedUrl: result.embedUrl,
        sessionId: result.sessionId,
        status: "live",
        startedBy: me?.name ?? "someone",
      });
    } else {
      setError(
        result.error === "not_configured"
          ? "not-configured"
          : result.error === "unauthorized"
            ? "Entra na sala de novo e tenta outra vez."
            : "Não consegui abrir a sessão. Tenta de novo.",
      );
    }
  };

  const close = async () => {
    if (data.sessionId) void stopCobrowse(data.sessionId);
    await updateData<"cobrowse">(item.id, {
      ...data,
      status: "ended",
      embedUrl: undefined,
      sessionId: undefined,
    });
  };

  // ----- Live session -----
  if (data.status === "live" && data.embedUrl) {
    return (
      <div className="surface relative flex size-full flex-col overflow-hidden rounded-2xl">
        <div className="flex items-center gap-2 border-b border-white/8 px-2.5 py-1.5">
          <Monitor className="size-3.5 shrink-0 text-glow" strokeWidth={2.2} />
          {changing ? (
            <form
              className="flex min-w-0 flex-1 items-center gap-1.5"
              onSubmit={(event) => {
                event.preventDefault();
                void start(draft);
              }}
            >
              <input
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => event.stopPropagation()}
                placeholder="novo link"
                spellCheck={false}
                autoFocus
                className="min-w-0 flex-1 rounded-lg bg-white/8 px-2 py-1 text-[11px] ring-1 ring-white/12 outline-none focus:ring-glow/50"
              />
              <button
                type="submit"
                disabled={busy}
                className="shrink-0 rounded-lg bg-glow/25 px-2 py-1 text-[11px] font-medium text-glow"
              >
                ir
              </button>
            </form>
          ) : (
            <span className="min-w-0 flex-1 truncate text-[11px] text-muted">{data.url}</span>
          )}

          {canEdit && !changing && (
            <button
              type="button"
              onClick={() => {
                setDraft(data.url);
                setChanging(true);
              }}
              title="trocar link"
              className="shrink-0 text-muted transition hover:text-chalk"
            >
              <Repeat className="size-3.5" strokeWidth={2.2} />
            </button>
          )}
          {canEdit && (
            <button
              type="button"
              onClick={() => void close()}
              title="fechar sessão"
              className="shrink-0 text-muted transition hover:text-red-300"
            >
              <X className="size-3.5" strokeWidth={2.4} />
            </button>
          )}
        </div>

        <iframe
          src={data.embedUrl}
          title={data.url}
          className="min-h-0 flex-1 bg-black"
          allow="autoplay; fullscreen; clipboard-read; clipboard-write; microphone; camera"
        />

        {/* Shield when unselected so the canvas can pan/zoom over it. */}
        {!selected && <div className="absolute inset-0 top-9" />}
      </div>
    );
  }

  // ----- Idle / ended / setup -----
  return (
    <div className="surface grid size-full place-items-center rounded-2xl p-5 text-center">
      {error === "not-configured" ? (
        <div className="max-w-[300px] space-y-2 text-muted">
          <Monitor className="mx-auto size-5" strokeWidth={1.8} />
          <p className="text-xs leading-relaxed">
            O navegador compartilhado precisa da chave do Hyperbeam configurada na
            Cloudflare. Veja <span className="text-chalk">COBROWSE.md</span>.
          </p>
        </div>
      ) : selected && canEdit ? (
        <form
          className="w-full max-w-[300px] space-y-2"
          onSubmit={(event) => {
            event.preventDefault();
            void start(draft);
          }}
        >
          <div className="flex items-center justify-center gap-1.5 text-muted">
            <Monitor className="size-4" strokeWidth={2} />
            <span className="text-xs font-medium">navegador compartilhado</span>
          </div>
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => event.stopPropagation()}
            placeholder="cola um link e todos usam juntos"
            spellCheck={false}
            className="w-full rounded-xl bg-white/8 px-3 py-2 text-xs ring-1 ring-white/12 outline-none placeholder:text-muted/60 focus:ring-glow/50"
          />
          <button
            type="submit"
            disabled={busy || !draft.trim()}
            className={clsx(
              "flex w-full items-center justify-center gap-1.5 rounded-xl bg-chalk py-2 text-xs font-semibold text-ink-950 transition hover:bg-white disabled:opacity-50",
            )}
          >
            {busy ? <Loader2 className="size-3.5 animate-spin" strokeWidth={2.4} /> : null}
            {busy ? "abrindo" : data.status === "ended" ? "abrir de novo" : "abrir juntos"}
          </button>
          {error && error !== "not-configured" && (
            <p className="text-[11px] text-red-300">{error}</p>
          )}
        </form>
      ) : (
        <div className="text-muted">
          <Monitor className="mx-auto mb-2 size-5" strokeWidth={1.8} />
          <p className="text-xs">
            {data.status === "ended" ? "sessão encerrada" : "navegador compartilhado"}
          </p>
          {data.url && (
            <a
              href={data.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-glow hover:underline"
            >
              <ExternalLink className="size-3" strokeWidth={2.2} />
              abrir numa aba
            </a>
          )}
        </div>
      )}
    </div>
  );
}
