"use client";

/**
 * Ayarlar → "Çalışma Alanım" (Kişisel Dijital Ofis). Owner kararı 2026-11-02: kişiselleştirme ana ekranın üst çubuğundan
 * kaldırıldı; buradan açılır. Kişiselleştirme merkezi canlı önizleme için ANA EKRANDA açılır (/?calisma-alanim=1).
 *
 * Erişim sunucuda karar verilir (bayrak + Owner / izin listesi / ROLLOUT_ALL). Uç 404 → sekme HİÇ gösterilmez
 * (yetkisiz hesaba kişiselleştirme erişimi verilmez; diğer ayar sekmeleri aynen kalır). Demo hesap yalnız görüntüler.
 */
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { History, ImageIcon, LayoutTemplate, Sparkles } from "lucide-react";
import { getDesign, type DesignState } from "@/lib/workspace/client";

export type WorkspaceAccess = { status: "loading" | "on" | "off"; design: DesignState | null };

/** Sekmenin görünüp görünmeyeceği için tek yoklama (GET tasarım). Hata / 404 → kapalı (fail-closed). */
export function useWorkspaceAccess(enabled: boolean): WorkspaceAccess {
  const [state, setState] = useState<WorkspaceAccess>({ status: "loading", design: null });
  useEffect(() => {
    if (!enabled) return;
    const ac = new AbortController();
    getDesign(ac.signal)
      .then((r) => setState(r.kind === "ok" ? { status: "on", design: r.value } : { status: "off", design: null }))
      .catch(() => { /* sayfadan ayrılındı */ });
    return () => ac.abort();
  }, [enabled]);
  return enabled ? state : { status: "off", design: null };
}

// Yerleşim kimliği (A/B/C, kanonik) → settings.workspace.layouts.<kimlik> gösterim adı.
const LAYOUT_IDS = new Set(["A", "B", "C"]);

export function WorkspaceSettingsTab({ access, readOnly }: { access: WorkspaceAccess; readOnly: boolean }) {
  const t = useTranslations("settings.workspace");
  const d = access.design;
  const applied = d?.applied ?? null;
  const rows: [React.ElementType, string, string][] = [
    [LayoutTemplate, t("appliedDesign"), applied ? (LAYOUT_IDS.has(applied.layout) ? t(`layouts.${applied.layout}`) : applied.layout) : t("defaultDesign")],
    [ImageIcon, t("logoAndBackground"), applied ? [applied.logo.assetId ? t("personalLogo") : null, applied.bg.mode === "photo" ? t("ownPhoto") : applied.bg.mode === "theme" ? t("presetTheme") : null].filter(Boolean).join(" · ") || t("default") : t("default")],
    [History, t("draftHistory"), `${d?.draft ? t("draftSaved") : t("noDraft")} · ${t("historyCount", { count: d?.history.length ?? 0 })}`],
  ];
  return (
    <div className="space-y-5" data-testid="settings-workspace">
      <p className="text-sm leading-relaxed text-slate-600">
        {t("intro")}
      </p>
      <ul className="grid gap-2 sm:grid-cols-3">
        {rows.map(([Icon, label, value]) => (
          <li key={label} className="rounded-2xl border border-slate-100 bg-white/80 p-4">
            <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500"><Icon className="h-4 w-4" aria-hidden />{label}</p>
            <p className="mt-1.5 text-sm font-semibold text-slate-800">{value}</p>
          </li>
        ))}
      </ul>
      {readOnly ? (
        <p role="note" className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
          {t("demoNote")}
        </p>
      ) : (
        <Link
          href="/?calisma-alanim=1"
          data-testid="settings-open-workspace"
          className="inline-flex items-center gap-2 rounded-full bg-violet-700 px-5 py-2.5 text-sm font-bold text-white shadow-md transition-colors hover:bg-violet-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-700"
        >
          <Sparkles className="h-4 w-4" aria-hidden />
          {t("edit")}
        </Link>
      )}
      <p className="text-xs leading-relaxed text-slate-500">
        {t("footer")}
      </p>
    </div>
  );
}
