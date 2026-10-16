"use client";

// AŞAMA 2B — haritanın ALT bölümü: [Uzman Bilgilerim] | [Sistem Yorumu].
//
//   • hd_system_reading yetkisi KAPALI → sekme çubuğu YOK; alt bölüm birebir eskisi gibi (children).
//   • AÇIK → iki ayrı sekme. Varsayılan "Uzman Bilgilerim" (mevcut deneyim korunur). Sistem Yorumu
//     ilk tıklamada yüklenir, sonra gizli tutulur (tekrar açma = yeniden istek yok; zaten 0 Roxy).
//   • İki kaynak KARIŞMAZ: uzman içerikleri (children) ile sistem yorumu ayrı bileşen/uç.
//   • Görünürlük yalnız UX içindir; erişim SUNUCUDA zorlanır (/api/hd/charts/system-reading → 403).
//
// YALNIZ ADMİN (adminSources verilirse): üç AYRI kaynak sekmesi —
//   [Uzman Bilgilerim] (kişisel Bilgi Bankası) | [Merkezi Bilgi Bankası Yorumu] (hd_canonical_*) |
//   [Roxy API Yorumu] (bu haritanın KAYITLI sağlayıcı yorumu; yeni Roxy çağrısı yapılmaz).
// Normal uzman bu düzeni GÖRMEZ; yukarıdaki iki sekmeli akış aynen korunur.

import { useState, type ReactNode } from "react";
import { isAdminUser, readYasamUser } from "@/lib/auth/yasamUser";
import { hasModulePermission } from "@/lib/auth/modulePermissions";
import { HdSystemReadingPanel } from "./HdSystemReadingPanel";

/** İstemci görünürlük kapısı: human_design + hd_system_reading (admin her zaman). */
export function canUseHdSystemReading(): boolean {
  const u = readYasamUser();
  return hasModulePermission(u, "human_design") && hasModulePermission(u, "hd_system_reading");
}

/** Admin üç-kaynak görünümü mü? YALNIZ etiket/düzen içindir — hiçbir özelliği kilitlemez/açmaz. */
export function isHdAdminSourceView(): boolean {
  return isAdminUser(readYasamUser());
}

/** Admin ekranındaki kaynak adları (tek yer). */
export const HD_ADMIN_SOURCE_LABELS = {
  expert: "Uzman Bilgilerim",
  central: "Merkezi Bilgi Bankası Yorumu",
  system: "Roxy API Yorumu",
} as const;

type Tab = "expert" | "central" | "system";

export function HdChartKnowledgeTabs({
  chartId,
  allowed,
  children,
  adminSources,
}: {
  chartId: string;
  allowed: boolean;
  /** Mevcut uzman bölümleri (Bilgi Bankanızdan Eşleşmeler + Kişinin HD Bilgileri) — DEĞİŞMEZ. */
  children?: ReactNode;
  /** Yalnız admin hesabında kullanılır: kişisel ve merkezî içerik ayrı sekmelerde. */
  adminSources?: { expert: ReactNode; central: ReactNode };
}) {
  const [tab, setTab] = useState<Tab>("expert");
  const [systemMounted, setSystemMounted] = useState(false);
  const [admin] = useState(isHdAdminSourceView);
  const split = admin && adminSources ? adminSources : null;

  // Normal uzman (split yok): eski davranış birebir.
  if (!split) {
    if (!allowed) return <>{children}</>;
  }

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
    <div className="space-y-5" data-hd-knowledge-tabs data-hd-admin-sources={split ? "1" : undefined}>
      <div className="mx-auto max-w-[1552px]">
        <div role="tablist" aria-label="Harita bilgileri" className="flex w-full flex-wrap gap-1 rounded-xl bg-slate-100 p-1 sm:w-auto sm:inline-flex">
          {tabBtn("expert", "Uzman Bilgilerim")}
          {split ? tabBtn("central", HD_ADMIN_SOURCE_LABELS.central) : null}
          {allowed ? tabBtn("system", split ? HD_ADMIN_SOURCE_LABELS.system : "Sistem Yorumu") : null}
        </div>
      </div>
      <div role="tabpanel" id="hd-know-panel-expert" aria-labelledby="hd-know-tab-expert" hidden={tab !== "expert"} className="space-y-6">
        {split ? split.expert : children}
      </div>
      {split ? (
        <div role="tabpanel" id="hd-know-panel-central" aria-labelledby="hd-know-tab-central" hidden={tab !== "central"} className="space-y-6">
          {split.central}
        </div>
      ) : null}
      {allowed && systemMounted ? (
        <div
          role="tabpanel"
          id="hd-know-panel-system"
          aria-labelledby="hd-know-tab-system"
          hidden={tab !== "system"}
          className="mx-auto max-w-[1552px] border-t border-indigo-100/80 pt-5"
        >
          {split ? (
            <p className="mb-3 text-[11px] leading-relaxed text-slate-500" data-hd-roxy-note>
              Bu haritanın hesaplanması sırasında Roxy API&apos;den alınıp kaydedilmiş yorumdur. Görüntülemek yeni bir Roxy isteği oluşturmaz; kayıtlı yorum yoksa gösterilmez.
            </p>
          ) : null}
          <HdSystemReadingPanel chartId={chartId} />
        </div>
      ) : null}
    </div>
  );
}
