"use client";

/**
 * NKB-V2 — Kişi/analiz Word raporu bölüm seçici. Yalnız word-report generator'ının GERÇEKTEN
 * ürettiği bölümler; en az biri zorunlu. Seçim server'a `sections` ile gönderilir.
 */

import { useState } from "react";
import {
  WORD_TAB_LABELS,
  WORD_TAB_ORDER,
  WORD_TAB_NO_SAVED_CONTENT,
  atLeastOneWordPersonSection,
  defaultWordPersonSections,
  type WordPersonSections,
} from "../bilgi-bankasi/helpers/wordPersonSections";

export function WordPersonSectionPicker({
  open,
  busy,
  title = "Word Raporu — Bölüm Seçimi",
  onCancel,
  onConfirm,
}: {
  open: boolean;
  busy: boolean;
  title?: string;
  onCancel: () => void;
  onConfirm: (sections: WordPersonSections) => void;
}) {
  const [sections, setSections] = useState<WordPersonSections>(defaultWordPersonSections());

  if (!open) return null;

  const canGenerate = atLeastOneWordPersonSection(sections);

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/45 px-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel();
      }}
    >
      <div role="dialog" aria-modal="true" aria-label={title} className="w-full max-w-md overflow-hidden rounded-3xl border border-white/40 bg-white shadow-2xl">
        <div className="bg-gradient-to-r from-blue-600 to-indigo-700 px-6 py-5 text-white">
          <div className="text-lg font-black">{title}</div>
          <div className="mt-1 text-sm text-white/85">Rapora eklenecek bölümleri seçin</div>
        </div>
        <div className="px-6 py-5">
          <div className="flex flex-col gap-2">
            {WORD_TAB_ORDER.map((key) => {
              const liveOnly = WORD_TAB_NO_SAVED_CONTENT.includes(key);
              return (
                <label
                  key={key}
                  className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-violet-100 bg-violet-50/40 p-2.5 text-sm font-semibold text-slate-800"
                >
                  <input
                    type="checkbox"
                    checked={sections[key]}
                    onChange={() => setSections((prev) => ({ ...prev, [key]: !prev[key] }))}
                    className="h-4 w-4 rounded border-violet-300 text-violet-600 focus:ring-violet-400"
                  />
                  <span className="min-w-0">{WORD_TAB_LABELS[key]}</span>
                  {liveOnly ? (
                    <span className="ml-auto text-[10px] font-medium text-slate-400">canlı giriş gerekir</span>
                  ) : null}
                </label>
              );
            })}
          </div>
          {!canGenerate ? (
            <p className="mt-3 text-xs font-bold text-rose-600">En az bir bölüm seçin.</p>
          ) : null}
          <div className="mt-5 flex justify-end gap-2.5">
            <button
              type="button"
              disabled={busy}
              onClick={onCancel}
              className="h-10 rounded-2xl border border-slate-200 bg-slate-100 px-5 text-sm font-black text-slate-700 transition hover:bg-slate-200 disabled:opacity-60"
            >
              Vazgeç
            </button>
            <button
              type="button"
              disabled={!canGenerate || busy}
              onClick={() => onConfirm(sections)}
              className="h-10 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 px-6 text-sm font-black text-white shadow-lg transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy ? "Hazırlanıyor…" : "Word Oluştur"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
