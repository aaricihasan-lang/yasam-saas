"use client";

// HUMAN DESIGN ANALİZLERİM — tek ana liste (route korunur: /human-design/danisanlar).
//   • Ana liste: yalnız analizi olan danışanlar (profil başına tek satır, analiz sayısı, son analiz,
//     Danışan Yolculuğu bağlantısı). Arama/sayfalama sunucuda. Word işlemleri YALNIZ danışan detayında.
//   • "Yeni Human Design Analizi": mevcut güvenli akış (Mevcut Danışan Seç / Yeni Danışan) ihtiyaç
//     anında açılan panelde — ikinci bir danışan veritabanı YOK.
//   • Analizi olmayan eski profiller ve profil yönetimi (açma/silme): "Tüm Human Design profilleri"
//     ekranında (mevcut HdClientListesi aynen) — erişim kaybolmaz, ana ekranı doldurmaz.

import { useState } from "react";
import Link from "next/link";
import { HumanDesignShell } from "../components/HumanDesignShell";
import { useBfcacheRefresh } from "@/hooks/useBfcacheRefresh";
import { HdClientForm } from "./components/HdClientForm";
import { HdJourneyClientPicker } from "./components/HdJourneyClientPicker";
import { HdAnalysisGroupList } from "./components/HdAnalysisGroupList";
import { DemoModuleBanner } from "@/components/demo/DemoModuleBanner";
import { readYasamUser } from "@/lib/auth/yasamUser";

const MODES = [
  { id: "existing" as const, label: "Mevcut Danışan Seç" },
  { id: "new" as const, label: "Yeni Danışan" },
];
type Mode = (typeof MODES)[number]["id"];

export default function HdHesaplamaPage() {
  useBfcacheRefresh();
  const isDemo = readYasamUser()?.is_demo_account === true;
  const [mode, setMode] = useState<Mode>("existing");
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
            Analiz yaptığınız danışanlar. Danışanın detayından tüm analizlerine ve Human Design Danışan Raporu&apos;na ulaşırsınız.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setNewOpen((v) => !v)}
          aria-expanded={newOpen}
          aria-controls="hd-new-analysis-panel"
          className="h-10 shrink-0 rounded-xl border border-indigo-300/80 bg-gradient-to-r from-indigo-600 to-violet-600 px-5 text-sm font-black tracking-wide text-white shadow-[0_6px_18px_rgba(79,70,229,0.28)] transition hover:brightness-105"
          data-hd-new-analysis
        >
          {newOpen ? "Kapat" : "Yeni Human Design Analizi"}
        </button>
      </div>

      <div className="space-y-4">
        {newOpen ? (
          <section id="hd-new-analysis-panel" className="overflow-hidden rounded-2xl border border-indigo-200/80 bg-white/95 shadow-[0_8px_28px_-10px_rgba(79,70,229,0.18)] ring-1 ring-indigo-200/60" data-hd-workspace-client>
            <div role="tablist" aria-label="Danışan" className="flex flex-wrap gap-2 border-b border-indigo-200/60 bg-white/75 p-3">
              {MODES.filter((m) => !isDemo || m.id === "existing").map((m) => (
                <button
                  key={m.id}
                  type="button"
                  role="tab"
                  aria-selected={mode === m.id}
                  onClick={() => setMode(m.id)}
                  className={`h-9 shrink-0 whitespace-nowrap rounded-xl border px-4 text-sm font-black tracking-wide transition-all duration-200 ${
                    mode === m.id
                      ? "border-transparent bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-[0_6px_18px_rgba(79,70,229,0.28)]"
                      : "border-indigo-200 bg-white/90 text-slate-700 hover:border-indigo-400 hover:bg-indigo-50"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <div className="bg-gradient-to-b from-white/95 to-indigo-50/25 p-4">
              {mode === "new" && !isDemo ? <HdClientForm /> : <HdJourneyClientPicker />}
            </div>
          </section>
        ) : null}

        <HdAnalysisGroupList />

        <p className="m-0 text-center text-xs text-slate-500">
          Henüz analizi olmayan ve eski Human Design profilleri:{" "}
          <Link href="/human-design/danisanlar/profiller" className="font-bold text-indigo-600 hover:underline" data-hd-profiles-link>
            Tüm Human Design profilleri
          </Link>
        </p>
      </div>
    </HumanDesignShell>
  );
}
