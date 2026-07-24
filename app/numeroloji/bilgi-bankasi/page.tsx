"use client";

import { useState } from "react";
import { NumerolojiPremiumShell } from "../components/NumerolojiPremiumShell";
import { useBfcacheRefresh } from "@/hooks/useBfcacheRefresh";
import { BilgiKayitEkleDuzenle } from "./components/BilgiKayitEkleDuzenle";
import { BilgiDogaltasAta } from "./components/BilgiDogaltasAta";
import { BilgiKayitListesi } from "./components/BilgiKayitListesi";
import { DemoModuleBanner } from "@/components/demo/DemoModuleBanner";
import { readYasamUser } from "@/lib/auth/yasamUser";

const BILGI_TABS = [
  { id: "kayit-ekle" as const, label: "Kayıt Ekle / Düzenle" },
  { id: "dogaltas-ata" as const, label: "Doğaltaş Ata" },
  { id: "kayit-listesi" as const, label: "Kayıt Listesi" },
];

type BilgiTabId = (typeof BILGI_TABS)[number]["id"];

export default function NumerolojiBilgiBankasiPage() {
  useBfcacheRefresh();
  const isDemo = readYasamUser()?.is_demo_account === true;
  const [tab, setTab] = useState<BilgiTabId>(isDemo ? "kayit-listesi" : "kayit-ekle");

  return (
    <NumerolojiPremiumShell maxWidthClass="max-w-none">
      {isDemo && (
        <DemoModuleBanner className="mb-3" message="Numeroloji bilgi bankası demo hesabında görüntülenebilir. Kayıt ekleme, düzenleme ve silme işlemleri yapılamaz." />
      )}
      {/* NUM-MOB-2-FIX1: mobilde başlık kutusuz (düz); md+ kart korunur. */}
      <div className="mb-3 px-[clamp(8px,2.5vw,14px)] py-2 md:border md:border-violet-200/80 md:bg-white/90 md:px-5 md:py-4 md:shadow-[0_6px_24px_-8px_rgba(91,33,182,0.18)] md:ring-1 md:ring-purple-200/60 md:backdrop-blur-xl md:rounded-2xl">
        <h1 className="text-xl font-black tracking-tight text-slate-900 sm:text-2xl">
          Bilgi Bankası
        </h1>
        <p className="mt-1 text-xs leading-relaxed text-slate-600 sm:text-sm">
          Numeroloji eğitim ve bilgi içerikleri bu alanda yönetilecek.
        </p>
      </div>

      {/* NUM-MOB-2-FIX1: mobilde kutusuz (panel kabı/sekme şeridi düz); md+ kart korunur. */}
      <div className="overflow-hidden md:rounded-2xl md:border md:border-violet-200/80 md:bg-white/95 md:shadow-[0_8px_28px_-10px_rgba(91,33,182,0.18)] md:ring-1 md:ring-purple-200/60 md:backdrop-blur-md">
        <div className="flex flex-wrap gap-2 py-2 md:border-b md:border-violet-200/60 md:bg-white/75 md:p-3 md:backdrop-blur-xl md:rounded-t-2xl">
          {BILGI_TABS.filter((t) => !isDemo || t.id === "kayit-listesi").map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`h-9 shrink-0 whitespace-nowrap rounded-xl border px-4 text-sm font-black tracking-wide transition-all duration-200 ${
                tab === t.id
                  ? "border-transparent bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white shadow-[0_6px_18px_rgba(139,92,246,0.28)]"
                  : "border-violet-200 bg-white/90 text-slate-700 hover:border-violet-400 hover:bg-violet-50"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="px-[clamp(8px,2.5vw,14px)] py-3 md:bg-gradient-to-b md:from-white/95 md:to-violet-50/25 md:p-4">
          {tab === "kayit-ekle" ? <BilgiKayitEkleDuzenle /> : null}
          {tab === "dogaltas-ata" ? <BilgiDogaltasAta /> : null}
          {tab === "kayit-listesi" ? <BilgiKayitListesi /> : null}
        </div>
      </div>
    </NumerolojiPremiumShell>
  );
}
