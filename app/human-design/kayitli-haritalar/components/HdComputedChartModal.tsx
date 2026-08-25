"use client";

// FAZ 9D — Hesaplanmış (computed) HD harita detay modalı.
//
// Saklanan computed_result (tam HdChartResult) 9B GET ?id= ile çekilir ve
// <BodyGraph result={computed_result} /> ile RECOMPUTE OLMADAN render edilir.
// Silme 9B DELETE ile. Manuel modal (HdHaritaDetayModal) ve BodyGraph görsel
// katmanı DEĞİŞMEZ; burada yalnız kullanılır.

import { useEffect, useState } from "react";
import { BodyGraph } from "../../harita/components/BodyGraph";
import {
  getComputedChart,
  deleteComputedChart,
  type ComputedChartDetail,
} from "@/lib/human-design/api/chartsClient";
import { HdPersonalKnowledgePanel } from "./HdPersonalKnowledgePanel";
import { HdProfessionalReportButton } from "./HdProfessionalReportButton";

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

function Badge({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-200/80 bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-800">
      <span className="text-[10px] font-black uppercase tracking-wide text-indigo-500">{label}</span>
      {value}
    </span>
  );
}

export function HdComputedChartModal({ id, onClose, onDeleted }: Props) {
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
    setDeleting(true);
    setDeleteError("");
    const { ok, error } = await deleteComputedChart(id);
    setDeleting(false);
    if (ok) onDeleted(id);
    else setDeleteError(error ?? "Silinemedi.");
  }

  const result = row?.computed_result ?? null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto px-4 py-6">
      <button
        type="button"
        aria-label="Kapat"
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-md"
      />

      <div className="relative z-10 w-full max-w-3xl rounded-[28px] border-2 border-indigo-200/80 bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 rounded-t-[26px] border-b border-indigo-100/80 bg-gradient-to-r from-indigo-50 to-violet-50/60 px-6 py-4">
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-widest text-indigo-500">Hesaplanmış Harita</p>
            <h2 className="mt-0.5 truncate text-lg font-black text-slate-900">{row?.client_name || "Kişisel Kayıt"}</h2>
            <p className="text-xs text-slate-500">
              {formatDate(row?.birth_date)}
              {row?.birth_time ? ` · ${row.birth_time}` : ""}
              {row?.birth_place ? ` · ${row.birth_place}` : ""}
              {row?.timezone ? ` · ${row.timezone}` : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="max-h-[68vh] overflow-y-auto p-6">
          {loading ? (
            <p className="py-10 text-center text-sm text-slate-500">Yükleniyor...</p>
          ) : loadError ? (
            <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
              {loadError}
            </p>
          ) : result ? (
            <div className="space-y-5">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(280px,360px)_minmax(0,1fr)]">
              <div className="flex items-start justify-center overflow-hidden rounded-2xl border border-indigo-200/70 bg-white p-3 shadow-sm">
                <BodyGraph result={result} />
              </div>
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  <Badge label="Type" value={result.type} />
                  <Badge label="Authority" value={result.authority} />
                  <Badge label="Profile" value={result.profile} />
                  <Badge
                    label="Definition"
                    value={`${result.definition.kind} · ${result.definition.componentCount} bileşen`}
                  />
                </div>
                <div className="rounded-xl border border-indigo-100/80 bg-indigo-50/30 px-4 py-3 text-sm">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-700">Tanımlı Merkezler</p>
                  <p className="text-slate-800">{result.centers.defined.join(", ") || "—"}</p>
                  <p className="mt-2.5 text-[11px] font-bold uppercase tracking-wide text-slate-500">Açık Merkezler</p>
                  <p className="text-slate-600">{result.centers.open.join(", ") || "—"}</p>
                  <p className="mt-2.5 text-[11px] font-bold uppercase tracking-wide text-indigo-600">
                    Kanallar ({result.channels.length})
                  </p>
                  <p className="text-slate-700">{result.channels.map((c) => c.name).join(", ") || "—"}</p>
                </div>
              </div>
            </div>
              <div className="border-t border-indigo-100/80 pt-5">
                <p className="mb-3 text-xs font-black uppercase tracking-widest text-indigo-700">Kişinin Human Design Bilgileri</p>
                <HdPersonalKnowledgePanel chartId={id} />
              </div>
            </div>
          ) : (
            <p className="py-10 text-center text-sm text-slate-500">Kayıt bulunamadı.</p>
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-b-[26px] border-t border-indigo-100/80 bg-slate-50/60 px-6 py-4">
          <div className="min-h-[1rem] text-xs">
            {deleteError ? (
              <span role="alert" className="font-semibold text-rose-600">
                {deleteError}
              </span>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {/* FAZ 2.1: computed chart detayı başarıyla yüklendiğinde mevcut Professional
                Word butonunu REUSE et (chartId = persisted computed row.id). Yeni akış YOK. */}
            {!loading && !loadError && row ? (
              <HdProfessionalReportButton chartId={id} />
            ) : null}
            <button
              type="button"
              onClick={onClose}
              className="h-9 rounded-xl border border-slate-200 bg-white px-5 text-sm font-black uppercase tracking-wide text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              Kapat
            </button>
            <button
              type="button"
              onClick={() => void handleDelete()}
              disabled={deleting}
              className="h-9 rounded-xl border border-rose-200 bg-white px-5 text-sm font-black uppercase tracking-wide text-rose-600 shadow-sm transition hover:border-rose-400 hover:bg-rose-50 disabled:opacity-50"
            >
              {deleting ? "Siliniyor..." : "Sil"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
