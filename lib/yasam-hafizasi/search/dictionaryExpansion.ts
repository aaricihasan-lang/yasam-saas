/**
 * Yaşam Hafızası™ — Sözlük / Eş-Anlam Genişletme (Dictionary Expansion) (Sprint 2 / S2.16).
 *
 * S2.15'in ürettiği **query-origin** `Concept[]` çıktısını, küratörlü dictionary
 * snapshot'ı üzerinden **synonym-origin** `Concept`'lerle **additif** genişletir
 * (kaynak: docs/yasam-hafizasi/04-phase-2-fast-search.md §2). Saf/deterministik/DB'siz.
 *
 * SÖZLEŞME (kilitli):
 *   - Girdi `normalizeSearchText` (S2.14) üzerinden geçer; kendi tokenization/normalization
 *     mantığı YAZILMAZ → query/index/sözlük simetrisi.
 *   - Çıktı = [ DEĞİŞMEYEN query prefix (base, opak) , synonym suffix ]. **Sort YOK.**
 *   - `entries` VERİLEN sırayla; entry içinde **canonical önce, sonra `synonyms[]` sırası**.
 *   - Dedup anahtarı **yalnız normalize edilmiş `term`**; `seen` başlangıçta base term'leriyle
 *     dolu → query, aynı term'de synonym'i **bastırır**; ilk görülen korunur.
 *   - Genişletici **yalnız `origin:"synonym"`** üretir (`origin:"query"` tek kaynağı `base`).
 *     Her yeni Concept `canonical` = normalize edilmiş entry canonical (canonical'ın kendisi
 *     yeni eklenirse `canonical=self`).
 *   - Çok kelimeli terimler substring/`includes` DEĞİL; normalize token dizisinde **bitişik
 *     alt-dizi (contiguous subsequence)** + tam token eşitliğiyle bulunur ("anne" ⊄ "anneanne").
 *   - **Tek-sıçrama:** yalnız base/query eşleşmeleri tetikler; eklenen synonym yeniden lookup
 *     ETMEZ → transitif genişleme yok → A→B→A döngüsü tasarım gereği oluşmaz.
 *   - Çıktı dizisi **ve her yeni Concept** `Object.freeze`; her çağrı **taze** dizi.
 *     `base` opak taşınır (yeniden oluşturulmaz); `base`/`entries`/`synonyms` mutasyonsuz.
 *   - **Fail-safe:** runtime'da tipe rağmen bozuk girdiye karşı savunur; **asla throw etmez**.
 *   - Tavan YOK (kavram/synonym sayısı sınırsız); yeni config sabiti YOK.
 *   - Kapsam dışı (S2.17): DictionaryPort · Supabase adapter · DB erişimi · tenant_id/lang/
 *     is_active · tenant/global merge · snapshot DB sıralaması · search_tsv/tsquery.
 */

import type { Concept } from "./types";
import { normalizeSearchText } from "./normalize";

/**
 * Küratörlü sözlük satırının genişleticiye verilen minimal domain modeli.
 * HAM metin taşır; normalize genişletici içinde `normalizeSearchText` ile yapılır.
 * `tenant_id`/`lang`/`is_active` YOKTUR → onlar adapter/S2.17 sorumluluğudur.
 */
export interface DictionaryEntry {
  canonical: string;
  synonyms: readonly string[];
}

/** `needle` token dizisi, `haystack`'in BİTİŞİK alt-dizisi mi (tam token eşitliği). */
function isContiguousSubsequence(
  needle: readonly string[],
  haystack: readonly string[],
): boolean {
  const n = needle.length;
  const h = haystack.length;
  if (n === 0 || n > h) return false;
  for (let i = 0; i + n <= h; i++) {
    let ok = true;
    for (let j = 0; j < n; j++) {
      if (haystack[i + j] !== needle[j]) {
        ok = false;
        break;
      }
    }
    if (ok) return true;
  }
  return false;
}

/** Bir sözlük aday terimi: normalize edilmiş term + eşleşme için token dizisi. */
interface CandidateTerm {
  readonly term: string;
  readonly tokens: readonly string[];
}

/**
 * query-origin `base`'i sözlük snapshot'ı ile additif genişletir. Saf + deterministik +
 * fail-safe. Sonuç = değişmeyen query prefix + synonym suffix; her çağrı taze frozen dizi.
 */
export function expandConcepts(
  base: readonly Concept[],
  normalizedText: string,
  entries: readonly DictionaryEntry[],
): readonly Concept[] {
  // Runtime savunması: TS tipine rağmen çağıran bozuk değer geçebilir. Sınırda `unknown`
  // üzerinden koru → guard'lar gerçekten gereklidir (no-unnecessary-condition çatışmaz).
  const rawBase: unknown = base;
  const safeBase: readonly Concept[] = Array.isArray(rawBase)
    ? (rawBase as readonly Concept[])
    : [];

  const rawEntries: unknown = entries;
  const entryList: readonly unknown[] = Array.isArray(rawEntries) ? rawEntries : [];

  // Sorgu token dizisi (bitişik alt-dizi eşleşmesi için). String değilse boş sorgu.
  const rawText: unknown = normalizedText;
  const queryTokens: readonly string[] =
    typeof rawText === "string" && rawText.length > 0 ? rawText.split(" ") : [];

  // Dedup: yalnız normalize `term`. seen'i base'in GEÇERLİ term'leriyle doldur (query kazanır).
  const seen = new Set<string>();
  for (const c of safeBase) {
    const term: unknown = (c as { term?: unknown } | null | undefined)?.term;
    if (typeof term === "string" && term.length > 0) seen.add(term);
  }

  const suffix: Concept[] = [];

  // Boş sorgu veya boş sözlük → genişleme yok (base tek başına döner).
  if (queryTokens.length > 0) {
    for (const raw of entryList) {
      // entry null/object değilse atla (bozuk kayıt tüm fonksiyonu düşürmez).
      if (raw === null || typeof raw !== "object") continue;
      const entry = raw as { canonical?: unknown; synonyms?: unknown };

      // canonical string değilse entry'yi atla.
      if (typeof entry.canonical !== "string") continue;
      const canonicalTokens = normalizeSearchText(entry.canonical).tokens;
      // canonical normalize boşsa entry TAMAMEN atlanır.
      if (canonicalTokens.length === 0) continue;
      const canonicalTerm = canonicalTokens.join(" ");

      // synonyms dizi değilse boş liste kabul et.
      const synList: readonly unknown[] = Array.isArray(entry.synonyms) ? entry.synonyms : [];

      // Aday terimler: canonical önce, sonra synonyms[] sırası. Entry-içi duplicate term
      // yalnız bir kez değerlendirilir.
      const candidates: CandidateTerm[] = [{ term: canonicalTerm, tokens: canonicalTokens }];
      const entrySeen = new Set<string>([canonicalTerm]);
      for (const s of synList) {
        if (typeof s !== "string") continue; // non-string synonym atla
        const synTokens = normalizeSearchText(s).tokens;
        if (synTokens.length === 0) continue; // boş synonym atla
        const synTerm = synTokens.join(" ");
        if (entrySeen.has(synTerm)) continue; // entry-içi dup tek kez
        entrySeen.add(synTerm);
        candidates.push({ term: synTerm, tokens: synTokens });
      }

      // Çift yönlü tetik: canonical VEYA herhangi synonym sorguda bitişik alt-dizi ise
      // tüm grup (canonical + synonyms) eklenir. Yalnız base/query tetikler (tek-sıçrama).
      const triggered = candidates.some((cand) =>
        isContiguousSubsequence(cand.tokens, queryTokens),
      );
      if (!triggered) continue;

      // Grup emit: canonical → synonyms sırası; global term-dedup (query prefix rezerve).
      for (const cand of candidates) {
        if (seen.has(cand.term)) continue;
        seen.add(cand.term);
        // origin literalinin genişlemesini önlemek için önce `Concept` olarak tiplenir (S2.15 deseni).
        const concept: Concept = { term: cand.term, origin: "synonym", canonical: canonicalTerm };
        suffix.push(Object.freeze(concept));
      }
    }
  }

  // Taze + frozen dizi; base opak taşınır (yeniden oluşturulmaz), boş girdide de taze frozen.
  return Object.freeze([...safeBase, ...suffix]);
}
