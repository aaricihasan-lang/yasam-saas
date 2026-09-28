/**
 * lib/cosmic/hijri.ts — Kozmik Ajanda Hicri takvim erişim noktası.
 *
 * Tüm mantık KANONİK nötr çekirdekten gelir: lib/calendar/hijriUmmAlQura.ts
 * (resmî Umm al-Qura tablosu ≤1500 AH + Umm al-Qura kuralıyla hesaplanmış 1501–1524 AH).
 * Tarayıcı/ICU Intl "islamic-umalqura" KULLANILMAZ (denetim G1: ICU 1450 AH sonrası kuraldan sapıyor).
 */
export {
  HIJRI_MONTHS_TR, HIJRI_METHOD_NOTE, hijriMethodLabel, gregorianToJdn,
  hijriFromGregorian, hijriFromLocalDate, getHijriDate, getHijriMonthYear,
  type HijriDay, type HijriMethod,
} from "../calendar/hijriUmmAlQura";
