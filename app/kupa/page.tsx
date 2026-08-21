"use client";

import Link from "next/link";
import { KupaShell, kupaCard } from "./components/KupaShell";

/** Kupa & Hacamat Terapisi — modül landing (6 ana alan). */

const AREAS: { title: string; desc: string; icon: string; href: string }[] = [
  {
    title: "Vücut & Nokta Atlası",
    desc: "Haritada nokta yerleşimlerini işaretle, taşı, boyutlandır ve kaydet.",
    icon: "🫙",
    href: "/kupa/nokta-atlasi",
  },
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
      subtitle="Profesyonel çalışma alanı — vücut nokta atlası, amaç rehberi, teknikler, bilgi ve güvenlik."
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {AREAS.map((a) => (
          <Link
            key={a.href}
            href={a.href}
            className={`${kupaCard} group flex flex-col gap-2 text-inherit no-underline outline-none transition duration-200 hover:-translate-y-0.5 hover:border-amber-400/30 hover:bg-amber-500/[0.06] focus-visible:ring-2 focus-visible:ring-amber-400/50`}
          >
            <div className="text-2xl leading-none" aria-hidden>
              {a.icon}
            </div>
            <h2 className="text-sm font-bold md:text-base">{a.title}</h2>
            <p className="text-xs leading-snug text-slate-400">{a.desc}</p>
          </Link>
        ))}
      </div>

      <p className="mt-6 text-[11px] leading-relaxed text-slate-500">
        Not: Bu modül geleneksel kullanım / kaynaklandırılmış ilişki bilgisini düzenler;
        hiçbir konu otomatik olarak &quot;tedavi eder&quot; anlamı taşımaz. Kayıtlar hesabınıza
        özeldir (tenant-izole).
      </p>
    </KupaShell>
  );
}
