"use client";

import Link from "next/link";
import { useIsAndroid } from "@/hooks/useIsAndroid";

export type HdHubModule = {
  title: string;
  desc: string;
  href: string;
  icon: string;
  badge: string;
  accent: string;
  cardBorder: string;
  cardBg: string;
  badgeCls: string;
  /** P2-3: Android'de (Word indirilemez) gösterilecek açıklama; yoksa `desc`. */
  androidDesc?: string;
};

/**
 * HD hub — AŞAMA 3C: iki ana çalışma alanı kartı (Human Design Hesaplama + Bilgi Bankası).
 * Eski Kayıtlı Haritalar/Word üst şeridi ve admin-only "Rapor Oluştur" kartı
 * kaldırıldı; Profesyonel Word harita görünümünden, geçmiş raporlar Geçmiş Analizler'den açılır.
 */
export function HdHubModules({ modules }: { modules: readonly HdHubModule[] }) {
  // P2-3: Android'de Word vaadi metin olarak da gösterilmez (`.no-android` SSR'da gizli).
  const isAndroid = useIsAndroid();

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2" data-hd-hub>
      {modules.map((mod) => (
        <Link key={`${mod.href}:${mod.title}`} href={mod.href} className="group block no-underline">
          <div
            className={`flex h-full flex-col rounded-2xl border bg-gradient-to-br p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${mod.cardBorder} ${mod.cardBg}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-xl text-white shadow-sm transition-transform duration-200 group-hover:scale-105 ${mod.accent}`}
              >
                {mod.icon}
              </div>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ring-1 ring-inset ${mod.badgeCls}`}>
                {mod.badge}
              </span>
            </div>

            <h2 className="mt-3.5 text-base font-black text-slate-900">{mod.title}</h2>
            <p className="mt-1 flex-1 text-xs leading-5 text-slate-600">
              {mod.androidDesc ? (
                <>
                  <span className="no-android">{mod.desc}</span>
                  {isAndroid && mod.androidDesc}
                </>
              ) : (
                mod.desc
              )}
            </p>

            <div className="mt-4 flex items-center justify-end">
              <span
                className={`flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br text-white shadow-sm transition-transform duration-200 group-hover:scale-110 ${mod.accent}`}
                aria-hidden
              >
                →
              </span>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}
