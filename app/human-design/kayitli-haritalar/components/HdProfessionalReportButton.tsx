"use client";

/**
 * "Profesyonel Word Raporu Oluştur" — Kayıtlı Harita detayından tek-tık akış (§19):
 *   create snapshot → success report_id → DOCX indir.
 * Download başarısız olsa da rapor kaydı korunur (Kayıtlı Raporlar'dan tekrar indirilebilir).
 * Double-submit engellenir (disabled loading state). Ayrı preview sayfası YOK (§47).
 */

import { useState } from "react";
import {
  createProfessionalReport,
  downloadProfessionalReport,
} from "../../kayitli-raporlar/helpers/hdProfessionalReport";

type Phase = "idle" | "creating" | "downloading" | "done" | "error";

export function HdProfessionalReportButton({ chartId }: { chartId: string }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState<string>("");

  const busy = phase === "creating" || phase === "downloading";

  async function handleClick() {
    if (busy) return;
    setPhase("creating");
    setMessage("");

    const created = await createProfessionalReport(chartId);
    if (!created.ok) {
      setPhase("error");
      setMessage(created.error);
      return;
    }

    setPhase("downloading");
    const dl = await downloadProfessionalReport(created.id);
    if (!dl.ok) {
      // Rapor kaydı OLUŞTU; yalnız indirme başarısız → Kayıtlı Raporlar'dan tekrar indirilebilir.
      setPhase("error");
      setMessage(`Rapor kaydedildi ancak indirilemedi: ${dl.error} Kayıtlı Raporlar'dan indirebilirsiniz.`);
      return;
    }
    setPhase("done");
    setMessage("Rapor indirildi. Kayıtlı Raporlar'dan tekrar erişebilirsiniz.");
  }

  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        onClick={handleClick}
        disabled={busy}
        aria-busy={busy}
        className="flex h-9 items-center rounded-xl border border-emerald-300/80 bg-gradient-to-r from-emerald-600 to-teal-600 px-5 text-sm font-black uppercase tracking-wide text-white no-underline shadow-sm transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {phase === "creating"
          ? "Rapor hazırlanıyor…"
          : phase === "downloading"
            ? "İndiriliyor…"
            : "Profesyonel Word Raporu"}
      </button>
      {message ? (
        <p
          className={`text-xs font-semibold ${phase === "error" ? "text-rose-600" : "text-emerald-700"}`}
          role="status"
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}
