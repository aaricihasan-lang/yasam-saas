"use client";

import Link from "next/link";
import { KupaShell, kupaCard, kupaBtnPrimary } from "./components/KupaShell";

/**
 * Kupa & Hacamat Terapisi — modül landing (V2 çalışma merkezi).
 *
 * HİYERARŞİ (FAZ 3B): eşit-ağırlıklı 6 kart DEĞİL. Üç katman:
 *   1) PRIMARY HERO  → Hacamat Protokolleri (günlük çalışma alanı; dominant)
 *   2) DESTEK KÜTÜPHANELERİ → protokollerde kullanılan temel kayıtlar (5 kart)
 *   3) MEVCUT REHBER → Amaç / Rahatsızlık Rehberi (legacy; korunur ama subordinate)
 *
 * Copy kullanıcı dilinde (DB/mimari jargonu YOK). İçerik/route DEĞİŞMEZ; yalnız
 * landing navigation hiyerarşisi. Yeni fetch/API/sayaç YOK — statik navigasyon.
 */

type Area = { title: string; desc: string; icon: string; href: string };

// Destek kütüphaneleri — protokollerde kullanılan temel kayıtlar (sade kullanıcı dili).
const SUPPORT: Area[] = [
  {
    title: "Hacamat Noktaları",
    desc: "Hacamat bölgelerini ve kayıtlı açıklamalarını görüntüleyin.",
    icon: "📍",
    href: "/kupa/noktalar",
  },
  {
    title: "Kupa Teknikleri",
    desc: "Kuru, yaş ve farklı uygulama tekniklerini yönetin.",
    icon: "🌀",
    href: "/kupa/teknikler",
  },
  {
    title: "Güvenlik & Kontrendikasyonlar",
    desc: "Uygulama öncesi dikkat ve güvenlik kayıtlarını yönetin.",
    icon: "⚠️",
    href: "/kupa/guvenlik",
  },
  {
    title: "Kaynaklar",
    desc: "Kitap, eğitmen, eğitim veya kendi kaynak kayıtlarınızı yönetin.",
    icon: "📖",
    href: "/kupa/kaynaklar",
  },
  {
    title: "Bilgi & Eğitim",
    desc: "Uzun bilgi ve eğitim kayıtlarınızı saklayın ve düzenleyin.",
    icon: "📚",
    href: "/kupa/bilgi-kutuphanesi",
  },
];

export default function KupaLandingPage() {
  return (
    <KupaShell
      title="Kupa & Hacamat Terapisi"
      subtitle="Hacamat protokollerinizi oluşturun; bölgeleri, teknikleri, uygulama akışını, güvenlik notlarını, bilgileri ve kaynakları tek çalışma alanında yönetin."
      badge="Profesyonel Çalışma Alanı"
    >
      {/* ── 1) PRIMARY HERO — Hacamat Protokolleri (dominant ama KOMPAKT, tek CTA) ─── */}
      <Link
        href="/kupa/protokoller"
        className="group mb-4 flex flex-col gap-3 rounded-2xl border border-amber-200/90 bg-gradient-to-br from-amber-50 via-white to-rose-50/60 p-4 text-inherit no-underline shadow-[0_1px_3px_rgba(120,80,40,0.06),0_16px_40px_-24px_rgba(180,83,9,0.35)] outline-none transition duration-200 hover:-translate-y-0.5 hover:border-amber-300 hover:shadow-[0_2px_10px_rgba(120,80,40,0.1),0_24px_48px_-24px_rgba(180,83,9,0.4)] focus-visible:ring-2 focus-visible:ring-amber-400/70 lg:flex-row lg:items-center lg:justify-between lg:gap-5 lg:px-6 lg:py-4"
      >
        <div className="flex items-center gap-3">
          <span
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-amber-200 bg-white/80 text-2xl shadow-sm"
            aria-hidden
          >
            🗂️
          </span>
          <div className="min-w-0">
            <span className="text-[11px] font-bold uppercase tracking-wide text-amber-700">Çalışma Alanı</span>
            <h2 className="text-xl font-black tracking-tight text-slate-900">Hacamat Protokolleri</h2>
            <p className="mt-0.5 max-w-2xl text-[13px] leading-relaxed text-slate-600">
              Rahatsızlık veya çalışma amacına göre bölgeleri, teknikleri, uygulama akışını, güvenliği,
              bilgileri ve kaynakları tek yerde yönetin.
            </p>
          </div>
        </div>
        <span className={`${kupaBtnPrimary} shrink-0 self-start lg:self-center`}>
          Protokolleri Aç
          <span className="transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden>→</span>
        </span>
      </Link>

      {/* ── 2) DESTEK KÜTÜPHANELERİ ─────────────────────────────────────────────── */}
      <h2 className="mb-2 text-sm font-black uppercase tracking-wide text-slate-500">Destek Kütüphaneleri</h2>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {SUPPORT.map((a) => (
          <Link
            key={a.href}
            href={a.href}
            className={`${kupaCard} group flex min-h-[150px] flex-col gap-1.5 text-inherit no-underline outline-none transition duration-200 hover:-translate-y-0.5 hover:border-amber-200 hover:shadow-[0_2px_8px_rgba(120,80,40,0.08),0_16px_32px_-20px_rgba(180,83,9,0.3)] focus-visible:ring-2 focus-visible:ring-amber-400/60`}
          >
            <span
              className="flex h-10 w-10 items-center justify-center rounded-2xl border border-amber-100 bg-amber-50/80 text-2xl"
              aria-hidden
            >
              {a.icon}
            </span>
            <div className="flex-1">
              <h3 className="text-[17px] font-bold text-slate-900">{a.title}</h3>
              <p className="mt-1.5 text-[13px] leading-relaxed text-slate-500">{a.desc}</p>
            </div>
            <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-amber-700">
              Aç
              <span className="transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden>→</span>
            </span>
          </Link>
        ))}
      </div>

      {/* ── 3) MEVCUT REHBER — Amaç / Rahatsızlık Rehberi (legacy; sakin/subordinate) ── */}
      <div className="mt-5">
        <Link
          href="/kupa/amac-rehberi"
          className="group flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white/70 px-4 py-3.5 text-inherit no-underline outline-none transition duration-200 hover:border-slate-300 hover:bg-white focus-visible:ring-2 focus-visible:ring-amber-400/60"
        >
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-xl" aria-hidden>
              🎯
            </span>
            <div className="min-w-0">
              <span className="text-[10.5px] font-semibold uppercase tracking-wide text-slate-400">Mevcut Rehber</span>
              <h3 className="text-[15px] font-bold text-slate-800">Amaç / Rahatsızlık Rehberi</h3>
              <p className="mt-0.5 text-[12.5px] leading-relaxed text-slate-500">
                Mevcut konu, ilişkili bölgeler ve kaynak kayıtlarınızı görüntüleyin.
              </p>
            </div>
          </div>
          <span className="inline-flex shrink-0 items-center gap-1.5 text-sm font-semibold text-slate-600">
            Rehberi Aç
            <span className="transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden>→</span>
          </span>
        </Link>
      </div>

      {/* Sakin editoryal not (medical claim YOK). */}
      <p className="mt-5 max-w-3xl text-xs leading-relaxed text-slate-400">
        Not: Bu modül geleneksel kullanım / kaynaklandırılmış ilişki bilgisini düzenler;
        hiçbir konu otomatik olarak &quot;tedavi eder&quot; anlamı taşımaz.
      </p>
    </KupaShell>
  );
}
