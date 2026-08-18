"use client";

import { runInEffect } from "@/lib/runInEffect";
import { useEffect, useState } from "react";
import { getSyncedTenantId } from "@/lib/auth/sessionTenant";
import { useBfcacheRefresh } from "@/hooks/useBfcacheRefresh";
import { fetchOilCounts } from "@/lib/aromaterapi/aromatherapyData";
import { downloadWord } from "@/lib/aromaterapi/wordExport";
import { useToast } from "@/components/ui/ToastProvider";
import { DemoModuleBanner } from "@/components/demo/DemoModuleBanner";
import { readYasamUser } from "@/lib/auth/yasamUser";
import { getDemoOilStats } from "@/lib/demo/demoAromaterapi";
import { AromaterapiSectionShell } from "@/app/aromaterapi/_components/AromaterapiSectionShell";
import { AromaterapiModuleCard } from "@/app/aromaterapi/_components/AromaterapiModuleCard";
import { AROMATERAPI_HUB_MODULES } from "@/lib/aromaterapi/aromaterapiModules";

type OilStats = {
  total: number;
  essential: number;
  carrier: number;
  maceration: number;
  other: number;
};

const statCard =
  "rounded-xl border border-amber-100/80 bg-white/90 px-3 py-2 text-center shadow-sm";

export default function AromaTerapiHubPage() {
  const isDemo = readYasamUser()?.is_demo_account === true;
  const [stats, setStats] = useState<OilStats>(() =>
    isDemo
      ? getDemoOilStats()
      : { total: 0, essential: 0, carrier: 0, maceration: 0, other: 0 },
  );
  const [loading, setLoading] = useState(!isDemo);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (isDemo) return;
    runInEffect(() => {
      void (async () => {
        setLoading(true);
        setErrorMsg("");
        const tenantId = await getSyncedTenantId();
        if (!tenantId) {
          setLoading(false);
          setErrorMsg("Oturum açmanız gerekiyor. Lütfen sayfayı yenileyin.");
          return;
        }

        // Sayaçlar güvenli server API'den tek çağrıda gelir (service_role;
        // PostgREST 1000 tavanından bağımsız gerçek toplam).
        const { counts, error } = await fetchOilCounts();

        setLoading(false);

        if (error || !counts) {
          setErrorMsg("İstatistikler yüklenemedi.");
          return;
        }

        const other = Math.max(
          0,
          counts.total - counts.essential - counts.carrier - counts.maceration,
        );
        setStats({ ...counts, other });
      })();
    });
  }, [isDemo]);

  useBfcacheRefresh();

  const { showToast } = useToast();
  const [exportingGeneral, setExportingGeneral] = useState(false);
  async function exportGeneralWord() {
    if (exportingGeneral) return;
    setExportingGeneral(true);
    const { ok, error } = await downloadWord("/api/aromaterapi/word-report", {});
    setExportingGeneral(false);
    if (ok) showToast({ title: "Word hazırlandı", message: "Aromaterapi genel katalog raporu indiriliyor.", type: "success" });
    else showToast({ title: "Word oluşturulamadı", message: error ?? "Rapor oluşturulamadı.", type: "error" });
  }

  const statTiles = [
    { label: "Toplam", value: stats.total, cls: "text-slate-950" },
    { label: "Uçucu", value: stats.essential, cls: "text-amber-700" },
    { label: "Sabit", value: stats.carrier, cls: "text-emerald-700" },
    { label: "Maserasyon", value: stats.maceration, cls: "text-rose-700" },
    { label: "Diğer", value: stats.other, cls: "text-violet-700" },
  ];

  return (
    <AromaterapiSectionShell
      eyebrow="Terapötik Yağ Kütüphanesi"
      title="Aromaterapi Merkezi"
      subtitle="Uçucu, sabit ve maserasyon yağı kütüphaneleri, karışım oluşturucu, kaynaklar ve bilgi kayıtları. Profesyonel referans ve çalışma merkezi."
      icon="🌸"
      showNav={false}
      banner={
        isDemo ? (
          <DemoModuleBanner message="Aromaterapi modülü demo hesabı için temsili verilerle gösterilmektedir. İçerikler görüntülenebilir; düzenleme ve yeni kayıt işlemleri demo hesabında çalışmaz." />
        ) : undefined
      }
      actions={
        <div className="flex flex-col gap-2">
          {!isDemo && (
            <button
              type="button"
              onClick={() => void exportGeneralWord()}
              disabled={exportingGeneral}
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 px-3.5 text-[12px] font-black text-white shadow-sm ring-1 ring-white/25 transition hover:brightness-105 disabled:opacity-60"
              title="Tüm Aromaterapi kaynaklarını tek profesyonel Word dosyasında indir"
            >
              <span aria-hidden>📄</span>
              {exportingGeneral ? "Hazırlanıyor…" : "Aromaterapi Kataloğunu Word'e Aktar"}
            </button>
          )}
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {statTiles.map((s) => (
              <div key={s.label} className={statCard}>
                <div className={`text-lg font-black sm:text-xl ${s.cls}`}>
                  {loading ? "—" : s.value}
                </div>
                <div className="mt-0.5 text-[10px] font-bold text-slate-500">
                  {s.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      }
    >
      {errorMsg ? (
        <div className="mb-4 rounded-2xl bg-rose-50 px-4 py-2.5 text-[13px] font-bold text-rose-700 ring-1 ring-rose-100">
          {errorMsg}
        </div>
      ) : null}

      {/* Bölüm kartları — tek registry'den üretilir (hard-code YOK). */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {AROMATERAPI_HUB_MODULES.map((module) => (
          <AromaterapiModuleCard
            key={module.id}
            module={module}
            badge={
              module.id === "yaglar" && !loading ? `${stats.total} yağ` : undefined
            }
          />
        ))}
      </section>

      <footer className="mt-5 flex flex-wrap items-center gap-2 rounded-2xl border border-amber-100/60 bg-white/60 px-4 py-3 backdrop-blur-sm">
        <span className="text-lg" aria-hidden>
          🌿
        </span>
        <p className="text-xs font-medium text-slate-500">
          Aromaterapi Merkezi — yağ kütüphanesi, karışım oluşturucu ve kaynak
          temelli bilgi sistemi. Bölümler hazırlandıkça bu merkezden açılır.
        </p>
      </footer>
    </AromaterapiSectionShell>
  );
}
