"use client";

import type { HdReportWithClient } from "../helpers/hdKayitliRaporlar";

type Props = {
  row: HdReportWithClient;
  onClose: () => void;
};

function formatDate(val: string | null | undefined): string {
  if (!val) return "—";
  try {
    return new Date(val).toLocaleDateString("tr-TR", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  } catch {
    return val;
  }
}

export function HdRaporDetayModal({ row, onClose }: Props) {
  const content = row.edited_content ?? row.generated_content ?? "";
  const clientName = row.client?.name ?? "—";

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto px-4 py-6">
      <button
        type="button"
        aria-label="Kapat"
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-md"
      />

      <div className="relative z-10 w-full max-w-2xl rounded-[28px] border-2 border-indigo-200/80 bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 rounded-t-[26px] border-b border-indigo-100/80 bg-gradient-to-r from-fuchsia-50 to-violet-50/60 px-6 py-4">
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-fuchsia-500">
              Rapor Detayı
            </p>
            <h2 className="mt-0.5 text-lg font-black text-slate-900">{row.title}</h2>
            <p className="text-xs text-slate-500">
              {clientName} · {formatDate(row.created_at)}
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
        <div className="max-h-[65vh] overflow-y-auto p-6">
          {content ? (
            <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-slate-700">
              {content}
            </pre>
          ) : (
            <p className="text-sm text-slate-400">Rapor içeriği yok.</p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 rounded-b-[26px] border-t border-indigo-100/80 bg-slate-50/60 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="h-9 rounded-xl border border-slate-200 bg-white px-5 text-sm font-black uppercase tracking-wide text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            Kapat
          </button>
          {row.client_id && (
            <a
              href={`/human-design/rapor-olustur?clientId=${row.client_id}`}
              className="flex h-9 items-center rounded-xl border border-fuchsia-200 bg-white px-5 text-sm font-black uppercase tracking-wide text-fuchsia-700 no-underline shadow-sm transition hover:border-fuchsia-400 hover:bg-fuchsia-50"
              onClick={onClose}
            >
              Düzenle
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
