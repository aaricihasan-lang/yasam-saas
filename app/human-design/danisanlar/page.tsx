"use client";

// HUMAN DESIGN ANALİZLERİM — Human Design'daki TEK danışan listesi (route korunur: /human-design/danisanlar).
//   • Tek liste + tek arama (HdAnalysisGroupList, Türkçe alfabetik): analizli ve analizsiz HD profilleri;
//     aramada ayrıca Human Design kaydı olmayan Danışan Yolculuğu danışanları ("Human Design Başlat").
//   • "Detayı Aç" kayıtlı profesyonel haritayı doğrudan açar; analiz geçmişi ve TEK "Sil" aynı pencerede.
//   • "Yeni Danışan" (owner kararı 2026-10-17): YALNIZ temiz form görünür — liste gizlenir, form kapatılınca
//     aynı tek liste geri gelir. "Danışanı Oluştur ve Analiz Et" danışanı oluşturur, haritayı hesaplar ve
//     profesyonel haritayı DOĞRUDAN açar (ara sayfa / ikinci hesapla düğmesi yok).

import { useState } from "react";
import { HumanDesignShell } from "../components/HumanDesignShell";
import { useBfcacheRefresh } from "@/hooks/useBfcacheRefresh";
import { HdClientForm, type HdAnalyzedResult } from "./components/HdClientForm";
import { HdAnalysisGroupList } from "./components/HdAnalysisGroupList";
import { HdComputedChartModal } from "../kayitli-haritalar/components/HdComputedChartModal";
import { DemoModuleBanner } from "@/components/demo/DemoModuleBanner";
import { readYasamUser } from "@/lib/auth/yasamUser";
import { useToast } from "@/components/ui/ToastProvider";

export default function HdHesaplamaPage() {
  useBfcacheRefresh();
  const { showToast } = useToast();
  const isDemo = readYasamUser()?.is_demo_account === true;
  const [newOpen, setNewOpen] = useState(false);
  const [analyzed, setAnalyzed] = useState<HdAnalyzedResult | null>(null);

  return (
    <HumanDesignShell>
      {isDemo && (
        <DemoModuleBanner className="mb-3" message="Human Design demo hesabında görüntüleme modundadır. Yeni danışan ekleme, düzenleme ve hesaplama yapılamaz." />
      )}
      <div className="mb-3 flex flex-col gap-3 rounded-2xl border border-indigo-200/80 bg-white/90 px-5 py-4 shadow-[0_6px_24px_-8px_rgba(79,70,229,0.18)] ring-1 ring-indigo-200/60 backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="m-0 text-xl font-black uppercase tracking-tight text-slate-900 sm:text-2xl">
            {newOpen ? "Yeni Danışan" : "Human Design Analizlerim"}
          </h1>
          <p className="m-0 mt-1 text-xs leading-relaxed text-slate-600 sm:text-sm">
            {newOpen
              ? "Bilgileri girin; “Danışanı Oluştur ve Analiz Et” danışanı kaydeder ve profesyonel Human Design haritasını açar."
              : "Danışanı arayın ve seçin. “Detayı Aç” kayıtlı profesyonel haritayı açar; rapor ve silme işlemleri oradadır."}
          </p>
        </div>
        {!isDemo ? (
          <button
            type="button"
            onClick={() => setNewOpen((v) => !v)}
            aria-expanded={newOpen}
            aria-controls="hd-new-client-panel"
            className={
              newOpen
                ? "h-9 shrink-0 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 hover:bg-slate-50"
                : "h-10 shrink-0 rounded-xl border border-indigo-300/80 bg-gradient-to-r from-indigo-600 to-violet-600 px-5 text-sm font-black tracking-wide text-white shadow-[0_6px_18px_rgba(79,70,229,0.28)] transition hover:brightness-105"
            }
            data-hd-new-analysis
          >
            {newOpen ? "← Listeye Dön" : "Yeni Danışan"}
          </button>
        ) : null}
      </div>

      {newOpen && !isDemo ? (
        <section id="hd-new-client-panel" className="rounded-2xl border border-indigo-200/80 bg-white/95 p-4 shadow-[0_8px_28px_-10px_rgba(79,70,229,0.18)] ring-1 ring-indigo-200/60" data-hd-workspace-client>
          <HdClientForm
            onAnalyzed={(r) => {
              setNewOpen(false);
              setAnalyzed(r);
            }}
          />
        </section>
      ) : (
        <HdAnalysisGroupList />
      )}

      {analyzed ? (
        <HdComputedChartModal
          id={analyzed.chartId}
          profile={analyzed.hdClientId ? { hdClientId: analyzed.hdClientId, name: analyzed.name } : undefined}
          onClose={() => setAnalyzed(null)}
          onDeleted={() => setAnalyzed(null)}
          onProfileDeleted={(res) => {
            setAnalyzed(null);
            showToast({
              message: `Human Design kayıtları silindi: ${res.deletedAnalyses} analiz ve ${res.deletedReports} Word raporu. Danışan Yolculuğu ana kaydı korundu.`,
              type: "success",
            });
          }}
        />
      ) : null}
    </HumanDesignShell>
  );
}
