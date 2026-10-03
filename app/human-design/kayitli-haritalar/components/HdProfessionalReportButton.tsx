"use client";

/**
 * "Profesyonel Word Raporu Oluştur" — Kayıtlı Harita detayından tek-tık akış (§19):
 *   create snapshot → success report_id → DOCX indir.
 * Download başarısız olsa da rapor kaydı korunur (Kayıtlı Raporlar'dan tekrar indirilebilir).
 * Double-submit engellenir (disabled loading state). Ayrı preview sayfası YOK (§47).
 *
 * FAZ1 final hardening: profesyonel Word TÜM HD uzmanlarına açıktır (sunucu
 * requireModuleAccess). Canonical metin uzmana yalnız bu donmuş DOCX ile ulaşır.
 * Android kuralı korunur: Word (.docx) indirme UI'si Android'de render edilmez.
 */

import { useRef, useState } from "react";
import { useIsAndroid } from "@/hooks/useIsAndroid";
import {
  createProfessionalReport,
  downloadProfessionalReport,
} from "../../kayitli-raporlar/helpers/hdProfessionalReport";

type Phase = "idle" | "creating" | "downloading" | "done" | "error";

function newRequestId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  // Eski tarayıcı yedeği (RFC4122 v4 biçimi).
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function HdProfessionalReportButton({ chartId, label }: { chartId: string; label?: string }) {
  const isAndroid = useIsAndroid();

  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState<string>("");
  // P2-2: bir kullanıcı eylemi = bir istek kimliği. Hata sonrası tekrar denemede AYNI kimlik
  // kullanılır (sunucu ikinci satır oluşturmaz). Başarıdan sonra aynı rapor yeniden indirilir;
  // yeni rapor yalnız bilinçli "Yeni sürüm oluştur" ile (yeni kimlik) oluşur.
  const requestIdRef = useRef<string | null>(null);
  const [createdReportId, setCreatedReportId] = useState<string | null>(null);
  const busyRef = useRef(false);

  const busy = phase === "creating" || phase === "downloading";

  async function download(reportId: string, omittedCount: number) {
    setPhase("downloading");
    const dl = await downloadProfessionalReport(reportId);
    if (!dl.ok) {
      setPhase("error");
      setMessage(`Rapor kaydedildi ancak indirilemedi: ${dl.error} Tekrar indirmeyi deneyin veya Kayıtlı Raporlar'ı kullanın.`);
      return;
    }
    setPhase("done");
    setMessage(
      omittedCount > 0
        ? "Rapor indirildi. İçeriği henüz yayımlanmamış bazı bölümler rapora alınmadı. Kayıtlı Raporlar'dan tekrar erişebilirsiniz."
        : "Rapor indirildi. Kayıtlı Raporlar'dan tekrar erişebilirsiniz.",
    );
  }

  async function handleClick(mode: "default" | "newVersion" = "default") {
    if (busyRef.current) return;
    busyRef.current = true;
    try {
      setMessage("");
      // Rapor zaten oluşturulduysa varsayılan eylem AYNI raporu yeniden indirmektir.
      if (mode === "default" && createdReportId) {
        await download(createdReportId, 0);
        return;
      }
      if (mode === "newVersion" || !requestIdRef.current) requestIdRef.current = newRequestId();
      setPhase("creating");
      const created = await createProfessionalReport(chartId, requestIdRef.current ?? undefined);
      if (!created.ok) {
        setPhase("error");
        setMessage(created.error);
        return; // requestId korunur → tekrar deneme aynı rapor kimliğini kullanır
      }
      setCreatedReportId(created.id);
      await download(created.id, created.omittedCount);
    } finally {
      busyRef.current = false;
    }
  }

  if (isAndroid) return null;

  return (
    <div className="no-android flex flex-col gap-1.5">
      <button
        type="button"
        onClick={() => void handleClick("default")}
        disabled={busy}
        aria-busy={busy}
        className="flex h-9 items-center rounded-xl border border-emerald-300/80 bg-gradient-to-r from-emerald-600 to-teal-600 px-5 text-sm font-black uppercase tracking-wide text-white no-underline shadow-sm transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {phase === "creating"
          ? "Rapor hazırlanıyor…"
          : phase === "downloading"
            ? "İndiriliyor…"
            : createdReportId
              ? "Word'ü Tekrar İndir"
              : label ?? "Profesyonel Word Raporu"}
      </button>
      {createdReportId && !busy ? (
        <button
          type="button"
          onClick={() => void handleClick("newVersion")}
          className="self-start text-[11px] font-bold text-emerald-700 underline-offset-2 hover:underline"
        >
          Haritadaki güncel bilgilerle yeni sürüm oluştur
        </button>
      ) : null}
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
