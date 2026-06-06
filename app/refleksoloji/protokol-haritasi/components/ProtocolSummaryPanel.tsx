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
      <div className="flex flex-1 flex-col items-center justify-center px-4 py-8 text-center">
        <p className="text-sm font-bold text-violet-900">Protokol özeti</p>
        <p className="mt-2 max-w-sm text-xs font-medium text-slate-600">
          Formu doldurdukça hedef, organlar ve atlas eşleşme durumu burada görünür.
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
      <div>
        <h2 className="text-base font-black text-slate-900">
          {draft.title.trim() || "—"}
        </h2>
        <p className="mt-1 text-xs font-medium leading-relaxed text-slate-600">
          {draft.description.trim() || "Açıklama girilmedi."}
        </p>
      </div>

      <div>
        <h3 className="text-xs font-bold text-violet-900">Organlar</h3>
        {statuses.length === 0 ? (
          <p className="mt-1 text-xs font-medium text-slate-500">Organ eklenmedi.</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-2">
            {statuses.map((status) => (
              <li
                key={status.name}
                className={`rounded-xl border p-2.5 ${status.color.chipClass}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-1.5">
                  <span className="text-sm font-bold">{status.name}</span>
                  <span
                    className={`rounded-lg px-2 py-0.5 text-xs font-bold ${
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
                  <p className="mt-1 text-xs font-medium opacity-90">
                    Bu organ için atlas bölgesi kayıtlı değil. Önce Bölge Haritası&apos;ndan ekleyin.
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      {draft.notes.trim() ? (
        <div>
          <h3 className="text-xs font-bold text-violet-900">Uygulama Notları</h3>
          <p className="mt-1 whitespace-pre-wrap text-xs font-medium leading-relaxed text-slate-700">
            {draft.notes}
          </p>
        </div>
      ) : null}
    </div>
  );
}
