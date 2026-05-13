"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import BilincaltiSebepleri from "./components/BilincaltiSebepleri";
import BiyoenerjiLayout, {
  type BiyoenerjiNavItem,
  type BiyoenerjiSectionId,
} from "./components/BiyoenerjiLayout";
import BiyoenerjiSeanslari from "./components/BiyoenerjiSeanslari";
import Cakralar from "./components/Cakralar";
import EnerjiBedenleri from "./components/EnerjiBedenleri";
import Imajinasyonlar from "./components/Imajinasyonlar";
import SembolDili from "./components/SembolDili";

const NAV_ITEMS: BiyoenerjiNavItem[] = [
  { id: "seanslar", label: "Biyoenerji Seansları", icon: "◈" },
  { id: "enerji-bedenleri", label: "Enerji Bedenleri", icon: "◎" },
  { id: "bilincalti", label: "Bilinçaltı Sebepleri", icon: "◐" },
  { id: "imajinasyon", label: "İmajinasyonlar", icon: "✧" },
  { id: "sembol", label: "Sembol Dili", icon: "✦" },
  { id: "cakralar", label: "Çakralar", icon: "⬡" },
];

export default function BiyoenerjiDashboardPage() {
  const [activeId, setActiveId] = useState<BiyoenerjiSectionId>("seanslar");

  const panel = useMemo(() => {
    switch (activeId) {
      case "enerji-bedenleri":
        return <EnerjiBedenleri />;
      case "bilincalti":
        return <BilincaltiSebepleri />;
      case "imajinasyon":
        return <Imajinasyonlar />;
      case "sembol":
        return <SembolDili />;
      case "cakralar":
        return <Cakralar />;
      case "seanslar":
      default:
        return <BiyoenerjiSeanslari />;
    }
  }, [activeId]);

  return (
    <main className="min-h-screen bg-[linear-gradient(145deg,#f5f3ff_0%,#ecfeff_38%,#f0fdf4_72%,#fff7ed_100%)] text-slate-950">
      <div className="mx-auto flex min-h-screen max-w-[1200px] flex-col px-3 py-5 sm:px-6 sm:py-8">
        <header className="mb-5 shrink-0 rounded-[26px] border border-white/75 bg-white/72 p-4 shadow-[0_8px_40px_-12px_rgba(15,23,42,0.06)] ring-1 ring-violet-100/50 backdrop-blur-md sm:mb-6 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="mb-1.5 inline-flex rounded-full bg-violet-50 px-2.5 py-1 text-[10px] font-black tracking-[0.14em] text-violet-700 ring-1 ring-violet-100">
                MODÜL
              </p>
              <h1 className="text-2xl font-black tracking-tight text-slate-900 sm:text-[28px]">Biyoenerji</h1>
              <p className="mt-1.5 max-w-xl text-[13px] font-medium leading-relaxed text-slate-500">
                Aura, bilinçaltı & sembol dili çalışma alanı
              </p>
            </div>
            <Link
              href="/dashboard"
              className="inline-flex w-fit shrink-0 items-center gap-2 self-start rounded-2xl border border-slate-200/80 bg-white/90 px-4 py-2.5 text-[12px] font-black text-slate-700 shadow-sm ring-1 ring-white transition hover:border-violet-200 hover:bg-violet-50/80 hover:text-slate-900"
            >
              <span aria-hidden className="text-violet-500">
                ←
              </span>
              Modüllere dön
            </Link>
          </div>
        </header>

        <BiyoenerjiLayout items={NAV_ITEMS} activeId={activeId} onSelect={setActiveId}>
          {panel}
        </BiyoenerjiLayout>
      </div>
    </main>
  );
}
