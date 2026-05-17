"use client";

import Link from "next/link";
import { useState } from "react";
import { NumerolojiPremiumShell } from "../components/NumerolojiPremiumShell";
import { BilgiKayitEkleDuzenle } from "./components/BilgiKayitEkleDuzenle";
import { BilgiDogaltasAta } from "./components/BilgiDogaltasAta";
import { BilgiKayitListesi } from "./components/BilgiKayitListesi";

const navLinkClass =
  "inline-flex min-h-[56px] items-center gap-4 rounded-2xl border-2 border-violet-300/90 bg-white/85 px-7 py-4 text-base font-black text-violet-900 shadow-lg ring-2 ring-violet-200/70 backdrop-blur-md transition hover:scale-[1.03] hover:border-violet-400 hover:bg-white hover:text-violet-950 hover:shadow-xl no-underline";

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
        <div className="mb-5 flex flex-wrap gap-4 sm:mb-6">
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
        <div className="flex flex-wrap gap-5 rounded-[32px] border-[3px] border-violet-300/40 bg-white/75 p-5 shadow-[0_0_45px_rgba(139,92,246,0.14)] backdrop-blur-xl">
          {BILGI_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`h-16 shrink-0 whitespace-nowrap rounded-2xl border-2 px-8 text-base font-black tracking-wide shadow-md transition-all duration-300 xl:text-lg ${
                tab === t.id
                  ? "scale-[1.04] border-transparent bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white shadow-[0_12px_32px_rgba(139,92,246,0.30)]"
                  : "border-violet-200 bg-white/90 text-slate-700 hover:-translate-y-1 hover:border-violet-400 hover:bg-violet-50"
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
