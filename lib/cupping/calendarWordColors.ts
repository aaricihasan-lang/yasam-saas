/**
 * KUPA & HACAMAT — FAZ 6 — WORD ÇIKTISI GÜN RENGİ EŞLEMESİ (baskı-uyumlu pastel).
 *
 * TEK DOĞRULUK KAYNAĞI (Word): color_key → sabit HEX (dolgu + okunur metin + ince kenarlık).
 *   Ekran (Tailwind sky/emerald/… -50/-300/-800 aileleri) ile AYNI renk ailesinin baskı-uyumlu
 *   pastel karşılığı; böylece "9 Eylül ekranda sarıysa Word'de de sarıdır" garantisi sağlanır.
 *
 * ÜRÜN KURALI (owner KİLİTLİ): Renk ANLAMI sabitlenmez. Bu eşleme yalnız GÖRSEL ayrım + Türkçe
 *   renk ADI verir; hiçbir renk "uygun/yasak/sünnet/altın" gibi hazır bir hüküm TAŞIMAZ.
 * KONTRAST/BASKI: Tüm dolgular koyu metinle okunur; renk TEK sinyal değildir (Word'de gün ayrıca
 *   ince kenarlıkla işaretlenir + "Renk: <ad>" metniyle etiketlenir → siyah-beyaz baskıda da ayırt).
 *
 * Anahtarlar CUPPING_DAY_COLOR_KEYS ile BİREBİR. NULL (renk yok) → CUPPING_DAY_WORD_NEUTRAL.
 */

import type { CuppingDayColorKey } from "@/lib/cupping/calendarTypes";

export type CuppingDayWordColor = {
  /** Hücre dolgusu (Tailwind *-100 ailesi; docx shading fill — `#` YOK). */
  fill: string;
  /** Okunur koyu metin (Tailwind *-800 ailesi). */
  text: string;
  /** İnce destekleyici kenarlık (Tailwind *-300 ailesi). */
  border: string;
};

/**
 * Ekran paletiyle (cellState.ts CUPPING_DAY_COLORS) hizalı baskı-uyumlu HEX seti.
 *   fill  = *-100, text = *-800, border = *-300 (Tailwind kanonik değerleri).
 */
export const CUPPING_DAY_WORD_COLORS: Record<CuppingDayColorKey, CuppingDayWordColor> = {
  blue:   { fill: "E0F2FE", text: "075985", border: "7DD3FC" }, // sky
  green:  { fill: "D1FAE5", text: "065F46", border: "6EE7B7" }, // emerald
  yellow: { fill: "FEF9C3", text: "854D0E", border: "FDE047" }, // yellow
  red:    { fill: "FFE4E6", text: "9F1239", border: "FDA4AF" }, // rose
  purple: { fill: "EDE9FE", text: "5B21B6", border: "C4B5FD" }, // violet
  orange: { fill: "FFEDD5", text: "9A3412", border: "FDBA74" }, // orange
  pink:   { fill: "FCE7F3", text: "9D174B", border: "F9A8D4" }, // pink
};

/**
 * Renksiz (color_key = NULL) seçili gün — nötr indigo (ekrandaki "selected_saved" ailesiyle
 * uyumlu). Eski renksiz kayıtlar SİLİNMEZ/BOYANMAZ; nötr ama açıkça "seçili" görünür.
 */
export const CUPPING_DAY_WORD_NEUTRAL: CuppingDayWordColor = {
  fill: "E0E7FF", // indigo-100
  text: "3730A3", // indigo-800
  border: "A5B4FC", // indigo-300
};

/** Türkçe renk adı (a11y/etiket; renk ANLAMI DEĞİL). cellState.ts labelTr ile birebir. */
export const CUPPING_DAY_COLORS_LABEL_TR: Record<CuppingDayColorKey, string> = {
  blue: "Mavi",
  green: "Yeşil",
  yellow: "Sarı",
  red: "Kırmızı",
  purple: "Mor",
  orange: "Turuncu",
  pink: "Pembe",
};
