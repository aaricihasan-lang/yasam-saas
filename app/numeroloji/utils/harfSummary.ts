// FAZ 6 — Harflerin Yankılanışı SUNUM (presentation-only) filtresi.
//
// Engine (lib/numeroloji/harflerinYankilanisi.ts) TAM yaşam çizgisini ("full")
// üretmeye devam eder — DEĞİŞTİRİLMEZ. Bu saf yardımcı yalnız SONUÇ ÖZETİ'nde
// gelecek segmentleri gizler: geçmiş segmentlerin tamamı + ŞU AN AKTİF segment
// gösterilir; aktif segmentten SONRAKİ segmentler gizlenir.
//
// KRİTİK: Aktif segment kendi TAM aralığıyla korunur (uç yıl kırpılmaz). Ayrıntılı /
// Sayısal Hesaplama ekranı bu filtreyi KULLANMAZ (tam timeline orada kalır).

import type { HarfYankilanisiSegment } from "@/lib/numeroloji";

/**
 * Segmentleri, referans yılı içeren AKTİF segmente (dahil) kadar kırpar.
 *
 * - Yıl bilgisi olan segmentlerde: aktif = yearStart ≤ referenceYear ≤ yearEnd.
 *   Aktif segmentin indeksine kadar (dahil) olanlar döner; sonrası gizlenir.
 * - referenceYear tüm segmentlerin ÜSTÜNDE ise (kişi maxAge'den yaşlı): hepsi geçmiştir → tümü döner.
 * - referenceYear tüm segmentlerin ALTINDA ise (henüz timeline başlamamış): yalnız ilk segment döner.
 * - Segmentlerde yıl bilgisi YOKSA (doğum yılı verilmemiş): güvenli davranış — tümü döner
 *   (yıl çapası olmadan aktif dönem belirlenemez; hiçbir şey gizlenmez).
 */
export function filterHarfSegmentsThroughActive(
  segments: HarfYankilanisiSegment[],
  referenceYear: number,
): HarfYankilanisiSegment[] {
  if (!segments.length) return segments;

  const hasYears = segments.every(
    (s) => s.yearStart !== undefined && s.yearEnd !== undefined,
  );
  if (!hasYears) return segments.slice();

  const activeIdx = segments.findIndex(
    (s) => (s.yearStart as number) <= referenceYear && referenceYear <= (s.yearEnd as number),
  );

  if (activeIdx === -1) {
    const first = segments[0]!;
    // Timeline henüz başlamamış (ref < ilk segment) → yalnız ilk segment.
    if (referenceYear < (first.yearStart as number)) return segments.slice(0, 1);
    // Aksi halde ref, son segmentin de üstünde → hepsi geçmiş.
    return segments.slice();
  }

  return segments.slice(0, activeIdx + 1);
}
