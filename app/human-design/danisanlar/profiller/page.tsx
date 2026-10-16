"use client";

// Tüm Human Design profilleri (yönetim) — ana "Human Design Analizlerim" ekranından taşındı.
// Analizi olmayan ve Danışan Yolculuğu'na bağlı olmayan eski profiller dahil; profili açma ve silme
// MEVCUT bileşenle (HdClientListesi) aynen — yetki ve silme kuralları değişmedi.

import Link from "next/link";
import { HumanDesignShell } from "../../components/HumanDesignShell";
import { useBfcacheRefresh } from "@/hooks/useBfcacheRefresh";
import { HdClientListesi } from "../components/HdClientListesi";

export default function HdProfillerPage() {
  useBfcacheRefresh();
  return (
    <HumanDesignShell>
      <div className="mb-3 rounded-2xl border border-indigo-200/80 bg-white/90 px-5 py-4 shadow-[0_6px_24px_-8px_rgba(79,70,229,0.18)] ring-1 ring-indigo-200/60">
        <h1 className="m-0 text-xl font-black tracking-tight text-slate-900 sm:text-2xl">Tüm Human Design Profilleri</h1>
        <p className="m-0 mt-1 text-xs leading-relaxed text-slate-600 sm:text-sm">
          Henüz analizi olmayan ve Danışan Yolculuğu&apos;na bağlı olmayan eski profiller dahil tüm Human Design profilleri; profili açma ve silme.{" "}
          <Link href="/human-design/danisanlar" className="font-bold text-indigo-600 hover:underline">
            Human Design Analizlerim
          </Link>
        </p>
      </div>
      <section className="rounded-2xl border border-indigo-200/80 bg-white/95 p-5 shadow-sm ring-1 ring-indigo-100/60" data-hd-profiles>
        <HdClientListesi />
      </section>
    </HumanDesignShell>
  );
}
