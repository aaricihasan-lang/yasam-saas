"use client";

import { useState } from "react";
import { HumanDesignShell } from "../components/HumanDesignShell";
import { HdBilgiKayitForm } from "./components/HdBilgiKayitForm";
import { HdBilgiKayitListesi } from "./components/HdBilgiKayitListesi";

const TABS = [
  { id: "kayit-ekle" as const, label: "Kayıt Ekle" },
  { id: "kayit-listesi" as const, label: "Kayıt Listesi" },
];

type TabId = (typeof TABS)[number]["id"];

export default function HdBilgiBankasiPage() {
  const [tab, setTab] = useState<TabId>("kayit-ekle");

  return (
    <HumanDesignShell>
      {/* Başlık */}
      <div className="mb-3 rounded-2xl border border-indigo-200/80 bg-white/90 px-5 py-4 shadow-[0_6px_24px_-8px_rgba(79,70,229,0.18)] ring-1 ring-indigo-200/60 backdrop-blur-xl">
        <h1 className="text-xl font-black tracking-tight text-slate-900 sm:text-2xl">
          Human Design — Bilgi Bankası
        </h1>
        <p className="mt-1 text-xs leading-relaxed text-slate-600 sm:text-sm">
          Kapılar, kanallar, merkezler, tipler, otoriteler, profiller ve yorumlar bu alanda yönetilir.
        </p>
      </div>

      {/* İçerik */}
      <div className="overflow-hidden rounded-2xl border border-indigo-200/80 bg-white/95 shadow-[0_8px_28px_-10px_rgba(79,70,229,0.18)] ring-1 ring-indigo-200/60 backdrop-blur-md">
        {/* Tab Bar */}
        <div className="flex flex-wrap gap-2 rounded-t-2xl border-b border-indigo-200/60 bg-white/75 p-3 backdrop-blur-xl">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`h-9 shrink-0 whitespace-nowrap rounded-xl border px-4 text-sm font-black tracking-wide transition-all duration-200 ${
                tab === t.id
                  ? "border-transparent bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-[0_6px_18px_rgba(79,70,229,0.28)]"
                  : "border-indigo-200 bg-white/90 text-slate-700 hover:border-indigo-400 hover:bg-indigo-50"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab İçeriği */}
        <div className="bg-gradient-to-b from-white/95 to-indigo-50/25 p-4">
          {tab === "kayit-ekle" && (
            <HdBilgiKayitForm onSuccess={() => setTab("kayit-listesi")} />
          )}
          {tab === "kayit-listesi" && <HdBilgiKayitListesi />}
        </div>
      </div>
    </HumanDesignShell>
  );
}
