/**
 * Yaşam Hafızası™ — Kavram Kümesi / Concept Set (Sprint 2 / S2.15).
 *
 * Ham kullanıcı sorgusundan **yalnız query-origin** `Concept[]` üretir
 * (kaynak: docs/yasam-hafizasi/04-phase-2-fast-search.md §2:
 * `C = { normalize(sorgu) token'ları }`). Saf/deterministik/DB'siz.
 *
 * SÖZLEŞME:
 *   - Girdi `normalizeSearchText` (S2.14) üzerinden geçer; bu birim KENDİ
 *     tokenization/normalization mantığını YAZMAZ — yalnız `.tokens`'ı tüketir (simetri).
 *   - Her BENZERSİZ token → `{ term: token, origin: "query" }` (canonical EKLENMEZ).
 *   - Dedup anahtarı yalnız `term`; **ilk-görülme sırası korunur**; **sort YOK**.
 *   - Phrase concept YOK; dictionary/synonym expansion YOK; dictionary seam YOK (S2.16).
 *   - Stop-word / tek-karakter / sayısal token **filtrelenmez** (normalize çıktısı korunur).
 *   - Non-string / boş / whitespace-only / punctuation-only → **boş frozen dizi**; throw YOK.
 *   - Çıktı dizisi **ve her Concept** `Object.freeze`; her çağrı **taze** dizi/nesne üretir.
 *   - Global mutable state / cache / singleton YOK; girdi mutasyonu YOK.
 *   - DB/Supabase/fetch/env/API/SQL/AI bağımlılığı YOK.
 */

import type { Concept } from "./types";
import { normalizeSearchText } from "./normalize";

/**
 * Ham sorgudan query-origin Kavram Kümesi (C) üretir. Saf + deterministik + fail-safe.
 * Anlamlı içerik yoksa boş (taze, frozen) dizi döner; hiçbir girdide throw etmez.
 */
export function buildConceptSet(input: unknown): readonly Concept[] {
  // Tek normalize kaynağı (S2.14); kendi ayrıştırmamız yok → query/index simetrisi.
  const { tokens } = normalizeSearchText(input);

  const seen = new Set<string>();
  const concepts: Concept[] = [];

  for (const token of tokens) {
    // term-bazlı dedup; ilk-görülme sırası korunur (sort yok).
    if (seen.has(token)) continue;
    seen.add(token);
    const concept: Concept = { term: token, origin: "query" };
    concepts.push(Object.freeze(concept));
  }

  // Taze + dışarıdan mutasyona kapalı dizi (boş girdide de taze frozen []).
  return Object.freeze(concepts);
}
