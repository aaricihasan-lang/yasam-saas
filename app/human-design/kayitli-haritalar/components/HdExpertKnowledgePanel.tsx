"use client";

// Hesaplanmış harita → UZMANIN KENDİ Bilgi Bankası eşleşmeleri (human_design_knowledge_records).
//
// Kodlar merkezi normalizasyondan (normalize/hdAppCodes) üretilir:
//   tip_ otorite_ profil_ tanim_ merkez_tanimli_ merkez_tanimsiz_ merkez_tam_acik_ merkez_acik_(eski genel) kanal_ kapi_
// → manuel haritalarla BİREBİR aynı kod biçimi; uzman kayıtları tenant-scoped
// /api/hd/knowledge?codes= ucundan okunur. Sağlayıcı (RoxyAPI) açıklama metni BURADA YOKTUR.

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { HD_KNOWLEDGE_CATEGORY_PREFIX, type HdKnowledgeCategory } from "@/lib/human-design/constants";
import { buildExpertKnowledgeCodes, toAppChartCodes, type StoredChartScalars } from "@/lib/human-design/normalize/hdAppCodes";
import { loadKnowledgeForCodes, type KnowledgeGroup } from "../../rapor-olustur/helpers/hdRapor";
import type { HdCenterCode } from "@/lib/human-design/types";
import type { HdCenterState } from "@/lib/human-design/chart/centerStates";
import { hdKnowledgeDisplayTitle, isLegacyCenterKnowledgeCode } from "@/lib/human-design/knowledge/centerKnowledge";

export function HdExpertKnowledgePanel({
  chart,
  centerStates = null,
}: {
  chart: StoredChartScalars;
  /** HD-UZMAN-01: kanıtlı merkez durumları (Tanımsız / Açık kesin kayıtları için). */
  centerStates?: Partial<Record<HdCenterCode, HdCenterState>> | null;
}) {
  const statesKey = centerStates ? JSON.stringify(centerStates) : "";
  // eslint-disable-next-line react-hooks/exhaustive-deps -- statesKey, centerStates içeriğinin kararlı anahtarı
  const codes = useMemo(() => buildExpertKnowledgeCodes(toAppChartCodes(chart), centerStates), [chart, statesKey]);
  const codesKey = codes.join(",");
  const [state, setState] = useState<{ loading: boolean; groups: KnowledgeGroup[]; error: string | null }>({
    loading: true,
    groups: [],
    error: null,
  });

  useEffect(() => {
    let alive = true;
    const list = codesKey ? codesKey.split(",") : [];
    loadKnowledgeForCodes(list).then(({ groups, error }) => {
      if (alive) setState({ loading: false, groups, error });
    });
    return () => {
      alive = false;
    };
  }, [codesKey]);

  const matched = state.groups.reduce((n, g) => n + g.records.length, 0);
  const t = useTranslations("hd.records.expert");
  const tc = useTranslations("hd.knowledge.category");
  // DB kategori değeri Türkçe kanonik (DEĞİŞMEZ) → kod → yalnız GÖSTERİM etiketi; bilinmeyen kategori aynen.
  const categoryLabel = (category: string) => {
    const code = (HD_KNOWLEDGE_CATEGORY_PREFIX as Record<string, string | undefined>)[category as HdKnowledgeCategory];
    return code && tc.has(code) ? tc(code) : category;
  };

  return (
    <section aria-labelledby="hd-expert-kb-title" data-hd-expert-codes={codesKey}>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <p id="hd-expert-kb-title" className="text-xs font-black uppercase tracking-widest text-emerald-700">
          {t("title")}
        </p>
        {!state.loading && !state.error ? (
          <span className="text-[11px] font-semibold text-slate-500">
            {t("summary", { matched, headings: codes.length })}
          </span>
        ) : null}
      </div>
      <p className="mb-3 text-[11px] leading-relaxed text-slate-500">
        {t("intro")}
      </p>
      {state.loading ? (
        <p className="text-xs text-slate-500">{t("loading")}</p>
      ) : state.error ? (
        <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
          {t("loadError", { error: state.error })}
        </p>
      ) : matched === 0 ? (
        <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-xs text-slate-500">
          {t("empty")}
        </p>
      ) : (
        <div className="space-y-3">
          {state.groups.map(({ category, records }) => (
            <div key={category}>
              <p className="mb-1.5 text-[10px] font-black uppercase tracking-wide text-emerald-600">{categoryLabel(category)}</p>
              <div className="space-y-2">
                {records.map((r) => (
                  <article key={r.id} data-hd-kb-code={r.code} className="rounded-xl border border-emerald-100 bg-emerald-50/40 px-4 py-3">
                    <p className="mb-1 text-xs font-bold text-slate-800">{hdKnowledgeDisplayTitle(r.code, r.title)}</p>
                    {isLegacyCenterKnowledgeCode(r.code) ? (
                      <p className="mb-1 text-[10px] font-semibold text-amber-700" data-hd-kb-legacy-center>{t("legacyCenterNote")}</p>
                    ) : null}
                    {r.content ? (
                      <p className="whitespace-pre-wrap text-xs leading-relaxed text-slate-700">{r.content}</p>
                    ) : null}
                    {r.expert_notes ? (
                      <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2">
                        <p className="text-[10px] font-black uppercase tracking-wide text-amber-700">{t("privateNotes")}</p>
                        <p className="whitespace-pre-wrap text-xs leading-relaxed text-slate-700">{r.expert_notes}</p>
                      </div>
                    ) : null}
                  </article>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
