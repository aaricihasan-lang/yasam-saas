"use client";

import { Suspense } from "react";
import { useTranslations } from "next-intl";
import { HumanDesignShell } from "../components/HumanDesignShell";
import { HdRaporListesi } from "./components/HdRaporListesi";
import BfcacheRefreshHandler from "@/components/BfcacheRefreshHandler";
import { DemoModuleBanner } from "@/components/demo/DemoModuleBanner";
import { readYasamUser } from "@/lib/auth/yasamUser";

export default function KayitliRaporlarPage() {
  const isDemo = readYasamUser()?.is_demo_account === true;
  const t = useTranslations("hd.reports");

  return (
    <HumanDesignShell>
      <BfcacheRefreshHandler />
      {isDemo && (
        <DemoModuleBanner className="mb-3" message={t("demoBanner")} />
      )}
      {/* Başlık */}
      <div className="mb-5 rounded-2xl border border-fuchsia-200/80 bg-white/90 px-5 py-5 shadow-[0_6px_24px_-8px_rgba(168,85,247,0.18)] ring-1 ring-fuchsia-200/60 backdrop-blur-xl">
        <h1 className="text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">
          {t("title")}
        </h1>
        <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
          {t("subtitle")}
        </p>
      </div>

      {/* Liste */}
      <Suspense fallback={<div className="py-12 text-center text-sm text-slate-500">{t("loading")}</div>}>
        <HdRaporListesi />
      </Suspense>
    </HumanDesignShell>
  );
}
