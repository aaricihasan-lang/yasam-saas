"use client";

import Link from "next/link";
import { KupaShell, kupaCard } from "./components/KupaShell";

/** Kupa & Hacamat Terapisi — modül landing (workspace hub). İçerik dokunulmadı. */

type Area = { title: string; desc: string; icon: string; href: string };

const PRIMARY: Area = {
  title: "Vücut & Nokta Atlası",
  desc: "Vücut haritaları üzerinde nokta yerleşimlerini işaretle, taşı, boyutlandır, döndür ve kaydet. Aynı nokta farklı haritalarda ayrı yerleşimler taşıyabilir.",
  icon: "🫙",
  href: "/kupa/nokta-atlasi",
};

const SECONDARY: Area[] = [
  {
    title: "Hacamat Noktaları",
    desc: "Nokta kayıtları: ad, kod, anatomik bölge, geleneksel kullanım, güvenlik.",
    icon: "📍",
    href: "/kupa/noktalar",
  },
  {
    title: "Amaç / Rahatsızlık Rehberi",
    desc: "Konu ↔ nokta ilişkisi; konuyu aç, ilgili noktaları haritada birlikte gör.",
    icon: "🎯",
    href: "/kupa/amac-rehberi",
  },
  {
    title: "Kupa Teknikleri",
    desc: "Kuru, yaş (hacamat), sabit ve hareketli/kaydırmalı teknik kayıtları.",
    icon: "🌀",
    href: "/kupa/teknikler",
  },
  {
    title: "Bilgi & Eğitim Kütüphanesi",
    desc: "Uzun profesyonel bilgi ve eğitim kayıtları.",
    icon: "📚",
    href: "/kupa/bilgi-kutuphanesi",
  },
  {
    title: "Güvenlik & Kontrendikasyonlar",
    desc: "Bağımsız güvenlik/kontrendikasyon kayıtları (açıklamaya gömülü değil).",
    icon: "⚠️",
    href: "/kupa/guvenlik",
  },
];

export default function KupaLandingPage() {
  return (
    <KupaShell
      title="Kupa & Hacamat Terapisi"
      subtitle="Profesyonel çalışma merkezi — vücut nokta atlası, amaç rehberi, teknikler, bilgi ve güvenlik. Tüm kayıtlar hesabınıza özeldir (tenant-izole)."
      badge="Profesyonel Çalışma Alanı"
    >
      {/* ANA ÖZELLİK — Vücut & Nokta Atlası (birincil kart) */}
      <Link
        href={PRIMARY.href}
        className="group relative mb-5 flex flex-col gap-5 overflow-hidden rounded-3xl border border-amber-200/80 bg-gradient-to-br from-amber-50 via-orange-50/70 to-rose-50/60 p-6 text-inherit no-underline shadow-[0_2px_8px_rgba(120,80,40,0.06),0_18px_40px_-24px_rgba(180,83,9,0.35)] outline-none transition duration-200 hover:-translate-y-0.5 hover:border-amber-300 hover:shadow-[0_4px_12px_rgba(120,80,40,0.08),0_24px_50px_-24px_rgba(180,83,9,0.45)] focus-visible:ring-2 focus-visible:ring-amber-400/60 md:flex-row md:items-center md:gap-7 md:p-8"
      >
        <div
          className="pointer-events-none absolute right-[-40px] top-[-40px] h-52 w-52 rounded-full bg-amber-300/20 blur-2xl"
          aria-hidden
        />
        <span
          className="relative flex h-24 w-24 shrink-0 items-center justify-center rounded-3xl border border-amber-200 bg-white/80 text-5xl shadow-sm md:h-28 md:w-28 md:text-6xl"
          aria-hidden
        >
          {PRIMARY.icon}
        </span>
        <div className="relative min-w-0 flex-1">
          <span className="mb-1.5 inline-flex items-center gap-1.5 rounded-full bg-amber-100/80 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-amber-800">
            Ana Çalışma Alanı
          </span>
          <h2 className="text-2xl font-black tracking-tight text-slate-900 md:text-3xl">
            {PRIMARY.title}
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600 md:text-[15px]">
            {PRIMARY.desc}
          </p>
        </div>
        <span className="relative inline-flex shrink-0 items-center gap-2 self-start rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-5 py-2.5 text-sm font-bold text-white shadow-sm shadow-amber-500/25 transition group-hover:from-amber-600 group-hover:to-orange-600 md:self-center">
          Atlası Aç
          <span className="transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden>
            →
          </span>
        </span>
      </Link>

      {/* DİĞER ÇALIŞMA ALANLARI (ikincil premium kartlar) */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {SECONDARY.map((a) => (
          <Link
            key={a.href}
            href={a.href}
            className={`${kupaCard} group flex flex-col gap-3 text-inherit no-underline outline-none transition duration-200 hover:-translate-y-0.5 hover:border-amber-200 hover:shadow-[0_2px_8px_rgba(120,80,40,0.08),0_16px_32px_-20px_rgba(180,83,9,0.3)] focus-visible:ring-2 focus-visible:ring-amber-400/60`}
          >
            <span
              className="flex h-12 w-12 items-center justify-center rounded-2xl border border-amber-100 bg-amber-50/80 text-2xl"
              aria-hidden
            >
              {a.icon}
            </span>
            <div className="flex-1">
              <h3 className="text-base font-bold text-slate-900">{a.title}</h3>
              <p className="mt-1 text-[13px] leading-relaxed text-slate-500">{a.desc}</p>
            </div>
            <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-amber-700">
              Aç
              <span className="transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden>
                →
              </span>
            </span>
          </Link>
        ))}
      </div>

      <p className="mt-7 max-w-3xl text-xs leading-relaxed text-slate-400">
        Not: Bu modül geleneksel kullanım / kaynaklandırılmış ilişki bilgisini düzenler;
        hiçbir konu otomatik olarak &quot;tedavi eder&quot; anlamı taşımaz.
      </p>
    </KupaShell>
  );
}
