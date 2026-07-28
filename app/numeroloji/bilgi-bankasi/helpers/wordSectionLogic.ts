/**
 * NKB-V2 — Bilgi Bankası Word raporu bölüm seçimi (saf; client + server ortak; harness test eder).
 *
 * Yalnız generator'ın GERÇEKTEN üretebildiği bölümler seçilebilir:
 *   - descriptions : "Açıklama Kayıtları" (kanonik açıklamalar / Kulvar bölümleri)
 *   - stones       : "Doğaltaş Atamaları"
 *   - bibliography : "Kaynakça" (yapılandırılmış kaynaklar)
 *   - sourceNotes  : "Kaynak Notları" (include_in_analysis=true uzman notları; yalnız descriptions ile birlikte)
 *
 * Kurallar:
 *   - En az bir bölüm seçilmeli (aksi halde Word oluşturulmaz).
 *   - sourceNotes yalnız descriptions seçiliyse etkilidir (açıklama taşıyan tek bölüm odur).
 *   - Server'a `sections` gönderilmezse (eski istemci) TÜM bölümler açık kabul edilir (geri-uyumlu).
 */

export type WordSectionKey = "descriptions" | "stones" | "bibliography" | "sourceNotes";

export type WordSections = Record<WordSectionKey, boolean>;

export const WORD_SECTION_ORDER: WordSectionKey[] = [
  "descriptions",
  "stones",
  "bibliography",
  "sourceNotes",
];

export const WORD_SECTION_LABELS: Record<WordSectionKey, string> = {
  descriptions: "Açıklama Kayıtları",
  stones: "Doğaltaş Atamaları",
  bibliography: "Kaynakça",
  sourceNotes: "Kaynak Notları (Analizde kullanılan)",
};

/** Varsayılan: tam çıktı (geriye dönük uyumlu). */
export function defaultWordSections(): WordSections {
  return { descriptions: true, stones: true, bibliography: true, sourceNotes: true };
}

/** En az bir gerçek çıktı bölümü seçili mi? (sourceNotes tek başına descriptions olmadan sayılmaz.) */
export function atLeastOneWordSection(s: WordSections): boolean {
  return s.descriptions || s.stones || s.bibliography;
}

/** sourceNotes efektif mi? (yalnız descriptions ile birlikte anlamlı) */
export function sourceNotesEffective(s: WordSections): boolean {
  return s.descriptions && s.sourceNotes;
}

/**
 * Server tarafı normalizasyon: `sections` verilmemişse tüm bölümler açık (eski istemci uyumu).
 * Verilmişse yalnız bilinen anahtarlar boolean'a indirgenir; bilinmeyen anahtar yok sayılır.
 */
export function normalizeWordSections(input: unknown): WordSections {
  if (input === undefined || input === null || typeof input !== "object") {
    return defaultWordSections();
  }
  const o = input as Record<string, unknown>;
  const out = { descriptions: false, stones: false, bibliography: false, sourceNotes: false };
  for (const k of WORD_SECTION_ORDER) {
    out[k] = o[k] === true;
  }
  // Hiçbir çıktı bölümü seçilmemişse (bozuk/boş gönderim) fail-safe: tam çıktı.
  if (!atLeastOneWordSection(out)) return defaultWordSections();
  return out;
}
