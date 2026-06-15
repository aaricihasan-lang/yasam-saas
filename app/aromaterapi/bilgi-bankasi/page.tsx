"use client";

import Link from "next/link";

const pageBg =
  "relative min-h-screen overflow-hidden bg-[radial-gradient(ellipse_at_top_left,#fdf4ff_0%,#fff7ed_50%,#f8fafc_100%)] text-slate-950";

const TOPICS = [
  {
    icon: "🧬",
    title: "Temel Kimyasal Bileşenler",
    desc: "Terpenler, fenoller, esterler, aldehitler ve ketonlar — uçucu yağların kimyasal yapısı ve terapötik rolleri.",
    badge: "Kimya",
    coming: true,
  },
  {
    icon: "⚗️",
    title: "Elde Etme Yöntemleri",
    desc: "Distilasyon, ekstraksiyon, mekanik ve gelişmiş yöntemler — uçucu yağların üretim teknikleri.",
    badge: "Proses",
    coming: true,
  },
  {
    icon: "🧠",
    title: "Etki Mekanizması",
    desc: "Limbik sistem, olfaktör yol, cilt absorbsiyonu ve sistemik etkiler — aromaterapi nasıl çalışır.",
    badge: "Fizyoloji",
    coming: true,
  },
];

export default function BilgiBankasiPage() {
  return (
    <main className={pageBg}>
      <div className="pointer-events-none absolute -left-20 -top-20 h-[420px] w-[420px] rounded-full bg-violet-200/20 blur-[120px]" />
      <div className="pointer-events-none absolute -right-20 top-40 h-[320px] w-[320px] rounded-full bg-amber-200/15 blur-[100px]" />

      <div className="relative z-10 mx-auto w-full max-w-[1400px] space-y-5 px-4 py-5 sm:px-6 lg:px-8 xl:px-10">

        {/* Header */}
        <header className="rounded-[28px] border border-violet-200/50 bg-white/80 p-5 shadow-sm backdrop-blur-xl sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 flex-1">
              <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-violet-200/80 bg-violet-50/90 px-4 py-1.5 text-[11px] font-black uppercase tracking-[0.16em] text-violet-800 shadow-sm">
                <span>📚</span>
                <span>Aromaterapi — Bilgi Bankası</span>
              </div>
              <h1 className="text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">
                Bilgi Bankası
              </h1>
              <p className="mt-2 max-w-xl text-sm font-medium leading-relaxed text-slate-600">
                Aromaterapi kimyası, elde etme yöntemleri ve etki mekanizmaları — Excel kaynaklı referans makaleler. Yakında yayında.
              </p>
            </div>
            <Link
              href="/aromaterapi"
              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-violet-300/55 bg-gradient-to-r from-violet-500 to-purple-500 px-3.5 text-[12px] font-black text-white shadow-md ring-1 ring-white/35 transition hover:brightness-105"
            >
              <span aria-hidden className="text-sm leading-none">←</span>
              Aromaterapi Ana
            </Link>
          </div>
        </header>

        {/* Konu Kartları */}
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {TOPICS.map((topic) => (
            <div
              key={topic.title}
              className="flex flex-col rounded-[24px] border border-violet-100/80 bg-white/80 p-5 shadow-sm opacity-75"
            >
              <div className="mb-3 flex items-center gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-violet-100 bg-violet-50/80 text-2xl shadow-sm">
                  {topic.icon}
                </div>
                <span className="inline-flex rounded-full border border-violet-200 bg-violet-50 px-2.5 py-0.5 text-[10px] font-black text-violet-700">
                  {topic.badge}
                </span>
              </div>
              <h2 className="text-[15px] font-black tracking-tight text-slate-900">{topic.title}</h2>
              <p className="mt-1.5 flex-1 text-[12px] font-medium leading-relaxed text-slate-500">{topic.desc}</p>
              <div className="mt-4">
                <span className="block w-full rounded-xl bg-slate-100 py-2 text-center text-[12px] font-black text-slate-500 shadow-sm">
                  Yakında Geliyor
                </span>
              </div>
            </div>
          ))}
        </section>

        {/* Alt Bilgi */}
        <div className="rounded-2xl border border-violet-100/60 bg-white/60 px-4 py-3 backdrop-blur-sm">
          <p className="text-xs font-medium text-slate-500">
            📋 Bu bölümdeki içerikler Excel kaynaklı Aromaterapi referans materyallerinden derlenecektir.
            İçerik yükleme Excel import aşamasında tamamlanacak.
          </p>
        </div>
      </div>
    </main>
  );
}
