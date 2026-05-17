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
    <main className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,#ede9fe_0%,#ecfeff_38%,#f8fafc_100%)] text-slate-950">
      <div className="pointer-events-none absolute left-0 top-0 h-[520px] w-[520px] rounded-full bg-violet-300/20 blur-[150px]" />
      <div className="pointer-events-none absolute right-0 top-0 h-[520px] w-[520px] rounded-full bg-emerald-300/20 blur-[150px]" />

      <div className="relative z-10 flex min-h-screen w-full flex-col px-6 py-6 xl:px-10 2xl:px-14">
        <header className="mb-6 shrink-0 rounded-[34px] border-[3px] border-violet-300/45 bg-white/75 p-8 shadow-[0_0_45px_rgba(139,92,246,0.16)] backdrop-blur-xl">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="mb-3 inline-flex rounded-full border border-violet-200 bg-violet-50 px-5 py-2 text-sm font-black tracking-[0.18em] text-violet-700">
                MODÜL
              </p>
              <h1 className="text-5xl font-black tracking-tight text-slate-950 xl:text-6xl">Biyoenerji</h1>
              <p className="mt-3 text-lg font-medium text-slate-600 xl:text-xl">
                Aura, bilinçaltı & sembol dili çalışma alanı
              </p>
            </div>
            <Link
              href="/"
              className="inline-flex w-fit shrink-0 items-center gap-2 self-start rounded-2xl border-2 border-violet-200 bg-white px-6 py-4 font-black text-slate-800 shadow-md transition hover:bg-violet-50"
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
