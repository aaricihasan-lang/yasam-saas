"use client";

import {
  ATLAS_GROUP_LABEL,
  type AtlasBackgroundGroup,
  type OrganResolved,
} from "@/lib/refleksoloji/atlasRegionsCore";
import type { ProtocolFormDraft } from "../types";

type ProtocolSummaryPanelProps = {
  draft: ProtocolFormDraft;
  organs: OrganResolved[];
  footView: AtlasBackgroundGroup;
};

/**
 * Aktif görünümde bölge yoksa, bölgesi olan diğer görünüm(ler)i grup-bazında
 * tarif eder. "Yan" genel dili YOK: Taban / Yan İç / Yan Dış ayrı adlandırılır.
 */
function otherViewsHint(organ: OrganResolved, currentView: AtlasBackgroundGroup): string | null {
  const others = organ.groups.filter((g) => g !== currentView);
  if (others.length === 0) return null;
  const parts = others.map((g) => `${ATLAS_GROUP_LABEL[g]} görünümünde ${organ.byGroup[g]} bölge`);
  return `Bu organın ${ATLAS_GROUP_LABEL[currentView]} görünümünde kayıtlı bölgesi yok. ${parts.join(", ")} var.`;
}

export function ProtocolSummaryPanel({ draft, organs, footView }: ProtocolSummaryPanelProps) {
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
        {organs.length === 0 ? (
          <p className="mt-1 text-xs font-medium text-slate-500">Organ eklenmedi.</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-2">
            {organs.map((organ) => {
              const currentViewEmpty = organ.found && organ.byGroup[footView] === 0;
              const hint = currentViewEmpty ? otherViewsHint(organ, footView) : null;
              return (
                <li
                  key={organ.label}
                  className={`rounded-xl border p-2.5 ${organ.color.chipClass}`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-1.5">
                    <span className="text-sm font-bold">{organ.label}</span>
                    <span
                      className={`rounded-lg px-2 py-0.5 text-xs font-bold ${
                        organ.found
                          ? "bg-white/80 text-emerald-800"
                          : "bg-white/80 text-amber-900"
                      }`}
                    >
                      {organ.found
                        ? `Atlas bulundu (${organ.totalRegions} bölge)`
                        : "Atlas bulunamadı"}
                    </span>
                  </div>
                  {/* Atlas VAR ama aktif görünümde bölge yoksa → görünüme özel bilgi
                      (ASLA "Atlas bulunamadı" deme). */}
                  {hint ? (
                    <p className="mt-1 text-xs font-medium opacity-90">{hint}</p>
                  ) : null}
                  {!organ.found ? (
                    <p className="mt-1 text-xs font-medium opacity-90">
                      Bu organ için atlas bölgesi kayıtlı değil. Önce Bölge Haritası&apos;ndan ekleyin.
                    </p>
                  ) : null}
                </li>
              );
            })}
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
