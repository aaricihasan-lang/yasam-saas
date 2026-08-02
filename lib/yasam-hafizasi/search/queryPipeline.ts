/**
 * BF-13 — Kullanıcı arama orkestratörü (SAF; DB/IO YOK).
 *
 * Ham sorgu string'ini mevcut retrieval katmanlarını BİRLEŞTİREREK güvenli bir
 * `RetrievalQueryDescriptor`'a çevirir. İkinci retrieval mantığı YAZILMAZ — yalnız
 * mevcut saf birimler zincirlenir:
 *   normalizeSearchText → buildConceptSet → expandConcepts → buildTsQueryPlan
 *   → buildRetrievalQuery
 *
 * Tenant ve allowShared YALNIZ server tarafından oluşturulan visibility descriptor
 * üzerinden geçer (bu birim HTTP/body/query OKUMAZ). Sözlük verisi hazır olmadığı
 * için synonym genişletmesi BOŞ sözlükle çağrılır (sahte eş-anlam ÜRETİLMEZ).
 */
import type { Concept } from "./types";
import type { RetrievalQueryDescriptor } from "./retrievalQuery";
import { normalizeSearchText } from "./normalize";
import { buildConceptSet } from "./conceptSet";
import { expandConcepts, type DictionaryEntry } from "./dictionaryExpansion";
import { buildTsQueryPlan } from "./tsQueryPlan";
import { buildRetrievalQuery } from "./retrievalQuery";

/** Kabul edilen maksimum ham sorgu uzunluğu (route ayrıca 400 döndürür). */
export const YH_MAX_QUERY_LENGTH = 200;

/** Sözlük adaptörü/verisi henüz yok → boş snapshot (additif genişletme no-op). */
const EMPTY_DICTIONARY: readonly DictionaryEntry[] = Object.freeze([]);

export interface BuildDescriptorInput {
  rawQuery: unknown;
  /** Yalnız server'da session'dan çözülen tenant. */
  sessionTenantId: string;
  /** yh_shared flag'i ve istek birlikte true ise true. */
  allowShared: boolean;
}

export interface BuildDescriptorResult {
  descriptor: RetrievalQueryDescriptor;
  concepts: readonly Concept[];
  normalizedText: string;
}

/**
 * Ham sorgu + visibility → yürütülebilir/fail-closed descriptor. Boş/anlamsız sorgu
 * `buildRetrievalQuery` içinde `noop('empty-tsquery')` olur (route boş sonuç döndürür).
 */
export function buildRetrievalDescriptor(input: BuildDescriptorInput): BuildDescriptorResult {
  const normalized = normalizeSearchText(input.rawQuery);
  const base = buildConceptSet(input.rawQuery);
  const concepts = expandConcepts(base, normalized.normalizedText, EMPTY_DICTIONARY);
  const plan = buildTsQueryPlan(concepts);
  const descriptor = buildRetrievalQuery(plan, {
    sessionTenantId: input.sessionTenantId,
    allowShared: input.allowShared,
  });
  return { descriptor, concepts, normalizedText: normalized.normalizedText };
}
