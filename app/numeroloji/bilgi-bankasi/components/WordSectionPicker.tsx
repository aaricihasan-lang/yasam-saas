"use client";

/**
 * NKB-V2 — Word raporu bölüm seçici. Yalnız GERÇEK üretilebilir bölümler; en az biri zorunlu.
 * "Kaynak Notları" yalnız "Açıklama Kayıtları" seçiliyken etkindir (açıklama taşıyan tek bölüm).
 */

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";
import {
  WORD_SECTION_LABELS,
  WORD_SECTION_ORDER,
  atLeastOneWordSection,
  defaultWordSections,
  type WordSections,
} from "../helpers/wordSectionLogic";

export function WordSectionPicker({
  open,
  busy,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (sections: WordSections) => void;
}) {
  const t = useTranslations("numerology.knowledge.wordPicker");
  const tc = useTranslations("numerology.knowledge.shared");
  // I18N: bölüm anahtarları sunucuya giden koddur; TR'de WORD_SECTION_LABELS aynen, EN'de katalogdan.
  const isSourceLocale = useLocale() === DEFAULT_LOCALE;
  const [sections, setSections] = useState<WordSections>(defaultWordSections());

  if (!open) return null;

  const canGenerate = atLeastOneWordSection(sections);

  function toggle(key: keyof WordSections) {
    setSections((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      // descriptions kapanınca sourceNotes anlamsız → görsel olarak da kapat.
      if (key === "descriptions" && !next.descriptions) next.sourceNotes = false;
      return next;
    });
  }

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/45 px-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel();
      }}
    >
      <div role="dialog" aria-modal="true" aria-label={t("dialogAria")} className="w-full max-w-md overflow-hidden rounded-3xl border border-white/40 bg-white shadow-2xl">
        <div className="bg-gradient-to-r from-blue-600 to-indigo-700 px-6 py-5 text-white">
          <div className="text-lg font-black">{t("title")}</div>
          <div className="mt-1 text-sm text-white/85">{t("subtitle")}</div>
        </div>
        <div className="px-6 py-5">
          <div className="flex flex-col gap-2">
            {WORD_SECTION_ORDER.map((key) => {
              const disabled = key === "sourceNotes" && !sections.descriptions;
              return (
                <label
                  key={key}
                  className={`flex items-center gap-2.5 rounded-xl border p-2.5 text-sm font-semibold ${
                    disabled
                      ? "cursor-not-allowed border-slate-100 bg-slate-50 text-slate-400"
                      : "cursor-pointer border-violet-100 bg-violet-50/40 text-slate-800"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={disabled ? false : sections[key]}
                    disabled={disabled}
                    onChange={() => toggle(key)}
                    className="h-4 w-4 rounded border-violet-300 text-violet-600 focus:ring-violet-400"
                  />
                  {isSourceLocale ? WORD_SECTION_LABELS[key] : t(`sections.${key}`)}
                  {key === "sourceNotes" ? (
                    <span className="ml-auto text-[11px] font-medium text-slate-400">{t("withDescriptions")}</span>
                  ) : null}
                </label>
              );
            })}
          </div>
          {!canGenerate ? (
            <p className="mt-3 text-xs font-bold text-rose-600">{t("atLeastOne")}</p>
          ) : null}
          <div className="mt-5 flex justify-end gap-2.5">
            <button
              type="button"
              disabled={busy}
              onClick={onCancel}
              className="h-10 rounded-2xl border border-slate-200 bg-slate-100 px-5 text-sm font-black text-slate-700 transition hover:bg-slate-200 disabled:opacity-60"
            >
              {tc("cancel")}
            </button>
            <button
              type="button"
              disabled={!canGenerate || busy}
              onClick={() => onConfirm(sections)}
              className="h-10 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 px-6 text-sm font-black text-white shadow-lg transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy ? t("preparing") : t("generate")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
