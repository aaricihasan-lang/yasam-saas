"use client";

// FAZ 9D — Hesaplanmış (computed) HD harita detay modalı.
//
// Saklanan computed_result (tam HdChartResult) 9B GET ?id= ile çekilir ve
// <BodyGraph result={computed_result} /> ile RECOMPUTE OLMADAN render edilir.
// Silme 9B DELETE ile. Manuel modal (HdHaritaDetayModal) ve BodyGraph görsel
// katmanı DEĞİŞMEZ; burada yalnız kullanılır.

import { useEffect, useRef, useState } from "react";
import {
  getComputedChart,
  deleteComputedChart,
  type ComputedChartDetail,
} from "@/lib/human-design/api/chartsClient";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { useHdModalA11y } from "../../components/useHdModalA11y";
import { HdPersonalKnowledgePanel } from "./HdPersonalKnowledgePanel";
import { HdProfessionalReportButton } from "./HdProfessionalReportButton";
import { HdComputedChartView } from "./HdComputedChartView";
import { HdExpertKnowledgePanel } from "./HdExpertKnowledgePanel";
import { computedChartAppCodes } from "@/lib/human-design/chart/computedChart";

type Props = {
  id: string;
  onClose: () => void;
  onDeleted: (id: string) => void;
};

function formatDate(val: string | null | undefined): string {
  if (!val) return "—";
  try {
    return new Date(val).toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch {
    return val;
  }
}

export function HdComputedChartModal({ id, onClose, onDeleted }: Props) {
  const { confirm } = useConfirm();
  const dialogRef = useRef<HTMLDivElement>(null);
  useHdModalA11y(dialogRef, onClose);
  const [row, setRow] = useState<ComputedChartDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  useEffect(() => {
    let alive = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- id başına yeniden yükleme (mevcut davranış korunur)
    setLoading(true);
    setLoadError("");
    getComputedChart(id).then(({ row: r, error }) => {
      if (!alive) return;
      setLoading(false);
      if (error) setLoadError(error);
      else setRow(r);
    });
    return () => {
      alive = false;
    };
  }, [id]);

  async function handleDelete() {
    if (deleting) return;
    // HD-P2-D: silmeden önce ortak (erişilebilir) onay dialog'u — veri kaybını önler.
    const confirmed = await confirm({
      title: "Haritayı sil",
      message: `${row?.client_name || "Bu kişisel kayıt"} için hesaplanmış harita kalıcı olarak silinecek. Bu işlem geri alınamaz.`,
      confirmText: "Sil",
      cancelText: "Vazgeç",
      tone: "danger",
    });
    if (!confirmed) return;
    setDeleting(true);
    setDeleteError("");
    const { ok, error } = await deleteComputedChart(id);
    setDeleting(false);
    if (ok) onDeleted(id);
    else setDeleteError(error ?? "Silinemedi.");
  }

  const result = row?.computed_result ?? null;

  // Tam ekran profesyonel çalışma görünümü: üst bar (kimlik + eylemler) sabit, içerik kendi içinde
  // kayar. Masaüstünde BodyGraph + Design 13 + Personality 13 tek bakışta (HdComputedChartView).
  return (
    // z-[70]: uygulama header'ı (fixed top-0 z-50) çalışma alanının üstüne binip toolbar'ı KIRPMASIN.
    // backdrop-blur YOK: tam ekran opak zemin (blur gereksiz GPU yükü + ekran yakalamayı donduruyordu).
    <div className="fixed inset-0 z-[70] bg-slate-50">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="hd-computed-detay-title"
        tabIndex={-1}
        className="flex h-[100dvh] w-full flex-col focus:outline-none"
      >
        {/* Üst bar */}
        <div className="flex flex-none flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-indigo-100 bg-white px-4 py-2 shadow-sm sm:px-6" data-hd-toolbar>
          <div className="min-w-0">
            <h2 id="hd-computed-detay-title" className="truncate text-base font-black leading-tight text-slate-900">
              <span className="mr-2 text-[10px] font-black uppercase tracking-widest text-indigo-500">Human Design</span>
              {row?.client_name || "Kişisel Kayıt"}
            </h2>
            <p className="truncate text-xs text-slate-500">
              {formatDate(row?.birth_date)}
              {row?.birth_time ? ` • ${row.birth_time.slice(0, 5)}` : ""}
              {row?.birth_place ? ` • ${row.birth_place}` : ""}
              {row?.timezone ? ` (${row.timezone})` : ""}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {deleteError ? (
              <span role="alert" className="text-xs font-semibold text-rose-600">
                {deleteError}
              </span>
            ) : null}
            {/* FAZ 2.1: mevcut Profesyonel Word butonu REUSE (chartId = kayıtlı computed row.id). */}
            {!loading && !loadError && row ? <HdProfessionalReportButton chartId={id} /> : null}
            <button
              type="button"
              onClick={() => void handleDelete()}
              disabled={deleting}
              className="h-9 rounded-xl border border-rose-200 bg-white px-4 text-sm font-black uppercase tracking-wide text-rose-600 shadow-sm transition hover:border-rose-400 hover:bg-rose-50 disabled:opacity-50"
            >
              {deleting ? "Siliniyor..." : "Sil"}
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Kapat"
              className="h-9 rounded-xl border border-slate-200 bg-white px-4 text-sm font-black uppercase tracking-wide text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              Kapat ✕
            </button>
          </div>
        </div>

        {/* İçerik */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[1600px] p-3 sm:p-4 lg:px-6">
            {loading ? (
                <p className="py-10 text-center text-sm text-slate-500">Yükleniyor...</p>
              ) : loadError ? (
                <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
                  {loadError}
                </p>
              ) : result ? (
                <div className="space-y-6">
                  <HdComputedChartView result={result} roxyRender={(row?.roxy_render as Record<string, unknown> | null | undefined) ?? null} />
                  <div className="border-t border-emerald-100 pt-5">
                    <HdExpertKnowledgePanel chart={computedChartAppCodes(result)} />
                  </div>
                  <div className="border-t border-indigo-100/80 pt-5">
                    <p className="mb-3 text-xs font-black uppercase tracking-widest text-indigo-700">Kişinin <span lang="en">Human Design</span> Bilgileri</p>
                    <HdPersonalKnowledgePanel chartId={id} />
                  </div>
                </div>
              ) : (
                <p className="py-10 text-center text-sm text-slate-500">Kayıt bulunamadı.</p>
              )}
          </div>
        </div>
      </div>
    </div>
  );
}
