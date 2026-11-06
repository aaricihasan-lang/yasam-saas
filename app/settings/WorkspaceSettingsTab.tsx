"use client";

/**
 * Ayarlar → "Çalışma Alanım" (Kişisel Dijital Ofis). Owner kararı 2026-11-02: kişiselleştirme ana ekranın üst çubuğundan
 * kaldırıldı; buradan açılır. Kişiselleştirme merkezi canlı önizleme için ANA EKRANDA açılır (/?calisma-alanim=1).
 *
 * Erişim sunucuda karar verilir (bayrak + Owner / izin listesi / ROLLOUT_ALL). Uç 404 → sekme HİÇ gösterilmez
 * (yetkisiz hesaba kişiselleştirme erişimi verilmez; diğer ayar sekmeleri aynen kalır). Demo hesap yalnız görüntüler.
 */
import { useEffect, useState } from "react";
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

const LAYOUT_NAMES: Record<string, string> = { A: "A · İmza Bandı", B: "B · Dijital Ofis", C: "C · Kartvizit Stüdyo" };

export function WorkspaceSettingsTab({ access, readOnly }: { access: WorkspaceAccess; readOnly: boolean }) {
  const d = access.design;
  const applied = d?.applied ?? null;
  const rows: [React.ElementType, string, string][] = [
    [LayoutTemplate, "Uygulanan tasarım", applied ? LAYOUT_NAMES[applied.layout] ?? applied.layout : "Varsayılan Yaşam Sistemi görünümü"],
    [ImageIcon, "Logo ve arka plan", applied ? [applied.logo.assetId ? "Kişisel logo" : null, applied.bg.mode === "photo" ? "Kendi fotoğrafım" : applied.bg.mode === "theme" ? "Hazır tema" : null].filter(Boolean).join(" · ") || "Varsayılan" : "Varsayılan"],
    [History, "Kayıtlı taslak / geçmiş", `${d?.draft ? "Kaydedilmiş taslak var" : "Taslak yok"} · ${d?.history.length ?? 0} önceki tasarım`],
  ];
  return (
    <div className="space-y-5" data-testid="settings-workspace">
      <p className="text-sm leading-relaxed text-slate-600">
        Ana ekranınızı kendi logonuz, fotoğrafınız ve marka renklerinizle kişiselleştirin; modülleri gizleyin, Favorilerim
        listenizi düzenleyin. Kişiselleştirme merkezi ana ekranda açılır ve değişiklikleri uygulamadan önce canlı olarak gösterir.
        Görünüm modunu (Gündüz, Gece, Okuma, Odak) ana ekranın üst çubuğundan da değiştirebilirsiniz.
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
          Demo hesapta kişiselleştirme yalnız görüntülenebilir; değişiklik kaydedilemez.
        </p>
      ) : (
        <Link
          href="/?calisma-alanim=1"
          data-testid="settings-open-workspace"
          className="inline-flex items-center gap-2 rounded-full bg-violet-700 px-5 py-2.5 text-sm font-bold text-white shadow-md transition-colors hover:bg-violet-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-700"
        >
          <Sparkles className="h-4 w-4" aria-hidden />
          Çalışma Alanımı Düzenle
        </Link>
      )}
      <p className="text-xs leading-relaxed text-slate-500">
        Kişiselleştirme yalnız sizin ana ekran görünümünüzü değiştirir; modül yetkileriniz, danışan kayıtlarınız ve iç modül
        ekranları etkilenmez.
      </p>
    </div>
  );
}
