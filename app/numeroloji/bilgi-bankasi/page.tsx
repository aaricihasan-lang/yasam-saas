"use client";

import Link from "next/link";
import { useState } from "react";
import { NumerolojiPremiumShell } from "../components/NumerolojiPremiumShell";
import { BilgiKayitEkleDuzenle } from "./components/BilgiKayitEkleDuzenle";
import { BilgiDogaltasAta } from "./components/BilgiDogaltasAta";
import { BilgiKayitListesi } from "./components/BilgiKayitListesi";

const navLinkClass =
  "inline-flex items-center gap-2 rounded-2xl border border-white/85 bg-white/80 px-6 py-3 text-sm font-bold text-violet-900 shadow-[0_8px_26px_-8px_rgba(91,33,182,0.38)] ring-1 ring-violet-200/55 backdrop-blur-md transition hover:scale-[1.03] hover:border-violet-300/90 hover:bg-white hover:text-violet-950 hover:shadow-[0_14px_36px_-8px_rgba(91,33,182,0.45)] no-underline";

const BILGI_TABS = [
  { id: "kayit-ekle" as const, label: "Kayıt Ekle / Düzenle" },
  { id: "dogaltas-ata" as const, label: "Doğaltaş Ata" },
  { id: "kayit-listesi" as const, label: "Kayıt Listesi" },
];

type BilgiTabId = (typeof BILGI_TABS)[number]["id"];

export default function NumerolojiBilgiBankasiPage() {
  const [tab, setTab] = useState<BilgiTabId>("kayit-ekle");

  return (
    <NumerolojiPremiumShell maxWidthClass="w-[96%] max-w-[1800px]">
      <div className="mb-10 rounded-[32px] border-2 border-violet-200/80 bg-white/90 px-16 py-14 shadow-xl ring-1 ring-purple-200 backdrop-blur-xl">
        <div className="mb-5 flex flex-wrap gap-3 sm:mb-6">
          <Link href="/numeroloji" className={navLinkClass}>
            ← Modül seçimi
          </Link>
          <Link href="/numeroloji/analiz" className={navLinkClass}>
            Numeroloji Analizi
          </Link>
          <Link href="/numeroloji/liste" className={navLinkClass}>
            Kayıtlı Analizler
          </Link>
        </div>
        <h1 className="text-5xl font-black tracking-tight text-slate-900 lg:leading-tight">
          Bilgi Bankası
        </h1>
        <p className="mt-5 max-w-4xl text-lg leading-relaxed text-slate-600">
          Numeroloji eğitim ve bilgi içerikleri bu alanda yönetilecek.
        </p>
      </div>

      <div className="overflow-hidden rounded-[32px] border-2 border-violet-200/80 bg-white/95 shadow-xl ring-1 ring-purple-200 backdrop-blur-md">
        <div className="flex flex-wrap gap-4 border-b border-violet-200/80 bg-gradient-to-r from-violet-50/90 via-amber-50/60 to-sky-50/85 p-5 sm:gap-5 sm:p-6">
          {BILGI_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`min-h-[68px] shrink-0 whitespace-nowrap rounded-2xl px-10 py-5 text-left text-lg font-bold tracking-wide transition ${
                tab === t.id
                  ? "bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-lg ring-2 ring-violet-300/50"
                  : "border-2 border-violet-200/70 bg-white/90 text-slate-600 shadow-md ring-1 ring-purple-200 hover:border-violet-300 hover:bg-white hover:text-violet-800"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="bg-gradient-to-b from-white/95 to-violet-50/25 p-10">
          {tab === "kayit-ekle" ? <BilgiKayitEkleDuzenle /> : null}
          {tab === "dogaltas-ata" ? <BilgiDogaltasAta /> : null}
          {tab === "kayit-listesi" ? <BilgiKayitListesi /> : null}
        </div>
      </div>
    </NumerolojiPremiumShell>
  );
}
