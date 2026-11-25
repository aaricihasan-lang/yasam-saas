"use client";

/**
 * NKB-V2-D2 — Detay modalı salt görüntüleme: bağlı kaynaklar.
 * internal_note GÖSTERİLMEZ (yalnız admin düzenleme bağlamı). Kaynak yoksa kısa durum.
 */
import { useLocale, useTranslations } from "next-intl";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";
import { joinLinksWithSources, pageDisplay, sectionKeyLabel } from "../helpers/sourceUiLogic";
import type { NumerologySourceRow, RecordSourceRow } from "../helpers/sourcesApi";

export function KulvarSourceReadonlyList({
  links,
  sources,
}: {
  links: RecordSourceRow[];
  sources: NumerologySourceRow[];
}) {
  const t = useTranslations("numerology.knowledge");
  // I18N: section_key kanonik koddur; TR'de yardımcı etiketi/sayfa biçimi aynen, EN'de katalogdan.
  const isSourceLocale = useLocale() === DEFAULT_LOCALE;
  const sectionLabel = (key: RecordSourceRow["section_key"]): string =>
    isSourceLocale ? sectionKeyLabel(key) : t(`shared.sectionLabels.${key ?? "all"}`);
  const pageText = (link: RecordSourceRow): string => {
    if (isSourceLocale) return pageDisplay(link);
    const { page_start: s, page_end: e } = link;
    if (s === null && e === null) return "";
    if (s !== null && e !== null && s !== e) return t("shared.pageRange", { start: s, end: e });
    return t("shared.pageSingle", { page: s ?? e ?? 0 });
  };
  const joined = joinLinksWithSources(links, sources);

  if (joined.length === 0) {
    return <p className="mt-2 text-base font-medium text-slate-500">{t("sourceList.noSources")}</p>;
  }

  return (
    <ul className="mt-2 grid gap-3">
      {joined.map(({ link, source }) => {
        const pg = pageText(link);
        return (
          <li
            key={link.id}
            className={`min-w-0 rounded-2xl border-2 bg-white p-4 shadow-sm ${
              link.is_primary ? "border-violet-400 ring-2 ring-violet-200/60" : "border-violet-200/80"
            }`}
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="break-words text-lg font-black text-slate-900">
                {source?.display_label ?? t("sourceList.sourceNotFound")}
              </span>
              {link.is_primary ? (
                <span className="rounded-lg bg-violet-100 px-2 py-0.5 text-xs font-bold text-violet-800 ring-1 ring-violet-200">
                  {t("shared.primary")}
                </span>
              ) : null}
              <span className="rounded-lg bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700 ring-1 ring-slate-200">
                {sectionLabel(link.section_key)}
              </span>
            </div>
            {source?.title ? <p className="mt-1 break-words text-sm font-medium text-slate-600">{source.title}</p> : null}
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm font-medium text-slate-600">
              {pg ? <span>{pg}</span> : null}
              {link.locator ? <span className="break-words">{link.locator}</span> : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
