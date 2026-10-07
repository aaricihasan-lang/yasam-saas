"use client";

// AŞAMA 3C — HUMAN DESIGN HESAPLAMA çalışma alanı (eski "Danışanlar" sayfası; route korunur).
//   Danışan seç (merkezî Danışan Yolculuğu) / Yeni danışan → danışan çalışma sayfası (doğum bilgileri +
//   Hesapla + profesyonel harita) → Geçmiş Human Design Analizleri. Teknik kavramlar (profil/bağlantı
//   kimlikleri) kullanıcıya gösterilmez.

import { useState } from "react";
import { HumanDesignShell } from "../components/HumanDesignShell";
import { useBfcacheRefresh } from "@/hooks/useBfcacheRefresh";
import { HdClientForm } from "./components/HdClientForm";
import { HdJourneyClientPicker } from "./components/HdJourneyClientPicker";
import { HdClientListesi } from "./components/HdClientListesi";
import { HdAnalysisHistory } from "./components/HdAnalysisHistory";
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

  return (
    <HumanDesignShell>
      {isDemo && (
        <DemoModuleBanner className="mb-3" message="Human Design demo hesabında görüntüleme modundadır. Yeni danışan ekleme, düzenleme ve hesaplama yapılamaz." />
      )}
      <div className="mb-3 rounded-2xl border border-indigo-200/80 bg-white/90 px-5 py-4 shadow-[0_6px_24px_-8px_rgba(79,70,229,0.18)] ring-1 ring-indigo-200/60 backdrop-blur-xl">
        <h1 className="text-xl font-black tracking-tight text-slate-900 sm:text-2xl">Human Design Hesaplama</h1>
        <p className="mt-1 text-xs leading-relaxed text-slate-600 sm:text-sm">
          Danışan seçin veya yeni danışan oluşturun ve profesyonel Human Design haritasını hesaplayın.
        </p>
      </div>

      <div className="space-y-4">
        <section className="overflow-hidden rounded-2xl border border-indigo-200/80 bg-white/95 shadow-[0_8px_28px_-10px_rgba(79,70,229,0.18)] ring-1 ring-indigo-200/60" data-hd-workspace-client>
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

        <details className="group rounded-2xl border border-indigo-200/80 bg-white/95 p-5 shadow-sm ring-1 ring-indigo-100/60" data-hd-profiles>
          <summary className="cursor-pointer list-none text-xs font-black uppercase tracking-widest text-indigo-700 marker:hidden">
            <span className="mr-1 inline-block transition group-open:rotate-90">▸</span>
            Human Design Danışanları
          </summary>
          <div className="mt-4">
            <HdClientListesi />
          </div>
        </details>

        <HdAnalysisHistory />
      </div>
    </HumanDesignShell>
  );
}
