"use client";

import Link from "next/link";
import { ArrowRight, FileJson, Info } from "lucide-react";
import { AdminModuleLayout } from "@/components/admin/AdminModuleLayout";

/**
 * Doğaltaş JSON Import — yönlendirme ekranı.
 *
 * Bu rotanın kendine ait bir içe aktarma işlevi YOKTUR (eskiden yalnız demo kartları vardı).
 * Gerçek Doğaltaş JSON aktarımı Toplu Veri Aktarımı ekranının "Doğaltaş JSON" sekmesindedir
 * (varsayılan açılan sekme; sunucu tarafı admin import API'si). Bu ekran işlev taklit etmez.
 */
const steps = [
  "JSON dosyasını seçin.",
  "Alan eşleştirme önizlemesini kontrol edin.",
  "Uygun kayıtları aktarın; aktarım sunucu tarafında, yönetici yetkisiyle yapılır.",
] as const;

export default function DogaltasImportPage() {
  return (
    <AdminModuleLayout
      title="Doğaltaş JSON Import"
      description="Taş veritabanı toplu JSON aktarımı (yalnızca admin)"
      Icon={FileJson}
      theme={{
        headerGradient: "from-slate-900 via-cyan-900 to-teal-800",
        headerLabelClass: "text-cyan-200/90",
        iconWrap: "from-cyan-500 to-teal-500",
      }}
    >
      <section
        data-admin-info="dogaltas-import"
        className="rounded-2xl border border-slate-200 bg-white/90 p-6 shadow-md sm:p-8"
      >
        <div className="flex items-start gap-3">
          <Info className="mt-0.5 h-5 w-5 shrink-0 text-slate-500" aria-hidden />
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-slate-900">
              Doğaltaş JSON aktarımı Toplu Veri Aktarımı ekranında yapılır
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              Bu sayfanın ayrı bir içe aktarma işlevi yoktur. Aktarım, Toplu Veri Aktarımı ekranının
              &ldquo;Doğaltaş JSON&rdquo; sekmesinde yapılır; ekran açıldığında bu sekme seçili gelir.
            </p>
            <ol className="mt-4 list-decimal space-y-1 pl-5 text-sm leading-relaxed text-slate-700">
              {steps.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      <div className="mt-6">
        <Link
          href="/admin/toplu-veri"
          className="inline-flex h-11 items-center gap-2 rounded-xl border-2 border-cyan-200 bg-white px-5 text-sm font-bold text-cyan-900 no-underline shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
        >
          Toplu Veri Aktarımı → Doğaltaş JSON
          <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </div>
    </AdminModuleLayout>
  );
}
