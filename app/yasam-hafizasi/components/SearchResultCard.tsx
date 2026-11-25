"use client";

import { useTranslations } from "next-intl";
import type { YhSearchResult } from "@/lib/yasam-hafizasi/ui/searchResult";
import { useYhModuleLabel } from "./useYhLabels";

/** BF-13 — tek sonuç kartı: modül rozeti + başlık + snippet + provenans. */
export function SearchResultCard({
  result,
  onOpen,
}: {
  result: YhSearchResult;
  onOpen: (r: YhSearchResult) => void;
}) {
  const t = useTranslations("memory.workspace.detail");
  const label = useYhModuleLabel();
  const moduleLabel = label.professional(result.module, result.moduleLabel);
  return (
    <button
      type="button"
      onClick={() => onOpen(result)}
      className="block w-full rounded-2xl border border-white/80 bg-white/85 p-4 text-left shadow-sm backdrop-blur-sm transition hover:-translate-y-0.5 hover:border-violet-200 hover:shadow-md"
    >
      <div className="mb-1.5 flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center rounded-full bg-violet-50 px-2.5 py-0.5 text-[11px] font-black uppercase tracking-wide text-violet-700">
          {moduleLabel}
        </span>
        {result.isShared ? (
          <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
            {t("shared")}
          </span>
        ) : null}
        {result.topicTags.slice(0, 2).map((t) => (
          <span key={t} className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">
            #{t}
          </span>
        ))}
      </div>
      <h3 className="line-clamp-1 text-base font-bold text-slate-900">
        {result.title ?? t("untitled")}
      </h3>
      {result.snippet ? (
        <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-slate-600">{result.snippet}</p>
      ) : null}
      <p className="mt-2 text-[11px] text-slate-400">{t("source", { module: moduleLabel })}</p>
    </button>
  );
}
