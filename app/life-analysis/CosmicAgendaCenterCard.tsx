"use client";

/**
 * Yaşam Analiz Merkezi → Yaşam Takvimi / Kozmik Ajanda kartı (2026-10-17 owner kararı: modül ana panelde ayrı kart
 * değil, bu merkezin içinde). Adres DEĞİŞMEDİ: /cosmic-calendar (eski bağlantılar ve yer imleri çalışır); hesaplama ve
 * iş mantığına dokunulmadı.
 *
 * Görünürlük yalnız kullanıcının GERÇEK cosmic_calendar yetkisiyle (sistem sahibi her zaman görür). Canlı
 * module_permissions syncYasamUserFromDb ile kesinleşmeden kart çizilmez (fail-closed, yanıp sönme yok). Bu yalnız
 * görünürlüktür: sayfa ModuleRouteGuard (routeModuleAccess /cosmic-calendar kuralı), API'ler requireModuleAccess
 * ("cosmic_calendar") ile ayrıca korunur.
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, CalendarDays } from "lucide-react";
import { hasModulePermission } from "@/lib/auth/modulePermissions";
import { readYasamUser, syncYasamUserFromDb } from "@/lib/auth/yasamUser";

export default function CosmicAgendaCenterCard() {
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const cached = readYasamUser();
    void syncYasamUserFromDb(cached)
      .then((fresh) => {
        if (!cancelled) setAllowed(hasModulePermission(fresh ?? cached ?? null, "cosmic_calendar"));
      })
      .catch(() => {
        if (!cancelled) setAllowed(hasModulePermission(cached ?? null, "cosmic_calendar"));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!allowed) return null;

  return (
    <Link
      href="/cosmic-calendar"
      data-testid="life-analysis-cosmic-card"
      className="group flex flex-col rounded-[18px] border border-indigo-200/70 bg-gradient-to-br from-indigo-100/90 via-violet-50/95 to-white p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-400 to-violet-600 text-white shadow-sm transition-all duration-200 group-hover:scale-105">
          <CalendarDays className="h-5 w-5" strokeWidth={2.25} />
        </div>
        <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-800 ring-1 ring-emerald-200/80">
          Aktif
        </span>
      </div>

      <h2 className="mt-2 text-sm font-black text-slate-900 sm:text-base">Yaşam Takvimi / Kozmik Ajanda</h2>
      <p className="mt-0.5 flex-1 text-xs leading-5 text-slate-600">
        Hicri takvim, hacamat günleri, ay evreleri ve günlük kozmik akış.
      </p>

      <div className="mt-3 flex items-center justify-end">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-900 text-white shadow-sm transition group-hover:scale-105" aria-hidden>
          <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.5} />
        </span>
      </div>
    </Link>
  );
}
