"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { downloadWord } from "@/lib/aromaterapi/wordExport";
import { useAromaApiError } from "@/lib/aromaterapi/useAromaterapiModuleText";

export interface ReadListSelection {
  selectedIds: Set<string>;
  toggle: (id: string) => void;
  selectAllPage: (ids: string[]) => void;
  clear: () => void;
  isExporting: boolean;
  onExportSelected: () => void;
  onExportAll: () => void;
}

/**
 * ReadListScreen için additive çoklu-seçim + Word export hook'u.
 * Seçim GLOBAL (sayfalar arası korunur); `resetKey` (q/filter/sort imzası) değişince
 * DETERMİNİSTİK olarak temizlenir. selected ids kullanıcının açık seçtiği kayıtlar;
 * export server tarafında tenant-scope ile yeniden doğrulanır.
 */
export function useReadListSelection(opts: {
  exportUrl: string;
  resetKey: string;
  showToast: (t: { title: string; message: string; type: "success" | "error" | "info" }) => void;
}): ReadListSelection {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const t = useTranslations("aromatherapy.shared");
  const apiError = useAromaApiError();
  const [exporting, setExporting] = useState(false);
  const [prevKey, setPrevKey] = useState(opts.resetKey);
  if (opts.resetKey !== prevKey) { setPrevKey(opts.resetKey); setSelectedIds(new Set()); } // filtre değişince seçim temizlenir

  const toggle = (id: string) =>
    setSelectedIds((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const selectAllPage = (ids: string[]) =>
    setSelectedIds((prev) => { const n = new Set(prev); ids.forEach((i) => n.add(i)); return n; });
  const clear = () => setSelectedIds(new Set());

  async function run(body: Record<string, unknown>) {
    if (exporting) return;
    setExporting(true);
    const { ok, error, errorCode } = await downloadWord(opts.exportUrl, body);
    setExporting(false);
    if (ok) opts.showToast({ title: t("wordReadyTitle"), message: t("wordReadyBody"), type: "success" });
    else opts.showToast({ title: t("wordFailedTitle"), message: apiError.text(error, errorCode, t("wordFailedBody")), type: "error" });
  }

  return {
    selectedIds, toggle, selectAllPage, clear, isExporting: exporting,
    onExportSelected: () => void run({ mode: "selected", ids: [...selectedIds] }),
    onExportAll: () => void run({ mode: "all" }),
  };
}
