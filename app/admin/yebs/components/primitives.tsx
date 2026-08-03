"use client";

// ============================================================
// YEBS A8 — Ortak UI primitive'leri (badge, state, pagination, kabuk)
// Mevcut admin tasarım token'larına uyar: pastel, rounded-2xl, ring badge.
// ============================================================

import type { ReactNode, InputHTMLAttributes, SelectHTMLAttributes } from "react";
import { AlertTriangle, Inbox, Loader2, RefreshCw } from "lucide-react";
import { statusMeta, verificationMeta, TONE_BADGE_CLASS } from "@/lib/yebs/ui/statusDictionary";

const BADGE_BASE = "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold ring-1 whitespace-nowrap";

/** Durum badge — metin + tone (yalnız renge güvenilmez; metin her zaman var). */
export function StatusBadge({ status }: { status: string }) {
  const m = statusMeta(status);
  return <span className={`${BADGE_BASE} ${TONE_BADGE_CLASS[m.tone]}`}>{m.label}</span>;
}

/** Evidence verification_status badge. */
export function VerificationBadge({ status }: { status: string }) {
  const m = verificationMeta(status);
  return <span className={`${BADGE_BASE} ${TONE_BADGE_CLASS[m.tone]}`}>{m.label}</span>;
}

export function LoadingBlock({ label = "Yükleniyor…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500" aria-live="polite">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> {label}
    </div>
  );
}

export function ErrorBlock({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-rose-200/70 bg-rose-50/60 px-6 py-10 text-center" role="alert">
      <AlertTriangle className="h-6 w-6 text-rose-500" aria-hidden />
      <p className="text-sm font-semibold text-rose-800">{message}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="btn-soft inline-flex items-center gap-1.5 text-xs">
          <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Tekrar dene
        </button>
      )}
    </div>
  );
}

export function EmptyBlock({ message = "Kayıt bulunamadı." }: { message?: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-slate-300 bg-white/60 px-6 py-12 text-center text-sm text-slate-500">
      <Inbox className="h-6 w-6 text-slate-400" aria-hidden />
      {message}
    </div>
  );
}

/** Offset pagination — önceki/sonraki + sayfa bilgisi. count null ise yalnız ok yönleri. */
export function Pagination({
  offset, limit, count, loading, onPage,
}: {
  offset: number; limit: number; count: number | null; loading: boolean;
  onPage: (nextOffset: number) => void;
}) {
  const page = Math.floor(offset / limit) + 1;
  const totalPages = count != null ? Math.max(1, Math.ceil(count / limit)) : null;
  const hasPrev = offset > 0;
  const hasNext = count != null ? offset + limit < count : false;

  return (
    <div className="mt-3 flex items-center justify-between gap-3 text-xs text-slate-600">
      <span>
        {count != null ? `Toplam ${count} kayıt · ` : ""}
        Sayfa {page}{totalPages ? ` / ${totalPages}` : ""}
      </span>
      <div className="flex gap-2">
        <button type="button" disabled={!hasPrev || loading} onClick={() => onPage(Math.max(0, offset - limit))}
          className="btn-soft px-3 py-1.5 disabled:opacity-40">Önceki</button>
        <button type="button" disabled={!hasNext || loading} onClick={() => onPage(offset + limit)}
          className="btn-soft px-3 py-1.5 disabled:opacity-40">Sonraki</button>
      </div>
    </div>
  );
}

/** Sayfa kabuğu — pastel gradyan, max-w-[1400px], responsive padding. */
export function YebsPageShell({ children }: { children: ReactNode }) {
  return (
    <main className="relative min-h-screen overflow-x-hidden bg-[linear-gradient(135deg,#fdf4ff_0%,#eef2ff_42%,#f0fdfa_100%)] text-slate-900 antialiased">
      <div className="relative z-10 mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        {children}
      </div>
    </main>
  );
}

const INPUT = "h-10 w-full rounded-xl border border-slate-200 bg-white/80 px-3 text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100";

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  const { className, ...rest } = props;
  return <input {...rest} className={`${INPUT} ${className ?? ""}`} />;
}

export function SelectInput(props: SelectHTMLAttributes<HTMLSelectElement> & { children: ReactNode }) {
  const { children, className, ...rest } = props;
  return <select {...rest} className={`${INPUT} ${className ?? ""}`}>{children}</select>;
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-bold text-slate-700">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-slate-400">{hint}</span>}
    </label>
  );
}

export { INPUT as YEBS_INPUT_CLASS };
