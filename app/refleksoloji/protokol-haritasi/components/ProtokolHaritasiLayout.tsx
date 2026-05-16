"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { useToast } from "@/components/ui/ToastProvider";
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
  "flex h-full min-h-0 flex-col overflow-hidden rounded-[32px] border border-white/90 bg-white/80 shadow-[0_16px_40px_-18px_rgba(91,33,182,0.2)] ring-1 ring-violet-100/70 backdrop-blur-md";

export function ProtokolHaritasiLayout() {
  const { showToast } = useToast();
  const { hydrated, saveProtocol } = useProtocolRegistry();
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

    const saved = saveProtocol(draft, null);
    if (!saved) {
      setValidationMessage("Kayıt yapılamadı. Alanları kontrol edin.");
      return;
    }

    showToast({
      type: "success",
      title: "Protokol kaydedildi",
      message: `«${saved.title}» başarıyla kaydedildi.`,
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
    <main className="relative flex min-h-screen w-full max-w-none flex-col overflow-x-hidden bg-[linear-gradient(160deg,#f3ebff_0%,#ebe4ff_28%,#f8f4ff_58%,#f0f7ff_100%)] text-slate-900 antialiased">
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div className="absolute -left-24 top-0 h-72 w-72 rounded-full bg-violet-300/25 blur-3xl" />
        <div className="absolute right-[-8%] top-[8%] h-80 w-80 rounded-full bg-fuchsia-200/20 blur-3xl" />
      </div>

      <div className="relative z-10 flex min-h-screen w-full max-w-none flex-col px-4 py-4 md:px-6 xl:px-8">
        <div className="flex shrink-0 items-center gap-4 pb-4">
          <Link
            href="/refleksoloji"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border-2 border-violet-300/95 bg-white/90 px-4 py-2.5 text-base font-extrabold text-violet-950 shadow-md ring-1 ring-violet-200/80 backdrop-blur-sm transition hover:border-violet-400 hover:bg-white hover:shadow-lg"
          >
            <span aria-hidden>←</span>
            <span className="hidden sm:inline">Ana Menü</span>
          </Link>
          <header className="min-w-0 flex-1">
            <p className="text-sm font-black uppercase tracking-[0.22em] text-violet-700/90">
              Refleksoloji · Protokol Kaydı
            </p>
            <h1 className="truncate text-4xl font-black leading-tight tracking-tight text-slate-900 sm:text-5xl">
              Protokol Haritası
            </h1>
            <p className="mt-1 line-clamp-2 text-lg font-medium text-slate-600">
              Yeni protokol oluşturun; kayıtlı protokoller için Kayıtlı Protokoller sayfasını kullanın.
            </p>
          </header>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 xl:grid-cols-[380px_minmax(520px,1fr)_minmax(520px,1fr)] xl:gap-6">
          <aside className={`${panelClass} p-6 xl:p-8`}>
            <ProtocolRegistrationForm
              draft={draft}
              onDraftChange={setDraft}
              onSave={handleSave}
              onClear={handleClear}
              validationMessage={validationMessage}
            />
          </aside>

          <section className={`${panelClass} p-6 xl:p-8`}>
            <h2 className="mb-4 shrink-0 text-2xl font-bold text-violet-900">Protokol Özeti</h2>
            <ProtocolSummaryPanel draft={draft} statuses={statuses} />
          </section>

          <div className="flex min-h-[760px] min-w-0 flex-col xl:min-h-0">
            <div className="relative flex min-h-[760px] flex-1 flex-col overflow-hidden">
              <div className="absolute inset-0 origin-center scale-[1.15]">
                <ProtocolFootMap
                  regions={regions}
                  footView={footView}
                  missingOrgans={missingOrgans}
                  onFootViewChange={setFootView}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
