// KRONOLOJİK SUNUM SINIRI (presentation-only). CANONICAL DEĞİLDİR:
//   • Engine/motor sonuçlarını MUTATE ETMEZ; canonical formül/aritmetik DEĞİŞMEZ.
//   • OWNER KESİN KURALI (BAŞLANGIÇ-YILI TABANLI, TAM ARALIK):
//       – Bir dönemin BAŞLANGIÇ yılı ≤ currentYear ise dönem ORİJİNAL BİTİŞİYLE TAM gösterilir
//         (bitiş currentYear'dan büyük olabilir — kırpılMAZ, "gösterilen bölüm" YAZILMAZ).
//       – Başlangıç yılı > currentYear ise dönem TAMAMEN gizlenir.
//       Örn (currentYear=2026): Harf 2026–2034 → TAM göster; 2035–2037 → gizle.
//                               Değişim 2026–2027 → TAM göster; 2027'de başlayan → gizle.
//   • Yaş-tabanlı Zirve/Mücadele: BAŞLANGIÇ (doğum yılı + başlangıç yaşı) ≤ currentYear ise
//     görünür; henüz başlamamışsa (> currentYear) gizli. Yaş→yıl için kaynak-kilitli hesap korunur.
//   • Yıl NUMARASI hardcode EDİLMEZ: çağıran `currentYear`'ı güvenilir Türkiye tarih kaynağından
//     (useCurrentYear / currentIstanbulYear) geçirir. 2030/2050/2100'de kod değişmeden çalışır.
//   • Ham serbest metni regex ile KESMEZ: tüm sınırlama YAPISAL (structured) veriden yapılır.

import {
  parseBirthDate,
  calcDegisimByYearOnly,
  calcDegisimByFullDate,
  type HarfYankilanisiSegment,
  type Zirve,
  type MucadeleItem,
  type MucadeleResult,
  type DegisimYearOnly,
  type DegisimFullDate,
} from "@/lib/numeroloji";
import { filterHarfSegmentsThroughActive } from "./harfSummary";

/** Her kronolojik bölümde TEK KEZ gösterilecek bilgilendirme notu. Yıl NUMARASI içermez. */
export const CHRONO_CUTOFF_NOTE =
  "Bu bölümde, içinde bulunduğumuz yıla kadar başlamış dönemler kaynak yöntemindeki tam tarih aralıklarıyla gösterilmiştir. Geleceğe ilişkin olay veya öngörü içermez.";

// ── Doğum yılı: motor snapshot'ından güvenle çıkar (yeni motor alanı GEREKMEZ) ──
function firstDogumTarihi(...sources: (string | undefined | null)[]): string | null {
  for (const s of sources) {
    if (!s) continue;
    const m = s.match(/Doğum Tarihi:\s*([^\n\r]+)/i);
    const v = m?.[1]?.trim();
    if (v) return v;
  }
  return null;
}

type OutMetinler = {
  degisimDonusumMetni?: string;
  zirveYillariMetni?: string;
  mucadeleYillariMetni?: string;
  harflerinYankilanisiMetni?: string;
  elementlerMetni?: string;
};

/** Motor çıktısından (metinlerde gömülü) doğum tarihini (ham "gg.aa.yyyy") çözer; yoksa null. */
export function dogumTarihiFromOut(out: OutMetinler): string | null {
  return firstDogumTarihi(
    out.degisimDonusumMetni,
    out.zirveYillariMetni,
    out.mucadeleYillariMetni,
    out.elementlerMetni,
    out.harflerinYankilanisiMetni,
  );
}

/** Motor çıktısından (metinlerde gömülü) doğum yılını çözer; bulunamazsa null. */
export function dogumYilindanOut(out: OutMetinler): number | null {
  const bd = dogumTarihiFromOut(out);
  const parts = bd ? parseBirthDate(bd) : null;
  return parts?.year ?? null;
}

// ── HARFLERİN YANKILANIŞI ──────────────────────────────────────────────────────
// OWNER: başlangıç yılı ≤ currentYear olan segmentler TAM aralıkla gösterilir; kırpma YOK.
export type HarfCutoffSegment = HarfYankilanisiSegment;

/**
 * BAŞLANGIÇ yılı ≤ currentYear olan segmentleri (geçmiş + AKTİF) ORİJİNAL aralıklarıyla
 * döndürür; gelecekte BAŞLAYAN (yearStart > currentYear) segmentleri gizler. Bitiş yılı
 * currentYear'dan büyük olabilir — KIRPILMAZ. Yıl bilgisi yoksa (doğum yılı verilmemiş)
 * güvenli davranış: sınırlayamayız → tümünü döndürür (gizleme yok).
 */
export function cutoffHarfSegments(
  segments: HarfYankilanisiSegment[],
  currentYear: number,
): HarfCutoffSegment[] {
  // filterHarfSegmentsThroughActive = geçmiş + aktif (yearStart ≤ currentYear seti). Kırpma YOK.
  return filterHarfSegmentsThroughActive(segments, currentYear).map((s) => ({ ...s }));
}

/** Segmentin gösterilecek bitiş yılı (ORİJİNAL, tam aralık). */
export function harfDisplayYearEnd(s: HarfCutoffSegment): number | undefined {
  return s.yearEnd;
}

/** Segmentin gösterilecek bitiş yaşı (ORİJİNAL, tam aralık). */
export function harfDisplayAgeEnd(s: HarfCutoffSegment): number {
  return s.ageEnd;
}

// ── ZİRVE (yaş-tabanlı; gelecekte başlayan gizli) ───────────────────────────────
/** birthYear + yaş ≤ currentYear olan zirveler görünür. birthYear yoksa (nadir) tümü. */
export function cutoffZirvePeaks(
  peaks: Zirve[] | undefined,
  birthYear: number | null,
  currentYear: number,
): Zirve[] {
  if (!peaks?.length) return [];
  if (birthYear == null) return peaks.slice();
  return peaks.filter((p) => birthYear + p.age <= currentYear);
}

// ── MÜCADELE (yaş-tabanlı; gelecekte başlayan gizli) ────────────────────────────
export type MucadeleCutoff = {
  method1: MucadeleItem[];
  /** ANA MÜCADELE başlangıç yaşı geçmişte/güncelde ise görünür. */
  anaMucadeleVisible: boolean;
  anaMucadele: number;
  anaMucadeleBaslangicYasi: number;
};

export function cutoffMucadele(
  m: MucadeleResult | null,
  birthYear: number | null,
  currentYear: number,
): MucadeleCutoff | null {
  if (!m) return null;
  const visible =
    birthYear == null ? m.method1.slice() : m.method1.filter((it) => birthYear + it.age <= currentYear);
  const anaMucadeleVisible =
    birthYear == null ? true : birthYear + m.anaMucadeleBaslangicYasi <= currentYear;
  return {
    method1: visible,
    anaMucadeleVisible,
    anaMucadele: m.anaMucadele,
    anaMucadeleBaslangicYasi: m.anaMucadeleBaslangicYasi,
  };
}

// ── DEĞİŞİM-DÖNÜŞÜM (takvim yılı bazlı; BAŞLANGIÇ ≤ currentYear → TAM aralık; başlamamış gizli) ──
export type DegisimYearOnlyCutoff = DegisimYearOnly & { effectEndYearDisplay: number };
export type DegisimFullDateCutoff = DegisimFullDate & { effectEndYearDisplay: number };

// OWNER: Değişim dönemi effectStartYear'da BAŞLAR (= changeYear - 1). Başlangıç ≤ currentYear ise
// dönem ORİJİNAL bitişiyle (effectEndYear = changeYear) TAM gösterilir — bitiş currentYear'ı aşabilir,
// KIRPILMAZ. Başlangıç > currentYear ise dönem gizlenir. effectEndYearDisplay = effectEndYear (tam).
function boundDegisim<T extends DegisimYearOnly>(items: T[], currentYear: number): (T & { effectEndYearDisplay: number })[] {
  return items
    .filter((r) => r.effectStartYear <= currentYear)
    .map((r) => ({ ...r, effectEndYearDisplay: r.effectEndYear }));
}

/** Doğum yılına göre Değişim-Dönüşüm (currentYear'a sınırlı). */
export function cutoffDegisimYearOnly(birthDate: string, currentYear: number, steps = 5): DegisimYearOnlyCutoff[] {
  const parts = parseBirthDate((birthDate || "").replace(/\//g, "."));
  if (!parts) return [];
  return boundDegisim(calcDegisimByYearOnly(parts.year, parts.month, steps), currentYear);
}

/** Gün ve ay dâhil Değişim-Dönüşüm (currentYear'a sınırlı). */
export function cutoffDegisimFullDate(birthDate: string, currentYear: number, steps = 5): DegisimFullDateCutoff[] {
  const parts = parseBirthDate((birthDate || "").replace(/\//g, "."));
  if (!parts) return [];
  return boundDegisim(calcDegisimByFullDate(parts.day, parts.month, parts.year, steps), currentYear) as DegisimFullDateCutoff[];
}
