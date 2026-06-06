"use client";

import { useState } from "react";
import { NumerolojiPremiumShell } from "../components/NumerolojiPremiumShell";
import { BilgiKayitEkleDuzenle } from "./components/BilgiKayitEkleDuzenle";
import { BilgiDogaltasAta } from "./components/BilgiDogaltasAta";
import { BilgiKayitListesi } from "./components/BilgiKayitListesi";

const BILGI_TABS = [
  { id: "kayit-ekle" as const, label: "Kayıt Ekle / Düzenle" },
  { id: "dogaltas-ata" as const, label: "Doğaltaş Ata" },
  { id: "kayit-listesi" as const, label: "Kayıt Listesi" },
];

type BilgiTabId = (typeof BILGI_TABS)[number]["id"];

export default function NumerolojiBilgiBankasiPage() {
  const [tab, setTab] = useState<BilgiTabId>("kayit-ekle");

  return (
    <NumerolojiPremiumShell maxWidthClass="max-w-none">
      <div className="mb-3 rounded-2xl border border-violet-200/80 bg-white/90 px-5 py-4 shadow-[0_6px_24px_-8px_rgba(91,33,182,0.18)] ring-1 ring-purple-200/60 backdrop-blur-xl">
        <h1 className="text-xl font-black tracking-tight text-slate-900 sm:text-2xl">
          Bilgi Bankası
        </h1>
        <p className="mt-1 text-xs leading-relaxed text-slate-600 sm:text-sm">
          Numeroloji eğitim ve bilgi içerikleri bu alanda yönetilecek.
        </p>
      </div>

      <div className="overflow-hidden rounded-2xl border border-violet-200/80 bg-white/95 shadow-[0_8px_28px_-10px_rgba(91,33,182,0.18)] ring-1 ring-purple-200/60 backdrop-blur-md">
        <div className="flex flex-wrap gap-2 rounded-t-2xl border-b border-violet-200/60 bg-white/75 p-3 backdrop-blur-xl">
          {BILGI_TABS.map((t) => (
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

        <div className="bg-gradient-to-b from-white/95 to-violet-50/25 p-4">
          {tab === "kayit-ekle" ? <BilgiKayitEkleDuzenle /> : null}
          {tab === "dogaltas-ata" ? <BilgiDogaltasAta /> : null}
          {tab === "kayit-listesi" ? <BilgiKayitListesi /> : null}
        </div>
      </div>
    </NumerolojiPremiumShell>
  );
}
