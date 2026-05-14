"use client";

import Link from "next/link";
import { NumerolojiPremiumShell } from "./components/NumerolojiPremiumShell";

export default function NumerolojiHubPage() {
  const cardClass =
    "group relative flex min-h-[10.5rem] flex-col justify-between overflow-hidden rounded-[26px] border border-white/75 bg-white/55 p-6 shadow-[0_14px_42px_rgba(15,23,42,0.07)] ring-1 ring-violet-100/50 no-underline backdrop-blur-xl transition duration-300 hover:-translate-y-1 hover:border-violet-300/70 hover:bg-white/75 hover:shadow-[0_22px_48px_-12px_rgba(91,33,182,0.22)]";

  return (
    <NumerolojiPremiumShell maxWidthClass="max-w-3xl">
      <header className="mb-8 rounded-[26px] border border-white/75 bg-white/55 px-6 py-8 text-center shadow-[0_14px_42px_rgba(15,23,42,0.06)] ring-1 ring-violet-100/50 backdrop-blur-xl sm:py-9">
        <p className="text-[10px] font-black uppercase tracking-[0.24em] text-violet-700/90">Yaşam Sistemi</p>
        <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-900 sm:text-[1.85rem]">Numeroloji</h1>
        <p className="mx-auto mt-3 max-w-md text-sm font-medium leading-relaxed text-slate-600">
          Profesyonel analiz ve kayıtlı çalışmalarınız için modül seçin.
        </p>
      </header>

      <div className="grid gap-5 sm:grid-cols-2">
        <Link href="/numeroloji/analiz" className={cardClass}>
          <div
            className="pointer-events-none absolute inset-0 bg-gradient-to-br from-violet-500/[0.07] via-transparent to-sky-500/[0.06] opacity-0 transition duration-300 group-hover:opacity-100"
            aria-hidden
          />
          <div className="relative">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-violet-200/60 bg-gradient-to-br from-violet-100/90 to-white text-2xl shadow-inner">
              🔢
            </div>
            <h2 className="mt-4 text-lg font-black tracking-tight text-slate-900">Numeroloji Analizi</h2>
            <p className="mt-2 text-xs leading-relaxed text-slate-600">
              Ad, soyad ve doğum tarihi ile tam analiz, görsel rapor ve PNG dışa aktarım.
            </p>
          </div>
          <span className="relative mt-4 text-[11px] font-black uppercase tracking-[0.14em] text-violet-700 group-hover:text-violet-900">
            Aç →
          </span>
        </Link>

        <Link href="/numeroloji/liste" className={cardClass}>
          <div
            className="pointer-events-none absolute inset-0 bg-gradient-to-br from-amber-400/[0.08] via-transparent to-violet-500/[0.06] opacity-0 transition duration-300 group-hover:opacity-100"
            aria-hidden
          />
          <div className="relative">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-amber-200/60 bg-gradient-to-br from-amber-100/90 to-white text-2xl shadow-inner">
              📋
            </div>
            <h2 className="mt-4 text-lg font-black tracking-tight text-slate-900">Kayıtlı Analizler</h2>
            <p className="mt-2 text-xs leading-relaxed text-slate-600">Daha önce kaydettiğiniz numeroloji analizlerini görüntüleyin.</p>
          </div>
          <span className="relative mt-4 text-[11px] font-black uppercase tracking-[0.14em] text-violet-700 group-hover:text-violet-900">
            Aç →
          </span>
        </Link>
      </div>
    </NumerolojiPremiumShell>
  );
}
