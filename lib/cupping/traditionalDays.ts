/**
 * KUPA & HACAMAT — FAZ 5 / AŞAMA 3 — GELENEKSEL SÜNNET/ALTIN GÜN KURALI (kanonik, saf).
 *
 * ÜRÜN KURALI (owner tarafından KİLİTLENDİ — AŞAMA 2'nin "otomatik gün YOK" kuralını
 *   BİLİNÇLİ olarak DEĞİŞTİRİR):
 *   Kupa Hacamat Takvimi, uzmanın VARSAYILAN geleneksel Sünnet günlerini takvimin İÇİNE
 *   otomatik ekler (İKİNCİ bir hesaplanmış takvim YOKTUR). Uzman bu günleri tutabilir,
 *   tek tek kaldırabilir, tümünü temizleyebilir veya kendi ekolüne göre takvimi tamamen
 *   kendisi kurabilir. Bu nedenle kural DETERMİNİSTİK ve TEK KAYNAKLIDIR (JSX'e dağıtılmaz).
 *
 * KURAL (owner formülü — EXACT):
 *   Aday Hicrî ay-günleri: 17, 19, 21.
 *   Bir aday YALNIZCA Gregoryen haftagünü şunlardan biriyse otomatik eklenir:
 *     Pazar (ISO 7), Pazartesi (ISO 1), Salı (ISO 2), Perşembe (ISO 4).
 *     (Çarşamba/Cuma/Cumartesi otomatik EKLENMEZ — ama YASAK DEĞİLDİR; uzman istediği
 *      günü MANUEL seçebilir. Haftagünü filtresi YALNIZ otomatik sistem günlerine uygulanır.)
 *   ALTIN GÜN: Hicrî gün = 17 VE Gregoryen haftagünü = Salı → "golden".
 *     (19-Salı ve 21-Salı ALTIN DEĞİLDİR; normal "sunnah" kalır.)
 *
 * KOZMİK SINIR (KESİN): Bu dosya Kozmik Hacamat (lib/cosmic/hacamat.ts,
 *   public.hacamat_rules, app/cosmic-calendar/**, app/api/hacamat/**) ile HİÇBİR kod bağı
 *   İÇERMEZ; oradan sabit/kural KOPYALAMAZ. Bu, Kupa modülünün KENDİ kilitli ürün kuralıdır.
 *
 * ZAMAN DİLİMİ: Gregoryen→Hicrî dönüşümü lib/cupping/hijri.ts (Umm al-Qura, UTC-öğle) ile
 *   YAPILIR — duplike Hicrî motoru YOKTUR. Haftagünü de UTC-öğle ile hesaplanır (kayma yok).
 */

import { annualHijriCells, gregorianToHijri, parseYmd } from "./hijri";

/**
 * Bir plan-gün satırının KÖKENİ (provenance). DB kolonu `selection_source` ile birebir.
 *   - "manual":      uzmanın kendi seçtiği gün (haftagünü/kurala BAĞLI DEĞİL).
 *   - "sunnah_auto": sistemin geleneksel kurala göre otomatik eklediği gün (Sünnet/Altın).
 * "Temizle" YALNIZ sunnah_auto satırları siler; manuel gün — kurala uysa bile — KORUNUR.
 */
export type CuppingSelectionSource = "manual" | "sunnah_auto";

export const SELECTION_SOURCE_MANUAL: CuppingSelectionSource = "manual";
export const SELECTION_SOURCE_SUNNAH: CuppingSelectionSource = "sunnah_auto";

/** DB CHECK ile birebir kontrollü değer kümesi. */
export const CUPPING_SELECTION_SOURCES: readonly CuppingSelectionSource[] = [
  SELECTION_SOURCE_MANUAL,
  SELECTION_SOURCE_SUNNAH,
] as const;

export function isCuppingSelectionSource(v: unknown): v is CuppingSelectionSource {
  return v === SELECTION_SOURCE_MANUAL || v === SELECTION_SOURCE_SUNNAH;
}

/** Geleneksel gösterim sınıfı (KÖKENDEN AYRI; tarihten TÜRETİLİR, saklanmaz). */
export type CuppingTraditionalDayStatus = "sunnah" | "golden";

/** Otomatik sistem günü aday Hicrî ay-günleri (owner formülü). */
export const CUPPING_SUNNAH_HIJRI_DAYS = [17, 19, 21] as const;

/**
 * Otomatik sistem günü için izinli Gregoryen haftagünleri (ISO: 1=Pzt … 7=Paz).
 * Pazar(7), Pazartesi(1), Salı(2), Perşembe(4). Çarşamba(3)/Cuma(5)/Cumartesi(6) HARİÇ.
 */
export const CUPPING_SUNNAH_ALLOWED_ISO_WEEKDAYS = [7, 1, 2, 4] as const;

/** Altın Gün: Hicrî 17 + Salı (ISO 2). */
export const CUPPING_ALTIN_HIJRI_DAY = 17 as const;
export const CUPPING_ALTIN_ISO_WEEKDAY = 2 as const;

const SUNNAH_HIJRI_SET = new Set<number>(CUPPING_SUNNAH_HIJRI_DAYS);
const ALLOWED_WEEKDAY_SET = new Set<number>(CUPPING_SUNNAH_ALLOWED_ISO_WEEKDAYS);

/**
 * Bir "YYYY-MM-DD" Gregoryen tarihin ISO haftagünü (1=Pzt … 7=Paz). UTC öğle → kayma yok.
 * (app/kupa/takvim/lib/bulk.ts'teki isoWeekday ile AYNI yöntem; lib katmanı app'e bağımlı
 *  olmasın diye burada dar-kapsamlı yerel kopyadır — Hicrî motoru duplike EDİLMEZ.)
 */
function isoWeekdayUtc(parts: { year: number; month: number; day: number }): number {
  const dow = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12, 0, 0)).getUTCDay(); // 0=Paz…6=Cmt
  return dow === 0 ? 7 : dow;
}

/**
 * Bir Gregoryen sivil tarihin GELENEKSEL sınıfı:
 *   null     → otomatik sistem günü DEĞİL
 *   "sunnah" → normal geleneksel Sünnet günü
 *   "golden" → Altın Gün (Hicrî 17 + Salı)
 * Geçersiz/gerçek-olmayan tarih → null (istisna FIRLATMAZ).
 */
export function getCuppingTraditionalDayStatus(
  input: string | { year: number; month: number; day: number },
): CuppingTraditionalDayStatus | null {
  const parts = typeof input === "string" ? parseYmd(input) : input;
  if (!parts) return null;
  const hijri = gregorianToHijri(parts);
  if (!hijri) return null;
  if (!SUNNAH_HIJRI_SET.has(hijri.day)) return null;

  const weekday = isoWeekdayUtc(parts);
  if (!ALLOWED_WEEKDAY_SET.has(weekday)) return null;

  if (hijri.day === CUPPING_ALTIN_HIJRI_DAY && weekday === CUPPING_ALTIN_ISO_WEEKDAY) {
    return "golden";
  }
  return "sunnah";
}

/** Bir yılın otomatik geleneksel günü (somut Gregoryen tarih + türetilmiş sınıf). */
export type TraditionalCuppingDate = {
  gregorian_date: string; // "YYYY-MM-DD"
  status: CuppingTraditionalDayStatus;
};

/**
 * Bir Gregoryen yıl için TÜM otomatik geleneksel günleri (Sünnet + Altın) hesaplar.
 * Hicrî dönüşüm lib/cupping/hijri.ts (annualHijriCells) ile yapılır → duplike motor YOK.
 * Sonuç artan tarih sırasında (annualHijriCells ay-ay/gün-gün üretir). Sahte tarih uydurulmaz
 * (o ayda 17/19/21 gerçekten yoksa — ör. Hicrî ay 29 çekiyorsa — o gün üretilmez).
 */
export function getTraditionalCuppingDatesForYear(year: number): TraditionalCuppingDate[] {
  if (!Number.isInteger(year)) return [];
  const out: TraditionalCuppingDate[] = [];
  for (const monthCells of annualHijriCells(year)) {
    for (const cell of monthCells) {
      const status = getCuppingTraditionalDayStatus(cell.gregorian);
      if (status) out.push({ gregorian_date: cell.gregorian, status });
    }
  }
  return out;
}
