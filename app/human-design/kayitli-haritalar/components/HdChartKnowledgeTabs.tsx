"use client";

// AŞAMA 2B — haritanın ALT bölümü: [Uzman Bilgilerim] | [Sistem Yorumu].
//
//   • hd_system_reading yetkisi KAPALI → sekme çubuğu YOK; alt bölüm birebir eskisi gibi (children).
//   • AÇIK → iki ayrı sekme. Varsayılan "Uzman Bilgilerim" (mevcut deneyim korunur). Sistem Yorumu
//     ilk tıklamada yüklenir, sonra gizli tutulur (tekrar açma = yeniden istek yok; zaten 0 Roxy).
//   • İki kaynak KARIŞMAZ: uzman içerikleri (children) ile sistem yorumu ayrı bileşen/uç.
//   • Görünürlük yalnız UX içindir; erişim SUNUCUDA zorlanır (/api/hd/charts/system-reading → 403).

import { useState, type ReactNode } from "react";
import { readYasamUser } from "@/lib/auth/yasamUser";
import { hasModulePermission } from "@/lib/auth/modulePermissions";
import { HdSystemReadingPanel } from "./HdSystemReadingPanel";

/** İstemci görünürlük kapısı: human_design + hd_system_reading (admin her zaman). */
export function canUseHdSystemReading(): boolean {
  const u = readYasamUser();
  return hasModulePermission(u, "human_design") && hasModulePermission(u, "hd_system_reading");
}

type Tab = "expert" | "system";

export function HdChartKnowledgeTabs({
  chartId,
  allowed,
  children,
}: {
  chartId: string;
  allowed: boolean;
  /** Mevcut uzman bölümleri (Bilgi Bankanızdan Eşleşmeler + Kişinin HD Bilgileri) — DEĞİŞMEZ. */
  children?: ReactNode;
}) {
  const [tab, setTab] = useState<Tab>("expert");
  const [systemMounted, setSystemMounted] = useState(false);

  if (!allowed) return <>{children}</>;

  const tabBtn = (key: Tab, label: string) => (
    <button
      type="button"
      role="tab"
      id={`hd-know-tab-${key}`}
      aria-selected={tab === key}
      aria-controls={`hd-know-panel-${key}`}
      onClick={() => {
        setTab(key);
        if (key === "system") setSystemMounted(true);
      }}
      className={`min-h-[40px] flex-1 rounded-lg px-4 text-sm font-bold transition sm:flex-none ${
        tab === key ? "bg-white text-indigo-700 shadow-sm" : "text-slate-600 hover:text-slate-900"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-5" data-hd-knowledge-tabs>
      <div className="mx-auto max-w-[1552px]">
        <div role="tablist" aria-label="Harita bilgileri" className="flex w-full gap-1 rounded-xl bg-slate-100 p-1 sm:w-auto sm:inline-flex">
          {tabBtn("expert", "Uzman Bilgilerim")}
          {tabBtn("system", "Sistem Yorumu")}
        </div>
      </div>
      <div role="tabpanel" id="hd-know-panel-expert" aria-labelledby="hd-know-tab-expert" hidden={tab !== "expert"} className="space-y-6">
        {children}
      </div>
      {systemMounted ? (
        <div
          role="tabpanel"
          id="hd-know-panel-system"
          aria-labelledby="hd-know-tab-system"
          hidden={tab !== "system"}
          className="mx-auto max-w-[1552px] border-t border-indigo-100/80 pt-5"
        >
          <HdSystemReadingPanel chartId={chartId} />
        </div>
      ) : null}
    </div>
  );
}
