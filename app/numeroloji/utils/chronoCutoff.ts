// KRONOLOJİK SUNUM SINIRI (presentation-only). CANONICAL DEĞİLDİR:
//   • Engine/motor sonuçlarını MUTATE ETMEZ; canonical formül/aritmetik DEĞİŞMEZ.
//   • OWNER KESİN KURALI (BAŞLANGIÇ-YILI TABANLI, TAM ARALIK):
//       – Bir dönemin BAŞLANGIÇ yılı ≤ currentYear ise dönem ORİJİNAL BİTİŞİYLE TAM gösterilir
//         (bitiş currentYear'dan büyük olabilir — kırpılMAZ, "gösterilen bölüm" YAZILMAZ).
//       – Başlangıç yılı > currentYear ise dönem TAMAMEN gizlenir.
//       Örn (currentYear=2026): Harf 2026–2034 → TAM göster; 2035–2037 → gizle.
//                               Değişim 2026–2027 → TAM göster; 2027'de başlayan → gizle.
//   • Yaş-tabanlı Zirve/Mücadele: BAŞLANGIÇ (doğum yılı + başlangıç yaşı) ≤ currentYear ise
//     görünür; henüz başlamamışsa (> currentYear) gizli. Mücadele yaşları GEÇİŞ SINIRIDIR; dönemin
//     başlangıcı bir önceki sınırdır (bkz. cutoffMucadele).
//   • Yıl NUMARASI hardcode EDİLMEZ: çağıran `currentYear`'ı güvenilir Türkiye tarih kaynağından
//     (useCurrentYear / currentIstanbulYear) geçirir. 2030/2050/2100'de kod değişmeden çalışır.
//   • Ham serbest metni regex ile KESMEZ: tüm sınırlama YAPISAL (structured) veriden yapılır.

import {
  parseBirthDate,
  calcDegisimByYearOnly,
  calcDegisimByFullDate,
  type HarfYankilanisiSegment,
  type Zirve,
  type MucadeleResult,
  type MucadeleDonem,
  type MucadeleAna,
  type MucadeleOncekiNokta,
  mucadeleDonemleri,
  type DegisimYearOnly,
  type DegisimFullDate,
} from "@/lib/numeroloji";
import { filterHarfSegmentsThroughActive } from "./harfSummary";

/** Her kronolojik bölümde TEK KEZ gösterilecek bilgilendirme notu. Yıl NUMARASI içermez. */
export const CHRONO_CUTOFF_NOTE =
  "Bu bölümde, içinde bulunduğumuz yıla kadar başlamış dönemler kaynak yöntemindeki tam tarih aralıklarıyla gösterilmiştir. Geleceğe ilişkin olay veya öngörü içermez.";

// ── GELECEK YILLAR ALT-YETKİSİ (module_permissions.numerology_future_years) ─────
// Yetki AÇIK uzmanda sınır yılı kaldırılır: motorun ZATEN hesapladığı tüm dönemler (Değişim 5
// adım · Zirve 4 · Mücadele 3 + ana · Harfler 80 yaş — yöntemin doğal bitişi) gösterilir. Yeni
// formül / ek adım / sonsuz döngü YOK; yalnız aynı filtrelerin sınır yılı değişir. Yetki KAPALI
// → sınır = currentYear (önceki davranış birebir). "Aktif dönem" vurgusu HER ZAMAN currentYear'dır.

/** Yetki açıkken sınır yılı: motorun ürettiği tüm yılları (≤ 2100+80) kapsayan sonlu üst değer. */
export const CHRONO_NO_LIMIT_YEAR = 9999;

/** Kronolojik filtrelerde kullanılacak sınır yılı (yetki KAPALI → currentYear; AÇIK → sınırsız). */
export function chronoLimitYear(currentYear: number, futureYears: boolean): number {
  return futureYears === true ? CHRONO_NO_LIMIT_YEAR : currentYear;
}

/** Yetki AÇIK iken gösterilen not (gelecek dönemler dahil). Yıl NUMARASI içermez. */
export const CHRONO_FULL_NOTE =
  "Bu bölümde, kaynak yöntemindeki tüm dönemler (gelecekte başlayacak olanlar dâhil) tam tarih aralıklarıyla gösterilmiştir. Geleceğe ilişkin olay veya öngörü içermez.";

/** Yetkiye göre kronolojik bölüm notu (KAPALI → önceki not birebir). */
export function chronoNoteText(futureYears: boolean): string {
  return futureYears === true ? CHRONO_FULL_NOTE : CHRONO_CUTOFF_NOTE;
}

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

export const ZIRVE_METOT1_LABEL = "Metot 1 — İlk Zirve Sayısına Göre";
export const ZIRVE_METOT2_LABEL = "Metot 2 — Hayat Yoluna Göre";

export type ZirveYasSatiri = { index: number; age: number; topic: number; display?: string };
export type ZirveYasGorunumu =
  | { format: "iki-metot"; metot1: ZirveYasSatiri[]; metot2: ZirveYasSatiri[] }
  | { format: "kayitli"; peaks: ZirveYasSatiri[] };

/**
 * Zirve yaşları — NİHAİ KARAR (2026-10-03): iki metot birlikte gösterilir. UI / Word / infografik /
 * düz metin TEK KAYNAK. Her metot kendi yaşına göre aynı owner kuralıyla süzülür
 * (birthYear + yaş ≤ currentYear). `yasMetot1/2` alanı olmayan eski snapshot'lar (Model C)
 * kaydedildiği tek yaş listesiyle ("kayitli") gösterilir.
 */
export function zirveYasGorunumu(
  peaks: Zirve[] | undefined | null,
  birthYear: number | null,
  currentYear: number,
): ZirveYasGorunumu | null {
  if (!Array.isArray(peaks) || !peaks.length) return null;
  const ok = (age: unknown): age is number => typeof age === "number" && Number.isFinite(age);
  const vis = (age: number) => birthYear == null || birthYear + age <= currentYear;
  const row = (p: Zirve, age: number): ZirveYasSatiri => ({ index: p.index, age, topic: p.topic, display: p.display });
  const ikiMetot = peaks.every((p) => ok(p.yasMetot1) && ok(p.yasMetot2));
  if (ikiMetot) {
    return {
      format: "iki-metot",
      metot1: peaks.filter((p) => vis(p.yasMetot1 as number)).map((p) => row(p, p.yasMetot1 as number)),
      metot2: peaks.filter((p) => vis(p.yasMetot2 as number)).map((p) => row(p, p.yasMetot2 as number)),
    };
  }
  return { format: "kayitli", peaks: peaks.filter((p) => ok(p.age) && vis(p.age)).map((p) => row(p, p.age)) };
}

// ── MÜCADELE (Kitap 2: yaşlar GEÇİŞ SINIRI; dönem bir önceki sınırda BAŞLAR) ──────
export type MucadeleCutoff =
  | { format: "kitap2"; periods: MucadeleDonem[]; ana: MucadeleAna | null }
  | { format: "onceki"; points: MucadeleOncekiNokta[] };

/**
 * P2 DÜZELTMESİ (2026-10-03): motorun mücadele yaşları DÖNEM GEÇİŞ SINIRIDIR (kitap 2 "X yaşına
 * kadar"); önceki sürüm bunları BAŞLANGIÇ sanıyor ve devam eden dönemi gizliyordu
 * (HASAN 2026: yalnız 1. mücadele görünüyordu, oysa 33–60 arası 2. dönemdedir).
 * Owner kuralı korunur: dönem BAŞLANGIÇ yılı (doğum yılı + startAge) ≤ currentYear ise görünür;
 * 1. dönem doğumda başladığı için her zaman görünür; ana mücadele 3. sınırdan sonra başlar.
 * Önceki metodoloji snapshot'ları (method2'li / anaMucadele'siz) kaydedildiği nokta yaşlarıyla
 * ve önceki görünürlük kuralıyla gösterilir (Model C). UI / Word / infografik / düz metin TEK KAYNAK.
 */
export function cutoffMucadele(
  m: MucadeleResult | null | undefined,
  birthYear: number | null,
  currentYear: number,
): MucadeleCutoff | null {
  const d = mucadeleDonemleri(m);
  if (!d) return null;
  const vis = (startYearAge: number) => birthYear == null || birthYear + startYearAge <= currentYear;
  if (d.format === "onceki") return { format: "onceki", points: d.points.filter((p) => vis(p.age)) };
  return {
    format: "kitap2",
    periods: d.periods.filter((p) => vis(p.startAge)),
    ana: d.ana && vis(d.ana.startAge) ? d.ana : null,
  };
}

/** Mücadele görünür satırları (UI düz metin, infografik, Word aynı etiketleri kullanır). */
export function mucadeleSatirlari(c: MucadeleCutoff | null): { baslik: string; konu: number }[] {
  if (!c) return [];
  if (c.format === "onceki") return c.points.map((p) => ({ baslik: p.label, konu: p.topic }));
  const out = c.periods.map((p) => ({ baslik: p.label, konu: p.topic }));
  if (c.ana) out.push({ baslik: c.ana.label, konu: c.ana.topic });
  return out;
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
