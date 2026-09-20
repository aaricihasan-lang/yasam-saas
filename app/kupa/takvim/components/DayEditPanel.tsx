"use client";

import { useEffect, useRef, useState } from "react";
import { kupaBtnDanger, kupaBtnGhost, kupaBtnSuccess, kupaInput } from "@/app/kupa/components/KupaShell";
import {
  CUPPING_DAY_LABEL_MAX,
  CUPPING_DAY_NOTE_MAX,
  type CuppingDayColorKey,
} from "@/lib/cupping/calendarTypes";
import { CUPPING_DAY_COLORS, CUPPING_DAY_COLOR_ORDER } from "../lib/cellState";

/**
 * FAZ 5 / AŞAMA 5 — GÜN DÜZENLEME PANELİ (premium, sade, hızlı).
 *
 * ÜRÜN KURALI (owner KİLİTLİ): Renk ve kısa açıklama TAMAMEN OPSİYONELDİR; renk anlamı platform
 *   tarafından SABİTLENMEZ (hazır etiket/anlam YOK) — uzman kendi metnini kendisi yazar. Panel,
 *   günün SEÇİM durumunu doğrudan değiştirmez; yalnız STİL uygular. "Gün Seçimini Kaldır" ile
 *   "Rengi Kaldır" açıkça AYRIDIR (yanlışlıkla seçim silme yok).
 *
 * KALICILIK: "Kaydet" değişikliği takvimin çalışma taslağına uygular (henüz-kaydedilmemiş yeni
 *   gün dâhil); nihai DB kaydı ana "Değişiklikleri Kaydet" ile olur (tek kalıcılık yolu →
 *   kaydedilmemiş-değişiklik uyarısı gün stilini de kapsar). Metin GÜVENLİ düz metindir (HTML render YOK).
 * MOBİL: masaüstünde küçük merkezî modal; mobilde ekranı taşırmayan alt-panel.
 */

/** Unicode kod-noktası sayısı (surrogate-güvenli sayaç; sunucu doğrulamasıyla aynı ölçü). */
function cpLen(s: string): number {
  return Array.from(s).length;
}

export type DayStyleDraft = {
  colorKey: CuppingDayColorKey | null;
  label: string;
  note: string;
};

export function DayEditPanel({
  gregText,
  hijriText,
  initial,
  onApply,
  onDeselect,
  onClose,
}: {
  /** Tam Gregoryen tarih (ör. "10 Aralık 2026"). */
  gregText: string;
  /** Tam Hicrî tarih (ör. "30 Cemaziyelahir 1448"). */
  hijriText: string;
  initial: DayStyleDraft;
  onApply: (style: DayStyleDraft) => void;
  onDeselect: () => void;
  onClose: () => void;
}) {
  const [colorKey, setColorKey] = useState<CuppingDayColorKey | null>(initial.colorKey);
  const [label, setLabel] = useState(initial.label);
  const [note, setNote] = useState(initial.note);
  const [error, setError] = useState<string | null>(null);
  const labelRef = useRef<HTMLInputElement>(null);

  // Esc ile kapat + ilk alana odak (a11y).
  useEffect(() => {
    labelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const labelLen = cpLen(label.trim());
  const labelOver = labelLen > CUPPING_DAY_LABEL_MAX;
  const noteOver = cpLen(note.trim()) > CUPPING_DAY_NOTE_MAX;

  function save() {
    // SESSİZ KIRPMA YOK — sınır aşımında açık doğrulama; kaydetme engellenir.
    if (labelOver) {
      setError(`Kısa açıklama en fazla ${CUPPING_DAY_LABEL_MAX} karakter olabilir.`);
      return;
    }
    if (noteOver) {
      setError(`Detay notu en fazla ${CUPPING_DAY_NOTE_MAX} karakter olabilir.`);
      return;
    }
    onApply({ colorKey, label: label.trim(), note: note.trim() });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Günü Düzenle"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[90vh] w-full flex-col overflow-y-auto rounded-t-2xl border border-amber-100 bg-white p-4 shadow-xl sm:max-w-md sm:rounded-2xl sm:p-5"
      >
        {/* Başlık + tarih bilgisi */}
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-base font-black text-slate-900">Günü Düzenle</h3>
            <p className="mt-0.5 text-sm font-semibold text-slate-700">{gregText}</p>
            <p className="text-xs text-slate-500">Hicrî {hijriText}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Kapat"
            className="shrink-0 rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          >
            <span aria-hidden className="text-lg leading-none">×</span>
          </button>
        </div>

        {/* Renk seçici — kontrollü palet + "Renk Yok" (opsiyonel) */}
        <div className="mb-4">
          <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">Renk (opsiyonel)</p>
          <div className="flex flex-wrap gap-2">
            {CUPPING_DAY_COLOR_ORDER.map((key) => {
              const def = CUPPING_DAY_COLORS[key];
              const active = colorKey === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setColorKey(key)}
                  aria-pressed={active}
                  aria-label={def.labelTr}
                  title={def.labelTr}
                  className={[
                    "h-9 w-9 rounded-full border-2 outline-none transition focus-visible:ring-2 focus-visible:ring-amber-400/70",
                    def.swatch,
                    active ? "ring-2 ring-slate-700 ring-offset-2" : "hover:scale-105",
                  ].join(" ")}
                />
              );
            })}
            {/* Renk Yok / Varsayılan */}
            <button
              type="button"
              onClick={() => setColorKey(null)}
              aria-pressed={colorKey === null}
              aria-label="Renk yok"
              title="Renk yok"
              className={[
                "flex h-9 items-center gap-1 rounded-full border-2 border-slate-300 bg-white px-3 text-xs font-semibold text-slate-500 outline-none transition focus-visible:ring-2 focus-visible:ring-amber-400/70",
                colorKey === null ? "ring-2 ring-slate-700 ring-offset-2" : "hover:border-slate-400",
              ].join(" ")}
            >
              Renk Yok
            </button>
          </div>
          {colorKey !== null ? (
            <button
              type="button"
              onClick={() => setColorKey(null)}
              className="mt-2 text-[11px] font-semibold text-amber-700 hover:text-amber-800"
            >
              Rengi Kaldır
            </button>
          ) : null}
        </div>

        {/* Kısa açıklama — serbest metin; sessiz kırpma YOK (sayaç + doğrulama) */}
        <div className="mb-4">
          <div className="mb-1.5 flex items-center justify-between">
            <label htmlFor="cupping-day-label" className="text-xs font-bold uppercase tracking-wide text-slate-500">
              Kısa Açıklama (opsiyonel)
            </label>
            <span className={`text-[11px] font-semibold ${labelOver ? "text-rose-600" : "text-slate-400"}`}>
              {labelLen}/{CUPPING_DAY_LABEL_MAX}
            </span>
          </div>
          <input
            id="cupping-day-label"
            ref={labelRef}
            type="text"
            value={label}
            onChange={(e) => {
              setLabel(e.target.value);
              if (error) setError(null);
            }}
            placeholder="Örn. kendi kısa notunuz"
            className={`${kupaInput} ${labelOver ? "border-rose-300 focus:border-rose-400 focus:ring-rose-200" : ""}`}
          />
        </div>

        {/* Detay notu — mevcut note alanı (hücrede gösterilmez; burada erişilir) */}
        <div className="mb-3">
          <label htmlFor="cupping-day-note" className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">
            Detay Notu (opsiyonel)
          </label>
          <textarea
            id="cupping-day-note"
            value={note}
            onChange={(e) => {
              setNote(e.target.value);
              if (error) setError(null);
            }}
            rows={3}
            placeholder="Yalnız bu gün için ek notunuz"
            className={`${kupaInput} resize-y ${noteOver ? "border-rose-300 focus:border-rose-400 focus:ring-rose-200" : ""}`}
          />
        </div>

        {error ? (
          <p className="mb-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700" role="alert">
            {error}
          </p>
        ) : null}

        {/* Aksiyonlar — "Gün Seçimini Kaldır" (seçimi bırakır) AYRI; Vazgeç / Kaydet */}
        <div className="mt-1 flex flex-col gap-2 border-t border-slate-100 pt-3 sm:flex-row sm:items-center sm:justify-between">
          <button type="button" className={kupaBtnDanger} onClick={onDeselect}>
            Gün Seçimini Kaldır
          </button>
          <div className="flex justify-end gap-2">
            <button type="button" className={`${kupaBtnGhost} min-h-[40px]`} onClick={onClose}>
              Vazgeç
            </button>
            <button
              type="button"
              className={`${kupaBtnSuccess} min-h-[40px]`}
              onClick={save}
              disabled={labelOver || noteOver}
            >
              Kaydet
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
