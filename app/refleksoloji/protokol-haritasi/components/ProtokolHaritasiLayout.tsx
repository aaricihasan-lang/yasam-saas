"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useToast } from "@/components/ui/ToastProvider";
import { STORAGE_QUOTA_ERROR_MESSAGE } from "@/lib/safeStorage";
import { EMPTY_PROTOCOL_DRAFT } from "../lib/protocolStorage";
import {
  missingAtlasOrgans,
  resolveColoredRegionsForOrgans,
} from "../lib/resolveDisplayRegions";
import { useProtocolRegistry } from "../hooks/useProtocolRegistry";
import type { ProtocolFootView, ProtocolFormDraft } from "../types";
import { ProtocolFootMap } from "./ProtocolFootMap";
import { ProtocolRegistrationForm } from "./ProtocolRegistrationForm";
import { ProtocolSummaryPanel } from "./ProtocolSummaryPanel";

const panelClass =
  "flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-white/90 bg-white/80 shadow-[0_8px_28px_-10px_rgba(91,33,182,0.18)] ring-1 ring-violet-100/70 backdrop-blur-md";

export function ProtokolHaritasiLayout() {
  const { showToast } = useToast();
  const { hydrated, saveProtocol, syncErrorMessage, clearSyncError } = useProtocolRegistry();

  useEffect(() => {
    if (!syncErrorMessage) return;
    showToast({ type: "warning", title: "Bulut eşitleme", message: syncErrorMessage });
    clearSyncError();
  }, [syncErrorMessage, clearSyncError, showToast]);
  const [draft, setDraft] = useState<ProtocolFormDraft>(EMPTY_PROTOCOL_DRAFT);
  const [footView, setFootView] = useState<ProtocolFootView>("taban");
  const [validationMessage, setValidationMessage] = useState<string | null>(null);

  const { regions, statuses } = useMemo(
    () => resolveColoredRegionsForOrgans(draft.organs, footView),
    [draft.organs, footView],
  );

  const missingOrgans = useMemo(() => missingAtlasOrgans(statuses), [statuses]);

  const resetForm = useCallback(() => {
    setDraft(EMPTY_PROTOCOL_DRAFT);
    setValidationMessage(null);
  }, []);

  const handleSave = () => {
    if (!draft.title.trim()) {
      setValidationMessage("Hedef / sorun adı zorunludur.");
      return;
    }
    if (draft.organs.length === 0) {
      setValidationMessage("En az bir organ ekleyin.");
      return;
    }

    const result = saveProtocol(draft, null);
    if (!result.saved) {
      setValidationMessage("Kayıt yapılamadı. Alanları kontrol edin.");
      return;
    }
    if (!result.storageOk) {
      showToast({ type: "error", title: "Depolama Hatası", message: STORAGE_QUOTA_ERROR_MESSAGE });
      return;
    }

    showToast({
      type: "success",
      title: "Protokol kaydedildi",
      message: `«${result.saved.title}» başarıyla kaydedildi.`,
    });
    resetForm();
  };

  const handleClear = () => {
    resetForm();
  };

  if (!hydrated) {
    return (
      <main className="flex min-h-screen w-full items-center justify-center bg-[linear-gradient(160deg,#f3ebff_0%,#ebe4ff_28%,#f8f4ff_58%,#f0f7ff_100%)]">
        <p className="text-base font-semibold text-violet-900">Yükleniyor…</p>
      </main>
    );
  }

  return (
    <main className="relative flex h-screen w-full max-w-none flex-col overflow-hidden bg-[linear-gradient(160deg,#f3ebff_0%,#ebe4ff_28%,#f8f4ff_58%,#f0f7ff_100%)] text-slate-900 antialiased">
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div className="absolute -left-24 top-0 h-72 w-72 rounded-full bg-violet-300/25 blur-3xl" />
        <div className="absolute right-[-8%] top-[8%] h-80 w-80 rounded-full bg-fuchsia-200/20 blur-3xl" />
      </div>

      <div className="relative z-10 flex h-full w-full flex-col px-3 py-2 md:px-5 xl:px-7">
        <header className="flex shrink-0 items-center gap-3 pb-2">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-violet-700/90">
              Refleksoloji &middot; Protokol Kaydı
            </p>
            <h1 className="truncate text-lg font-black leading-tight tracking-tight text-slate-900 sm:text-xl">
              Protokol Haritası
            </h1>
          </div>
          <p className="hidden shrink-0 text-xs font-medium text-slate-500 xl:block">
            Yeni protokol oluşturun; kayıtlılar için Kayıtlı Protokoller sayfasını kullanın.
          </p>
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 xl:grid-cols-[300px_1fr_1fr] xl:gap-4">
          <aside className={`${panelClass} p-4`}>
            <ProtocolRegistrationForm
              draft={draft}
              onDraftChange={setDraft}
              onSave={handleSave}
              onClear={handleClear}
              validationMessage={validationMessage}
            />
          </aside>

          <section className={`${panelClass} p-4`}>
            <h2 className="mb-3 shrink-0 text-base font-bold text-violet-900">Protokol Özeti</h2>
            <ProtocolSummaryPanel draft={draft} statuses={statuses} />
          </section>

          <div className={`${panelClass} min-w-0`}>
            <ProtocolFootMap
              regions={regions}
              footView={footView}
              missingOrgans={missingOrgans}
              onFootViewChange={setFootView}
            />
          </div>
        </div>
      </div>
    </main>
  );
}
