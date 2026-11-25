"use client";

import { useTranslations } from "next-intl";
import { HD_LEGACY_CENTER_NOTE, hdKnowledgeDisplayTitle, isLegacyCenterKnowledgeCode } from "@/lib/human-design/knowledge/centerKnowledge";
import type { KnowledgeGroup } from "../rapor-olustur/helpers/hdRapor";

type Props = {
  groups: KnowledgeGroup[];
  loading?: boolean;
};

export function GateKnowledgeNotes({ groups, loading }: Props) {
  const t = useTranslations("hd.forms.gateNotes");
  return (
    <div className="mt-4 space-y-2">
      <p className="text-[10px] font-black uppercase tracking-widest text-indigo-700">
        {t("title")}
      </p>
      {loading ? (
        <p className="text-xs text-indigo-500">{t("loading")}</p>
      ) : groups.length === 0 ? (
        <p className="text-xs text-slate-400">
          {t("empty")}
        </p>
      ) : (
        <div className="space-y-2">
          {groups.flatMap(({ category, records }) =>
            records.map((r) => (
              <div
                key={r.id}
                className="rounded-xl border border-indigo-100/80 bg-indigo-50/30 px-4 py-3"
              >
                <p className="mb-1 text-[10px] font-black uppercase tracking-wide text-indigo-500">
                  {category}
                </p>
                <p className="mb-0.5 text-xs font-bold text-slate-800">{hdKnowledgeDisplayTitle(r.code, r.title)}</p>
                {isLegacyCenterKnowledgeCode(r.code) ? (
                  <p className="mb-0.5 text-[10px] font-semibold text-amber-700" data-hd-kb-legacy-center>{HD_LEGACY_CENTER_NOTE}</p>
                ) : null}
                <p className="text-xs leading-relaxed text-slate-700 whitespace-pre-wrap">
                  {r.content}
                </p>
              </div>
            )),
          )}
        </div>
      )}
    </div>
  );
}
