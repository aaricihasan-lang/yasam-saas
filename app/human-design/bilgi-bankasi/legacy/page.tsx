"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { HumanDesignShell } from "../../components/HumanDesignShell";
import { useBfcacheRefresh } from "@/hooks/useBfcacheRefresh";
import { HdBilgiKayitForm } from "../components/HdBilgiKayitForm";
import { HdBilgiKayitListesi } from "../components/HdBilgiKayitListesi";
import { DemoModuleBanner } from "@/components/demo/DemoModuleBanner";
import { readYasamUser } from "@/lib/auth/yasamUser";

const TABS = [
  { id: "kayit-ekle" as const, label: "Kayıt Ekle" },
  { id: "kayit-listesi" as const, label: "Kayıt Listesi" },
];

type TabId = (typeof TABS)[number]["id"];

/**
 * ESKİ (legacy) uzman Bilgi Bankası — human_design_knowledge_records tabanlı.
 * Yeni canonical sistem ana route'a alındıktan sonra ROLLBACK yüzeyi olarak burada
 * korunur. Legacy tablolar/API/servisler/editör SİLİNMEZ. Kullanıcı yeni sistemi
 * kabul edene kadar erişilebilir kalır.
 */
export default function HdBilgiBankasiLegacyPage() {
  useBfcacheRefresh();
  const isDemo = readYasamUser()?.is_demo_account === true;
  const [tab, setTab] = useState<TabId>("kayit-listesi");

  return (
    <HumanDesignShell>
      <Link
        href="/human-design/bilgi-bankasi"
        className="mb-3 inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:underline"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Yeni Bilgi Bankası&apos;na dön
      </Link>

      {isDemo && (
        <DemoModuleBanner className="mb-3" message="Demo hesabında Human Design bilgi bankası görüntülenebilir. Kayıt ekleme, düzenleme ve silme işlemleri yapılamaz." />
      )}

      {/* Başlık + rollback bilgisi */}
      <div className="mb-3 rounded-2xl border border-amber-200/80 bg-amber-50/70 px-5 py-4 shadow-[0_6px_24px_-8px_rgba(217,119,6,0.14)] ring-1 ring-amber-200/60 backdrop-blur-xl">
        <h1 className="text-xl font-black tracking-tight text-slate-900 sm:text-2xl">
          Human Design — Eski Bilgi Bankası (Yedek)
        </h1>
        <p className="mt-1 text-xs leading-relaxed text-amber-800 sm:text-sm">
          Bu, eski uzman kayıt sistemidir ve yalnızca rollback amacıyla korunmaktadır.
          Güncel içerik için yeni Bilgi Bankası&apos;nı kullanın.
        </p>
      </div>

      {/* İçerik */}
      <div className="overflow-hidden rounded-2xl border border-indigo-200/80 bg-white/95 shadow-[0_8px_28px_-10px_rgba(79,70,229,0.18)] ring-1 ring-indigo-200/60 backdrop-blur-md">
        {/* Tab Bar */}
        <div className="flex flex-wrap gap-2 rounded-t-2xl border-b border-indigo-200/60 bg-white/75 p-3 backdrop-blur-xl">
          {TABS.filter((t) => !isDemo || t.id === "kayit-listesi").map((t) => (
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
          {tab === "kayit-ekle" && <HdBilgiKayitForm onSuccess={() => setTab("kayit-listesi")} />}
          {tab === "kayit-listesi" && <HdBilgiKayitListesi />}
        </div>
      </div>
    </HumanDesignShell>
  );
}
