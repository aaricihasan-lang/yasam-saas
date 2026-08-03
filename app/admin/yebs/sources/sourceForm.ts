// ============================================================
// YEBS A8 — Kaynak (source) türüne özgü yayın-künye matrisi (UI YARDIMCISI)
//
// Bu matris, A7 kalite kapısındaki `yebs_a7_source_blockers` fonksiyonunun
// (migration 20260922000000) `CASE v.source_type … WHEN 'published'` bloğunun
// BİREBİR UI yansımasıdır. Amaç: kullanıcıyı yayın öncesi ÖN-UYARMAK.
//
// ⚠️ UI OTORİTE DEĞİLDİR. Yayın kararını her zaman backend kapısı verir
// (YEBS_SOURCE_METADATA_INCOMPLETE). Bu dosya yalnız hangi alanların türüne göre
// "yayın için gerekli" olduğunu işaretlemek ve eksikleri önceden göstermek içindir.
//
// Model: her tür için `groups` — TÜM grupların sağlanması gerekir (AND);
// bir grup içinde alanlardan HERHANGİ BİRİ doldurulursa grup sağlanır (any-of).
// Boş `groups` → türe özgü ek zorunluluk yok (yalnız title yeterli).
// ============================================================

/** A7 kapısında geçen künye alan anahtarları (canonical kaynak alan adları). */
export type SourceGateFieldKey =
  | "authors"
  | "organization"
  | "publisher"
  | "isbn"
  | "publication_year"
  | "doi"
  | "document_no"
  | "url"
  | "dating_note";

/** Bir gereklilik grubu — içindeki alanlardan biri dolduğunda sağlanır. */
export type RequirementGroup = { anyOf: SourceGateFieldKey[] };

/** Türe özgü yayın kapısı — TÜM grupların (AND) sağlanması gerekir. */
export type SourceTypeGate = { groups: RequirementGroup[] };

/**
 * source_type → yayın kapısı matrisi.
 * yebs_a7_source_blockers CASE bloğu ile birebir:
 *   book / monograph      : (authors|organization) AND (publisher|isbn) AND publication_year
 *   journal_article       : authors AND (doi|publication_year)
 *   regulatory_document   : (organization|document_no)
 *   standard              : (organization|document_no)
 *   website               : url
 *   database_record       : url
 *   classical_text        : (dating_note|publication_year)
 *   thesis                : authors AND publication_year
 *   ELSE (oral_tradition_record, other, institutional_report, archival_document,
 *         media_recording, interview_record, field_observation_record,
 *         experiential_record) : ek zorunluluk yok — title yeterli
 */
export const SOURCE_PUBLISH_GATE: Record<string, SourceTypeGate> = {
  book: {
    groups: [
      { anyOf: ["authors", "organization"] },
      { anyOf: ["publisher", "isbn"] },
      { anyOf: ["publication_year"] },
    ],
  },
  monograph: {
    groups: [
      { anyOf: ["authors", "organization"] },
      { anyOf: ["publisher", "isbn"] },
      { anyOf: ["publication_year"] },
    ],
  },
  journal_article: {
    groups: [
      { anyOf: ["authors"] },
      { anyOf: ["doi", "publication_year"] },
    ],
  },
  regulatory_document: {
    groups: [{ anyOf: ["organization", "document_no"] }],
  },
  standard: {
    groups: [{ anyOf: ["organization", "document_no"] }],
  },
  website: {
    groups: [{ anyOf: ["url"] }],
  },
  database_record: {
    groups: [{ anyOf: ["url"] }],
  },
  classical_text: {
    groups: [{ anyOf: ["dating_note", "publication_year"] }],
  },
  thesis: {
    groups: [
      { anyOf: ["authors"] },
      { anyOf: ["publication_year"] },
    ],
  },
  // Ek zorunluluğu olmayan türler (ELSE → true). Açıkça boş bırakılır:
  oral_tradition_record: { groups: [] },
  other: { groups: [] },
  institutional_report: { groups: [] },
  archival_document: { groups: [] },
  media_recording: { groups: [] },
  interview_record: { groups: [] },
  field_observation_record: { groups: [] },
  experiential_record: { groups: [] },
};

/** Künye alanlarının Türkçe etiketleri (ön-uyarı ipuçlarında kullanılır). */
export const SOURCE_GATE_FIELD_LABEL: Record<SourceGateFieldKey, string> = {
  authors: "Yazar(lar)",
  organization: "Kurum",
  publisher: "Yayıncı",
  isbn: "ISBN",
  publication_year: "Yayın yılı",
  doi: "DOI",
  document_no: "Belge no",
  url: "URL",
  dating_note: "Tarihlendirme notu",
};

/** Verilen tür için kapı tanımını (yoksa boş) döndürür. */
export function gateFor(sourceType: string): SourceTypeGate {
  return SOURCE_PUBLISH_GATE[sourceType] ?? { groups: [] };
}

/**
 * Türe göre yayın için "gerekli" sayılan tüm alan anahtarları (tekilleştirilmiş).
 * Formda ilgili alanları "yayın için gerekli" olarak işaretlemek için.
 */
export function requiredGateFields(sourceType: string): Set<SourceGateFieldKey> {
  const s = new Set<SourceGateFieldKey>();
  for (const g of gateFor(sourceType).groups) {
    for (const k of g.anyOf) s.add(k);
  }
  return s;
}

/** Bir alan değeri "dolu" mu? (null/undefined/boş-string dolu değildir; 0 dahil sayı doludur). */
function hasValue(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === "string") return v.trim() !== "";
  if (typeof v === "number") return Number.isFinite(v);
  return true;
}

/**
 * Türe özgü yayın kapısını mevcut değerlerle ÖN-değerlendirir (UI uyarısı).
 * satisfied=true → türe göre künye tam görünüyor (backend yine son kararı verir).
 * missingGroups → sağlanmamış any-of grupları (kullanıcıya "şunlardan biri gerekli" denir).
 */
export function evaluateSourceGate(
  sourceType: string,
  values: Partial<Record<SourceGateFieldKey, unknown>>,
): { satisfied: boolean; missingGroups: RequirementGroup[] } {
  const gate = gateFor(sourceType);
  const missing: RequirementGroup[] = [];
  for (const g of gate.groups) {
    const ok = g.anyOf.some((k) => hasValue(values[k]));
    if (!ok) missing.push(g);
  }
  return { satisfied: missing.length === 0, missingGroups: missing };
}

/** Bir gereklilik grubunu Türkçe insan cümlesine çevirir ("Yazar veya Kurum"). */
export function describeGroup(group: RequirementGroup): string {
  return group.anyOf.map((k) => SOURCE_GATE_FIELD_LABEL[k]).join(" veya ");
}
