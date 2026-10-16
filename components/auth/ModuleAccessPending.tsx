"use client";

import { Loader2, RefreshCw } from "lucide-react";

type ModuleAccessPendingProps = {
  /**
   * Final-A3: erişim sunucuda geçici hata (ağ / 5xx / bozuk yanıt) nedeniyle DOĞRULANAMADI.
   * İçerik açılmaz (fail-closed) ama "yetkisiz / üyelik pasif" diye de etiketlenmez; tekrar dene.
   */
  failed?: boolean;
  /** Verilmezse "Tekrar Dene" sayfayı yeniler. */
  onRetry?: () => void;
};

/**
 * Modül yetkisi DB ile kesinleşene kadar gösterilen NÖTR yükleniyor ekranı.
 * ModuleRouteGuard, cache belirsizken "Yetkiniz Bulunmuyor" ekranını yanıp
 * söndürmemek için (K-1) bunu kullanır. Yalnız kesin "deny" gelince erişim
 * reddi ekranına geçilir.
 */
export default function ModuleAccessPending({ failed = false, onRetry }: ModuleAccessPendingProps = {}) {
  if (failed) {
    return (
      <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[linear-gradient(135deg,#fdf4ff_0%,#eef2ff_42%,#eff6ff_100%)] px-6 py-12 text-slate-900 antialiased">
        <div className="pointer-events-none absolute -left-24 top-0 h-[420px] w-[420px] rounded-full bg-violet-300/20 blur-[120px]" />
        <div className="pointer-events-none absolute right-0 bottom-0 h-[380px] w-[380px] rounded-full bg-cyan-200/25 blur-[110px]" />

        <div className="relative z-10 flex flex-col items-center gap-4 text-center" data-testid="access-unverified">
          <p className="text-sm font-black uppercase tracking-[0.28em] text-violet-700/85">
            Erişim doğrulanamadı
          </p>
          <p className="max-w-xs text-sm font-medium leading-relaxed text-slate-500" role="status" aria-live="polite">
            Bağlantı sorunu nedeniyle erişiminiz şu an doğrulanamadı. Oturumunuz açık; lütfen tekrar deneyin.
          </p>
          <button
            type="button"
            onClick={() => (onRetry ? onRetry() : window.location.reload())}
            data-testid="access-retry"
            className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-2xl border-2 border-violet-300/80 bg-gradient-to-r from-violet-50 to-indigo-50 px-6 text-sm font-black text-violet-950 shadow-md transition hover:-translate-y-0.5 hover:border-violet-400"
          >
            <RefreshCw className="h-4 w-4" aria-hidden />
            Tekrar Dene
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[linear-gradient(135deg,#fdf4ff_0%,#eef2ff_42%,#eff6ff_100%)] px-6 py-12 text-slate-900 antialiased">
      <div className="pointer-events-none absolute -left-24 top-0 h-[420px] w-[420px] rounded-full bg-violet-300/20 blur-[120px]" />
      <div className="pointer-events-none absolute right-0 bottom-0 h-[380px] w-[380px] rounded-full bg-cyan-200/25 blur-[110px]" />

      <div className="relative z-10 flex flex-col items-center gap-4 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-3xl bg-white/90 shadow-[0_16px_40px_rgba(15,23,42,0.10)] ring-1 ring-white/90">
          <Loader2 className="h-8 w-8 animate-spin text-violet-600" aria-hidden />
        </span>
        <p className="text-sm font-black uppercase tracking-[0.28em] text-violet-700/85">
          Kontrol ediliyor
        </p>
        <p className="max-w-xs text-sm font-medium leading-relaxed text-slate-500" role="status" aria-live="polite">
          Modül erişiminiz doğrulanıyor…
        </p>
      </div>
    </main>
  );
}
