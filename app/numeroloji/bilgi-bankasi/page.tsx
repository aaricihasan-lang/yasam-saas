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
    <NumerolojiPremiumShell maxWidthClass="max-w-[1500px]">
      <div className="mb-8 rounded-[32px] border border-violet-200/70 bg-white/80 px-8 py-10 shadow-[0_20px_56px_-16px_rgba(91,33,182,0.22)] ring-2 ring-violet-100/60 backdrop-blur-xl sm:px-12 sm:py-12 lg:px-14 lg:py-14">
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
        <h1 className="text-3xl font-black tracking-tight text-slate-900 sm:text-4xl lg:text-5xl lg:leading-tight">
          Bilgi Bankası
        </h1>
        <p className="mt-4 max-w-3xl text-base leading-relaxed text-slate-600 sm:text-lg">
          Numeroloji eğitim ve bilgi içerikleri bu alanda yönetilecek.
        </p>
      </div>

      <div className="overflow-hidden rounded-[32px] border border-violet-200/75 bg-white/90 shadow-[0_32px_72px_-20px_rgba(91,33,182,0.28)] ring-2 ring-violet-100/60 backdrop-blur-md">
        <div className="flex flex-wrap gap-3 border-b border-violet-200/80 bg-gradient-to-r from-violet-50/90 via-amber-50/60 to-sky-50/85 p-3 sm:gap-4 sm:p-4 lg:p-5">
          {BILGI_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`min-h-[56px] shrink-0 whitespace-nowrap rounded-2xl px-8 py-4 text-left text-base font-black uppercase tracking-wide transition lg:text-lg ${
                tab === t.id
                  ? "bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-[0_12px_32px_-6px_rgba(91,33,182,0.55)] ring-2 ring-violet-300/50"
                  : "border border-violet-200/60 bg-white/85 text-slate-600 shadow-sm ring-1 ring-violet-100/50 hover:border-violet-300/80 hover:bg-white hover:text-violet-800 hover:shadow-[0_8px_24px_-8px_rgba(91,33,182,0.3)]"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="bg-gradient-to-b from-white/95 to-violet-50/20 p-6 sm:p-8 lg:p-10 xl:p-12">
          {tab === "kayit-ekle" ? <BilgiKayitEkleDuzenle /> : null}
          {tab === "dogaltas-ata" ? <BilgiDogaltasAta /> : null}
          {tab === "kayit-listesi" ? <BilgiKayitListesi /> : null}
        </div>
      </div>
    </NumerolojiPremiumShell>
  );
}
