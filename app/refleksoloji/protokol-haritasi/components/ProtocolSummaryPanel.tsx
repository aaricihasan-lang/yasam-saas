"use client";

import type { OrganAtlasStatus, ProtocolFormDraft } from "../types";

type ProtocolSummaryPanelProps = {
  draft: ProtocolFormDraft;
  statuses: OrganAtlasStatus[];
};

export function ProtocolSummaryPanel({ draft, statuses }: ProtocolSummaryPanelProps) {
  const hasContent =
    draft.title.trim() || draft.description.trim() || draft.organs.length > 0 || draft.notes.trim();

  if (!hasContent) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
        <p className="text-xl font-bold text-violet-900">Protokol özeti</p>
        <p className="mt-3 max-w-md text-base font-medium text-slate-600">
          Formu doldurdukça hedef, organlar ve atlas eşleşme durumu burada görünür.
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto">
      <div>
        <h2 className="text-2xl font-black text-slate-900">
          {draft.title.trim() || "—"}
        </h2>
        <p className="mt-2 text-base font-medium leading-relaxed text-slate-600">
          {draft.description.trim() || "Açıklama girilmedi."}
        </p>
      </div>

      <div>
        <h3 className="text-lg font-bold text-violet-900">Organlar</h3>
        {statuses.length === 0 ? (
          <p className="mt-2 text-base font-medium text-slate-500">Organ eklenmedi.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-3">
            {statuses.map((status) => (
              <li
                key={status.name}
                className={`rounded-xl border p-4 ${status.color.chipClass}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-lg font-bold">{status.name}</span>
                  <span
                    className={`rounded-lg px-3 py-1 text-sm font-bold ${
                      status.found
                        ? "bg-white/80 text-emerald-800"
                        : "bg-white/80 text-amber-900"
                    }`}
                  >
                    {status.found
                      ? `Atlas bulundu (${status.regionCount} bölge)`
                      : "Atlas bulunamadı"}
                  </span>
                </div>
                {!status.found ? (
                  <p className="mt-2 text-sm font-medium opacity-90">
                    Bu organ için atlas bölgesi kayıtlı değil. Önce Bölge Haritası&apos;ndan organ
                    bölgesi ekleyin.
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      {draft.notes.trim() ? (
        <div>
          <h3 className="text-lg font-bold text-violet-900">Uygulama Notları</h3>
          <p className="mt-2 whitespace-pre-wrap text-base font-medium leading-relaxed text-slate-700">
            {draft.notes}
          </p>
        </div>
      ) : null}
    </div>
  );
}
