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
import {
  CHRONO_UNLIMITED_YEAR,
  chronoBirthYear,
  isRedactedAge,
  isRedactedTopic,
  isRedactedYear,
  isUnlimitedYear,
  resolveChronoBirth,
} from "./chronoBirth";

/** Her kronolojik bölümde TEK KEZ gösterilecek bilgilendirme notu. Yıl NUMARASI içermez. */
export const CHRONO_CUTOFF_NOTE =
  "Bu bölümde, içinde bulunduğumuz yıla kadar başlamış dönemler kaynak yöntemindeki tam tarih aralıklarıyla gösterilmiştir. Geleceğe ilişkin olay veya öngörü içermez.";

// ── GELECEK YILLAR ALT-YETKİSİ (module_permissions.numerology_future_years) ─────
// Yetki AÇIK uzmanda sınır yılı kaldırılır: motorun ZATEN hesapladığı tüm dönemler (Değişim 5
// adım · Zirve 4 · Mücadele 3 + ana · Harfler 80 yaş — yöntemin doğal bitişi) gösterilir. Yeni
// formül / ek adım / sonsuz döngü YOK; yalnız aynı filtrelerin sınır yılı değişir. Yetki KAPALI
// → sınır = currentYear (önceki davranış birebir). "Aktif dönem" vurgusu HER ZAMAN currentYear'dır.

/** Yetki açıkken sınır yılı: motorun ürettiği tüm yılları (≤ 2100+80) kapsayan sonlu üst değer. */
export const CHRONO_NO_LIMIT_YEAR = CHRONO_UNLIMITED_YEAR;

/** Kronolojik filtrelerde kullanılacak sınır yılı (yetki KAPALI → currentYear; AÇIK → sınırsız). */
export function chronoLimitYear(currentYear: number, futureYears: boolean): number {
  return futureYears === true ? CHRONO_NO_LIMIT_YEAR : currentYear;
}

/**
 * I18N-0003 — Ekranın etkin sınırı (saf). `granted`: istemcinin sunucudan okuduğu yetki önbelleği.
 * `restrictedLimitYear`: sunucu bu kaydı yetkisiz süzdüyse onun sınır yılı (yoksa null). Sunucu kısıtı
 * varken istemci önbelleği sınırı GENİŞLETEMEZ (yer tutucular / yeniden hesaplanan Değişim açılmaz).
 */
export function chronoViewLimit(
  currentYear: number,
  granted: boolean,
  restrictedLimitYear: number | null,
): { limitYear: number; futureYears: boolean } {
  const restricted = restrictedLimitYear !== null;
  const futureYears = granted === true && !restricted;
  const base = chronoLimitYear(currentYear, futureYears);
  return { limitYear: restricted ? Math.min(base, restrictedLimitYear as number) : base, futureYears };
}

/** Yetki AÇIK iken gösterilen not (gelecek dönemler dahil). Yıl NUMARASI içermez. */
export const CHRONO_FULL_NOTE =
  "Bu bölümde, kaynak yöntemindeki tüm dönemler (gelecekte başlayacak olanlar dâhil) tam tarih aralıklarıyla gösterilmiştir. Geleceğe ilişkin olay veya öngörü içermez.";

/** Yetkiye göre kronolojik bölüm notu (KAPALI → önceki not birebir). */
export function chronoNoteText(futureYears: boolean): string {
  return futureYears === true ? CHRONO_FULL_NOTE : CHRONO_CUTOFF_NOTE;
}

// ── Doğum yılı: motor snapshot'ından güvenle çıkar (yeni motor alanı GEREKMEZ) ──
// I18N-0003: karar tek çözücüden (chronoBirth.resolveChronoBirth) gelir — dilden bağımsız etiket eşleme,
// yapısal kayıt alanı birincil, belirsiz/bozuk veride FAIL-CLOSED. Bu iki yardımcı geriye dönük uyum
// içindir; `recordBirthDate` (kayıt `birth_date`) verilirse metin yalnız eski kayıt geri dönüşüdür.
type OutMetinler = {
  degisimDonusumMetni?: string;
  zirveYillariMetni?: string;
  mucadeleYillariMetni?: string;
  harflerinYankilanisiMetni?: string;
  elementlerMetni?: string;
};

/** Doğum tarihini ("GG.AA.YYYY") çözer; çözülemez/çelişkiliyse null (çağıran kronolojiyi GİZLER). */
export function dogumTarihiFromOut(out: OutMetinler, recordBirthDate?: string | null): string | null {
  const b = resolveChronoBirth(out, recordBirthDate);
  return b.ok ? b.engineText : null;
}

/** Doğum yılını çözer; bulunamaz/çelişkiliyse null (çağıran kronolojiyi GİZLER). */
export function dogumYilindanOut(out: OutMetinler, recordBirthDate?: string | null): number | null {
  return chronoBirthYear(out, recordBirthDate);
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
  // I18N-0003 FAIL-CLOSED: gizli yer tutucu segmentler (REDACTED_*) HİÇBİR sınırda gösterilmez; yetki
  // KAPALI iken yıl bilgisi olmayan segment varsa zaman ekseni kurulamaz → hiçbiri gösterilmez.
  const real = segments.filter((s) => !isRedactedHarfSegment(s));
  if (!isUnlimitedYear(currentYear) && real.some((s) => typeof s.yearStart !== "number" || typeof s.yearEnd !== "number")) return [];
  // filterHarfSegmentsThroughActive = geçmiş + aktif (yearStart ≤ currentYear seti). Kırpma YOK.
  return filterHarfSegmentsThroughActive(real, currentYear).map((s) => ({ ...s }));
}

/** Sunucu gizlemesinin bıraktığı yer tutucu harf segmenti mi? (gerçek zamanlama değildir) */
export function isRedactedHarfSegment(s: { ageStart?: unknown; ageEnd?: unknown; yearStart?: unknown; yearEnd?: unknown } | null | undefined): boolean {
  if (!s) return true;
  return isRedactedAge(s.ageStart) || isRedactedAge(s.ageEnd) || isRedactedYear(s.yearStart) || isRedactedYear(s.yearEnd);
}

/**
 * Yaş tabanlı görünürlük (Zirve / Mücadele ortak). Yer tutucu yaş hiçbir zaman görünmez.
 * Yetki AÇIK (sınırsız) → tümü (önceki davranış). Yetki KAPALI → doğum yılı ŞART; yoksa FAIL-CLOSED.
 */
function ageVisible(birthYear: number | null, limitYear: number): (age: number) => boolean {
  return (age: number) => {
    if (typeof age !== "number" || !Number.isFinite(age) || isRedactedAge(age)) return false;
    if (isUnlimitedYear(limitYear)) return true;
    return birthYear != null && birthYear + age <= limitYear;
  };
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
/** birthYear + yaş ≤ currentYear olan zirveler görünür. birthYear yoksa: yetki KAPALI → hiçbiri (fail-closed), AÇIK → tümü. */
export function cutoffZirvePeaks(
  peaks: Zirve[] | undefined,
  birthYear: number | null,
  currentYear: number,
): Zirve[] {
  if (!peaks?.length) return [];
  const vis = ageVisible(birthYear, currentYear);
  return peaks.filter((p) => !!p && typeof p === "object" && vis(p.age));
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
  // Bozuk kayıt: nesne olmayan zirve öğeleri yok sayılır (çökme yerine güvenli boş görünüm).
  peaks = peaks.filter((p): p is Zirve => !!p && typeof p === "object");
  if (!peaks.length) return null;
  const ok = (age: unknown): age is number => typeof age === "number" && Number.isFinite(age);
  const vis = ageVisible(birthYear, currentYear);
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
  const vis = ageVisible(birthYear, currentYear);
  const realTopic = (t: unknown) => !isRedactedTopic(t);
  if (d.format === "onceki") return { format: "onceki", points: d.points.filter((p) => vis(p.age) && realTopic(p.topic)) };
  return {
    format: "kitap2",
    periods: d.periods.filter((p) => vis(p.startAge) && realTopic(p.topic)),
    ana: d.ana && vis(d.ana.startAge) && realTopic(d.ana.topic) ? d.ana : null,
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
