"use client";

import { useTranslations } from "next-intl";

import { useState } from "react";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { requiresBulkDeleteGuard, runBulkDeleteConfirm } from "@/lib/ui/bulkDeleteGuard";

type LegacyQuarantineBannerProps = {
  /** Sahibi belirsiz kayıt sayısı. */
  count: number;
  /** "not" | "organ" | "protokol" */
  noun: string;
  onImport: () => void | Promise<void>;
  onDiscard: () => void | Promise<void>;
  className?: string;
};

/**
 * DL-007: eski (hesaba bağlı olmayan) cihaz verisi için TEK SEFERLİK karar bandı.
 * Veri ASLA otomatik silinmez veya otomatik bir hesaba aktarılmaz; kullanıcı
 * açıkça "Bana ait, içe aktar" ya da "Sil" der.
 */
export function LegacyQuarantineBanner({
  count,
  noun,
  onImport,
  onDiscard,
  className = "",
}: LegacyQuarantineBannerProps) {
  const t = useTranslations("reflexology.common.quarantine");
  const tc = useTranslations("reflexology.common");
  const { confirm } = useConfirm();
  const [busy, setBusy] = useState(false);

  if (count <= 0) return null;

  const run = async (fn: () => void | Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  const handleImport = () =>
    run(async () => {
      const ok = await confirm({
        message: t("importMsg", { count: String(count), noun }),
        confirmText: t("importConfirm"),
        cancelText: tc("cancel"),
      });
      if (ok) await onImport();
    });

  const handleDiscard = () =>
    run(async () => {
      // 3+ kayıt → sistem geneli 3 aşamalı toplu silme.
      const ok = requiresBulkDeleteGuard(count)
        ? await runBulkDeleteConfirm(confirm, {
            count,
            noun,
            detail: t("discardDetail"),
          })
        : await confirm({
            message: t("discardMsg", { count: String(count), noun }),
            confirmText: tc("delete"),
            cancelText: tc("cancel"),
            tone: "danger",
          });
      if (ok) await onDiscard();
    });

  return (
    <section
      role="status"
      className={`rounded-2xl border border-amber-300/80 bg-amber-50/90 p-4 shadow-sm ring-1 ring-amber-100/70 ${className}`}
    >
      <p className="text-sm font-bold text-amber-950">
        {t("found", { count: String(count), noun })}
      </p>
      <p className="mt-1 text-xs font-medium text-amber-900/90">
        {t("explain")}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void handleImport()}
          className="rounded-lg border border-emerald-300/80 bg-emerald-100 px-3 py-1.5 text-xs font-bold text-emerald-950 transition hover:bg-emerald-200/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {t("importConfirm")}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void handleDiscard()}
          className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-bold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {tc("delete")}
        </button>
      </div>
    </section>
  );
}
