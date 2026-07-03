"use client";

import { Loader2 } from "lucide-react";

/**
 * Modül yetkisi DB ile kesinleşene kadar gösterilen NÖTR yükleniyor ekranı.
 * ModuleRouteGuard, cache belirsizken "Yetkiniz Bulunmuyor" ekranını yanıp
 * söndürmemek için (K-1) bunu kullanır. Yalnız kesin "deny" gelince erişim
 * reddi ekranına geçilir.
 */
export default function ModuleAccessPending() {
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
