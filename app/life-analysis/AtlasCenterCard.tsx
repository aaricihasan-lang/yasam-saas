"use client";

/**
 * Yaşam Analiz Merkezi → Gökyüzü Atlası kartı (2026-10-15 owner kararı: Atlas ana panelde ayrı kart değil, merkezin
 * içinde). Görünürlük SUNUCUNUN erişim yoklamasıyla belirlenir (fail-closed): /api/astroloji/access yalnız sistem
 * sahibine ve Astroloji yetkisi açık uzmana 200 döner; diğer herkese tek tip 404 → kart hiç çizilmez (modülün varlığı
 * sızmaz, yanıp sönme yok). Sayfa ve API ayrıca kendi kapılarıyla korunur; bu yalnız görünürlüktür.
 * Adres değişmedi: /astroloji (eski bağlantılar ve yer imleri çalışır).
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, Sparkles } from "lucide-react";
import { astroFetch } from "@/app/admin/astroloji/_lib/api";

export default function AtlasCenterCard() {
  const [allowed, setAllowed] = useState(false);
  useEffect(() => {
    let alive = true;
    void astroFetch<{ ok: true }>("/api/admin/astroloji/access").then((r) => {
      if (alive) setAllowed(r.ok);
    });
    return () => {
      alive = false;
    };
  }, []);
  if (!allowed) return null;
  return (
    <Link
      href="/astroloji"
      className="group flex flex-col rounded-[18px] border border-indigo-200/70 bg-gradient-to-br from-indigo-100/90 via-violet-50/95 to-white p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
      data-testid="life-analysis-atlas-card"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 to-indigo-700 text-white shadow-sm transition-all duration-200 group-hover:scale-105">
          <Sparkles className="h-5 w-5" strokeWidth={2.25} />
        </div>
        <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-800 ring-1 ring-emerald-200/80">Aktif</span>
      </div>
      <h2 className="mt-2 text-sm font-black text-slate-900 sm:text-base">Gökyüzü Atlası</h2>
      <p className="mt-0.5 flex-1 text-xs leading-5 text-slate-600">
        Batı, Vedik ve KP astrolojisi analizleri; danışan arşivi, kayıtlı analizler ve haritalı Word / PDF raporları.
      </p>
      <div className="mt-3 flex items-center justify-end">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-900 text-white shadow-sm transition group-hover:scale-105" aria-hidden>
          <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.5} />
        </span>
      </div>
    </Link>
  );
}
