"use client";

import Link from "next/link";

export default function NumerolojiHubPage() {
  const cardClass =
    "group flex min-h-[8.5rem] flex-col justify-between rounded-2xl border border-slate-200/90 bg-white/95 p-5 shadow-md ring-1 ring-violet-100/50 no-underline transition duration-200 hover:-translate-y-0.5 hover:border-violet-300/80 hover:bg-white hover:shadow-lg hover:shadow-violet-200/40";

  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-50 via-amber-50/30 to-sky-50 px-4 py-10 text-slate-900 sm:px-6">
      <div className="mx-auto max-w-3xl">
        <header className="mb-8 text-center">
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-violet-700/85">Yaşam Sistemi</p>
          <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">Numeroloji</h1>
          <p className="mx-auto mt-2 max-w-md text-sm font-medium text-slate-600">Devam etmek için bir seçenek seçin.</p>
        </header>

        <div className="grid gap-4 sm:grid-cols-2">
          <Link href="/numeroloji/analiz" className={cardClass}>
            <div>
              <span className="text-3xl" aria-hidden>
                🔢
              </span>
              <h2 className="mt-3 text-lg font-black text-slate-900">Numeroloji Analizi</h2>
              <p className="mt-1 text-xs leading-relaxed text-slate-600">Ad, soyad ve doğum tarihi ile tam analiz, görsel rapor ve PNG dışa aktarım.</p>
            </div>
            <span className="mt-4 text-[11px] font-black uppercase tracking-wide text-violet-700 group-hover:text-violet-900">
              Aç →
            </span>
          </Link>

          <Link href="/numeroloji/liste" className={cardClass}>
            <div>
              <span className="text-3xl" aria-hidden>
                📋
              </span>
              <h2 className="mt-3 text-lg font-black text-slate-900">Kayıtlı Analizler</h2>
              <p className="mt-1 text-xs leading-relaxed text-slate-600">Daha önce kaydettiğiniz numeroloji analizlerini görüntüleyin.</p>
            </div>
            <span className="mt-4 text-[11px] font-black uppercase tracking-wide text-violet-700 group-hover:text-violet-900">
              Aç →
            </span>
          </Link>
        </div>
      </div>
    </div>
  );
}
