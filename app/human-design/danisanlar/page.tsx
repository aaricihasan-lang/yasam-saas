"use client";

// HUMAN DESIGN ANALİZLERİM — Human Design'daki TEK danışan listesi (route korunur: /human-design/danisanlar).
//   • Tek liste + tek arama (HdAnalysisGroupList): analizli ve analizsiz HD profilleri; aramada ayrıca
//     Human Design kaydı olmayan Danışan Yolculuğu danışanları ("Human Design Başlat"). Başka danışan
//     listesi / profil tablosu / seçici listesi YOK.
//   • "Detayı Aç" kayıtlı profesyonel haritayı doğrudan açar; analiz geçmişi, "Analizi Sil" ve
//     "Human Design Kaydını Tamamen Sil" aynı pencerede.
//   • "Yeni Danışan": yalnız form (merkezî Danışan Yolculuğu danışanı + HD profili; mükerrer uyarısı).

import { useState } from "react";
import { HumanDesignShell } from "../components/HumanDesignShell";
import { useBfcacheRefresh } from "@/hooks/useBfcacheRefresh";
import { HdClientForm } from "./components/HdClientForm";
import { HdAnalysisGroupList } from "./components/HdAnalysisGroupList";
import { DemoModuleBanner } from "@/components/demo/DemoModuleBanner";
import { readYasamUser } from "@/lib/auth/yasamUser";

export default function HdHesaplamaPage() {
  useBfcacheRefresh();
  const isDemo = readYasamUser()?.is_demo_account === true;
  const [newOpen, setNewOpen] = useState(false);

  return (
    <HumanDesignShell>
      {isDemo && (
        <DemoModuleBanner className="mb-3" message="Human Design demo hesabında görüntüleme modundadır. Yeni danışan ekleme, düzenleme ve hesaplama yapılamaz." />
      )}
      <div className="mb-3 flex flex-col gap-3 rounded-2xl border border-indigo-200/80 bg-white/90 px-5 py-4 shadow-[0_6px_24px_-8px_rgba(79,70,229,0.18)] ring-1 ring-indigo-200/60 backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="m-0 text-xl font-black uppercase tracking-tight text-slate-900 sm:text-2xl">Human Design Analizlerim</h1>
          <p className="m-0 mt-1 text-xs leading-relaxed text-slate-600 sm:text-sm">
            Danışanı arayın ve seçin. “Detayı Aç” kayıtlı profesyonel haritayı açar; analizler, Human Design Danışan Raporu ve silme işlemleri oradadır.
          </p>
        </div>
        {!isDemo ? (
          <button
            type="button"
            onClick={() => setNewOpen((v) => !v)}
            aria-expanded={newOpen}
            aria-controls="hd-new-client-panel"
            className="h-10 shrink-0 rounded-xl border border-indigo-300/80 bg-gradient-to-r from-indigo-600 to-violet-600 px-5 text-sm font-black tracking-wide text-white shadow-[0_6px_18px_rgba(79,70,229,0.28)] transition hover:brightness-105"
            data-hd-new-analysis
          >
            {newOpen ? "Kapat" : "Yeni Danışan"}
          </button>
        ) : null}
      </div>

      <div className="space-y-4">
        {newOpen && !isDemo ? (
          <section id="hd-new-client-panel" className="rounded-2xl border border-indigo-200/80 bg-white/95 p-4 shadow-[0_8px_28px_-10px_rgba(79,70,229,0.18)] ring-1 ring-indigo-200/60" data-hd-workspace-client>
            <p className="m-0 mb-3 text-xs text-slate-600">
              Danışan zaten kayıtlıysa listede adını arayın (Danışan Yolculuğu danışanları da çıkar). Yeni kişi için:
            </p>
            <HdClientForm />
          </section>
        ) : null}

        <HdAnalysisGroupList />
      </div>
    </HumanDesignShell>
  );
}
