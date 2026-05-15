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
    <NumerolojiPremiumShell maxWidthClass="max-w-7xl">
      <div className="mb-6 rounded-[32px] border border-white/75 bg-white/55 px-7 py-9 shadow-[0_18px_52px_rgba(15,23,42,0.08)] ring-1 ring-violet-100/50 backdrop-blur-xl sm:px-10 sm:py-11 lg:px-12 lg:py-12">
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
        <h1 className="text-3xl font-black tracking-tight text-slate-900 sm:text-4xl lg:text-[2.75rem] lg:leading-tight">
          Bilgi Bankası
        </h1>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-slate-600">
          Numeroloji eğitim ve bilgi içerikleri bu alanda yönetilecek.
        </p>
      </div>

      <div className="overflow-hidden rounded-[32px] border border-slate-200/85 bg-white/85 shadow-[0_28px_64px_-20px_rgba(91,33,182,0.22)] ring-1 ring-violet-100/55 backdrop-blur-md">
        <div className="flex flex-wrap gap-2 border-b border-slate-200/80 bg-gradient-to-r from-violet-50/85 via-amber-50/55 to-sky-50/85 p-2 sm:gap-3 sm:p-3">
          {BILGI_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`min-h-[3rem] shrink-0 whitespace-nowrap rounded-xl px-5 py-3 text-left text-sm font-black uppercase tracking-wide transition sm:px-6 sm:py-3.5 lg:text-[0.95rem] ${
                tab === t.id
                  ? "bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-[0_10px_28px_-4px_rgba(91,33,182,0.52)] ring-2 ring-violet-300/45"
                  : "bg-white/70 text-slate-600 hover:bg-white hover:text-violet-800 hover:shadow-[0_4px_14px_-6px_rgba(91,33,182,0.25)]"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="p-4 sm:p-6 lg:p-8">
          {tab === "kayit-ekle" ? <BilgiKayitEkleDuzenle /> : null}
          {tab === "dogaltas-ata" ? <BilgiDogaltasAta /> : null}
          {tab === "kayit-listesi" ? <BilgiKayitListesi /> : null}
        </div>
      </div>
    </NumerolojiPremiumShell>
  );
}
