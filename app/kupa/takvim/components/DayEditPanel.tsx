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
 * FAZ 5 / AŞAMA 5 — GÜN DÜZENLEME / EKLEME PANELİ (premium, sade, hızlı).
 *
 * ÜRÜN KURALI (owner KİLİTLİ): Uzmanın oluşturduğu HER yeni gün için RENK ZORUNLUDUR — uzman
 *   yedi pastel renkten birini kendisi seçer; sistem varsayılan renk/anlam ÖNERMEZ, ilk renk
 *   önceden seçili GELMEZ. Renk seçilmeden gün taslağa EKLENMEZ. Kısa açıklama ve detay notu
 *   OPSİYONELDİR. Renkli/seçili bir gün renksiz BIRAKILAMAZ (yalnız başka renkle değiştirilir) →
 *   renk-kaldırma / renksiz-bırakma seçeneği YOKTUR. Seçimi bırakma yalnız açık "Gün Seçimini
 *   Kaldır" iledir (günü ve stilini birlikte kaldırır). Hiçbir renge hazır anlam yüklenmez.
 *
 * KALICILIK: "Taslağa Uygula" değişikliği takvimin çalışma taslağına yazar (yeni gün dâhil);
 *   nihai DB kaydı ana "Değişiklikleri Kaydet" ile olur (tek kalıcılık yolu). Panel bu farkı
 *   açıkça belirtir. Metin GÜVENLİ düz metindir (HTML render YOK).
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
  isSelected,
  onApply,
  onDeselect,
  onClose,
}: {
  /** Tam Gregoryen tarih (ör. "10 Aralık 2026"). */
  gregText: string;
  /** Tam Hicrî tarih (ör. "30 Cemaziyelahir 1448"). */
  hijriText: string;
  initial: DayStyleDraft;
  /** Gün zaten seçili mi (taslak/kayıtlı)? false → yeni EKLEME (Gün Seçimini Kaldır gösterilmez). */
  isSelected: boolean;
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
  const colorMissing = colorKey === null;
  const canApply = !colorMissing && !labelOver && !noteOver;

  function save() {
    // RENK ZORUNLU — seçilmeden uygulanamaz (yeni gün + eski renksiz kayıt düzenlemesi).
    if (colorMissing) {
      setError("Devam etmek için bir renk seçin.");
      return;
    }
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
        aria-label={isSelected ? "Günü Düzenle" : "Gün Ekle"}
        onClick={(e) => e.stopPropagation()}
        /* max-h dvh: sanal klavye açılınca panel küçülür ve içerik kaydırılır → alt aksiyonlar
           kaybolmaz. Alt güvenli-alan payı (home indicator / klavye). */
        className="flex max-h-[90dvh] w-full flex-col overflow-y-auto rounded-t-2xl border border-amber-100 bg-white p-4 pb-[calc(1rem_+_env(safe-area-inset-bottom))] shadow-xl sm:max-w-md sm:rounded-2xl sm:p-5 sm:pb-[calc(1.25rem_+_env(safe-area-inset-bottom))]"
      >
        {/* Başlık + tarih bilgisi */}
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-base font-black text-slate-900">{isSelected ? "Günü Düzenle" : "Gün Ekle"}</h3>
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

        {/* Renk seçici — kontrollü palet; RENK ZORUNLU (varsayılan/ön-seçili YOK) */}
        <div className="mb-4">
          <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">Renk (zorunlu)</p>
          <div className="flex flex-wrap gap-2">
            {CUPPING_DAY_COLOR_ORDER.map((key) => {
              const def = CUPPING_DAY_COLORS[key];
              const active = colorKey === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    setColorKey(key);
                    if (error) setError(null);
                  }}
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
          </div>
          {colorMissing ? (
            <p className="mt-1.5 text-[11px] font-medium text-amber-700">
              Devam etmek için bir renk seçin.
            </p>
          ) : (
            <p className="mt-1.5 text-[11px] text-slate-400">
              Rengi değiştirmek için başka bir renge dokunun.
            </p>
          )}
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

        {/* KAYIT NETLİĞİ: bu panel yalnız çalışma TASLAĞINI günceller; kalıcı DB kaydı ana
            "Değişiklikleri Kaydet" ile olur (tek kalıcılık yolu). */}
        <p className="mb-2 rounded-lg border border-amber-100 bg-amber-50/60 px-3 py-2 text-[11px] leading-relaxed text-amber-800">
          Kalıcı olarak kaydetmek için takvimde <span className="font-bold">Değişiklikleri Kaydet</span>&apos;e basın.
        </p>

        {/* Aksiyonlar — "Gün Seçimini Kaldır" (günü + stilini bırakır) YALNIZ seçili günde; Vazgeç / Taslağa Uygula */}
        <div className="mt-1 flex flex-col gap-2 border-t border-slate-100 pt-3 sm:flex-row sm:items-center sm:justify-between">
          {isSelected ? (
            <button type="button" className={kupaBtnDanger} onClick={onDeselect}>
              Gün Seçimini Kaldır
            </button>
          ) : (
            <span aria-hidden />
          )}
          <div className="flex justify-end gap-2">
            <button type="button" className={`${kupaBtnGhost} min-h-[40px]`} onClick={onClose}>
              Vazgeç
            </button>
            <button
              type="button"
              className={`${kupaBtnSuccess} min-h-[40px]`}
              onClick={save}
              disabled={!canApply}
            >
              Taslağa Uygula
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
