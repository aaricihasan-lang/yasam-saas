"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { useConfirm } from "@/components/ui/ConfirmProvider";

/**
 * WT6 — Protokol formlarında MANUEL KAYIT + kaydedilmemiş-değişiklik koruması (ortak).
 *
 * Kural: protokol verisi YALNIZ kullanıcı açıkça "Kaydet"e (veya bölümdeki açık ekle/kaydet
 * düğmesine) bastığında yazılır; alan değişikliği, odaktan çıkma, geri/kapat/rota değişimi ASLA
 * yazmaz. Kaydedilmemiş değişiklik varken çıkış denenirse (uygulama içi link, tarayıcı/Android geri,
 * yenileme, panel kapatma) kullanıcıya açık karar sorulur: "Vazgeç" (formda kal) / "Kaydetmeden Çık".
 *
 * Her bölüm kendi "kirli" durumunu `useReportDirty(key, dirty)` ile bildirir; belge sayfası
 * `useAnyProtocolDirty()` ile tek bir sayfa-geneli koruma kurar.
 */

// Metinler: messages/<dil>/cupping.json → cupping.unsaved (TR birebir: "Kaydedilmemiş Değişiklikler" /
// "Kaydetmeden Çık" / "Vazgeç"). tone kanonik.
export const UNSAVED_LEAVE_TONE = "danger" as const;

/** Ortak "kaydetmeden çık?" onayı (true → kullanıcı değişiklikleri atmayı seçti). */
export function useConfirmLeave(): () => Promise<boolean> {
  const { confirm } = useConfirm();
  const t = useTranslations("cupping.unsaved");
  return useCallback(
    () =>
      confirm({
        title: t("title"),
        message: t("message"),
        confirmText: t("confirm"),
        cancelText: t("cancel"),
        tone: UNSAVED_LEAVE_TONE,
      }),
    [confirm, t],
  );
}

type Registry = { report: (key: string, dirty: boolean) => void; anyDirty: boolean };
const DirtyContext = createContext<Registry | null>(null);

export function ProtocolDirtyProvider({ children }: { children: ReactNode }) {
  const [keys, setKeys] = useState<ReadonlySet<string>>(() => new Set());
  const report = useCallback((key: string, dirty: boolean) => {
    setKeys((prev) => {
      if (dirty === prev.has(key)) return prev;
      const next = new Set(prev);
      if (dirty) next.add(key);
      else next.delete(key);
      return next;
    });
  }, []);
  const value = useMemo(() => ({ report, anyDirty: keys.size > 0 }), [report, keys]);
  return <DirtyContext.Provider value={value}>{children}</DirtyContext.Provider>;
}

/** Bölüm kirli durumunu bildirir (unmount'ta temizlenir). Provider yoksa sessizce no-op. */
export function useReportDirty(key: string, dirty: boolean): void {
  const ctx = useContext(DirtyContext);
  const report = ctx?.report;
  useEffect(() => {
    if (!report) return;
    report(key, dirty);
  }, [report, key, dirty]);
  useEffect(() => {
    if (!report) return;
    return () => report(key, false);
  }, [report, key]);
}

export function useAnyProtocolDirty(): boolean {
  return useContext(DirtyContext)?.anyDirty ?? false;
}
