"use client";

import { useState } from "react";
import { HdBilgiKayitForm } from "./HdBilgiKayitForm";
import { HdBilgiKayitListesi } from "./HdBilgiKayitListesi";

const TABS = [
  { id: "kayit-listesi" as const, label: "Kayıtlarım" },
  { id: "kayit-ekle" as const, label: "Yeni Kayıt Ekle" },
];

type TabId = (typeof TABS)[number]["id"];

/**
 * P1-4 — Uzmanın KENDİ Bilgi Bankası çalışma alanı (human_design_knowledge_records).
 *
 * Eskiden yalnız 11px gri "Eski Bilgi Bankası (yedek)" bağlantısının arkasındaki sayfadaydı;
 * ana Bilgi Bankası ekranı uzmana her zaman "henüz içerik oluşturulmamış" gösteriyordu. Artık
 * hub kartı doğrudan bu çalışma alanını açar: liste + ekle + düzenle + sil. Veri modeli,
 * API'ler ve tenant izolasyonu DEĞİŞMEDİ (aynı bileşenler/uçlar).
 */
export function HdKnowledgeWorkspace({ isDemo }: { isDemo: boolean }) {
  const [tab, setTab] = useState<TabId>("kayit-listesi");
  return (
    <div className="overflow-hidden rounded-2xl border border-indigo-200/80 bg-white/95 shadow-[0_8px_28px_-10px_rgba(79,70,229,0.18)] ring-1 ring-indigo-200/60 backdrop-blur-md">
      <div role="tablist" aria-label="Bilgi Bankası" className="flex flex-wrap gap-2 rounded-t-2xl border-b border-indigo-200/60 bg-white/75 p-3 backdrop-blur-xl">
        {TABS.filter((t) => !isDemo || t.id === "kayit-listesi").map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`h-10 shrink-0 whitespace-nowrap rounded-xl border px-4 text-sm font-black tracking-wide transition-all duration-200 ${
              tab === t.id
                ? "border-transparent bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-[0_6px_18px_rgba(79,70,229,0.28)]"
                : "border-indigo-200 bg-white/90 text-slate-700 hover:border-indigo-400 hover:bg-indigo-50"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="bg-gradient-to-b from-white/95 to-indigo-50/25 p-4">
        {tab === "kayit-ekle" && <HdBilgiKayitForm onSuccess={() => setTab("kayit-listesi")} />}
        {tab === "kayit-listesi" && <HdBilgiKayitListesi onAddNew={isDemo ? undefined : () => setTab("kayit-ekle")} />}
      </div>
    </div>
  );
}
