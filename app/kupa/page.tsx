"use client";

import Link from "next/link";
import { KupaShell, kupaCard } from "./components/KupaShell";

/** Kupa & Hacamat Terapisi — modül landing (workspace hub). İçerik dokunulmadı. */

type Area = { title: string; desc: string; icon: string; href: string };

const AREAS: Area[] = [
  {
    title: "Hacamat Noktaları",
    desc: "Nokta kayıtları: ad, kod, anatomik bölge, geleneksel kullanım, güvenlik.",
    icon: "📍",
    href: "/kupa/noktalar",
  },
  {
    title: "Amaç / Rahatsızlık Rehberi",
    desc: "Konu ↔ nokta ilişkisi; konuyu aç, ilgili noktaları ve kaynaklarını gör.",
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
  {
    title: "Kaynak Kataloğu",
    desc: "Kaynak künyeleri; içerik atıfları (Kaynaklar bölümleri) bu kayıtlara bağlanır.",
    icon: "📖",
    href: "/kupa/kaynaklar",
  },
];

export default function KupaLandingPage() {
  return (
    <KupaShell
      title="Kupa & Hacamat Terapisi"
      subtitle="Profesyonel çalışma merkezi — amaç rehberi, hacamat noktaları, teknikler, bilgi ve güvenlik. Tüm kayıtlar hesabınıza özeldir (tenant-izole)."
      badge="Profesyonel Çalışma Alanı"
    >
      {/* ÇALIŞMA ALANLARI — dengeli premium grid (desktop 3×2). */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {AREAS.map((a) => (
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
              <span className="transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden>
                →
              </span>
            </span>
          </Link>
        ))}
      </div>

      <p className="mt-2 max-w-3xl text-xs leading-relaxed text-slate-400">
        Not: Bu modül geleneksel kullanım / kaynaklandırılmış ilişki bilgisini düzenler;
        hiçbir konu otomatik olarak &quot;tedavi eder&quot; anlamı taşımaz.
      </p>
    </KupaShell>
  );
}
