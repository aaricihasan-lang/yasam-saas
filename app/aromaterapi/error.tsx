"use client";

import { useEffect } from "react";
import Link from "next/link";

/**
 * Aromaterapi V2 — modül-seviyesi hata sınırı (App Router error boundary).
 *
 * YALNIZ BEKLENMEYEN render/runtime hataları içindir. Beklenen API/form hataları
 * (401/403/404/409/422 vb.) throw EDİLMEZ; onlar mevcut okuma/form pipeline'ında
 * stabil kod → Türkçe mesaj olarak ele alınır ve buraya DÜŞMEZ.
 *
 * İlkeler: sakin Türkçe metin; teknik/DB detayı GÖSTERİLMEZ (yalnız server/console
 * log); tekrar dene (reset) + Aromaterapi ana ekranına güvenli dönüş; role="alert"
 * ve odaklanabilir başlık ile erişilebilirlik; PR #132 premium/temiz görünümü
 * (ağır kart/gradient yok).
 */
export default function AromaterapiError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Teknik ayrıntı yalnız istemci konsoluna/monitoring'e; kullanıcıya gösterilmez.
    console.error("[aromaterapi:error-boundary]", error);
  }, [error]);

  return (
    <main className="min-h-[70vh] bg-[radial-gradient(ellipse_at_top,#fff7ed_0%,#fdf4ff_45%,#f8fafc_100%)] px-4 py-16">
      <div
        role="alert"
        className="mx-auto flex max-w-md flex-col items-center rounded-2xl border border-amber-100 bg-white/85 px-6 py-8 text-center shadow-sm backdrop-blur-sm"
      >
        <span className="text-3xl" aria-hidden>
          🌿
        </span>
        <h1
          tabIndex={-1}
          className="mt-3 text-lg font-black tracking-tight text-slate-900"
        >
          Beklenmeyen bir sorun oluştu
        </h1>
        <p className="mt-1.5 text-[13px] font-medium leading-relaxed text-slate-500">
          Aromaterapi bölümü yüklenirken bir hata oluştu. Bilgileriniz güvende;
          çoğu durumda tekrar denemek yeterlidir.
        </p>

        <div className="mt-5 flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-center">
          <Link
            href="/aromaterapi"
            className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-[13px] font-black text-slate-600 shadow-sm transition hover:border-amber-200 hover:text-amber-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300/60"
          >
            Aromaterapi ana ekranı
          </Link>
          <button
            type="button"
            onClick={reset}
            className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-gradient-to-r from-amber-500 to-rose-500 px-5 text-[13px] font-black text-white shadow-md transition hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/60"
          >
            Tekrar dene
          </button>
        </div>
      </div>
    </main>
  );
}
